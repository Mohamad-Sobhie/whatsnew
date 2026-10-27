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
REVERSE_COUNT="$(git rev-list --count --no-merges "$MERGE_BASE..$BASE_REF")"

# Direction check: "/whatsnew main 1.6.10" usually means "what's new on main since 1.6.10",
# not "what does the old tag have that main doesn't". Warn when the comparison looks reversed.
DIRECTION_NOTE=""
if git merge-base --is-ancestor "$HEAD_REF" "$BASE_REF" 2>/dev/null && [ "$REVERSE_COUNT" -gt 0 ]; then
  DIRECTION_NOTE="'$HEAD' is already contained in '$BASE' ($REVERSE_COUNT commits on '$BASE' since). Did you mean: $HEAD $BASE ?"
elif [ "$REVERSE_COUNT" -gt $(( COMMIT_COUNT * 5 + 5 )) ]; then
  DIRECTION_NOTE="'$BASE' has $REVERSE_COUNT commits that '$HEAD' doesn't, but '$HEAD' adds only $COMMIT_COUNT. Is the order right? The reverse would be: $HEAD $BASE"
fi
if [ -n "$DIRECTION_NOTE" ]; then
  echo "warning: $DIRECTION_NOTE" >&2
fi

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
  echo "| Commits on base not in head | $REVERSE_COUNT |"
  if [ -n "$DIRECTION_NOTE" ]; then echo; echo "> **Check the direction:** $DIRECTION_NOTE"; fi
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
  # sed reads all of its input, unlike head, so the pipe never dies of SIGPIPE (exit 141 under pipefail)
  printf '%s\n' "$FULL_DIFF" | sed -n "1,${MAX_LINES}p"
  echo '```'
} > "$OUT"

echo "wrote $OUT ($COMMIT_COUNT commits, $TOTAL_LINES diff lines)"
