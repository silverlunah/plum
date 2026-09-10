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

async function createPrivateRepo({ name, description }) {
	const token = await ownToken();
	const repo = await githubRequest('/user/repos', {
		method: 'POST',
		token,
		body: { name, description: description || '', private: true, auto_init: true }
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
// a worktree's committed/persisted .git/config.
function authArgs(token) {
	return ['-c', `http.extraheader=AUTHORIZATION: bearer ${token}`];
}

async function cloneRepo({ owner, repo, destPath, branch }) {
	const token = await ownToken();
	const url = `https://github.com/${owner}/${repo}.git`;
	const args = [...authArgs(token)];
	if (branch) args.push('--branch', branch);
	await simpleGit().clone(url, destPath, args);
	return destPath;
}

async function initRepo(destPath) {
	await simpleGit(destPath).init();
}

async function addRemote({ repoPath, owner, repo }) {
	await simpleGit(repoPath).addRemote('origin', `https://github.com/${owner}/${repo}.git`);
}

async function commitAll({ repoPath, message }) {
	const git = simpleGit(repoPath);
	await git.add('.');
	await git.commit(message);
}

async function createBranch({ repoPath, branch }) {
	await simpleGit(repoPath).checkoutLocalBranch(branch);
}

async function pushBranch({ repoPath, branch }) {
	const token = await ownToken();
	await simpleGit(repoPath).raw([...authArgs(token), 'push', '-u', 'origin', branch]);
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
