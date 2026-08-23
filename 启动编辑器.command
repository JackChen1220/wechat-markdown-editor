#!/bin/zsh
set -u

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

PORT="${WECHAT_EDITOR_PORT:-3000}"
APP_URL="http://127.0.0.1:${PORT}"
LOG_DIR="${WECHAT_EDITOR_LOG_DIR:-$PROJECT_DIR/data/logs}"
RUNTIME_DIR="${WECHAT_EDITOR_RUNTIME_DIR:-$PROJECT_DIR/data/runtime}"
LOG_FILE="$LOG_DIR/server-${PORT}.log"
PID_FILE="$RUNTIME_DIR/server-${PORT}.pid"

pause_on_error() {
  if [[ -t 0 ]]; then
    echo ""
    read -r "?按回车键关闭窗口..."
  fi
}

fail() {
  echo "❌ $*" >&2
  pause_on_error
  exit 1
}

open_editor() {
  if [[ "${WECHAT_EDITOR_SKIP_OPEN:-0}" == "1" ]]; then
    return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open "$APP_URL" >/dev/null 2>&1 || true
  else
    echo "请在浏览器打开：$APP_URL"
  fi
}

editor_is_running() {
  local health page
  health="$(curl --noproxy '*' --max-time 1 --silent --show-error --fail "$APP_URL/api/health" 2>/dev/null)" || return 1
  [[ "$health" == *'"ok":true'* ]] || return 1
  page="$(curl --noproxy '*' --max-time 2 --silent --show-error --fail "$APP_URL/" 2>/dev/null)" || return 1
  [[ "$page" == *'<title>微信公众号 Markdown 编辑器</title>'* ]]
}

port_is_busy() {
  node -e '
    const net = require("net");
    const socket = net.connect({ host: "127.0.0.1", port: Number(process.argv[1]) });
    const finish = (code) => { socket.destroy(); process.exit(code); };
    socket.once("connect", () => finish(0));
    socket.once("error", () => finish(1));
    setTimeout(() => finish(1), 500).unref();
  ' "$PORT" >/dev/null 2>&1
}

echo "════════════════════════════════════════════"
echo "  微信公众号 Markdown 编辑器"
echo "════════════════════════════════════════════"

command -v node >/dev/null 2>&1 || fail "未找到 Node.js，请先安装 Node.js 20 或更高版本。"
command -v curl >/dev/null 2>&1 || fail "系统缺少 curl，无法检查本地服务。"

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null)" || fail "无法读取 Node.js 版本。"
[[ "$NODE_MAJOR" =~ '^[0-9]+$' ]] || fail "无法识别 Node.js 版本。"
(( NODE_MAJOR >= 20 )) || fail "当前 Node.js 版本过低，需要 Node.js 20 或更高版本。"

[[ "$PORT" =~ '^[0-9]+$' ]] || fail "端口必须是 1 到 65535 的整数。"
(( PORT >= 1 && PORT <= 65535 )) || fail "端口必须是 1 到 65535 的整数。"

if editor_is_running; then
  echo "✅ 编辑器已经运行，正在打开浏览器..."
  open_editor
  exit 0
fi

if port_is_busy; then
  fail "端口 $PORT 已被其他程序占用，未启动编辑器。"
fi

mkdir -p "$LOG_DIR" "$RUNTIME_DIR" || fail "无法创建本地日志目录。"

echo "正在启动本地服务..."
nohup env HOST="127.0.0.1" PORT="$PORT" node "$PROJECT_DIR/server.mjs" \
  >>"$LOG_FILE" 2>&1 </dev/null &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"

attempt=0
while (( attempt < 30 )); do
  if editor_is_running; then
    echo "✅ 启动成功，正在打开浏览器..."
    echo "   页面：$APP_URL"
    echo "   日志：$LOG_FILE"
    open_editor
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
  (( attempt += 1 ))
done

if kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true
fi
rm -f "$PID_FILE"
echo "最近的启动日志：" >&2
tail -n 20 "$LOG_FILE" >&2 2>/dev/null || true
fail "服务启动失败，请查看日志：$LOG_FILE"
