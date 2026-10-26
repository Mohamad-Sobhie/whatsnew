#!/usr/bin/env bash
# Check out the "before" and "after" versions of the app side by side, so both can run at once.
#
#   worktrees.sh up <base> <head> [before_port] [after_port]
#   worktrees.sh down
#
# "before" = the merge base of <base> and <head> (exactly what <head> started from),
# "after"  = <head>. Worktrees live in a temp folder, outside the repo, so dev servers,
# linters and test runners in the main checkout never see them.
# State is written to whatsnew-output/worktrees.env. Works with macOS's default bash 3.2.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "error: not inside a git repository" >&2; exit 1; }
cd "$ROOT"
OUT_DIR="$ROOT/whatsnew-output"
STATE="$OUT_DIR/worktrees.env"
REPO_NAME="$(basename "$ROOT")"
WT_ROOT="${TMPDIR:-/tmp}"
WT_ROOT="${WT_ROOT%/}/whatsnew/$REPO_NAME"

install_hint() {
  # Print the install command matching the lockfile in $1.
  if   [ -f "$1/pnpm-lock.yaml" ]; then echo "pnpm install --frozen-lockfile"
  elif [ -f "$1/yarn.lock" ];      then echo "yarn install --frozen-lockfile"
  elif [ -f "$1/bun.lockb" ] || [ -f "$1/bun.lock" ]; then echo "bun install --frozen-lockfile"
  elif [ -f "$1/package-lock.json" ]; then echo "npm ci"
  elif [ -f "$1/package.json" ];   then echo "npm install"
  else echo "(no package.json — check the README for how to run this project)"
  fi
}

kill_port() {
  local pids
  pids="$(lsof -ti "tcp:$1" 2>/dev/null || true)"
  if [ -n "$pids" ]; then echo "$pids" | xargs kill 2>/dev/null || true; echo "stopped server on port $1"; fi
}

cmd="${1:-}"
case "$cmd" in
  up)
    BASE="${2:?usage: worktrees.sh up <base> <head> [before_port] [after_port]}"
    HEAD="${3:?usage: worktrees.sh up <base> <head> [before_port] [after_port]}"
    BEFORE_PORT="${4:-4101}"
    AFTER_PORT="${5:-4102}"

    for p in "$BEFORE_PORT" "$AFTER_PORT"; do
      if lsof -ti "tcp:$p" >/dev/null 2>&1; then echo "error: port $p is already in use — pass other ports" >&2; exit 1; fi
    done

    MERGE_BASE="$(git merge-base "$BASE" "$HEAD")"
    mkdir -p "$OUT_DIR" "$WT_ROOT"

    for side in before after; do
      dir="$WT_ROOT/$side"
      if [ -d "$dir" ]; then git worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"; fi
    done
    git worktree prune

    git worktree add --detach --quiet "$WT_ROOT/before" "$MERGE_BASE"
    git worktree add --detach --quiet "$WT_ROOT/after" "$HEAD"

    # Local env files are not in git but most apps need them to start.
    copied=""
    for f in .env .env.local .env.development .env.development.local; do
      if [ -f "$ROOT/$f" ] && ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
        cp "$ROOT/$f" "$WT_ROOT/before/$f"
        cp "$ROOT/$f" "$WT_ROOT/after/$f"
        copied="$copied $f"
      fi
    done

    cat > "$STATE" <<EOF
BEFORE_DIR="$WT_ROOT/before"
AFTER_DIR="$WT_ROOT/after"
BEFORE_REF="$(git rev-parse --short "$MERGE_BASE")"
AFTER_REF="$HEAD"
BEFORE_PORT="$BEFORE_PORT"
AFTER_PORT="$AFTER_PORT"
EOF

    echo "before: $WT_ROOT/before  (merge base $(git rev-parse --short "$MERGE_BASE"), port $BEFORE_PORT)"
    echo "after:  $WT_ROOT/after   ($HEAD, port $AFTER_PORT)"
    [ -n "$copied" ] && echo "copied untracked env files into both:$copied"
    echo "install deps in each with: $(install_hint "$WT_ROOT/after")"
    echo "state: $STATE"
    ;;

  down)
    if [ -f "$STATE" ]; then
      # shellcheck disable=SC1090
      . "$STATE"
      kill_port "$BEFORE_PORT"
      kill_port "$AFTER_PORT"
      for dir in "$BEFORE_DIR" "$AFTER_DIR"; do
        [ -d "$dir" ] && git worktree remove --force "$dir" 2>/dev/null || true
      done
      rm -f "$STATE"
    fi
    git worktree prune
    echo "worktrees removed"
    ;;

  *)
    echo "usage: worktrees.sh up <base> <head> [before_port] [after_port] | worktrees.sh down" >&2
    exit 1
    ;;
esac
