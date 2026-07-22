#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dev}"
REPORT="lighthouse-report.html"
FLAGS="--headless"

case "$MODE" in
  dev)
    URL="http://localhost:3000"
    echo "Running Lighthouse against dev server at $URL"
    echo "(Make sure 'npm run dev' is running)"
    ;;
  build)
    echo "Building static export..."
    npx next build
    PORT=3099
    npx serve out -p $PORT -s &
    SERVE_PID=$!
    trap "kill $SERVE_PID 2>/dev/null" EXIT
    echo "Waiting for static server..."
    sleep 2
    URL="http://localhost:$PORT"
    echo "Running Lighthouse against static build at $URL"
    ;;
  *)
    echo "Usage: $0 [dev|build]"
    echo "  dev   — run against the dev server (default, must be running on :3000)"
    echo "  build — build static export, serve it, then run Lighthouse"
    exit 1
    ;;
esac

npx lighthouse "$URL" \
  --output html \
  --output-path "./$REPORT" \
  --chrome-flags="--$FLAGS" \
  --quiet

echo "Report saved to $REPORT"
open "./$REPORT" 2>/dev/null || echo "Open $REPORT in your browser"
