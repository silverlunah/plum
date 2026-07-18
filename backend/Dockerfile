#
# This file is part of Plum.
# Licensed under the MIT License. See LICENSE file in the project root for details.
#

FROM mcr.microsoft.com/playwright:v1.50.0
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install
RUN npx playwright install --with-deps

COPY . .

RUN npx prisma generate
RUN npm run create-env && sed -i 's/^IS_HEADLESS=false/IS_HEADLESS=true/' .env

EXPOSE 3001
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
