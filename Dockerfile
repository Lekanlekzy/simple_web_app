FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --include=optional --no-audit --no-fund

COPY . .
RUN npm run build

# Central CI supplies the exact commit for the deployment health check.
ARG APP_REVISION=local
RUN node -e "require('node:fs').writeFileSync('release.json', JSON.stringify({ revision: process.env.APP_REVISION }) + '\n')"

FROM node:24-bookworm-slim AS runtime

# npm is a build tool here; remove its unused dependencies from the runtime.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app

# The server uses Node built-ins; runtime needs no npm dependencies.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs /app/release.json ./

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
