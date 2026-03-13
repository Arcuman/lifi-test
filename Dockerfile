FROM node:24.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24.14.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV APP_MODE=all
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/src/app/bootstrap/dev-all.js"]
