/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Manual CLI harness for the AI agent engine, there is no UI for it yet
// (that's Phase 6). Requires a project with a connected GitHub repo and an
// org with the chosen provider's key set, both configured through the normal
// Settings UI first.
//
// Usage: node config/scripts/ai-session-test.mjs --project=1 --provider=anthropic --message="List the files here" [--keep]

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const aiSessionService = require('../../services/aiSessionService.js');
const aiAgentService = require('../../services/aiAgentService.js');
const prisma = require('../../services/prisma.js');

function parseArgs() {
	const args = {};
	for (const arg of process.argv.slice(2)) {
		const [key, ...rest] = arg.replace(/^--/, '').split('=');
		args[key] = rest.length ? rest.join('=') : true;
	}
	return args;
}

async function main() {
	const args = parseArgs();
	if (!args.project || !args.provider || !args.message) {
		console.error(
			'Usage: node ai-session-test.mjs --project=<id> --provider=anthropic|openai --message="..." [--keep]'
		);
		process.exit(1);
	}

	const owner = await prisma.user.findFirst({ where: { role: 'owner' } });
	console.log(`Creating a ${args.provider} session on project ${args.project}…`);
	const session = await aiSessionService.createSession({
		projectId: Number(args.project),
		userId: owner.id,
		provider: args.provider,
		title: 'CLI harness session'
	});
	console.log(`Session ${session.id}, workspace at ${session.workspacePath}`);

	try {
		console.log('Sending message…');
		const result = await aiAgentService.runTurn(session, args.message);
		console.log(JSON.stringify(result, null, 2));
	} finally {
		if (!args.keep) {
			await aiSessionService.removeWorkspace(session);
			await aiSessionService.endSession(session.id, 'done');
			console.log('Cleaned up (pass --keep to inspect the workspace afterwards).');
		}
	}
	process.exit(0);
}

main().catch((e) => {
	console.error('FAILED:', e.message);
	process.exit(1);
});
