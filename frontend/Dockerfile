#
# This file is part of Plum.
# Licensed under the MIT License. See LICENSE file in the project root for details.
#

FROM node:18-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
