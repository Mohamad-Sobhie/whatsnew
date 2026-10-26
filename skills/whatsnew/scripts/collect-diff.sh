#!/usr/bin/env bash
# Collect everything the agent needs to understand what changed between two branches.
# Usage: collect-diff.sh [base] [head] [max_diff_lines]
# Writes: whatsnew-output/diff-context.md (relative to the repo root)
# Works with macOS's default bash 3.2.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "error: not inside a git repository" >&2; exit 1; }
cd "$ROOT"

default_base() {
  local ref
  ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  if [ -n "$ref" ]; then echo "${ref#origin/}"; return; fi
  for b in main master develop; do
    if git rev-parse --verify --quiet "$b" >/dev/null; then echo "$b"; return; fi
  done
  echo "main"
}

BASE="${1:-$(default_base)}"
HEAD="${2:-$(git rev-parse --abbrev-ref HEAD)}"
MAX_LINES="${3:-1500}"

resolve() {
  # Accept local branches, remote branches, tags or SHAs.
  if git rev-parse --verify --quiet "$1^{commit}" >/dev/null; then echo "$1"; return; fi
  if git rev-parse --verify --quiet "origin/$1^{commit}" >/dev/null; then echo "origin/$1"; return; fi
  echo "error: cannot find '$1' (try 'git fetch' first)" >&2; exit 1
}
BASE_REF="$(resolve "$BASE")"
HEAD_REF="$(resolve "$HEAD")"

MERGE_BASE="$(git merge-base "$BASE_REF" "$HEAD_REF")" || { echo "error: '$BASE' and '$HEAD' share no history" >&2; exit 1; }
COMMIT_COUNT="$(git rev-list --count --no-merges "$MERGE_BASE..$HEAD_REF")"

if [ "$COMMIT_COUNT" = "0" ] && git diff --quiet "$MERGE_BASE" "$HEAD_REF"; then
  echo "error: '$HEAD' has no changes compared to '$BASE'" >&2; exit 2
fi

# Noise we never want in the diff the agent reads.
EXCLUDES=(
  ':(exclude,glob)**/package-lock.json' ':(exclude,glob)**/yarn.lock' ':(exclude,glob)**/pnpm-lock.yaml'
  ':(exclude,glob)**/bun.lockb' ':(exclude,glob)**/Cargo.lock' ':(exclude,glob)**/poetry.lock'
  ':(exclude,glob)**/composer.lock' ':(exclude,glob)**/Gemfile.lock' ':(exclude,glob)**/packages.lock.json'
  ':(exclude,glob)**/dist/**' ':(exclude,glob)**/build/**' ':(exclude,glob)**/.next/**' ':(exclude,glob)**/bin/**'
  ':(exclude,glob)**/obj/**' ':(exclude,glob)**/*.min.js' ':(exclude,glob)**/*.map' ':(exclude,glob)**/*.snap'
  ':(exclude,glob)**/*.svg' ':(exclude,glob)**/whatsnew-output/**'
)

OUT_DIR="$ROOT/whatsnew-output"
OUT="$OUT_DIR/diff-context.md"
mkdir -p "$OUT_DIR"

REPO_NAME="$(basename "$ROOT")"
PKG_NAME=""
if [ -f package.json ]; then
  PKG_NAME="$(node -e 'try{process.stdout.write(require("./package.json").name||"")}catch(e){}' 2>/dev/null || true)"
fi
README_TITLE=""
for f in README.md readme.md Readme.md; do
  if [ -f "$f" ]; then README_TITLE="$(grep -m1 '^# ' "$f" | sed 's/^# //' || true)"; break; fi
done

FULL_DIFF="$(git diff --no-color --find-renames "$MERGE_BASE" "$HEAD_REF" -- . "${EXCLUDES[@]}")"
TOTAL_LINES="$(printf '%s\n' "$FULL_DIFF" | wc -l | tr -d ' ')"

{
  echo "# whatsnew: $HEAD vs $BASE"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| Repository | $REPO_NAME |"
  [ -n "$PKG_NAME" ] && echo "| package.json name | $PKG_NAME |"
  [ -n "$README_TITLE" ] && echo "| README title | $README_TITLE |"
  echo "| Base | \`$BASE_REF\` |"
  echo "| Head | \`$HEAD_REF\` |"
  echo "| Merge base | \`$(git rev-parse --short "$MERGE_BASE")\` |"
  echo "| Commits | $COMMIT_COUNT |"
  echo
  echo "## Commits (oldest first)"
  echo
  git log --no-merges --reverse --format='- %h %s%n%w(0,2,2)%b' "$MERGE_BASE..$HEAD_REF" | sed '/^[[:space:]]*$/d'
  echo
  echo "## Diffstat"
  echo
  echo '```'
  git diff --stat=120 "$MERGE_BASE" "$HEAD_REF" -- . "${EXCLUDES[@]}"
  echo '```'
  echo
  echo "## Changed files (A=added, M=modified, D=deleted, R=renamed)"
  echo
  echo '```'
  git diff --name-status --find-renames "$MERGE_BASE" "$HEAD_REF" -- . "${EXCLUDES[@]}"
  echo '```'
  echo
  echo "## Diff"
  echo
  if [ "$TOTAL_LINES" -gt "$MAX_LINES" ]; then
    echo "> Truncated: showing the first $MAX_LINES of $TOTAL_LINES lines. Open important files directly."
    echo
  fi
  echo '```diff'
  printf '%s\n' "$FULL_DIFF" | head -n "$MAX_LINES"
  echo '```'
} > "$OUT"

echo "wrote $OUT ($COMMIT_COUNT commits, $TOTAL_LINES diff lines)"
