/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const testCaseService = require('./testCaseService');
const testSuiteService = require('./testSuiteService');
const reportService = require('./reportService');

// "TC-014" → "TC", "MY-TEAM-3" → "MY-TEAM", "loose" → "loose"
const prefixOf = (displayId) => String(displayId ?? '').replace(/-\d+$/, '');

async function importTestCases(projectId, payload, userId) {
	if (!payload || payload.plumExport !== 'test-cases' || !Array.isArray(payload.suites)) {
		const err = new Error('Not a Plum test-case export file.');
		err.status = 400;
		throw err;
	}

	const project = await prisma.project.findUnique({
		where: { id: projectId },
		select: { testCasePrefix: true, testSuitePrefix: true }
	});

	const result = {
		importedSuites: 0,
		importedCases: 0,
		updatedSuites: 0,
		updatedCases: 0,
		skippedSuites: 0,
		skippedCases: 0
	};

	for (const suite of payload.suites) {
		if (!suite || typeof suite.name !== 'string' || !suite.name.trim()) {
			result.skippedSuites += 1;
			continue;
		}

		const suiteFields = {
			name: suite.name.trim(),
			description: suite.description ?? '',
			priority: suite.priority ?? 'Medium'
		};
		// Keep the source displayId when it belongs to this project's prefix — that
		// is what lets a re-import land back on the same rows instead of duplicating.
		const keepSuiteId = suite.displayId && prefixOf(suite.displayId) === project.testSuitePrefix;
		const existingSuite = keepSuiteId
			? await prisma.testSuite.findUnique({
					where: { projectId_displayId: { projectId, displayId: suite.displayId } }
				})
			: null;

		let suiteId;
		if (existingSuite) {
			await testSuiteService.update(projectId, existingSuite.id, suiteFields);
			suiteId = existingSuite.id;
			result.updatedSuites += 1;
		} else {
			const created = await testSuiteService.create(projectId, {
				...suiteFields,
				createdById: userId,
				displayId: keepSuiteId ? suite.displayId : null
			});
			suiteId = created.id;
			result.importedSuites += 1;
		}

		for (const c of suite.cases ?? []) {
			if (!c || typeof c.title !== 'string' || !c.title.trim()) {
				result.skippedCases += 1;
				continue;
			}

			const caseFields = {
				title: c.title.trim(),
				description: c.description ?? '',
				priority: c.priority ?? 'Medium'
			};
			const keepCaseId = c.displayId && prefixOf(c.displayId) === project.testCasePrefix;
			const existingCase = keepCaseId
				? await prisma.testCase.findUnique({
						where: { projectId_displayId: { projectId, displayId: c.displayId } }
					})
				: null;

			// Steps are replaced only when the file actually carries some — an older
			// export without steps shouldn't wipe steps off an existing case.
			const hasSteps = Array.isArray(c.steps) && c.steps.length > 0;

			if (existingCase) {
				await testCaseService.update(projectId, existingCase.id, { ...caseFields, suiteId });
				if (hasSteps) await testCaseService.upsertSteps(projectId, existingCase.id, c.steps);
				result.updatedCases += 1;
			} else {
				const created = await testCaseService.create(projectId, {
					...caseFields,
					suiteId,
					createdById: userId,
					displayId: keepCaseId ? c.displayId : null
				});
				if (created && hasSteps) await testCaseService.upsertSteps(projectId, created.id, c.steps);
				result.importedCases += 1;
			}
		}
	}

	// A just-imported case whose ID matches an @tag in a .feature file is
	// automated even though no run has happened yet — reconcile the flag now so
	// the badge shows immediately.
	await reportService.syncAutomatedFromFeatures(projectId);

	return result;
}

module.exports = { importTestCases };
