FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 STUDIO_DATABASE_PATH=/data/studio.sqlite
WORKDIR /app
# The Docker context is an explicit allowlist; no credentials, private Worker
# configuration, data files, tests or dependencies enter this image.
COPY --chown=node:node . .
RUN node scripts/build-site.mjs && chown -R node:node /app/dist && mkdir /data && chown node:node /data
EXPOSE 3000
# Prepares the mounted volume, then permanently drops privileges before HTTP.
CMD ["node", "server/entrypoint.mjs"]
