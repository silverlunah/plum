/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const FRONTEND_PORT = 3002;

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// 3002 is Plum's UI port everywhere; not strict, so `npm run dev` still
		// starts (on the next free port) while a container already holds 3002.
		port: FRONTEND_PORT,
		// `vite dev` only: developers reach the HMR server through whatever
		// hostname their machine or tunnel answers on, so the Host header can't be
		// known ahead of time. The deployed UI is a real build served by
		// adapter-node (see frontend/Dockerfile) and never reaches this setting.
		allowedHosts: true
	},
	preview: {
		port: FRONTEND_PORT,
		allowedHosts: true
	}
});
