#!/usr/bin/env bash
# Deploy the ench-notes backend to the openclaw VPS (ench-api.duckdns.org).
#
# The API runs there as a plain Node systemd service (deploy/ench-api.service)
# behind the box's existing nginx (deploy/nginx-ench-api.conf), TLS by certbot.
# No Docker on that host, and nothing shared with any other project: it moved
# off the hirdfit VPS on 2026-09-06 after that box's Cloudflare-only origin
# firewall cut off every direct hostname, including this one.
#
# Layout on the VPS (owner ench:ench, service user, nologin):
#   /opt/ench/.env                          hand-managed secrets, never in git
#   /opt/ench/secrets/service-account.json  Firebase admin credentials
#   /opt/ench/app/{dist,package*.json,node_modules}   what this script ships
#
# Usage: cd backend && bash deploy/deploy.sh
set -euo pipefail

VPS="${VPS:-openclaw}"   # ssh alias from ~/.ssh/config (ubuntu@51.38.135.211)
REMOTE_APP=/opt/ench/app
HOST=https://ench-api.duckdns.org

cd "$(dirname "$0")/.."

echo "==> Building"
npm ci --silent
npm run build

echo "==> Uploading dist + manifests"
tar czf /tmp/ench-app.tgz dist package.json package-lock.json
scp -q -o BatchMode=yes /tmp/ench-app.tgz "$VPS:/tmp/ench-app.tgz"
rm /tmp/ench-app.tgz

echo "==> Installing on $VPS and restarting ench-api"
# /opt/ench is 750 ench:ench, so everything below runs as root and drops to
# the service user for the file operations.
ssh -o BatchMode=yes "$VPS" sudo bash -s <<EOF
set -euo pipefail
cd $REMOTE_APP
as_ench() { sudo -u ench -H "\$@"; }
chmod 644 /tmp/ench-app.tgz
as_ench rm -rf dist.new && as_ench mkdir dist.new
as_ench tar xzf /tmp/ench-app.tgz -C dist.new
rm /tmp/ench-app.tgz
# Manifests first so npm ci installs against the new lockfile.
as_ench cp dist.new/package.json dist.new/package-lock.json .
as_ench npm ci --omit=dev --no-audit --no-fund --silent
as_ench rm -rf dist && as_ench mv dist.new/dist dist && as_ench rm -rf dist.new
systemctl restart ench-api
sleep 2
systemctl is-active ench-api >/dev/null || { journalctl -u ench-api -n 30 --no-pager; exit 1; }
EOF

echo "==> Verifying $HOST"
curl -fsS -m 10 "$HOST/healthz" | grep -q '"ok":true' || { echo "FAIL: healthz" >&2; exit 1; }
curl -fsS -m 10 "$HOST/.well-known/oauth-authorization-server" | grep -q "\"issuer\":\"$HOST\"" \
  || { echo "FAIL: OAuth issuer is not $HOST — check PUBLIC_URL in /opt/ench/.env" >&2; exit 1; }
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST "$HOST/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{}')
[ "$code" = "401" ] || { echo "FAIL: unauthenticated /mcp returned $code, expected 401" >&2; exit 1; }
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$HOST/metrics")
[ "$code" = "404" ] || { echo "FAIL: /metrics is public ($code) — check the nginx site" >&2; exit 1; }
echo "OK: healthy, OAuth issuer correct, MCP handshake 401, /metrics hidden"
