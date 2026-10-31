#!/usr/bin/env bash
set -euo pipefail
NAME="${1:-streamon.local}"
mkdir -p deploy/tls
SAN="DNS:localhost,IP:127.0.0.1"
if [[ "$NAME" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
  SAN="IP:${NAME},${SAN}"
else
  SAN="DNS:${NAME},${SAN}"
fi
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout deploy/tls/key.pem \
  -out deploy/tls/cert.pem \
  -subj "/CN=${NAME}" \
  -addext "subjectAltName=${SAN}"
printf '%s\n' "$NAME" > deploy/tls/ip.txt
echo
echo "Сертификат для ${NAME} записан в deploy/tls."
echo "В .env оставьте PORT=8080 и укажите HTTPS_PORT=8443."
echo "Браузер один раз предупредит о сертификате. После этого камера и микрофон заработают."
