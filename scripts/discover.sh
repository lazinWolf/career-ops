#!/usr/bin/env bash
# discover.sh — the ONE job-discovery command. Run on the host.
#
#   scripts/discover.sh             # sync profile → job-watcher → scan all sources
#   scripts/discover.sh --dry-run   # same, but scan.mjs writes nothing
#   scripts/discover.sh --no-watcher  # skip the job-watcher refresh (ATS/VC only)
#
# All targeting lives in portals.yml + config/profile.yml + cv.md. Results land
# in data/pipeline.md; evaluate them with /career-ops pipeline.
#
# Non-interactive (uses `exec -T`), so it is safe for cron / systemd timers.

set -euo pipefail

CAREER_OPS="$(cd "$(dirname "$0")/.." && pwd)"
# Machine-specific settings (e.g. JOB_WATCHER_DIR) live in the gitignored .env.
if [ -f "$CAREER_OPS/.env" ]; then set -a; . "$CAREER_OPS/.env"; set +a; fi
JOB_WATCHER_DIR="${JOB_WATCHER_DIR:-$HOME/Projects/job-watcher}"
REPORT="data/job-watcher/run-report.json"
PROFILE="data/job-watcher/profile.json"

dry_run=""
watcher=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run="--dry-run" ;;
    --no-watcher) watcher=0 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$CAREER_OPS"
in_container() { docker compose exec -T career-ops "$@"; }

if ! docker compose ps --services --filter status=running | grep -qx career-ops; then
  docker compose up -d >/dev/null
fi

echo "── 1/3 sync job-watcher profile from career-ops config"
in_container node scripts/sync-job-watcher-profile.mjs

if [ "$watcher" = 1 ]; then
  echo "── 2/3 refresh job-watcher (LinkedIn/Internshala/Indeed/Naukri; dry-run: no Telegram, no seen.json)"
  if [ -x "$JOB_WATCHER_DIR/.venv/bin/python" ]; then
    (cd "$JOB_WATCHER_DIR" && .venv/bin/python main.py --dry-run \
        --profile "$CAREER_OPS/$PROFILE" --report "$CAREER_OPS/$REPORT" >/dev/null 2>"$CAREER_OPS/data/job-watcher/last-run.log") \
      && echo "   report: $REPORT" \
      || echo "   job-watcher failed (see data/job-watcher/last-run.log); scanning with the previous report if fresh"
  else
    echo "   job-watcher venv not found at $JOB_WATCHER_DIR; skipping"
  fi
else
  echo "── 2/3 job-watcher skipped"
fi

echo "── 3/3 scan all sources"
in_container node scan.mjs --quiet $dry_run 2>&1 \
  | grep -v -E '^\s+• |^→ |discord\.gg' \
  | sed -n '/^Portal Scan/,$p'

[ -z "$dry_run" ] && echo && echo "Pending in pipeline: $(grep -c '^- \[ \]' data/pipeline.md)  →  next: /career-ops pipeline"
