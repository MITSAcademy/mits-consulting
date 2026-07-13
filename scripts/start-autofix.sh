#!/bin/bash
# Start the MITS auto-fix webhook server
# Usage: ./start-autofix.sh [--ngrok]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.autofix"

# Find node binary
NODE_BIN=$(command -v node 2>/dev/null || echo "/Users/shivamaggarwal/.local/node20/bin/node")
if [ ! -x "$NODE_BIN" ]; then
  echo "ERROR: node not found. Set PATH or install Node.js."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Copy $SCRIPT_DIR/.env.autofix.example to $SCRIPT_DIR/.env.autofix and fill in your values."
  exit 1
fi

# Load env
export $(grep -v '^#' "$ENV_FILE" | xargs)

echo "Starting MITS auto-fix webhook server..."
echo "  Port: ${AUTOFIX_PORT:-7891}"
echo "  Repo: ${MITS_REPO_PATH:-/Users/shivamaggarwal/mits-consulting}"

# Start server in background if --ngrok flag passed
if [[ "$1" == "--ngrok" ]]; then
  "$NODE_BIN" "$SCRIPT_DIR/autofix-webhook.js" &
  SERVER_PID=$!
  echo "  Server PID: $SERVER_PID"
  sleep 1
  echo ""
  echo "Starting ngrok tunnel..."
  ngrok http ${AUTOFIX_PORT:-7891}
  kill $SERVER_PID 2>/dev/null
else
  "$NODE_BIN" "$SCRIPT_DIR/autofix-webhook.js"
fi
