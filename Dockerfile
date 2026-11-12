FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY client client
COPY shared shared
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server server
COPY --chown=node:node shared shared
COPY --chown=node:node --from=build /app/client/dist client/dist
USER node
EXPOSE 3001
CMD ["node", "server/src/index.js"]
