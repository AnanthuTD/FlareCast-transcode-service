FROM node:23-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache ffmpeg

COPY package.json pnpm-lock.yaml ./

RUN corepack enable pnpm && pnpm install

# COPY prisma ./prisma
# RUN npx prisma generate || true

COPY . .
