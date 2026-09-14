/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const simpleGit = require('simple-git');
const settingsService = require('./settingsService');

const GITHUB_API = 'https://api.github.com';

async function ownToken() {
	const org = await settingsService.getOrgRaw();
	if (!org.githubToken) {
		const e = new Error('GitHub is not connected. Add a personal access token in Integrations.');
		e.status = 400;
		throw e;
	}
	return org.githubToken;
}

async function githubRequest(path, { method = 'GET', token, body } = {}) {
	const res = await fetch(`${GITHUB_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...(body && { 'Content-Type': 'application/json' })
		},
		...(body && { body: JSON.stringify(body) }),
		signal: AbortSignal.timeout(10000)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const e = new Error(data.message || `GitHub API responded ${res.status}`);
		e.status = res.status === 401 || res.status === 403 ? 400 : 502;
		throw e;
	}
	return data;
}

const toPublicRepo = (r) => ({
	owner: r.owner.login,
	name: r.name,
	fullName: r.full_name,
	private: r.private,
	defaultBranch: r.default_branch,
	htmlUrl: r.html_url,
	cloneUrl: r.clone_url
});

async function verifyConnection() {
	const token = await ownToken();
	const user = await githubRequest('/user', { token });
	return { username: user.login, name: user.name, avatarUrl: user.avatar_url };
}

async function listRepos({ page = 1, perPage = 50 } = {}) {
	const token = await ownToken();
	const repos = await githubRequest(
		`/user/repos?sort=updated&per_page=${perPage}&page=${page}&affiliation=owner,collaborator`,
		{ token }
	);
	return repos.map(toPublicRepo);
}

// No auto_init: a caller pushing its own initial commit right after creating the
// repo would otherwise collide with GitHub's own auto-generated first commit.
async function createPrivateRepo({ name, description }) {
	const token = await ownToken();
	const repo = await githubRequest('/user/repos', {
		method: 'POST',
		token,
		body: { name, description: description || '', private: true, auto_init: false }
	});
	return toPublicRepo(repo);
}

async function openPullRequest({ owner, repo, head, base, title, body }) {
	const token = await ownToken();
	const pr = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
		method: 'POST',
		token,
		body: { head, base, title, body: body || '' }
	});
	return { number: pr.number, url: pr.html_url };
}

// Every git operation below authenticates via a per-invocation `http.extraheader`
// rather than embedding the token in the remote URL, so the token never lands in
// a worktree's committed/persisted .git/config. GitHub's git-over-HTTPS backend
// only accepts Basic auth here (same as actions/checkout's own credential
// helper) - a bearer-scheme header gets a 401, and git's own fallback to an
// interactive prompt on that 401 is what actually surfaces, a generic "could
// not read Username" with no hint the header scheme itself was the problem.
function authArgs(token) {
	const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
	return ['-c', `http.extraheader=AUTHORIZATION: basic ${basic}`];
}

// A rejected credential and a git-protocol-level auth failure look identical
// by the time they reach here (git retries with an interactive prompt either
// way, which fails the same way in a container with no TTY), so both need
// this rewrite: raw text like "could not read Username ... No such device or
// address" means nothing to whoever pasted the token, not what actually went
// wrong with it.
function isGitAuthFailure(message) {
	return /could not read username|authentication failed|invalid credentials/i.test(message || '');
}

async function cloneRepo({ owner, repo, destPath, branch }) {
	const token = await ownToken();
	const url = `https://github.com/${owner}/${repo}.git`;
	const args = [...authArgs(token)];
	if (branch) args.push('--branch', branch);
	try {
		await simpleGit().clone(url, destPath, args);
	} catch (e) {
		if (isGitAuthFailure(e.message)) {
			const err = new Error(
				`GitHub rejected this token for ${owner}/${repo}. Check it hasn't expired and has repo access.`
			);
			err.status = 400;
			throw err;
		}
		throw e;
	}
	// `-c` on clone persists into .git/config, so a later push adding its own -c
	// sends the header twice - GitHub rejects that outright. Strip it back out.
	await simpleGit(destPath)
		.raw(['config', '--unset', 'http.extraheader'])
		.catch(() => {});
	return destPath;
}

async function initRepo(destPath, { defaultBranch = 'main' } = {}) {
	await simpleGit(destPath).init(['--initial-branch', defaultBranch]);
}

async function addRemote({ repoPath, owner, repo }) {
	await simpleGit(repoPath).addRemote('origin', `https://github.com/${owner}/${repo}.git`);
}

// A freshly git-init'd worktree has no identity configured; scoped `local` so
// it never touches the container's/host's global git config.
async function commitAll({ repoPath, message }) {
	const git = simpleGit(repoPath);
	await git.addConfig('user.name', 'Plum', false, 'local');
	await git.addConfig('user.email', 'plum@localhost', false, 'local');
	await git.add('.');
	await git.commit(message);
}

async function createBranch({ repoPath, branch }) {
	await simpleGit(repoPath).checkoutLocalBranch(branch);
}

async function pushBranch({ repoPath, branch }) {
	const token = await ownToken();
	try {
		await simpleGit(repoPath).raw([...authArgs(token), 'push', '-u', 'origin', branch]);
	} catch (e) {
		if (isGitAuthFailure(e.message)) {
			const err = new Error(
				"GitHub rejected this token. Check it hasn't expired and has repo write access."
			);
			err.status = 400;
			throw err;
		}
		throw e;
	}
}

module.exports = {
	verifyConnection,
	listRepos,
	createPrivateRepo,
	openPullRequest,
	cloneRepo,
	initRepo,
	addRemote,
	commitAll,
	createBranch,
	pushBranch
};
