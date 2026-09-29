#!/usr/bin/env bash
# WT-5G: abre o RECEIVER do palco (browser/TV) em Chrome kiosk — fullscreen
# real sem chrome, com conteúdo vindo do relay (independe do perfil/operador).
# Uso: ./open-palco-kiosk.sh ws://192.168.1.192:3100/v1/palco CODIGO
#      ./open-palco-kiosk.sh ws://192.168.1.192:3100/v1/palco SH4UA9 [pasta_receiver]
set -euo pipefail

api="${1:?Informe a WS da API (ex.: ws://IP:3100/v1/palco)}"
code="${2:?Informe o código da sessão (6 chars)}"
dir="${3:-$(cd "$(dirname "$0")/../../palco-receiver/webos" 2>/dev/null && pwd)}"
port="${KIOSK_PORT:-8090}"

if [[ ! -f "$dir/index.html" ]]; then
  echo "Receiver não encontrado em $dir" >&2
  exit 1
fi

# Serve a pasta do receiver em uma porta dedicada (o kiosk precisa de HTTP
# para localStorage funcionar — file:// bloqueia storage em alguns contextos).
if ! curl -s "http://127.0.0.1:$port/" >/dev/null 2>&1; then
  (cd "$dir" && python3 -m http.server "$port" >/dev/null 2>&1 &)
  sleep 1
fi

profile_dir="${XDG_CONFIG_HOME:-$HOME/.config}/LouvorJA-Palco-Kiosk"

for browser in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$browser" >/dev/null 2>&1; then
    exec "$browser" \
      --user-data-dir="$profile_dir" \
      --no-first-run \
      --no-default-browser-check \
      --kiosk \
      --new-window \
      "http://127.0.0.1:$port/?api=$api&code=$code"
  fi
done

echo 'Chrome/Chromium não encontrado.' >&2
exit 127
