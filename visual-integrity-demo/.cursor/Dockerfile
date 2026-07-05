FROM node:23.6-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /workspace

# Playwright system deps for chromium (idempotent with install --with-deps)
RUN npx --yes playwright@1.50.1 install-deps chromium || true
