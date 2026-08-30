/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Minimal in-memory fixed-window limiter — single-process, enough to blunt
// online credential guessing on /auth. Not a substitute for an edge WAF.
const buckets = new Map();

function rateLimit({ windowMs, max, key, message = 'Too many attempts — try again later.' }) {
	return (req, res, next) => {
		const k = key(req);
		const now = Date.now();
		const bucket = buckets.get(k);
		if (!bucket || now - bucket.start >= windowMs) {
			buckets.set(k, { start: now, count: 1 });
			return next();
		}
		bucket.count += 1;
		if (bucket.count > max) return res.status(429).json({ error: message });
		next();
	};
}

setInterval(() => {
	const cutoff = Date.now() - 3_600_000;
	for (const [k, b] of buckets) if (b.start < cutoff) buckets.delete(k);
}, 10 * 60_000).unref();

module.exports = { rateLimit };
