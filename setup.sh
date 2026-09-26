#!/bin/sh
# Writes config.js from $TYPESAFE_API_KEY (your Jev key). Re-run after rotating the key.
set -e
[ -n "$TYPESAFE_API_KEY" ] || { echo "TYPESAFE_API_KEY is not set" >&2; exit 1; }
cd "$(dirname "$0")"
printf 'const TYPESAFE_API_KEY = "%s";\n' "$TYPESAFE_API_KEY" > config.js
echo "Wrote config.js"
