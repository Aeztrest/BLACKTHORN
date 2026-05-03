# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
RUN pnpm --filter @deltag/web build

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
