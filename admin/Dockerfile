# ==============================================================================
# Admin Dashboard Dockerfile
# ==============================================================================
# Lightweight Node.js container for the admin dashboard.
#
# Build:
#   docker build -t remote-support-admin ./admin
#
# Run:
#   docker run -p 3001:3001 -v ./data:/app/data remote-support-admin
#
# ==============================================================================

FROM node:20-alpine

# Labels
LABEL maintainer="Remote Support"
LABEL description="Admin Dashboard for Remote Support Stack"

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY backend/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy backend source
COPY backend/ ./

# Copy frontend files
COPY frontend/ ./frontend/

# Create data directory
RUN mkdir -p /app/data && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Environment variables (can be overridden)
ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_PATH=/app/data

# Expose port (configurable via PORT env var)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:${PORT}/api/health || exit 1

# Start the server
CMD ["node", "server.js"]
