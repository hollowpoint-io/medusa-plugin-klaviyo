#!/usr/bin/env bash
# Fails the build if client or leak identifiers survive into the public package.
set -euo pipefail
cd "$(dirname "$0")/.."
if grep -rniE 'greyhaze|grey haze|grey-haze|pk_966c4a|medusajs\.app' \
    --exclude-dir=node_modules --exclude-dir=.medusa --exclude-dir=.git \
    --exclude=check-branding.sh .; then
  echo "FAIL: brand/leak identifiers found (see matches above)"
  exit 1
fi
echo "branding gate: clean"
