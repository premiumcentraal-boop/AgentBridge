FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY index.html favicon.svg _headers robots.txt sitemap.xml ./
COPY assets ./assets
COPY how-it-works ./how-it-works
COPY pricing ./pricing
COPY connect ./connect
COPY docs ./docs
COPY app ./app
COPY studio ./studio
RUN node scripts/build-site.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 STUDIO_DATABASE_PATH=/data/studio.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server/*.mjs ./server/
# Only the bounded body reader is shared; the telephony Worker is not loaded.
COPY --chown=node:node backend/src/bounded-body.mjs ./backend/src/bounded-body.mjs
RUN mkdir /data && chown node:node /data
EXPOSE 3000
CMD ["node", "server/entrypoint.mjs"]
