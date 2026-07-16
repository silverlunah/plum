/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

const prisma = require('./prisma');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');

// ---------------------------------------------------------------------------
// Export — all data except reports (reports are too large; use pg_dump instead)
// ---------------------------------------------------------------------------

const exportAll = async () => {
	const [cronJobs, project, testSuites, testRuns, users, runners] = await Promise.all([
		prisma.cronJob.findMany({ orderBy: { createdAt: 'asc' } }),
		prisma.project.findUnique({ where: { id: 1 } }),
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
		prisma.runner.findMany({ orderBy: { createdAt: 'asc' } })
	]);

	return {
		version: '2',
		exportedAt: new Date().toISOString(),
		disclaimer:
			'Reports are not included in this backup. Use pg_dump on the PostgreSQL volume to back up report history.',
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
		}))
	};
};

// ---------------------------------------------------------------------------
// Import — upsert all exported data, preserve IDs for relational integrity
// ---------------------------------------------------------------------------

const importAll = async (
	{ cronJobs = [], project = null, users = [], runners = [], testSuites = [], testRuns = [] },
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
						browser: job.browser ?? 'chromium',
						enabled: job.enabled ?? true,
						runnerIds: job.runnerIds ?? BUILT_IN_RUNNER_ID,
						notifyDiscord: job.notifyDiscord ?? false,
						notifySlack: job.notifySlack ?? false
					},
					update: {
						cronExpression: job.cronExpression,
						tags: job.tags,
						workers: job.workers ?? 1,
						browser: job.browser ?? 'chromium',
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
		},
		{ timeout: 30000 }
	);

	if (cronService) await cronService.reload();
};

// ---------------------------------------------------------------------------
// S3 upload — S3-compatible object storage (AWS, R2, B2, MinIO)
// ---------------------------------------------------------------------------

const uploadToS3 = async (jsonData, config) => {
	const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

	const {
		backupS3Endpoint,
		backupS3Region,
		backupS3Bucket,
		backupS3AccessKey,
		backupS3SecretKey,
		backupS3Prefix
	} = config;

	const clientConfig = {
		region: backupS3Region || 'auto',
		credentials: {
			accessKeyId: backupS3AccessKey,
			secretAccessKey: backupS3SecretKey
		}
	};
	if (backupS3Endpoint) clientConfig.endpoint = backupS3Endpoint;

	const client = new S3Client(clientConfig);

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

const testS3Connection = async (config) => {
	const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

	const {
		backupS3Endpoint,
		backupS3Region,
		backupS3Bucket,
		backupS3AccessKey,
		backupS3SecretKey,
		backupS3Prefix
	} = config;

	const clientConfig = {
		region: backupS3Region || 'auto',
		credentials: {
			accessKeyId: backupS3AccessKey,
			secretAccessKey: backupS3SecretKey
		}
	};
	if (backupS3Endpoint) clientConfig.endpoint = backupS3Endpoint;

	const client = new S3Client(clientConfig);
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

module.exports = { exportAll, importAll, uploadToS3, testS3Connection };
