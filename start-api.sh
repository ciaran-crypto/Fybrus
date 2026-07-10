#!/bin/bash
cd /Users/ciaranohare/PaystraxDashboardV3
set -a; source .env; set +a
npx tsx server/index.ts
