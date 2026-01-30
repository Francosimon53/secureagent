# =============================================================================
# SecureAgent Dockerfile
# =============================================================================
# Multi-stage build for optimized production images
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:20-slim AS production

# Create non-root user for security
RUN groupadd --gid 1001 secureagent \
    && useradd --uid 1001 --gid secureagent --shell /bin/bash --create-home secureagent

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder --chown=secureagent:secureagent /app/dist ./dist
COPY --from=builder --chown=secureagent:secureagent /app/node_modules ./node_modules
COPY --from=builder --chown=secureagent:secureagent /app/package*.json ./

# Create data directory
RUN mkdir -p /app/data && chown -R secureagent:secureagent /app/data

# Switch to non-root user
USER secureagent

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]

# -----------------------------------------------------------------------------
# Stage 3: Development
# -----------------------------------------------------------------------------
FROM node:20-slim AS development

WORKDIR /app

# Install development dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source and config
COPY tsconfig.json ./
COPY src/ ./src/
COPY tests/ ./tests/

# Create data directory
RUN mkdir -p /app/data

# Environment variables
ENV NODE_ENV=development
ENV PORT=3000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Start with watch mode
CMD ["npm", "run", "dev"]
