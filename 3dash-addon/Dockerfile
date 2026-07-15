ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20
FROM ${BUILD_FROM}

RUN apk add --no-cache nginx

# dist/ is produced by CI (npm run build -- --mode addon) before the image build
COPY dist /var/www/html
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY run.sh /etc/services.d/nginx/run
RUN chmod +x /etc/services.d/nginx/run
