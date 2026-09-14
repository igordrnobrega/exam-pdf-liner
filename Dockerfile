# Build the static bundle once and ship it in a tiny nginx image.
#
# The bundle is architecture-independent, so the build stage always runs on
# the builder's native platform ($BUILDPLATFORM) even when publishing a
# multi-arch image: no QEMU-emulated npm/vite for arm64, only the nginx stage
# is per-platform. Requires BuildKit (default in docker build / buildx).

# ---- Stage 1: build (native) ----
FROM --platform=$BUILDPLATFORM node:26-alpine AS builder
WORKDIR /web
# Dependencies first so this layer is reused until the lock changes; the npm
# cache mount keeps downloaded tarballs across builds even when it does.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . ./
RUN npm run build

# ---- Stage 2: serve (per target platform) ----
FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /web/dist /usr/share/nginx/html
EXPOSE 80
