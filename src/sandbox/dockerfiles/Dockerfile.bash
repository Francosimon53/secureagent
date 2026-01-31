# SecureAgent Sandbox - Bash Runtime
# Minimal, secure Alpine environment for sandboxed shell execution
#
# Security features:
# - Alpine base (minimal attack surface)
# - Non-root user (nobody:nogroup)
# - Read-only filesystem compatible
# - No network utilities (curl, wget removed)
# - Limited shell utilities

FROM alpine:3.19

# Install only essential utilities
RUN apk add --no-cache \
        bash \
        coreutils \
        grep \
        sed \
        awk \
        jq \
        bc \
        findutils \
        && \
    # Remove network utilities
    rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true && \
    # Clean up
    rm -rf /var/cache/apk/* /tmp/*

# Create sandbox directory
RUN mkdir -p /sandbox /tmp/sandbox && \
    chmod 755 /sandbox && \
    chmod 1777 /tmp/sandbox

# Set working directory
WORKDIR /sandbox

# Security: Run as nobody user
USER 65534:65534

# Environment
ENV HOME=/tmp/sandbox \
    SHELL=/bin/bash

# Default command (will be overridden)
CMD ["bash", "-c", "echo 'Sandbox ready'"]
