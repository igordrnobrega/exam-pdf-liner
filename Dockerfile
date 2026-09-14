# Build the static bundle once and ship it in a tiny nginx image.
# Pi-friendly: both stages have arm64 variants; CI publishes multi-arch.

# ---- Stage 1: build ----
FROM node:22-alpine AS builder
WORKDIR /web
# Don't copy package-lock.json — rollup's optional native deps are
# platform-specific (npm/cli#4828) and the lock pins one platform's binary.
# Letting npm install resolve fresh keeps the image buildable on any arch.
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . ./
RUN npm run build

# ---- Stage 2: serve ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /web/dist /usr/share/nginx/html
EXPOSE 80
