FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 STUDIO_DATABASE_PATH=/data/studio.sqlite
WORKDIR /app
ARG RAILWAY_GIT_COMMIT_SHA
# The Docker context is an explicit allowlist; no credentials, private Worker
# configuration, data files, tests or local dependencies enter this image.
COPY --chown=node:node . .
# Astryx/React build the website; the account MCP service uses pinned runtime dependencies.
# Railway's builder only supports cache mounts, so no secret mount is used here.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && \
    npm --prefix web ci --include=dev --ignore-scripts --no-audit --no-fund && \
    AGENTBRIDGE_SOURCE_COMMIT="$RAILWAY_GIT_COMMIT_SHA" node scripts/build-site.mjs && \
    rm -rf web/node_modules web/.cache /root/.npm && \
    chown -R node:node /app/dist && mkdir /data && chown node:node /data
EXPOSE 3000
# Prepares the mounted volume, then permanently drops privileges before HTTP.
CMD ["node", "server/entrypoint.mjs"]
