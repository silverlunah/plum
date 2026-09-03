#
# This file is part of Plum.
# Licensed under the MIT License. See LICENSE file in the project root for details.
#

FROM mcr.microsoft.com/playwright:v1.62.1
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps

COPY . .

# The legacy single-project tests dir is not shipped (it is .npmignore'd) and a
# fresh multi-project install has no host tests/ to bind-mount over it, but the
# server still asserts /app/tests exists on boot. Real tests live under
# /app/projects/<slug>/tests; this just satisfies the check.
RUN mkdir -p /app/tests

RUN npx prisma generate
RUN npm run create-env && sed -i 's/^IS_HEADLESS=false/IS_HEADLESS=true/' .env

EXPOSE 3001
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
