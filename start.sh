#!/bin/bash
cd "$(dirname "$0")"

# Load environment
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY not set in .env"
    echo "Get your API key at: https://console.anthropic.com/"
    exit 1
fi

# Start the server
echo "Starting SecureAgent on http://localhost:${PORT:-3000}"
npm run dev
