#!/bin/bash
set -e
echo "=== Type Check ===" && npx tsc --noEmit
echo "=== Lint ===" && npx next lint
echo "=== Build ===" && npx next build
echo "=== Done ==="
