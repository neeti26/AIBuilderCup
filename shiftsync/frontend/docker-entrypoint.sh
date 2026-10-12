#!/bin/sh
# Substitute BACKEND_URL into nginx config at container start, then exec nginx.
# BACKEND_URL is passed as an env var by Cloud Run (e.g. https://shiftsync-backend-xxx.run.app)

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"

echo "Starting ShiftSync frontend — backend: $BACKEND_URL"

# Replace the placeholder in nginx config with the actual backend URL
sed -i "s|BACKEND_URL_PLACEHOLDER|${BACKEND_URL}|g" /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
