#!/usr/bin/env bash
# Pre-release quality gate enforcer
# Intercepts Bash tool calls containing "gh release create" and blocks them
# unless all 4 quality-gate stage markers are present in the TopGun gate state file.
#
# State file: ~/.topgun/quality-gate.state  (TopGun-owned, not SB state)
# Stage count and marker names are defined in docs/pre-release-quality-gate.md.
# Each stage in that document ends with:
#   echo "quality-gate-stage-N" >> ~/.topgun/quality-gate.state
# If stages are added or removed from that document, update the loop below
# and commit both files together.
#
# To reset between release sessions:
#   rm ~/.topgun/quality-gate.state

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null)

# Only act on gh release create calls
if [[ "$COMMAND" != *"gh release create"* ]]; then
  exit 0
fi

STATE_FILE="$HOME/.topgun/quality-gate.state"

missing=()
for stage in 1 2 3 4; do
  if ! grep -q "quality-gate-stage-${stage}" "$STATE_FILE" 2>/dev/null; then
    missing+=("Stage ${stage}")
  fi
done

if [ ${#missing[@]} -eq 0 ]; then
  exit 0
fi

echo "" >&2
echo "╔══════════════════════════════════════════════════════════════╗" >&2
echo "║  BLOCKED: Pre-Release Quality Gate not complete              ║" >&2
echo "╠══════════════════════════════════════════════════════════════╣" >&2
for m in "${missing[@]}"; do
  printf "║  ✗ %-59s║\n" "$m missing" >&2
done
echo "╠══════════════════════════════════════════════════════════════╣" >&2
echo "║  Run all 4 stages in docs/pre-release-quality-gate.md        ║" >&2
echo "║  before cutting a release.                                   ║" >&2
echo "╚══════════════════════════════════════════════════════════════╝" >&2
echo "" >&2

exit 1
