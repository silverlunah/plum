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

const getProject = async () => {
	let project = await prisma.project.findUnique({ where: { id: 1 } });
	if (!project) {
		project = await prisma.project.create({ data: { id: 1 } });
	}
	return project;
};

const updateProject = async ({ name, logoUrl }) => {
	return prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1, name: name ?? '', logoUrl: logoUrl ?? '' },
		update: { name: name ?? '', logoUrl: logoUrl ?? '' }
	});
};

const getTestPrefixes = async () => {
	const project = await getProject();
	return { testCasePrefix: project.testCasePrefix, testSuitePrefix: project.testSuitePrefix };
};

const updateTestPrefixes = async ({ testCasePrefix, testSuitePrefix }) => {
	return prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1 },
		update: {
			...(testCasePrefix !== undefined && { testCasePrefix }),
			...(testSuitePrefix !== undefined && { testSuitePrefix })
		}
	});
};

module.exports = { getProject, updateProject, getTestPrefixes, updateTestPrefixes };
