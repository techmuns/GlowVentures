FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG SOURCE_COMMIT
RUN test ${#SOURCE_COMMIT} -eq 40 && printf '%s' "$SOURCE_COMMIT" > /app/.processor-commit
RUN npm run build:views && npm run build:statement-files
RUN mkdir -p /app/.cache/rapid-statement-publications && chown -R node:node /app/.cache
ENV NODE_ENV=production PORT=8788
EXPOSE 8788
USER node
CMD ["node", "scripts/ingest/rapid-server.mjs"]
