/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Plum is reverse-proxied behind whatever domain each self-hoster picks
		// (see "Setting Up the Server" docs), so the Host header can't be known
		// ahead of time. Disable Vite's dev-server host allowlist check entirely.
		allowedHosts: true
	}
});
