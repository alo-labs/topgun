#!/usr/bin/env bash
# TopGun PreToolUse:Write hook
# Blocks writing found-skills-*.json unless 18 partial registry files exist

set -euo pipefail

INPUT=$(cat)

# Use python3 to extract file_path (always available on macOS)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_path',''))" 2>/dev/null || echo "")

# Only intercept found-skills-*.json writes
if [[ "$FILE_PATH" != *"found-skills-"* ]]; then
  exit 0
fi

# Extract hash from filename like ~/.topgun/found-skills-abc123.json
HASH=$(basename "$FILE_PATH" .json | sed 's/found-skills-//')
TOPGUN_HOME="$HOME/.topgun"

COUNT=$(ls "$TOPGUN_HOME/registry-${HASH}-"*.json 2>/dev/null | wc -l | tr -d ' ')

if [ "$COUNT" -lt 18 ]; then
  echo "TopGun hook BLOCKED: found-skills write rejected — only ${COUNT}/18 partial registry files exist at ${TOPGUN_HOME}/registry-${HASH}-*.json. The dispatch-registries step did not complete or was skipped. This write is not allowed." >&2
  exit 1
fi

exit 0
