#!/usr/bin/env bash
#
# iOS 起動スモーク: Simulator にビルド済み .app をインストールして起動し、
# 「クラッシュせず生存しているか」だけを判定する。Swift コンパイルだけでは
# 拾えない以下のリグレッションを CI で検知するために使う:
#
#   - dyld error (link されていない framework の参照)
#   - Expo Modules の dynamic 登録失敗 (@available gate ミス等)
#   - AppDelegate / didFinishLaunchingWithOptions 内の Swift assertion
#   - JS バンドルロード時のトップレベル throw (Hermes parse error 含む)
#
# 前提: 呼び出し側で xcodebuild が完了し、$APP_PATH に .app が存在すること。
#
# ローカル実行例:
#   APP_PATH=ios-build/Build/Products/Debug-iphonesimulator/GoodMorning.app \
#   bash scripts/ios-launch-smoke.sh
#
# 環境変数:
#   APP_PATH         必須。インストールする .app へのパス。
#   BUNDLE_ID        既定: com.tktcorporation.goodmorning
#   SIMULATOR_DEVICE 既定: iPhone 16 Pro
#   SIMULATOR_OS     既定: 26.0
#   ARTIFACT_DIR     既定: ./launch-test  (sim.log / crash report のコピー先)
#   LAUNCH_GRACE_SEC 既定: 8  (起動後この秒数生存していれば成功とみなす)

set -euo pipefail

: "${APP_PATH:?APP_PATH is required (path to GoodMorning.app)}"
BUNDLE_ID="${BUNDLE_ID:-com.tktcorporation.goodmorning}"
SIMULATOR_DEVICE="${SIMULATOR_DEVICE:-iPhone 16 Pro}"
SIMULATOR_OS="${SIMULATOR_OS:-26.0}"
ARTIFACT_DIR="${ARTIFACT_DIR:-launch-test}"
LAUNCH_GRACE_SEC="${LAUNCH_GRACE_SEC:-8}"

mkdir -p "$ARTIFACT_DIR"

echo "==> Locating simulator: $SIMULATOR_DEVICE (iOS $SIMULATOR_OS)"
# 指定デバイスを優先するが、runner image のラインナップ変更（"iPhone 16 Pro" が
# 落ちて "iPhone 17 Pro" だけ残る等）で死なないよう、見つからなければ
# 同じ iOS バージョンの先頭デバイスにフォールバックする。
# このスモークの目的はモデルの再現ではなく「起動できるか」なので、
# 任意の iPhone Simulator で十分。
list_devices_for_os() {
  xcrun simctl list devices available --json |
    jq -r --arg os "iOS-${SIMULATOR_OS//./-}" '
      .devices
      | to_entries[]
      | select(.key | endswith($os))
      | .value[]
    '
}
SIM_UDID=$(
  list_devices_for_os |
    jq -r --slurp --arg dev "$SIMULATOR_DEVICE" '
      map(select(.name == $dev)) | .[0].udid // empty
    '
)
if [[ -z "$SIM_UDID" ]]; then
  echo "    requested device '$SIMULATOR_DEVICE' not found; falling back to first iOS $SIMULATOR_OS device"
  SIM_UDID=$(list_devices_for_os | jq -r --slurp '.[0].udid // empty')
fi
if [[ -z "$SIM_UDID" ]]; then
  echo "No iOS $SIMULATOR_OS simulator available. Runtimes installed:"
  xcrun simctl list runtimes
  exit 2
fi
echo "    UDID=$SIM_UDID"

echo "==> Booting simulator"
xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
xcrun simctl bootstatus "$SIM_UDID" -b

echo "==> Installing $APP_PATH"
xcrun simctl install "$SIM_UDID" "$APP_PATH"

echo "==> Streaming simulator log -> $ARTIFACT_DIR/sim.log"
# 起動時の Swift / dyld / Expo Modules ログを拾うため、bundle id だけでなく
# プロセス名でも絞り込む。クラッシュレポートは別経路で拾うため、ここでは
# 観測可能な fault / error レベルに絞り込みすぎないようにする。
xcrun simctl spawn "$SIM_UDID" log stream \
  --level=debug \
  --style=compact \
  --predicate "subsystem CONTAINS \"$BUNDLE_ID\" OR processImagePath CONTAINS \"GoodMorning\"" \
  > "$ARTIFACT_DIR/sim.log" 2>&1 &
LOG_PID=$!
cleanup() {
  kill "$LOG_PID" 2>/dev/null || true
  # 失敗時は DiagnosticReports をアーティファクトに残す
  local reports_dir="$HOME/Library/Logs/DiagnosticReports"
  if [[ -d "$reports_dir" ]]; then
    mkdir -p "$ARTIFACT_DIR/DiagnosticReports"
    find "$reports_dir" -maxdepth 1 \
      -name "GoodMorning-*.ips" -newermt "-5 minutes" \
      -exec cp {} "$ARTIFACT_DIR/DiagnosticReports/" \; 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Launching $BUNDLE_ID"
# `--terminate-running-process` で前回起動の残骸をクリア。
# `--console-pty` を使わない理由: console を引き継ぐとシェルが TTY 依存になり
# CI で扱いづらい。代わりに後段で sim.log / DiagnosticReports / pid 生存を見る。
LAUNCH_OUTPUT=$(xcrun simctl launch --terminate-running-process "$SIM_UDID" "$BUNDLE_ID")
APP_PID=$(echo "$LAUNCH_OUTPUT" | awk '{print $2}')
echo "    PID=$APP_PID"
if [[ -z "$APP_PID" || "$APP_PID" == "0" ]]; then
  echo "FAIL: simctl launch returned no pid: $LAUNCH_OUTPUT"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────
# 起動結果の判定
#
# ここがこの CI の本体。「クラッシュ」と「成功」をどう区別するかは
# 複数の流派があり、感度と誤検知率のトレードオフになるので、
# プロジェクトの要件に合わせて detect_launch_outcome() を実装する。
#
# 利用できる入力:
#   $1 SIM_UDID            シミュレータの UDID
#   $2 BUNDLE_ID           対象アプリの bundle id
#   $3 APP_PID             simctl launch が返した PID
#   $4 ARTIFACT_DIR        sim.log と DiagnosticReports/ が置かれるディレクトリ
#   $5 LAUNCH_GRACE_SEC    起動後の観測時間（既定 8 秒）
#
# 戻り値の規約:
#   exit 0 ... 起動成功（クラッシュ検知なし）
#   exit 1 ... 起動失敗（CI を fail させる）。stderr に判定理由を出力すること。
#
# 検討すべきアプローチ（複数組み合わせ可）:
#   A) PID 生存確認: $LAUNCH_GRACE_SEC 秒待ったあと、
#      `xcrun simctl spawn "$SIM_UDID" launchctl list | grep "$BUNDLE_ID"` で生存判定。
#      - 長所: 最もシンプル。dyld/Swift assertion 即死は確実に拾える。
#      - 短所: 起動直後に "成功して即座に backgroud" するアプリだと誤判定しうる。
#   B) DiagnosticReports スキャン: $ARTIFACT_DIR/DiagnosticReports/ 配下に
#      `GoodMorning-*.ips` があれば即 fail。
#      - 長所: 確定的。クラッシュレポートの中身もアーティファクトに残せる。
#      - 短所: レポートが書き出されるまでにラグがある（数秒〜十数秒）。
#   C) sim.log のシグネチャ検出: "Fatal error" / "dyld:" / "Terminating app due to uncaught"
#      / "ExpoModulesCore" 周辺のエラーパターンを grep。
#      - 長所: 原因まで含めて即時に判明する。
#      - 短所: シグネチャに依存するので false negative がありうる。
#   D) 既知の "起動完了" マーカーを bundle 側に埋めて待ち受け（最も堅牢だがコード側の対応が必要）。
#
# まずは A + B の組み合わせを推奨。grace 秒数生存 AND クラッシュレポート無し
# なら成功、というシンプルな AND 条件で誤検知を抑える。
# ─────────────────────────────────────────────────────────────────────

detect_launch_outcome() {
  local udid="$1"
  local bundle_id="$2"
  local app_pid="$3"
  local artifact_dir="$4"
  local grace_sec="$5"

  # A + B の AND 判定: 「grace 秒生存 かつ クラッシュレポート無し」を成功とする。
  # 起動直後クラッシュ（dyld / Swift assertion / Module 登録失敗）はどちらか必ず引っ掛かる。
  sleep "$grace_sec"

  if xcrun simctl spawn "$udid" launchctl list 2>/dev/null | grep -q "$bundle_id"; then
    local reports_dir="$HOME/Library/Logs/DiagnosticReports"
    local recent_crashes
    recent_crashes=$(find "$reports_dir" -maxdepth 1 \
      -name "GoodMorning-*.ips" -newermt "-5 minutes" 2>/dev/null | head -1 || true)
    if [[ -z "$recent_crashes" ]]; then
      echo "PASS: app pid=$app_pid alive after ${grace_sec}s, no crash report found"
      return 0
    fi
    echo "FAIL: crash report detected: $recent_crashes" >&2
    return 1
  fi

  echo "FAIL: app process for $bundle_id not found in launchctl after ${grace_sec}s" >&2
  echo "      (likely crashed during startup — see $artifact_dir/sim.log and DiagnosticReports/)" >&2
  return 1
}

detect_launch_outcome "$SIM_UDID" "$BUNDLE_ID" "$APP_PID" "$ARTIFACT_DIR" "$LAUNCH_GRACE_SEC"
