ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20

# Stage 1: Build the SPA
FROM node:20-alpine AS builder

ARG BUILD_VERSION
RUN apk add --no-cache git
WORKDIR /app
RUN git clone --depth 1 https://github.com/kdcius/3Dash_webapp.git .
RUN npm ci
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build -- --mode addon

# Stage 2: Serve with nginx on HA base image
FROM ${BUILD_FROM}

RUN apk add --no-cache nginx

COPY --from=builder /app/dist /var/www/html
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY run.sh /etc/services.d/nginx/run
RUN chmod +x /etc/services.d/nginx/run
