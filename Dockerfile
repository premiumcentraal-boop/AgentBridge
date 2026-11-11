FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 STUDIO_DATABASE_PATH=/data/studio.sqlite
WORKDIR /app
# The Docker context is an explicit allowlist; no credentials, private Worker
# configuration, data files, tests or local dependencies enter this image.
COPY --chown=node:node . .
# Astryx/React are build dependencies. The HTTP service stays dependency-free.
# Railway's builder only supports cache mounts, so no secret mount is used here.
RUN npm --prefix web ci --include=dev --ignore-scripts --no-audit --no-fund && \
    node scripts/build-site.mjs && \
    rm -rf web/node_modules web/.cache /root/.npm && \
    chown -R node:node /app/dist && mkdir /data && chown node:node /data
EXPOSE 3000
# Prepares the mounted volume, then permanently drops privileges before HTTP.
CMD ["node", "server/entrypoint.mjs"]
