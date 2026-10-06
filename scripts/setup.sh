#!/usr/bin/env bash
set -euo pipefail
cd /workspace/MYWED-APP
node -e 'if(Number(process.versions.node.split(".")[0])<24)throw new Error("Use Node 24 or later")'
npm ci --cache /tmp/mywed-npm-cache
npm run typecheck
npm test
npm run build
# No real workbook import, account seed, credentials, or long-running server during install.
