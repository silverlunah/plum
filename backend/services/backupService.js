/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Reports (with their rrweb recordings) are opt-in — they can be large, and
// this used to be a hard no ("reports are too large, use pg_dump") back when
// screenshots lived as external files on disk. Now everything lives in
// Postgres, so it's just a size tradeoff the admin can choose. Recording.events
// is gzip-compressed BYTEA — base64 it for JSON transport; startedAt/endedAt
// are BigInt, which JSON.stringify can't serialize natively.
async function exportReports() {
	const reports = await prisma.report.findMany({
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

const exportAll = async (includeReports = false) => {
	const [cronJobs, project, testSuites, testRuns, users, runners, reports] = await Promise.all([
		prisma.cronJob.findMany({ orderBy: { createdAt: 'asc' } }),
		prisma.project.findFirst({ orderBy: { id: 'asc' } }),
		prisma.testSuite.findMany({
			orderBy: { createdAt: 'asc' },
			include: {
				cases: {
					include: { steps: { orderBy: { order: 'asc' } } },
					orderBy: { createdAt: 'asc' }
				}
			}
		}),
		prisma.testRun.findMany({
			orderBy: { createdAt: 'asc' },
			include: { entries: { orderBy: { order: 'asc' } } }
		}),
		prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
		prisma.runner.findMany({ orderBy: { createdAt: 'asc' } }),
		includeReports ? exportReports() : Promise.resolve(null)
	]);

	return {
		version: '3',
		exportedAt: new Date().toISOString(),
		disclaimer: includeReports
			? 'Reports and recordings are included in this backup.'
			: 'Reports are not included in this backup. Enable "Include reports" in Settings → Backup, or use pg_dump on the PostgreSQL volume, to back up report history.',
		cronJobs: cronJobs.map(({ id, createdAt, updatedAt, reports: _, runnerId: __, ...r }) => r),
		project: project
			? {
					name: project.name,
					logoUrl: project.logoUrl,
					timezone: project.timezone,
					testCasePrefix: project.testCasePrefix,
					testSuitePrefix: project.testSuitePrefix,
					discordWebhookUrl: project.discordWebhookUrl,
					slackWebhookUrl: project.slackWebhookUrl,
					notifyPublicUrl: project.notifyPublicUrl
				}
			: null,
		users: users.map(({ updatedAt: _, ...u }) => u),
		runners: runners.map(({ createdAt: _, cronJobs: __, reports: ___, ...r }) => r),
		testSuites: testSuites.map(({ cases, ...suite }) => ({
			...suite,
			cases: cases.map(({ steps, runEntries: _, history: __, ...tc }) => ({
				...tc,
				steps: steps.map(({ createdAt: ___, ...step }) => step)
			}))
		})),
		testRuns: testRuns.map(({ entries, history: _, ...run }) => ({
			...run,
			entries: entries.map(({ executedAt, ...entry }) => ({ ...entry, executedAt }))
		})),
		...(reports !== null && { reports })
	};
};

// ---------------------------------------------------------------------------
// Import — upsert all exported data, preserve IDs for relational integrity
// ---------------------------------------------------------------------------

const importAll = async (
	{
		cronJobs = [],
		project = null,
		users = [],
		runners = [],
		testSuites = [],
		testRuns = [],
		reports = []
	},
	cronService
) => {
	await prisma.$transaction(
		async (tx) => {
			// 1. Users (needed before suites/runs reference createdById)
			for (const user of users) {
				await tx.user.upsert({
					where: { email: user.email },
					create: user,
					update: { name: user.name, role: user.role }
				});
			}

			// 2. Runners
			for (const runner of runners) {
				await tx.runner.upsert({
					where: { id: runner.id },
					create: runner,
					update: {
						name: runner.name,
						url: runner.url,
						token: runner.token,
						browser: runner.browser
					}
				});
			}

			// 3. CronJobs
			for (const job of cronJobs) {
				await tx.cronJob.upsert({
					where: { taskName: job.taskName },
					create: {
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

			// 4. Project settings
			if (project) {
				await tx.project.upsert({
					where: { id: 1 },
					create: { id: 1, ...project },
					update: project
				});
			}

			// 5. Test suites + cases + steps
			for (const suite of testSuites) {
				const { cases = [], ...suiteData } = suite;
				await tx.testSuite.upsert({
					where: { displayId: suiteData.displayId },
					create: suiteData,
					update: {
						name: suiteData.name,
						description: suiteData.description,
						priority: suiteData.priority
					}
				});

				for (const tc of cases) {
					const { steps = [], ...caseData } = tc;
					await tx.testCase.upsert({
						where: { displayId: caseData.displayId },
						create: caseData,
						update: {
							title: caseData.title,
							description: caseData.description,
							priority: caseData.priority,
							isAutomated: caseData.isAutomated
						}
					});

					// Replace all steps for this case (order may have changed)
					await tx.testStep.deleteMany({ where: { caseId: caseData.id } });
					for (const step of steps) {
						await tx.testStep.create({ data: step });
					}
				}
			}

			// 6. Test runs + entries
			for (const run of testRuns) {
				const { entries = [], ...runData } = run;
				await tx.testRun.upsert({
					where: { id: runData.id },
					create: runData,
					update: { title: runData.title, status: runData.status }
				});

				for (const entry of entries) {
					await tx.testRunEntry.upsert({
						where: { id: entry.id },
						create: entry,
						update: { status: entry.status, notes: entry.notes, order: entry.order }
					});
				}
			}

			// 7. Reports + recordings (opt-in — only present if this backup
			// included them). Recordings are always deleted and recreated
			// rather than upserted — same pattern as test steps above.
			for (const report of reports) {
				const { recordings = [], cronJobId: _staleCronJobId, ...reportData } = report;

				// cronJobId can't be trusted as exported — cron jobs above are
				// upserted keyed on taskName, not id, so the id a report recorded
				// at export time may no longer point at the right row (or any
				// row). Re-resolve it the same way reportService does when a
				// report is first created: a scheduled report's triggerType is
				// always its cron job's taskName.
				const cronJob = reportData.triggerType
					? await tx.cronJob.findUnique({ where: { taskName: reportData.triggerType } })
					: null;

				const data = { ...reportData, cronJobId: cronJob?.id ?? null };
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
		},
		{ timeout: 60000 }
	);

	if (cronService) await cronService.reload();
};

// ---------------------------------------------------------------------------
// S3 upload — S3-compatible object storage (AWS, R2, B2, MinIO)
// ---------------------------------------------------------------------------

// A custom endpoint means R2/B2/MinIO/on-prem, not real AWS S3 — those
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

// Lists backups previously uploaded by uploadToS3, newest first — the data
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
