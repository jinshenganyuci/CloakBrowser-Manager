#!/bin/bash
set -e

if [ -z "${KEEPASSXC_DATABASE_PASSWORD:-}" ]; then
    echo "错误：必须设置非空的 KEEPASSXC_DATABASE_PASSWORD 数据库密码。" >&2
    echo "请通过环境变量或 docker run 的 -e 参数设置。" >&2
    exit 1
fi

# Initialize data directories
mkdir -p /data/profiles
mkdir -p /tmp/cbm
chmod 700 /tmp/cbm

# Kill stale processes from previous container runs
pkill -f 'Xvnc :[0-9]' 2>/dev/null || true
pkill -f 'cloakbrowser.*chrome' 2>/dev/null || true
pkill -f 'chromium.*fingerprint' 2>/dev/null || true
pkill -f 'keepassxc.*?/data/profiles/' 2>/dev/null || true
pkill -f keepassxc-proxy 2>/dev/null || true
pkill -f xclip 2>/dev/null || true

# Clean Chrome lock files left on the persistent volume
find /data/profiles -maxdepth 2 -name 'SingletonLock' -delete 2>/dev/null || true
find /data/profiles -maxdepth 2 -name 'SingletonCookie' -delete 2>/dev/null || true
find /data/profiles -maxdepth 2 -name 'SingletonSocket' -delete 2>/dev/null || true

# Remove X11 lock files from previous displays
rm -f /tmp/.X1*-lock 2>/dev/null || true
find /tmp/cbm -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true

# Start FastAPI (serves built React + API)
cd /app
echo ""
echo "  CloakBrowser 管理器已启动：http://localhost:8080"
echo ""
exec uvicorn backend.main:app --host 0.0.0.0 --port 8080 --log-level warning
