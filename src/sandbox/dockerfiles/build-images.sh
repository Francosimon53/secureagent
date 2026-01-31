#!/bin/bash
# Build all sandbox Docker images
# Usage: ./build-images.sh [--push]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="${DOCKER_REGISTRY:-secureagent}"
PUSH=false

if [[ "$1" == "--push" ]]; then
    PUSH=true
fi

echo "Building SecureAgent sandbox images..."
echo "Registry: $REGISTRY"
echo ""

# Build Python image
echo "Building Python sandbox image..."
docker build \
    -f "$SCRIPT_DIR/Dockerfile.python" \
    -t "$REGISTRY/sandbox-python:latest" \
    "$SCRIPT_DIR"
echo "✓ Python image built"

# Build Node.js image
echo "Building Node.js sandbox image..."
docker build \
    -f "$SCRIPT_DIR/Dockerfile.node" \
    -t "$REGISTRY/sandbox-node:latest" \
    "$SCRIPT_DIR"
echo "✓ Node.js image built"

# Build Bash image
echo "Building Bash sandbox image..."
docker build \
    -f "$SCRIPT_DIR/Dockerfile.bash" \
    -t "$REGISTRY/sandbox-bash:latest" \
    "$SCRIPT_DIR"
echo "✓ Bash image built"

echo ""
echo "All images built successfully!"
echo ""

# List images
docker images | grep "$REGISTRY/sandbox"

# Push if requested
if [[ "$PUSH" == "true" ]]; then
    echo ""
    echo "Pushing images to registry..."
    docker push "$REGISTRY/sandbox-python:latest"
    docker push "$REGISTRY/sandbox-node:latest"
    docker push "$REGISTRY/sandbox-bash:latest"
    echo "✓ All images pushed"
fi
