/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

export const PAGE_TITLE = 'AI Agent, Plum';
export const HEADING = 'AI Agent';
export const HEADER_DESC =
	'Chat with an agent that can browse, write tests, run them, and open a pull request.';

export const CHAT_TAB_LABEL = 'Session';
export const HISTORY_TAB_LABEL = 'History';

export const PROVIDER_LABEL = 'Provider';
export const PROVIDER_ANTHROPIC_LABEL = 'Claude';
export const PROVIDER_OPENAI_LABEL = 'OpenAI';
export const NO_PROVIDER_CONFIGURED =
	'No AI provider is connected yet. Add a key in Settings → Integrations.';
export const TITLE_LABEL = 'Title';
export const TITLE_PLACEHOLDER = 'What are you working on?';
export const NODES_LABEL = 'Nodes';
export const START_SESSION_LABEL = 'Start Session';
export const STARTING_SESSION_LABEL = 'Starting…';
export const NO_GITHUB_REPO_ERROR =
	'This project has no GitHub repo connected. Connect one in Settings before starting an AI session.';

export const MESSAGE_PLACEHOLDER = 'Tell the agent what to do…';
export const SEND_LABEL = 'Send';
export const SENDING_LABEL = 'Sending…';
export const END_SESSION_LABEL = 'End Session';
export const NEW_SESSION_LABEL = '+ New Session';
export const OPEN_PR_LABEL = 'View Pull Request';

export const BROWSER_PANEL_TITLE = 'Browser';
export const BROWSER_PANEL_EMPTY =
	'No browser activity yet. The agent shares a screenshot here when it drives the browser.';
export const BROWSER_PANEL_UNAVAILABLE =
	'Live browser control is available for Claude sessions only.';

export const NO_SESSIONS_YET_TITLE = 'No AI sessions yet';
export const NO_SESSIONS_YET_DESC =
	'Start a session to have the agent write and run tests for you.';
export const NOT_YOUR_SESSION = 'Only the session creator can open it.';

export const STATUS_LABEL = {
	queued: 'Queued',
	running: 'Running',
	done: 'Done',
	error: 'Error'
};

export const FAILED_TO_LOAD_SESSIONS = 'Failed to load AI sessions.';
export const FAILED_TO_START_SESSION = 'Failed to start session.';
export const FAILED_TO_SEND_MESSAGE = 'Failed to send message.';

export const sessionSubtitle = (session) =>
	`${session.provider === 'openai' ? PROVIDER_OPENAI_LABEL : PROVIDER_ANTHROPIC_LABEL} · ${
		STATUS_LABEL[session.status] || session.status
	}`;
