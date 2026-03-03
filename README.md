# Gimmick - Digital Goods Marketplace

Modern Telegram Mini App za prodaju game keys i in-game valuta.

![Gimmick Screenshot](https://via.placeholder.com/800x400/0f172a/22c55e?text=Gimmick)

## Features

- 🎮 **Game Keys** - Steam, Epic, Origin, etc.
- 💰 **In-Game Currency** - Gold, diamonds, coins
- 🏪 **Multi-Vendor** - Više prodavača
- 📊 **Seller Dashboard** - Upravljanje proizvodima
- ⚡ **Instant Delivery** - Automatska dostava ključeva
- 🌙 **Dark Theme** - Moderan UI

## Tech Stack

### Backend
- **FastAPI** - Async Python web framework
- **SQLAlchemy** - ORM
- **SQLite/PostgreSQL** - Database
- **python-telegram-bot** - Telegram integration

### Frontend
- **React 18** - UI library
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Framer Motion** - Animations

## Struktura Projekta

```
gimmick/
├── backend/
│   ├── app/
│   │   ├── routers/      # API endpoints
│   │   ├── models.py     # Database models
│   │   ├── schemas.py    # Pydantic schemas
│   │   ├── auth.py       # Authentication
│   │   └── database.py   # DB config
│   ├── main.py           # FastAPI app
│   ├── bot.py            # Telegram bot
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── components/   # React components
    │   ├── pages/        # Page components
    │   ├── store/        # Zustand stores
    │   └── lib/          # Utilities
    ├── package.json
    └── vite.config.js
```

## Quick Start

### 1. Backend Setup

```bash
cd gimmick/backend

# Virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Environment variables
cp .env.example .env
# Edit .env with your BOT_TOKEN

# Run server
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd gimmick/frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

### 3. Telegram Bot

```bash
cd gimmick/backend
python bot.py
```

### 4. Seed Database (opciono)

```bash
# Kreiraj admin usera i seed kategorije
curl -X POST "http://localhost:8000/api/auth/dev-login?telegram_id=123456"

# Sa dobijenim tokenom:
curl -X POST "http://localhost:8000/api/admin/seed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## API Dokumentacija

Kad server radi, otvori:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Deployment

### Backend (Railway/Render)

```bash
# Procfile
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend (Vercel/Netlify)

```bash
npm run build
# Deploy dist/ folder
```

### Environment Variables

Backend:
```env
DATABASE_URL=postgresql://...
SECRET_KEY=your-secret-key
BOT_TOKEN=your-telegram-bot-token
WEBAPP_URL=https://your-frontend-url.com
```

## Database Models

### User
- Buyer/Seller/Admin role
- Telegram auth
- Shop profile za sellere

### Product
- Name, description, price
- Category, platform, region
- Stock count, sales stats

### ProductKey
- Individualni ključevi
- Linked to product
- Sold status tracking

### Order
- Buyer info
- Status workflow
- Delivered keys

## Seller Flow

1. User postane seller (/api/sellers/become-seller)
2. Kreira proizvod (/api/products POST)
3. Dodaje ključeve (/api/products/{id}/keys POST)
4. Buyer kupi → automatska dostava
5. Seller vidi zaradu u dashboardu

## TODO

- [ ] Telegram Payments integracija
- [ ] Review sistem
- [ ] Email notifikacije
- [ ] Advanced search
- [ ] Affiliate program
- [ ] Mobile app (React Native)

## License

MIT
