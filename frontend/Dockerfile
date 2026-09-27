FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@10.17.1 --activate && pnpm install --frozen-lockfile

COPY . .
EXPOSE 5173
CMD ["pnpm", "dev"]
