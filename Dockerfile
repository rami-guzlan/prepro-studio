# PrePro Studio hosted version (Cloud Run). See docs/CLOUD.md.
FROM node:22-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production ELECTRON_SKIP_BINARY_DOWNLOAD=1 STORAGE=gcs
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY electron/mcp.cjs ./electron/mcp.cjs
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
