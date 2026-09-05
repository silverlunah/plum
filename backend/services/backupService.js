/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { slugify } = require('../lib/slugify');

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Reports (with their rrweb recordings) are opt-in, they can be large, and
// this used to be a hard no ("reports are too large, use pg_dump") back when
// screenshots lived as external files on disk. Now everything lives in
// Postgres, so it's just a size tradeoff the admin can choose. Recording.events
// is gzip-compressed BYTEA: base64 it for JSON transport; startedAt/endedAt
// are BigInt, which JSON.stringify can't serialize natively.
async function exportReports(projectId) {
	const reports = await prisma.report.findMany({
		where: { projectId },
		orderBy: { createdAt: 'asc' },
		include: { recordings: true }
	});
	return reports.map(({ recordings, ...report }) => ({
		...report,
		recordings: recordings.map(({ events, startedAt, endedAt, ...rec }) => ({
			...rec,
			events: events.toString('base64'),
			startedAt: startedAt?.toString() ?? null,
			endedAt: endedAt?.toString() ?? null
		}))
	}));
}

// Everything about a project that isn't derivable and isn't an id. The two
// seq counters matter: they issue the next TC-/TS- number, and a restore that
// resets them to 0 hands out display ids that already exist.
const PROJECT_FIELDS = [
	'slug',
	'name',
	'logoUrl',
	'timezone',
	'testCasePrefix',
	'testSuitePrefix',
	'caseSeqNext',
	'suiteSeqNext',
	'discordWebhookUrl',
	'slackWebhookUrl',
	'maxRetries',
	'defaultHome',
	'manualRepositoryOnly',
	'testsPath',
	'framework'
];

const pick = (obj, fields) =>
	Object.fromEntries(fields.filter((f) => obj?.[f] !== undefined).map((f) => [f, obj[f]]));

async function exportProject(project, includeReports) {
	const [cronJobs, testSuites, testRuns, members, reports] = await Promise.all([
		prisma.cronJob.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } }),
		prisma.testSuite.findMany({
			where: { projectId: project.id },
			orderBy: { createdAt: 'asc' },
			include: {
				cases: {
					include: { steps: { orderBy: { order: 'asc' } } },
					orderBy: { createdAt: 'asc' }
				}
			}
		}),
		prisma.testRun.findMany({
			where: { projectId: project.id },
			orderBy: { createdAt: 'asc' },
			include: { entries: { orderBy: { order: 'asc' } } }
		}),
		prisma.projectMember.findMany({
			where: { projectId: project.id },
			include: { user: { select: { email: true } } }
		}),
		includeReports ? exportReports(project.id) : Promise.resolve(null)
	]);

	return {
		...pick(project, PROJECT_FIELDS),
		// By email, not userId: a restore matches users by email too, and the
		// membership is what decides whether a non-owner can see the project at all.
		members: members.map((m) => ({ email: m.user.email, role: m.role })),
		cronJobs: cronJobs.map(({ id, createdAt, updatedAt, projectId, runnerId: _, ...r }) => r),
		testSuites: testSuites.map(({ cases, projectId, ...suite }) => ({
			...suite,
			cases: cases.map(({ steps, projectId: _, runEntries: __, history: ___, ...tc }) => ({
				...tc,
				steps: steps.map(({ createdAt: ____, ...step }) => step)
			}))
		})),
		testRuns: testRuns.map(({ entries, projectId, history: _, ...run }) => ({
			...run,
			entries: entries.map(({ executedAt, ...entry }) => ({ ...entry, executedAt }))
		})),
		...(reports !== null && { reports })
	};
}

const exportAll = async (includeReports = false) => {
	const [projects, users, runners] = await Promise.all([
		prisma.project.findMany({ orderBy: { id: 'asc' } }),
		prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
		prisma.runner.findMany({ orderBy: { createdAt: 'asc' } })
	]);

	return {
		version: '4',
		exportedAt: new Date().toISOString(),
		disclaimer: includeReports
			? 'Reports and recordings are included in this backup.'
			: 'Reports are not included in this backup. Enable "Include reports" in Settings → Backup, or use pg_dump on the PostgreSQL volume, to back up report history.',
		users: users.map(({ updatedAt: _, ...u }) => u),
		// A backup file travels (S3, laptops); the node token is a live secret, so
		// drop it: nodes re-register their token on the next `plum node start`.
		runners: runners.map(({ createdAt: _, cronJobs: __, reports: ___, token: ____, ...r }) => ({
			...r,
			token: ''
		})),
		projects: await Promise.all(projects.map((p) => exportProject(p, includeReports)))
	};
};

// ---------------------------------------------------------------------------
// Import: upsert all exported data, preserve IDs for relational integrity
// ---------------------------------------------------------------------------

// A v3 file held one project's rows at the top level, with `project` carrying
// just its display settings and no slug. Reshape it into the v4 envelope so
// there is a single import path; the missing slug is what marks it as
// "whatever project this database already has".
function normalize(data) {
	if (Array.isArray(data.projects)) return data;
	const { cronJobs, testSuites, testRuns, reports, project } = data;
	return {
		users: data.users,
		runners: data.runners,
		projects: [
			{
				...(project ?? {}),
				legacy: true,
				cronJobs,
				testSuites,
				testRuns,
				...(reports !== undefined && { reports })
			}
		]
	};
}

// The project a file entry restores into. A slug that already exists is that
// project; a new slug is created; a legacy entry (no slug) lands on whatever
// project the database has, which is what a v3 restore always did.
async function resolveProject(tx, entry) {
	const data = pick(entry, PROJECT_FIELDS);
	if (!entry.legacy && entry.slug) {
		const existing = await tx.project.findUnique({ where: { slug: entry.slug } });
		if (existing) {
			// framework is fixed for the life of a project (its tests are written
			// against one runner), and slug is the identity we just matched on.
			const { framework: _, slug: __, ...mutable } = data;
			await tx.project.update({ where: { id: existing.id }, data: mutable });
			return existing.id;
		}
	} else {
		const existing = await tx.project.findFirst({ orderBy: { id: 'asc' } });
		if (existing) {
			const { framework: _, slug: __, ...mutable } = data;
			if (Object.keys(mutable).length > 0) {
				await tx.project.update({ where: { id: existing.id }, data: mutable });
			}
			return existing.id;
		}
	}

	const org =
		(await tx.organization.findFirst({ orderBy: { id: 'asc' } })) ??
		(await tx.organization.create({ data: { name: 'Default' } }));
	const created = await tx.project.create({
		data: {
			orgId: org.id,
			...data,
			slug: data.slug || slugify(data.name || 'default') || 'default'
		}
	});
	return created.id;
}

async function importProject(tx, entry, usersByEmail) {
	const projectId = await resolveProject(tx, entry);
	const { cronJobs = [], testSuites = [], testRuns = [], reports = [], members = [] } = entry;

	for (const m of members) {
		const userId = usersByEmail.get(m.email);
		if (!userId) continue;
		await tx.projectMember.upsert({
			where: { projectId_userId: { projectId, userId } },
			create: { projectId, userId, role: m.role },
			update: { role: m.role }
		});
	}

	for (const job of cronJobs) {
		await tx.cronJob.upsert({
			where: { projectId_taskName: { projectId, taskName: job.taskName } },
			create: {
				projectId,
				taskName: job.taskName,
				cronExpression: job.cronExpression,
				tags: job.tags,
				workers: job.workers ?? 1,
				browser: job.browser ?? DEFAULT_BROWSER,
				enabled: job.enabled ?? true,
				runnerIds: job.runnerIds ?? BUILT_IN_RUNNER_ID,
				notifyDiscord: job.notifyDiscord ?? false,
				notifySlack: job.notifySlack ?? false
			},
			update: {
				cronExpression: job.cronExpression,
				tags: job.tags,
				workers: job.workers ?? 1,
				browser: job.browser ?? DEFAULT_BROWSER,
				runnerIds: job.runnerIds ?? BUILT_IN_RUNNER_ID,
				notifyDiscord: job.notifyDiscord ?? false,
				notifySlack: job.notifySlack ?? false
			}
		});
	}

	// A row's id in the file is only right for a same-instance round trip. Every
	// upsert below keys on the natural key instead and remembers the id the
	// database actually used, so children get re-pointed rather than orphaned by
	// a foreign key that resolves to nothing (or to someone else's row).
	const suiteIds = new Map();
	const caseIds = new Map();

	for (const suite of testSuites) {
		const { cases = [], ...suiteData } = suite;
		const row = await tx.testSuite.upsert({
			where: { projectId_displayId: { projectId, displayId: suiteData.displayId } },
			create: { ...suiteData, projectId },
			update: {
				name: suiteData.name,
				description: suiteData.description,
				priority: suiteData.priority
			}
		});
		suiteIds.set(suiteData.id, row.id);

		for (const tc of cases) {
			const { steps = [], ...caseData } = tc;
			const caseRow = await tx.testCase.upsert({
				where: { projectId_displayId: { projectId, displayId: caseData.displayId } },
				create: { ...caseData, projectId, suiteId: row.id },
				update: {
					title: caseData.title,
					description: caseData.description,
					priority: caseData.priority,
					isAutomated: caseData.isAutomated,
					suiteId: row.id
				}
			});
			caseIds.set(caseData.id, caseRow.id);

			// Replace all steps for this case (order may have changed)
			await tx.testStep.deleteMany({ where: { caseId: caseRow.id } });
			for (const step of steps) {
				await tx.testStep.create({ data: { ...step, caseId: caseRow.id } });
			}
		}
	}

	const runIds = new Map();
	for (const run of testRuns) {
		const { entries = [], ...runData } = run;
		const row = await tx.testRun.upsert({
			where: { id: runData.id },
			create: { ...runData, projectId },
			update: { title: runData.title, status: runData.status }
		});
		runIds.set(runData.id, row.id);

		for (const entry of entries) {
			const caseId = caseIds.get(entry.caseId) ?? entry.caseId;
			await tx.testRunEntry.upsert({
				where: { id: entry.id },
				create: { ...entry, runId: row.id, caseId },
				update: { status: entry.status, notes: entry.notes, order: entry.order }
			});
		}
	}

	// Reports + recordings (opt-in: only present if this backup included them).
	// Recordings are always deleted and recreated rather than upserted: same
	// pattern as test steps above.
	for (const report of reports) {
		const { recordings = [], cronJobId: _staleCronJobId, ...reportData } = report;

		// cronJobId can't be trusted as exported: cron jobs above are upserted
		// keyed on taskName, not id, so the id a report recorded at export time
		// may no longer point at the right row (or any row). Re-resolve it the
		// same way reportService does when a report is first created: a scheduled
		// report's triggerType is always its cron job's taskName.
		const cronJob = reportData.triggerType
			? await tx.cronJob.findUnique({
					where: { projectId_taskName: { projectId, taskName: reportData.triggerType } }
				})
			: null;

		const data = {
			...reportData,
			projectId,
			cronJobId: cronJob?.id ?? null,
			testRunId: reportData.testRunId ? (runIds.get(reportData.testRunId) ?? null) : null
		};
		await tx.report.upsert({ where: { id: data.id }, create: data, update: data });

		await tx.recording.deleteMany({ where: { reportId: data.id } });
		for (const rec of recordings) {
			await tx.recording.create({
				data: {
					...rec,
					reportId: data.id,
					events: Buffer.from(rec.events, 'base64'),
					startedAt: rec.startedAt !== null ? BigInt(rec.startedAt) : null,
					endedAt: rec.endedAt !== null ? BigInt(rec.endedAt) : null
				}
			});
		}
	}
}

const importAll = async (data, cronService) => {
	const { users = [], runners = [], projects = [] } = normalize(data ?? {});

	await prisma.$transaction(
		async (tx) => {
			// Users and runners are instance-level and every project entry below
			// may reference them, so they land first.
			const usersByEmail = new Map();
			for (const user of users) {
				const row = await tx.user.upsert({
					where: { email: user.email },
					create: user,
					update: { name: user.name, role: user.role }
				});
				usersByEmail.set(row.email, row.id);
			}

			for (const runner of runners) {
				await tx.runner.upsert({
					where: { id: runner.id },
					create: runner,
					update: {
						name: runner.name,
						url: runner.url,
						// Backups no longer carry the token: keep whatever the live row has.
						...(runner.token && { token: runner.token }),
						browser: runner.browser
					}
				});
			}

			for (const entry of projects) {
				await importProject(tx, entry, usersByEmail);
			}
		},
		{ timeout: 120000 }
	);

	if (cronService) await cronService.reload();
};

// ---------------------------------------------------------------------------
// S3 upload, S3-compatible object storage (AWS, R2, B2, MinIO)
// ---------------------------------------------------------------------------

// A custom endpoint means R2/B2/MinIO/on-prem, not real AWS S3, those
// virtually always need path-style addressing (bucket.endpoint/... resolves
// nowhere for a self-hosted host like a docker service name). Real AWS S3
// (no custom endpoint) keeps the SDK's virtual-hosted-style default.
function buildS3ClientConfig({
	backupS3Endpoint,
	backupS3Region,
	backupS3AccessKey,
	backupS3SecretKey
}) {
	const clientConfig = {
		region: backupS3Region || 'auto',
		credentials: {
			accessKeyId: backupS3AccessKey,
			secretAccessKey: backupS3SecretKey
		}
	};
	if (backupS3Endpoint) {
		clientConfig.endpoint = backupS3Endpoint;
		clientConfig.forcePathStyle = true;
	}
	return clientConfig;
}

const uploadToS3 = async (jsonData, config) => {
	const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
	const { backupS3Bucket, backupS3Prefix } = config;
	const client = new S3Client(buildS3ClientConfig(config));

	const date = new Date().toISOString().slice(0, 10);
	const prefix = backupS3Prefix ? backupS3Prefix.replace(/\/?$/, '/') : '';
	const key = `${prefix}plum-backup-${date}.json`;

	await client.send(
		new PutObjectCommand({
			Bucket: backupS3Bucket,
			Key: key,
			Body: JSON.stringify(jsonData, null, 2),
			ContentType: 'application/json'
		})
	);

	return key;
};

// Lists backups previously uploaded by uploadToS3, newest first, the data
// needed for a "restore from S3" flow that doesn't require the admin to pull
// the file down through the S3 console/CLI themselves first.
const listS3Backups = async (config) => {
	const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
	const { backupS3Bucket, backupS3Prefix } = config;
	const client = new S3Client(buildS3ClientConfig(config));
	const prefix = backupS3Prefix ? backupS3Prefix.replace(/\/?$/, '/') : '';

	const res = await client.send(
		new ListObjectsV2Command({ Bucket: backupS3Bucket, Prefix: prefix })
	);

	return (res.Contents ?? [])
		.filter((o) => o.Key.endsWith('.json'))
		.map((o) => ({ key: o.Key, size: o.Size, lastModified: o.LastModified }))
		.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
};

// Fetches and parses one backup previously uploaded by uploadToS3.
const downloadFromS3 = async (key, config) => {
	const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
	const { backupS3Bucket } = config;
	const client = new S3Client(buildS3ClientConfig(config));
	const res = await client.send(new GetObjectCommand({ Bucket: backupS3Bucket, Key: key }));
	const text = await res.Body.transformToString('utf8');
	return JSON.parse(text);
};

const testS3Connection = async (config) => {
	const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
	const { backupS3Bucket, backupS3Prefix } = config;
	const client = new S3Client(buildS3ClientConfig(config));
	const prefix = backupS3Prefix ? backupS3Prefix.replace(/\/?$/, '/') : '';
	const key = `${prefix}.plum-connection-test`;

	await client.send(
		new PutObjectCommand({
			Bucket: backupS3Bucket,
			Key: key,
			Body: 'ok',
			ContentType: 'text/plain'
		})
	);

	// Clean up the test file
	try {
		await client.send(new DeleteObjectCommand({ Bucket: backupS3Bucket, Key: key }));
	} catch {}
};

module.exports = {
	exportAll,
	importAll,
	uploadToS3,
	listS3Backups,
	downloadFromS3,
	testS3Connection
};
