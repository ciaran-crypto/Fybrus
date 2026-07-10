#!/bin/bash
# Self-contained: build already done via `npm run build:local`.
# Loads .env and serves the bundled API + static frontend on one port.
cd /Users/ciaranohare/PaystraxDashboardV3
set -a; source .env; set +a
export NODE_ENV=production
exec node dist/index.js
