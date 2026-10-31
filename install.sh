#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

NODE_VERSION="${NODE_VERSION:-v22.23.4}"

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Нужны права root: $*"
    exit 1
  fi
}

if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
fi
OS_ID="${ID:-}"
OS_LIKE="${ID_LIKE:-}"

rpm_family() {
  case "$OS_ID" in
    redos|rhel|centos|rocky|almalinux|fedora|ol) return 0 ;;
  esac
  case "$OS_LIKE" in
    *rhel*|*fedora*|*centos*) return 0 ;;
  esac
  return 1
}

glibc_version() {
  getconf GNU_LIBC_VERSION 2>/dev/null | awk '{ print $2 }' || true
}

version_ge() {
  printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

ensure_build_tools() {
  if command -v python3 >/dev/null 2>&1 && command -v g++ >/dev/null 2>&1 && command -v make >/dev/null 2>&1; then
    return
  fi
  echo "Ставлю компилятор и Python для mediasoup"
  if command -v dnf >/dev/null 2>&1; then
    run_root dnf install -y python3 gcc-c++ make tar xz curl ca-certificates openssl
  elif command -v yum >/dev/null 2>&1; then
    run_root yum install -y python3 gcc-c++ make tar xz curl ca-certificates
  elif command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update
    run_root apt-get install -y python3 build-essential curl ca-certificates xz-utils
  else
    echo "Поставьте вручную: python3, g++, make, curl"
    exit 1
  fi
}

node_major() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi
  node -p 'Number(process.versions.node.split(".")[0])'
}

install_node() {
  local arch suffix sha url tmp
  case "$(uname -m)" in
    x86_64|amd64) suffix="linux-x64"; sha="1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce" ;;
    aarch64|arm64) suffix="linux-arm64"; sha="6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b" ;;
    *)
      echo "Нет готовой сборки Node.js для $(uname -m)"
      exit 1
      ;;
  esac
  local glibc
  glibc="$(glibc_version)"
  if [ -z "$glibc" ] || ! version_ge "$glibc" "2.28"; then
    echo "Node.js 22 нужен glibc 2.28 или новее. Сейчас: ${glibc:-не найден}."
    echo "На РЕД ОС 7.3 официальный Node.js 22 не запускается. Нужна РЕД ОС 8."
    exit 1
  fi
  if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1 || ! command -v sha256sum >/dev/null 2>&1; then
    if command -v dnf >/dev/null 2>&1; then
      run_root dnf install -y curl tar xz ca-certificates coreutils
    elif command -v yum >/dev/null 2>&1; then
      run_root yum install -y curl tar xz ca-certificates coreutils
    else
      ensure_build_tools
    fi
  fi
  url="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${suffix}.tar.xz"
  tmp="$(mktemp)"
  echo "Скачиваю Node.js ${NODE_VERSION}"
  curl -fsSL "$url" -o "$tmp"
  echo "${sha}  ${tmp}" | sha256sum -c -
  run_root tar -xJf "$tmp" -C /usr/local --strip-components=1
  rm -f "$tmp"
  hash -r
}

ensure_node() {
  export PATH="/usr/local/bin:${PATH}"
  local major
  major="$(node_major)"
  if [ "$major" -ge 22 ]; then
    return
  fi
  if [ "$major" -gt 0 ]; then
    echo "Сейчас Node.js $(node -v). Нужен 22 или новее, ставлю ${NODE_VERSION} в /usr/local."
  fi
  install_node
  major="$(node_major)"
  if [ "$major" -lt 22 ]; then
    echo "Node.js 22 не установился"
    exit 1
  fi
}

env_value() {
  local key="$1" fallback="$2" line
  line="$(grep -E "^${key}=" .env | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  if [ -z "$line" ]; then
    printf '%s' "$fallback"
  else
    printf '%s' "$line"
  fi
}

open_firewall() {
  local port min max
  port="$(env_value PORT 8080)"
  min="$(env_value RTC_MIN_PORT 40000)"
  max="$(env_value RTC_MAX_PORT 40199)"
  if ! command -v firewall-cmd >/dev/null 2>&1; then
    echo "firewalld не найден. Откройте ${port}/tcp, 8443/tcp и ${min}-${max} UDP/TCP вручную."
    return
  fi
  if ! run_root systemctl is-active --quiet firewalld; then
    echo "firewalld не запущен. Откройте ${port}/tcp, 8443/tcp и ${min}-${max} UDP/TCP вручную."
    return
  fi
  local https
  https="$(env_value HTTPS_PORT 8443)"
  echo "Открываю порты в firewalld: ${port}/tcp, ${https}/tcp и ${min}-${max} UDP/TCP"
  run_root firewall-cmd --permanent --add-port="${port}/tcp"
  if [ "$https" != "$port" ]; then
    run_root firewall-cmd --permanent --add-port="${https}/tcp"
  fi
  run_root firewall-cmd --permanent --add-port="${min}-${max}/udp"
  run_root firewall-cmd --permanent --add-port="${min}-${max}/tcp"
  run_root firewall-cmd --reload
}

others_can_traverse() {
  local dir="$1" mode other
  while [ "$dir" != "/" ]; do
    mode="$(stat -c '%a' "$dir")"
    other="${mode: -1}"
    if [ $((10#$other & 1)) -eq 0 ]; then
      return 1
    fi
    dir="$(dirname "$dir")"
  done
}

install_service() {
  local nologin svc_user svc_group owner
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemd не найден. Запуск: npm start"
    return
  fi
  owner="$(stat -c '%U' "$ROOT")"
  if others_can_traverse "$ROOT"; then
    svc_user=streamon
    svc_group=streamon
    if ! id streamon >/dev/null 2>&1; then
      nologin="$(command -v nologin || true)"
      [ -n "$nologin" ] || nologin=/sbin/nologin
      run_root useradd --system --home-dir "$ROOT" --shell "$nologin" streamon
    fi
    run_root chown -R streamon:streamon "$ROOT/data"
    if [ -f "$ROOT/.env" ]; then
      run_root chgrp streamon "$ROOT/.env"
      run_root chmod 640 "$ROOT/.env"
    fi
  else
    svc_user="$owner"
    svc_group="$(id -gn "$owner")"
    echo "Каталог закрыт для других пользователей. Служба запустится от имени ${svc_user}."
  fi
  run_root chmod a+rX "$ROOT"
  run_root chmod -R a+rX "$ROOT/server" "$ROOT/web"
  if [ -f "$ROOT/.env" ]; then
    sed -i 's/\r$//' "$ROOT/.env"
  fi
  local port
  port="$(env_value PORT 8080)"
  if ss -tlnH | awk '{ print $4 }' | grep -q ":${port}$"; then
    if systemctl --user is-active --quiet streamon; then
      echo "Streamon уже слушает порт ${port}, перезапускаю службу"
      systemctl --user restart streamon
      systemctl --user --no-pager --full status streamon || true
      return
    fi
    echo "Порт ${port} уже занят, Streamon на него не встанет:"
    run_root ss -tlnp | grep ":${port}" || true
    echo "В .env смените PORT на свободный, откройте его в firewalld и снова выполните: bash install.sh"
    return
  fi
  local node_bin
  node_bin="$(command -v node)"
  if [ "$svc_user" != "streamon" ]; then
    # Системная служба из домашнего каталога на РЕД ОС не стартует: SELinux не пускает её в /home.
    run_root systemctl disable --now streamon >/dev/null 2>&1 || true
    local home unit_dir
    home="$(getent passwd "$svc_user" | cut -d: -f6)"
    unit_dir="${home}/.config/systemd/user"
    mkdir -p "$unit_dir"
    cat > "${unit_dir}/streamon.service" << EOF
[Unit]
Description=Streamon video conferences and live streams
After=network.target

[Service]
WorkingDirectory=${ROOT}
EnvironmentFile=${ROOT}/.env
ExecStart=${node_bin} server/src/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
    run_root loginctl enable-linger "$svc_user"
    systemctl --user daemon-reload
    systemctl --user enable --now streamon
    if systemctl --user is-active --quiet streamon; then
      echo "Служба запущена от имени ${svc_user}. Журнал: journalctl --user -u streamon -f"
    else
      systemctl --user --no-pager --full status streamon || true
      echo "Служба не запустилась. Журнал: journalctl --user -u streamon -n 40 --no-pager"
    fi
    return
  fi
  local unit
  unit="$(mktemp)"
  cat > "$unit" << EOF
[Unit]
Description=Streamon video conferences and live streams
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
EnvironmentFile=${ROOT}/.env
ExecStart=${node_bin} server/src/index.js
Restart=on-failure
RestartSec=3
User=${svc_user}
Group=${svc_group}
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
  run_root cp "$unit" /etc/systemd/system/streamon.service
  rm -f "$unit"
  run_root systemctl daemon-reload
  run_root systemctl enable --now streamon
  if run_root systemctl is-active --quiet streamon; then
    echo "Служба streamon запущена. Журнал: journalctl -u streamon -f"
  else
    run_root systemctl --no-pager --full status streamon || true
    echo "Служба не запустилась. Журнал: journalctl -u streamon -n 40 --no-pager"
  fi
}

if rpm_family; then
  echo "Система: ${PRETTY_NAME:-$OS_ID}"
fi

ensure_build_tools
ensure_node

npm install --prefix server
worker_bin="server/node_modules/mediasoup/worker/out/Release/mediasoup-worker"
worker_runs() {
  [ -x "$worker_bin" ] || return 1
  "$worker_bin" >/dev/null 2>&1
  [ "$?" -eq 41 ]
}
if ! worker_runs; then
  echo "Собираю mediasoup-worker под эту систему. Это занимает несколько минут."
  rm -f "$worker_bin"
  (cd server/node_modules/mediasoup && MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD=1 node npm-scripts.mjs postinstall)
  chmod u+x "$worker_bin" 2>/dev/null || true
  if command -v restorecon >/dev/null 2>&1; then
    restorecon -Rv server/node_modules/mediasoup/worker/out >/dev/null 2>&1 || true
  fi
fi
npm install --prefix web
# install.js можно запускать только пока bin/esbuild ещё скрипт.
# После первого раза esbuild подменяет его на ELF, и повторный node install.js падает.
if [ -f web/node_modules/esbuild/bin/esbuild ]; then
  chmod u+x web/node_modules/esbuild/bin/esbuild 2>/dev/null || true
  if ! web/node_modules/esbuild/bin/esbuild --version >/dev/null 2>&1; then
    if command -v restorecon >/dev/null 2>&1; then
      restorecon -Rv web/node_modules/esbuild >/dev/null 2>&1 || true
    fi
    web/node_modules/esbuild/bin/esbuild --version >/dev/null 2>&1 || echo "esbuild не запускается. Проверьте SELinux: restorecon -Rv web/node_modules"
  fi
fi
if command -v restorecon >/dev/null 2>&1; then
  restorecon -Rv "$ROOT/server/node_modules" "$ROOT/web/node_modules" >/dev/null 2>&1 || true
fi
find server/node_modules web/node_modules -path '*/.bin/*' -type f -exec chmod u+x {} + 2>/dev/null || true
find server/node_modules web/node_modules -type f \( -path '*/bin/*' -o -name 'esbuild' -o -name 'mediasoup-worker' \) -exec chmod u+x {} + 2>/dev/null || true
npm run build --prefix web
mkdir -p data

if [ ! -f .env ]; then
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 32)"
    sed -i "s/^JWT_SECRET=$/JWT_SECRET=${secret}/" .env
  fi
  echo "Создан файл .env. Укажите в нём ANNOUNCED_IP — IP этой машины в сети, затем снова выполните: sudo bash install.sh"
fi

echo "Сборка готова. Node.js $(node -v)"

if [ -f .env ]; then
  sed -i 's/\r$//' .env
fi

if rpm_family || command -v firewall-cmd >/dev/null 2>&1; then
  open_firewall
fi

if [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; then
  install_service
else
  echo "Запуск сейчас: npm start"
  echo "Чтобы поставить службу systemd, выполните: sudo bash install.sh"
fi
