#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════╗
# ║  Gimmick — Production Deploy Script                 ║
# ║  Run on a fresh Ubuntu 22.04+ VPS as root           ║
# ║  Usage: bash deploy.sh YOUR_DOMAIN.com              ║
# ╚══════════════════════════════════════════════════════╝

DOMAIN="${1:?Usage: bash deploy.sh YOUR_DOMAIN.com}"
HOME_DIR="/home/web"
WEB_DIR="/var/www/web"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══ Deploying to $DOMAIN ═══"

# ── 1. System packages ──
echo "► Installing system packages..."
apt-get update -qq
apt-get install -y -qq nginx python3-venv python3-pip ufw git curl

# ── 2. Firewall ──
echo "► Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 3. Create app user ──
echo "► Creating web user..."
id -u web &>/dev/null || useradd -r -m -d /home/web -s /bin/bash web

# ── 4. Copy project files ──
echo "► Copying project..."
mkdir -p "$HOME_DIR" "$WEB_DIR"
rsync -a --exclude='node_modules' --exclude='__pycache__' --exclude='venv' --exclude='.git' \
    "$REPO_DIR/" "$HOME_DIR/"

# ── 5. Backend setup ──
echo "► Setting up backend..."
cd "$HOME_DIR/backend"
python3 -m venv venv
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
deactivate

# ── 6. Production .env ──
if [ ! -f "$HOME_DIR/backend/.env" ]; then
    cp "$HOME_DIR/deploy/.env.production" "$HOME_DIR/backend/.env"
    SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))")
    sed -i "s|CHANGE_ME_RUN_python3_-c_\"import_secrets;print(secrets.token_urlsafe(64))\"|$SECRET|" "$HOME_DIR/backend/.env"
    sed -i "s|YOUR_DOMAIN.com|$DOMAIN|g" "$HOME_DIR/backend/.env"
    echo ""
    echo "⚠  EDIT $HOME_DIR/backend/.env and fill in:"
    echo "   - BOT_TOKEN"
    echo "   - NOWPAYMENTS keys"
    echo ""
fi

# ── 7. Frontend build & copy to /var/www/web ──
echo "► Building frontend..."
if command -v node &>/dev/null; then
    cd "$HOME_DIR/frontend"
    npm ci --silent
    npm run build
    rsync -a --delete "$HOME_DIR/frontend/dist/" "$WEB_DIR/"
else
    echo "  Node.js not found — install it or copy dist/ from your local build"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
fi

# ── 8. Fix permissions ──
echo "► Setting permissions..."
chown -R web:web "$HOME_DIR"
chmod 600 "$HOME_DIR/backend/.env"
chown -R www-data:www-data "$WEB_DIR"

# ── 9. Nginx config ──
echo "► Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/web"
cp "$HOME_DIR/deploy/nginx.conf" "$NGINX_CONF"
sed -i "s|YOUR_DOMAIN.com|$DOMAIN|g" "$NGINX_CONF"
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/web
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 10. SSL (Cloudflare Origin Certificate) ──
echo "► Setting up Cloudflare Origin SSL..."
mkdir -p /etc/ssl/cloudflare
if [ ! -f /etc/ssl/cloudflare/origin.pem ]; then
    echo ""
    echo "⚠  Place your Cloudflare Origin Certificate files at:"
    echo "     /etc/ssl/cloudflare/origin.pem"
    echo "     /etc/ssl/cloudflare/origin-key.pem"
    echo "   Then run: sudo nginx -t && sudo systemctl reload nginx"
    echo ""
else
    chown root:root /etc/ssl/cloudflare/origin-key.pem
    chmod 600 /etc/ssl/cloudflare/origin-key.pem
    nginx -t && systemctl reload nginx
fi

# ── 11. Systemd services ──
echo "► Installing systemd services..."
cp "$HOME_DIR/deploy/gimmick-api.service" /etc/systemd/system/tgweb-api.service
cp "$HOME_DIR/deploy/gimmick-bot.service" /etc/systemd/system/tgweb-bot.service
systemctl daemon-reload
systemctl enable --now tgweb-api
systemctl enable --now tgweb-bot

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅  Gimmick deployed to https://$DOMAIN"
echo ""
echo "  Services:"
echo "    systemctl status tgweb-api"
echo "    systemctl status tgweb-bot"
echo "    journalctl -u tgweb-api -f"
echo "    journalctl -u tgweb-bot -f"
echo ""
echo "  ⚠  Don't forget:"
echo "    1. Edit /home/web/backend/.env (BOT_TOKEN, payment keys)"
echo "    2. Restart: systemctl restart tgweb-api tgweb-bot"
echo "    3. Set bot webhook menu URL to https://$DOMAIN"
echo "       (bot.py does this automatically on startup)"
echo "═══════════════════════════════════════════════"
