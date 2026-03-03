#!/bin/bash
# Production Deployment Script
# Syncs only code files, excludes config/data/env

# ===== CONFIGURE THESE =====
REMOTE_USER="your_user"
REMOTE_HOST="your_server_ip"
REMOTE_PATH="/path/to/gimmick"
# ===========================

LOCAL_PATH="$(dirname "$0")/.."

echo "🚀 Deploying to $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"

# Backend - sync only Python files and requirements
echo ""
echo "📦 Syncing backend..."
rsync -avz --progress \
  --include="*.py" \
  --include="requirements.txt" \
  --include="app/" \
  --include="app/**" \
  --include="routers/" \
  --include="routers/**" \
  --exclude="__pycache__/" \
  --exclude="*.pyc" \
  --exclude=".env" \
  --exclude="*.db" \
  --exclude="uploads/" \
  --exclude="venv/" \
  --exclude=".venv/" \
  "$LOCAL_PATH/backend/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/backend/"

# Frontend - sync only source files
echo ""
echo "🎨 Syncing frontend..."
rsync -avz --progress \
  --include="src/" \
  --include="src/**" \
  --include="public/" \
  --include="public/**" \
  --include="index.html" \
  --include="package.json" \
  --include="vite.config.js" \
  --include="tailwind.config.js" \
  --include="postcss.config.js" \
  --exclude="node_modules/" \
  --exclude="dist/" \
  --exclude=".env" \
  --exclude=".env.*" \
  "$LOCAL_PATH/frontend/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/frontend/"

echo ""
echo "✅ Files synced!"
echo ""
echo "Now run on server:"
echo "  cd $REMOTE_PATH/backend && python3 migrate.py"
echo "  sudo systemctl restart gimmick-backend"
echo "  cd $REMOTE_PATH/frontend && npm install && npm run build"
