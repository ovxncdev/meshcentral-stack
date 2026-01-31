# ==============================================================================
# Notifications Service Dockerfile
# ==============================================================================
# Lightweight service that receives webhooks from MeshCentral
# and forwards them to the admin dashboard.
# ==============================================================================

FROM node:20-alpine

LABEL maintainer="Remote Support"
LABEL description="Webhook receiver for MeshCentral notifications"

WORKDIR /app

# Create minimal package.json
RUN echo '{"name":"notifications","version":"1.0.0","main":"server.js"}' > package.json

# Copy server
COPY server.js .

# Non-root user
RUN chown -R node:node /app
USER node

ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "server.js"]
