#!/bin/bash
# collect-dropbox-audit.sh — snapshot the Offshore Alliance Dropbox structure for analysis.
#
# Read-only. Walks the synced Dropbox folder on this Mac and writes text summaries
# (structure, where the files are, how recently each area is used, file types).
# Nothing in Dropbox is modified. Online-only (cloud) files are still listed.
#
# Usage:
#   bash docs/dropbox-audit/collect-dropbox-audit.sh "/Users/troyburton/Reveille Dropbox/Troy Burton/<OA folder>"
#   bash docs/dropbox-audit/collect-dropbox-audit.sh "<OA folder path>" --no-filenames   # omit file names (folders only)
#
# Output: docs/dropbox-audit/output/*.txt (relative to the repo), ready to commit and push.

set -euo pipefail

ROOT="${1:-}"
NO_FILENAMES="${2:-}"
if [[ -z "$ROOT" || ! -d "$ROOT" ]]; then
  echo "Usage: $0 \"<path to the OA Dropbox folder>\" [--no-filenames]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$SCRIPT_DIR/output"
mkdir -p "$OUT"
NOW=$(date +%s)
D90=$((NOW - 90*86400))
D365=$((NOW - 365*86400))

cd "$ROOT"
echo "Auditing: $ROOT"
echo "Writing:  $OUT"

# 0. Context
{
  echo "root_path=$ROOT"
  echo "root_folder_name=$(basename "$ROOT")"
  echo "collected_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "collected_by=$(whoami)@$(hostname)"
  echo "dropbox_desktop_prefix=$(echo "$ROOT" | sed -n 's|.*\(/[^/]* Dropbox\)/.*|\1|p')"
} > "$OUT/00-context.txt"

# 1. Folder tree, four levels deep, no dot-folders
find . -maxdepth 4 -type d -not -path '*/.*' | sed 's|^\./||' | sort > "$OUT/01-tree.txt"

# 2. Files per folder (direct children only), busiest first
find . -type f -not -path '*/.*' -not -name '.*' | sed 's|/[^/]*$||; s|^\./||; s|^\.$|(root)|' \
  | sort | uniq -c | sort -rn > "$OUT/02-folder-counts.txt"

# 3. Activity by area: for each top-level and second-level folder, file count, size,
#    newest change, and how many files changed in the last 90 / 365 days.
#    This is the change-management signal: which areas are live, which are dormant.
find . -type f -not -path '*/.*' -not -name '.*' -exec stat -f '%m%t%z%t%N' {} + \
  | awk -F'\t' -v now="$NOW" -v d90="$D90" -v d365="$D365" '
    {
      mtime=$1; size=$2; path=$3; sub(/^\.\//,"",path)
      n=split(path, parts, "/")
      top=(n>1)?parts[1]:"(root)"
      sec=(n>2)?parts[1]"/"parts[2]:top
      for (k=1;k<=2;k++) {
        key=(k==1)?top:sec
        if (k==2 && sec==top) continue
        cnt[key]++; bytes[key]+=size
        if (mtime>newest[key]) newest[key]=mtime
        if (mtime>=d90) r90[key]++
        if (mtime>=d365) r365[key]++
      }
    }
    END {
      printf "%-70s %8s %10s %12s %8s %8s\n","folder","files","size_MB","newest","last90d","last365d"
      for (key in cnt) {
        cmd="date -r " newest[key] " +%Y-%m-%d"; cmd | getline d; close(cmd)
        printf "%-70s %8d %10.1f %12s %8d %8d\n", key, cnt[key], bytes[key]/1048576, d, r90[key]+0, r365[key]+0
      }
    }' | sort > "$OUT/03-folder-activity.txt"

# 4. File types in use
find . -type f -not -path '*/.*' -not -name '.*' | sed -n 's/.*\.\([A-Za-z0-9]\{1,6\}\)$/\1/p' \
  | tr 'A-Z' 'a-z' | sort | uniq -c | sort -rn > "$OUT/04-file-types.txt"

# 5. Totals
{
  echo "folders=$(find . -type d -not -path '*/.*' | wc -l | tr -d ' ')"
  echo "files=$(find . -type f -not -path '*/.*' -not -name '.*' | wc -l | tr -d ' ')"
  echo "max_depth=$(find . -type d -not -path '*/.*' | awk -F/ '{ if (NF>m) m=NF } END { print m-1 }')"
  echo "total_MB=$(find . -type f -not -path '*/.*' -not -name '.*' -exec stat -f '%z' {} + | awk '{ s+=$1 } END { printf "%.1f", s/1048576 }')"
} > "$OUT/05-totals.txt"

# 6. Recently changed files (what people are actually working on). Skipped with --no-filenames.
if [[ "$NO_FILENAMES" != "--no-filenames" ]]; then
  find . -type f -not -path '*/.*' -not -name '.*' -exec stat -f '%m%t%N' {} + \
    | sort -rn | head -300 \
    | awk -F'\t' '{ cmd="date -r " $1 " +%Y-%m-%d"; cmd | getline d; close(cmd); p=$2; sub(/^\.\//,"",p); print d "\t" p }' \
    > "$OUT/06-recent-files.txt"
else
  echo "(omitted with --no-filenames)" > "$OUT/06-recent-files.txt"
fi

echo
echo "Done. Files written:"
ls -la "$OUT"
echo
echo "Next: review $OUT (remove anything you would rather not share), then"
echo "  git add docs/dropbox-audit/output && git commit -m 'docs(dropbox): current folder audit' && git push"
