/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const testCaseService = require('./testCaseService');
const testSuiteService = require('./testSuiteService');

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

	const result = { importedSuites: 0, importedCases: 0, skippedSuites: 0, skippedCases: 0 };

	for (const suite of payload.suites) {
		if (!suite || typeof suite.name !== 'string' || !suite.name.trim()) {
			result.skippedSuites += 1;
			continue;
		}

		let suiteId;
		const suiteCollides =
			suite.displayId &&
			prefixOf(suite.displayId) === project.testSuitePrefix &&
			(await prisma.testSuite.findUnique({
				where: { projectId_displayId: { projectId, displayId: suite.displayId } }
			}));

		if (suiteCollides) {
			suiteId = suiteCollides.id;
			result.skippedSuites += 1;
		} else {
			const created = await testSuiteService.create(projectId, {
				name: suite.name.trim(),
				description: suite.description ?? '',
				priority: suite.priority ?? 'Medium',
				createdById: userId
			});
			suiteId = created.id;
			result.importedSuites += 1;
		}

		for (const c of suite.cases ?? []) {
			if (!c || typeof c.title !== 'string' || !c.title.trim()) {
				result.skippedCases += 1;
				continue;
			}

			const caseCollides =
				c.displayId &&
				prefixOf(c.displayId) === project.testCasePrefix &&
				(await prisma.testCase.findUnique({
					where: { projectId_displayId: { projectId, displayId: c.displayId } }
				}));
			if (caseCollides) {
				result.skippedCases += 1;
				continue;
			}

			const created = await testCaseService.create(projectId, {
				suiteId,
				title: c.title.trim(),
				description: c.description ?? '',
				priority: c.priority ?? 'Medium',
				createdById: userId
			});
			if (created && Array.isArray(c.steps) && c.steps.length > 0) {
				await testCaseService.upsertSteps(projectId, created.id, c.steps);
			}
			result.importedCases += 1;
		}
	}

	return result;
}

module.exports = { importTestCases };
