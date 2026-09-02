#
# This file is part of Plum.
# Licensed under the MIT License. See LICENSE file in the project root for details.
#

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY .npmrc package.json package-lock.json ./
RUN npm ci

COPY svelte.config.js vite.config.js jsconfig.json ./
COPY static ./static
COPY src ./src

# Vite inlines import.meta.env.VITE_API_URL into the client bundle at build time,
# but operators point Plum at a different API host without rebuilding the image
# (`plum server` writes VITE_API_URL into docker-compose.override.yml at runtime).
# So the bundle is built with a sentinel that the entrypoint substitutes on every
# container start; src/lib/constants.js needs no change for this to work.
ENV VITE_API_URL=__PLUM_VITE_API_URL__
RUN npm run build

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production

COPY .npmrc package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Baked fallback for deployments that prefer to fix the API URL at build time.
# A runtime VITE_API_URL still wins over it.
ARG VITE_API_URL=""
ENV PLUM_API_URL_DEFAULT=${VITE_API_URL}

# Kept pristine so a restart with a different VITE_API_URL re-substitutes from
# the sentinel instead of a value a previous start already wrote in.
COPY --from=build /app/build ./build-template

COPY <<'EOF' /usr/local/bin/plum-frontend-entrypoint
#!/bin/sh
set -eu

SENTINEL=__PLUM_VITE_API_URL__
TEMPLATE=/app/build-template
SERVE=/app/build

api_url="${VITE_API_URL:-}"
[ -n "$api_url" ] || api_url="${PLUM_API_URL_DEFAULT:-}"
[ -n "$api_url" ] || api_url=http://localhost:3001
# Whitelist rather than escape: the value is spliced into a sed replacement and
# into JS string literals, so anything outside URL characters is dropped.
api_url=$(printf %s "$api_url" | tr -cd 'A-Za-z0-9:/._~%?=@+-')

rm -rf "$SERVE"
cp -R "$TEMPLATE" "$SERVE"

files=$(find "$SERVE" -type f \( -name '*.js' -o -name '*.map' -o -name '*.html' \) -exec grep -l "$SENTINEL" {} +) || true
if [ -z "$files" ]; then
	echo "plum: warning: $SENTINEL missing from the bundle, VITE_API_URL cannot be applied at runtime" >&2
else
	printf %s "$files" | tr '\n' '\0' | xargs -0 sed -i "s|$SENTINEL|$api_url|g"
	# The adapter pre-compresses at build time, so every .gz/.br sibling still holds
	# the sentinel, and that is the copy a browser actually receives. Rebuild them
	# from the substituted files.
	printf %s "$files" | PLUM_SERVE="$SERVE" node -e '
		const fs = require("fs");
		const zlib = require("zlib");
		let input = "";
		process.stdin.on("data", (c) => (input += c));
		process.stdin.on("end", () => {
			let rebuilt = 0;
			for (const file of input.split("\n").filter(Boolean)) {
				for (const ext of [".gz", ".br"]) {
					if (!fs.existsSync(file + ext)) continue;
					const raw = fs.readFileSync(file);
					fs.writeFileSync(
						file + ext,
						ext === ".gz"
							? zlib.gzipSync(raw, { level: 9 })
							: zlib.brotliCompressSync(raw)
					);
					rebuilt++;
				}
			}
			if (rebuilt > 0) console.log(`plum: rebuilt ${rebuilt} pre-compressed asset(s)`);
		});
	'
	echo "plum: serving UI with API base $api_url"
fi

exec node "$SERVE"
EOF

RUN chmod 0755 /usr/local/bin/plum-frontend-entrypoint && chown -R node:node /app

# adapter-node reads PORT/HOST; 3002 is what docker-compose.yml publishes from.
ENV PORT=3002 \
	HOST=0.0.0.0
EXPOSE 3002

USER node
CMD ["/usr/local/bin/plum-frontend-entrypoint"]
