/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const slug = (s) =>
	String(s)
		.replace(/[^a-z0-9]+/gi, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase() || 'export';

const CONTENT_TYPE = {
	json: 'application/json; charset=utf-8',
	csv: 'text/csv; charset=utf-8'
};

const exportFormat = (req) => (String(req.query.format).toLowerCase() === 'csv' ? 'csv' : 'json');

/**
 * Renders and sends one of `renderers` (keyed by format) as a downloadable
 * file. Each renderer is a function returning the body (or a promise of it);
 * only the requested format's renderer runs.
 */
async function sendExport(res, { format, filenameBase, ...renderers }) {
	if (typeof renderers[format] !== 'function') {
		return res.status(400).json({ error: `Unsupported export format: ${format}` });
	}
	const name = `${slug(filenameBase)}-${new Date().toISOString().slice(0, 10)}.${format}`;
	res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
	res.setHeader('Content-Type', CONTENT_TYPE[format]);

	const body = await renderers[format]();
	if (format === 'json') return res.send(JSON.stringify(body, null, 2));
	res.send(body);
}

module.exports = { sendExport, exportFormat };
