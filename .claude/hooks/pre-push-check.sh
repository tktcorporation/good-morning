#!/bin/bash
# Hook: git push / jj git push の前に Pre-push Checklist を実行する。
# 1つでも失敗したら push をブロックする。
#
# 背景: CLAUDE.md に「1つでも失敗したらプッシュしない」と書いてあるが、
# テキストルールだけでは AI が「既存の問題だから例外」と自己判断でバイパスする。
# この hook で機械的に強制する。
#
# PreToolUse hook for Bash tool

set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

if [ -z "$command" ]; then
  exit 0
fi

# git push または jj git push を検出
if ! echo "$command" | grep -qE '(^|\s)(git\s+push|jj\s+git\s+push)'; then
  exit 0
fi

# プロジェクトルートに移動
cd "$CLAUDE_PROJECT_DIR"

errors=()

# 1. 型チェック
if ! pnpm typecheck > /dev/null 2>&1; then
  errors+=("typecheck")
fi

# 2. Biome lint
if ! pnpm lint > /dev/null 2>&1; then
  errors+=("lint")
fi

# 3. Biome format
if ! pnpm biome format . > /dev/null 2>&1; then
  errors+=("format")
fi

# 4. テスト
if ! pnpm test > /dev/null 2>&1; then
  errors+=("test")
fi

# 5. Expo 依存パッケージ互換性
if ! npx expo install --check > /dev/null 2>&1; then
  errors+=("expo install --check")
fi

if [ ${#errors[@]} -gt 0 ]; then
  failed=$(IFS=', '; echo "${errors[*]}")
  cat <<EOF
╭──────────────────────────────────────────────╮
│  Pre-push チェックに失敗しました             │
│                                              │
│  失敗: ${failed}
│                                              │
│  全チェックを通してから push してください     │
│  参考: CLAUDE.md の Pre-push Checklist       │
╰──────────────────────────────────────────────╯
EOF
  exit 2
fi

exit 0
