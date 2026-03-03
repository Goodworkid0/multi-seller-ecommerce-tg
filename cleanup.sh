#!/bin/bash
# Cleanup script za anonimizaciju i pripremu za deployment
# Pokreni iz root foldera projekta

echo "🧹 Čišćenje projekta za deployment..."

# Brisanje Python cache
echo "Brisanje __pycache__..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

# Brisanje .pyc fajlova
find . -name "*.pyc" -delete 2>/dev/null
find . -name "*.pyo" -delete 2>/dev/null

# Brisanje venv (može se regenerisati)
if [ -d "backend/venv" ]; then
    echo "Brisanje venv..."
    rm -rf backend/venv
fi

# Brisanje node_modules
if [ -d "frontend/node_modules" ]; then
    echo "Brisanje node_modules..."
    rm -rf frontend/node_modules
fi

# Brisanje baza podataka
echo "Brisanje lokalnih baza..."
rm -f backend/*.db backend/*.db-journal 2>/dev/null

# Brisanje uploadanih fajlova (avatari itd)
echo "Čišćenje uploads foldera..."
rm -rf backend/uploads/avatars/* 2>/dev/null
touch backend/uploads/avatars/.gitkeep 2>/dev/null

# Provjera da .env nije uključen
if [ -f "backend/.env" ]; then
    echo ""
    echo "⚠️  UPOZORENJE: backend/.env postoji!"
    echo "   NE UPLOADUJ .env fajl na server!"
    echo "   Koristi .env.example kao template."
    echo ""
fi

# Provjera za hardkodirane kredencijale
echo "Provjera za hardkodirane kredencijale..."
if grep -r "BOT_TOKEN.*[0-9]:" --include="*.py" --include="*.js" --include="*.jsx" . 2>/dev/null; then
    echo "⚠️  Pronađen mogući hardkodiran BOT_TOKEN!"
fi

if grep -r "NOWPAYMENTS.*[A-Z0-9]{10}" --include="*.py" --include="*.js" --include="*.jsx" . 2>/dev/null; then
    echo "⚠️  Pronađen mogući hardkodiran API key!"
fi

echo ""
echo "✅ Čišćenje završeno!"
echo ""
echo "Sljedeći koraci:"
echo "1. Zipuj projekat: tar -czvf gimmick-clean.tar.gz gimmick/"
echo "2. Upload na server: scp gimmick-clean.tar.gz user@server:/home/user/"
echo "3. Na serveru kreiraj novi .env sa pravim vrijednostima"
