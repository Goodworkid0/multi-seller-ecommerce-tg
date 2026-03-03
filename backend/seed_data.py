"""Seed script to populate database with dummy data"""
import asyncio
import json
import random
from datetime import datetime, timedelta
from app.database import async_session, engine, Base
from app.models import (
    User, UserRole, Category, Product, ProductKey, ProductVariant,
    Order, OrderItem, OrderStatus, Review, Notification,
    Service, Auction, AuctionBid, AuctionStatus,
    MiddlemanDeal, MiddlemanMessage, MiddlemanStatus,
    Dispute, DisputeStatus, OrderMessage, AppSettings
)


async def seed_database():
    """Populate database with realistic dummy data"""
    
    async with async_session() as db:
        print("🌱 Starting database seeding...")
        
        # ─── AppSettings ─────────────────────────────────────────────────────
        from sqlalchemy import select
        settings_check = await db.execute(select(AppSettings).where(AppSettings.id == 1))
        if not settings_check.scalar_one_or_none():
            db.add(AppSettings(
                id=1,
                app_name="Gimmick Market",
                bot_username="GimmickMarketBot",
                product_fee_percent=10.0,
                auction_fee_percent=5.0,
                middleman_fee_percent=5.0,
                referral_percent=5.0,
                referral_first_deposit_bonus_percent=10.0
            ))
            print("✅ Created AppSettings")
        
        # ─── Categories ──────────────────────────────────────────────────────
        categories_data = [
            {"name": "Game Keys", "slug": "game-keys", "icon": "🎮"},
            {"name": "Gift Cards", "slug": "gift-cards", "icon": "🎁"},
            {"name": "Software", "slug": "software", "icon": "💿"},
            {"name": "Accounts", "slug": "accounts", "icon": "👤"},
            {"name": "In-Game Items", "slug": "in-game-items", "icon": "⚔️"},
            {"name": "Subscriptions", "slug": "subscriptions", "icon": "📺"},
        ]
        
        categories = []
        for cat_data in categories_data:
            check = await db.execute(select(Category).where(Category.slug == cat_data["slug"]))
            if not check.scalar_one_or_none():
                cat = Category(**cat_data)
                db.add(cat)
                categories.append(cat)
        
        await db.flush()
        print(f"✅ Created {len(categories)} categories")
        
        # ─── Service Categories ──────────────────────────────────────────────
        from app.models import ServiceCategory
        service_categories_data = [
            {"name": "Game Boosting", "slug": "boosting", "icon": "🎮", "sort_order": 1},
            {"name": "Coaching", "slug": "coaching", "icon": "🎯", "sort_order": 2},
            {"name": "Design", "slug": "design", "icon": "🎨", "sort_order": 3},
            {"name": "Development", "slug": "development", "icon": "💻", "sort_order": 4},
            {"name": "Writing", "slug": "writing", "icon": "✍️", "sort_order": 5},
            {"name": "Marketing", "slug": "marketing", "icon": "📈", "sort_order": 6},
            {"name": "Other", "slug": "other", "icon": "📦", "sort_order": 7},
        ]
        svc_cats_created = 0
        for sc_data in service_categories_data:
            check = await db.execute(select(ServiceCategory).where(ServiceCategory.slug == sc_data["slug"]))
            if not check.scalar_one_or_none():
                db.add(ServiceCategory(**sc_data))
                svc_cats_created += 1
        await db.flush()
        print(f"✅ Created {svc_cats_created} service categories")
        
        # ─── Users (Buyers & Sellers) ────────────────────────────────────────
        seller_data = [
            {
                "telegram_id": "seller_1001",
                "username": "GameKeyKing",
                "first_name": "Alex",
                "role": UserRole.SELLER,
                "balance": 1250.50,
                "shop_name": "GameKey Kingdom",
                "shop_description": "Premium game keys at best prices! 5+ years in business.",
                "seller_rating": 4.8,
                "seller_review_count": 156,
                "total_sales": 892,
                "rep_positive": 145,
                "rep_negative": 3,
                "seller_expires_at": datetime.utcnow() + timedelta(days=180),
                "collateral": 500.0,
                "seller_rank": 3,  # Gold
                "is_featured": True,
                "featured_expires_at": datetime.utcnow() + timedelta(days=30),
            },
            {
                "telegram_id": "seller_1002",
                "username": "CryptoCards",
                "first_name": "Maria",
                "role": UserRole.SELLER,
                "balance": 890.25,
                "shop_name": "Crypto Gift Cards",
                "shop_description": "Gift cards for all major platforms. Instant delivery!",
                "seller_rating": 4.6,
                "seller_review_count": 89,
                "total_sales": 543,
                "rep_positive": 82,
                "rep_negative": 5,
                "seller_expires_at": datetime.utcnow() + timedelta(days=90),
                "collateral": 200.0,
                "seller_rank": 2,  # Silver
            },
            {
                "telegram_id": "seller_1003",
                "username": "ProAccounts",
                "first_name": "Ivan",
                "role": UserRole.SELLER,
                "balance": 2340.00,
                "pending_balance": 450.00,
                "shop_name": "Pro Accounts Store",
                "shop_description": "Verified gaming accounts. All games, all regions!",
                "seller_rating": 4.9,
                "seller_review_count": 234,
                "total_sales": 1205,
                "rep_positive": 220,
                "rep_negative": 2,
                "seller_expires_at": datetime.utcnow() + timedelta(days=365),
                "collateral": 1000.0,
                "seller_rank": 3,  # Gold
                "is_featured": True,
                "featured_expires_at": datetime.utcnow() + timedelta(days=15),
            },
            {
                "telegram_id": "seller_1004",
                "username": "SoftwarePro",
                "first_name": "Elena",
                "role": UserRole.SELLER,
                "balance": 560.75,
                "shop_name": "Software Paradise",
                "shop_description": "Windows, Office, Antivirus - all legit keys!",
                "seller_rating": 4.4,
                "seller_review_count": 45,
                "total_sales": 178,
                "rep_positive": 40,
                "rep_negative": 4,
                "seller_expires_at": datetime.utcnow() + timedelta(days=60),
                "seller_rank": 1,  # Bronze
            },
        ]
        
        buyer_data = [
            {"telegram_id": "buyer_2001", "username": "GamerDude", "first_name": "John", "balance": 150.00},
            {"telegram_id": "buyer_2002", "username": "CasualPlayer", "first_name": "Sarah", "balance": 75.50},
            {"telegram_id": "buyer_2003", "username": "DigitalNomad", "first_name": "Mike", "balance": 320.00},
            {"telegram_id": "buyer_2004", "username": "TechBuyer", "first_name": "Lisa", "balance": 45.25},
            {"telegram_id": "buyer_2005", "username": "ProGamer99", "first_name": "Dan", "balance": 890.00},
            {"telegram_id": "buyer_2006", "username": "NewUser123", "first_name": "Anna", "balance": 25.00},
        ]
        
        sellers = []
        buyers = []
        
        for data in seller_data:
            check = await db.execute(select(User).where(User.telegram_id == data["telegram_id"]))
            if not check.scalar_one_or_none():
                user = User(**data)
                db.add(user)
                sellers.append(user)
        
        for data in buyer_data:
            check = await db.execute(select(User).where(User.telegram_id == data["telegram_id"]))
            if not check.scalar_one_or_none():
                user = User(role=UserRole.BUYER, **data)
                db.add(user)
                buyers.append(user)
        
        await db.flush()
        
        # Re-fetch sellers and buyers after flush to get IDs
        seller_result = await db.execute(select(User).where(User.role == UserRole.SELLER))
        sellers = seller_result.scalars().all()
        
        buyer_result = await db.execute(select(User).where(User.role == UserRole.BUYER))
        buyers = buyer_result.scalars().all()
        
        print(f"✅ Created {len(sellers)} sellers and {len(buyers)} buyers")
        
        # ─── Products ────────────────────────────────────────────────────────
        # Tags must match PredefinedTag names: Steam, PlayStation, Xbox, Nintendo, 
        # Gift Cards, Subscriptions, Accounts, Windows, Office, Antivirus
        if sellers:
            products_data = [
                # Seller 1 - Game Keys (Gaming category)
                {"seller": sellers[0], "name": "Elden Ring Steam Key", "price": 45.99, "stock": 15, "game_name": "Elden Ring", "platform": "Steam", "region": "Global", "sales": 89, "rating": 4.9, "reviews": 45, "tags": ["Steam"]},
                {"seller": sellers[0], "name": "Hogwarts Legacy Deluxe", "price": 55.99, "stock": 8, "game_name": "Hogwarts Legacy", "platform": "Steam", "region": "EU", "sales": 67, "rating": 4.7, "reviews": 32, "tags": ["Steam"]},
                {"seller": sellers[0], "name": "Cyberpunk 2077 GOG Key", "price": 29.99, "stock": 23, "game_name": "Cyberpunk 2077", "platform": "GOG", "region": "Global", "sales": 156, "rating": 4.6, "reviews": 78, "tags": ["Steam"]},
                {"seller": sellers[0], "name": "Red Dead Redemption 2", "price": 39.99, "stock": 12, "game_name": "RDR2", "platform": "Steam", "region": "Global", "sales": 203, "rating": 4.8, "reviews": 95, "tags": ["Steam"]},
                
                # Seller 2 - Gift Cards (Digital Goods + Gaming)
                {"seller": sellers[1] if len(sellers) > 1 else sellers[0], "name": "Steam Wallet $50", "price": 47.50, "stock": 50, "game_name": "Steam Gift Card", "platform": "Steam", "region": "US", "sales": 234, "rating": 5.0, "reviews": 120, "tags": ["Steam", "Gift Cards"]},
                {"seller": sellers[1] if len(sellers) > 1 else sellers[0], "name": "PlayStation Store €20", "price": 19.00, "stock": 35, "game_name": "PSN Gift Card", "platform": "PlayStation", "region": "EU", "sales": 189, "rating": 4.9, "reviews": 89, "tags": ["PlayStation", "Gift Cards"]},
                {"seller": sellers[1] if len(sellers) > 1 else sellers[0], "name": "Xbox Game Pass 3 Months", "price": 32.99, "stock": 20, "game_name": "Xbox Game Pass", "platform": "Xbox", "region": "Global", "sales": 145, "rating": 4.8, "reviews": 67, "tags": ["Xbox", "Subscriptions"]},
                
                # Seller 3 - Subscriptions & Accounts (Digital Goods)
                {"seller": sellers[2] if len(sellers) > 2 else sellers[0], "name": "Netflix Premium 1 Year", "price": 89.99, "stock": 10, "game_name": "Netflix", "platform": "Netflix", "region": "Global", "sales": 78, "rating": 4.5, "reviews": 34, "tags": ["Subscriptions"]},
                {"seller": sellers[2] if len(sellers) > 2 else sellers[0], "name": "Spotify Premium Lifetime", "price": 45.00, "stock": 25, "game_name": "Spotify", "platform": "Spotify", "region": "Global", "sales": 312, "rating": 4.7, "reviews": 156, "tags": ["Subscriptions"]},
                {"seller": sellers[2] if len(sellers) > 2 else sellers[0], "name": "Valorant Account Immortal", "price": 199.00, "stock": 3, "game_name": "Valorant", "platform": "Riot", "region": "NA", "sales": 23, "rating": 4.9, "reviews": 12, "tags": ["Accounts"]},
                
                # Seller 4 - Software
                {"seller": sellers[3] if len(sellers) > 3 else sellers[0], "name": "Windows 11 Pro Key", "price": 25.00, "stock": 100, "game_name": "Windows 11", "platform": "Microsoft", "region": "Global", "sales": 456, "rating": 4.6, "reviews": 234, "tags": ["Windows"]},
                {"seller": sellers[3] if len(sellers) > 3 else sellers[0], "name": "Office 365 Family 1 Year", "price": 55.00, "stock": 45, "game_name": "Office 365", "platform": "Microsoft", "region": "Global", "sales": 289, "rating": 4.8, "reviews": 145, "tags": ["Office"]},
            ]
            
            products = []
            for p_data in products_data:
                check = await db.execute(select(Product).where(Product.name == p_data["name"]))
                if not check.scalar_one_or_none():
                    product = Product(
                        seller_id=p_data["seller"].id,
                        name=p_data["name"],
                        description=f"Authentic {p_data['name']}. Instant delivery via Telegram. 24/7 support!",
                        price=p_data["price"],
                        stock_count=p_data["stock"],
                        game_name=p_data["game_name"],
                        platform=p_data["platform"],
                        region=p_data["region"],
                        sales_count=p_data["sales"],
                        rating=p_data["rating"],
                        review_count=p_data["reviews"],
                        is_active=True,
                        tags=json.dumps(p_data["tags"])
                    )
                    db.add(product)
                    products.append(product)
            
            await db.flush()
            
            # Add product keys
            product_result = await db.execute(select(Product))
            all_products = product_result.scalars().all()
            
            for product in all_products:
                # Check if keys already exist
                existing_keys = await db.execute(
                    select(ProductKey).where(ProductKey.product_id == product.id)
                )
                if not existing_keys.scalars().first():
                    # Add some keys
                    for i in range(min(product.stock_count, 5)):
                        key = ProductKey(
                            product_id=product.id,
                            key_value=f"XXXX-{product.id:04d}-{i:04d}-DEMO",
                            is_sold=False
                        )
                        db.add(key)
            
            print(f"✅ Created {len(products)} products with keys")
        
        # ─── Services ────────────────────────────────────────────────────────
        if sellers:
            services_data = [
                {"seller": sellers[0], "title": "Game Coaching - FPS Games", "description": "Professional coaching for CS2, Valorant, Apex. 1 hour session with VOD review.", "category": "coaching", "price": 25.00, "delivery_time": "1 day", "orders": 45, "rating": 4.9, "reviews": 23},
                {"seller": sellers[0], "title": "Rank Boosting - Valorant", "description": "Safe boosting by Immortal+ players. Fast and secure!", "category": "boosting", "price": 15.00, "delivery_time": "3 days", "orders": 89, "rating": 4.7, "reviews": 45},
                {"seller": sellers[1] if len(sellers) > 1 else sellers[0], "title": "Account Recovery Service", "description": "Lost access to your gaming account? We can help recover it!", "category": "other", "price": 50.00, "delivery_time": "2 days", "orders": 34, "rating": 4.8, "reviews": 17},
                {"seller": sellers[2] if len(sellers) > 2 else sellers[0], "title": "Custom Gaming Logo Design", "description": "Professional logo design for your Twitch/YouTube channel.", "category": "design", "price": 35.00, "delivery_time": "5 days", "orders": 67, "rating": 4.6, "reviews": 34},
                {"seller": sellers[2] if len(sellers) > 2 else sellers[0], "title": "Stream Overlay Package", "description": "Full overlay package: alerts, panels, screens, and webcam frame.", "category": "design", "price": 75.00, "delivery_time": "1 week", "orders": 28, "rating": 4.9, "reviews": 14},
                {"seller": sellers[3] if len(sellers) > 3 else sellers[0], "title": "Website Development", "description": "Custom website development for your business. React/Next.js stack.", "category": "development", "price": 500.00, "delivery_time": "2 weeks", "orders": 12, "rating": 5.0, "reviews": 8},
            ]
            
            services = []
            for s_data in services_data:
                check = await db.execute(select(Service).where(Service.title == s_data["title"]))
                if not check.scalar_one_or_none():
                    service = Service(
                        seller_id=s_data["seller"].id,
                        title=s_data["title"],
                        description=s_data["description"],
                        category=s_data["category"],
                        price=s_data["price"],
                        delivery_time=s_data["delivery_time"],
                        orders_count=s_data["orders"],
                        rating=s_data["rating"],
                        review_count=s_data["reviews"],
                        is_active=True
                    )
                    db.add(service)
                    services.append(service)
            
            print(f"✅ Created {len(services)} services")
        
        # ─── Auctions ────────────────────────────────────────────────────────
        if sellers and buyers:
            auctions_data = [
                {"seller": sellers[0], "title": "Rare Steam Account - 500+ Games", "description": "Legendary account with rare games including removed titles. 15 years old!", "category": "accounts", "start_price": 500.00, "buyout_price": 2500.00, "current_bid": 850.00, "bids": 12, "status": AuctionStatus.ACTIVE},
                {"seller": sellers[0], "title": "CS2 Knife - Karambit Doppler", "description": "Factory New Karambit Doppler Phase 2. Pink galaxy pattern!", "category": "items", "start_price": 800.00, "buyout_price": 1500.00, "current_bid": 1100.00, "bids": 8, "status": AuctionStatus.ACTIVE},
                {"seller": sellers[2] if len(sellers) > 2 else sellers[0], "title": "League Account - Challenger S13", "description": "Challenger account with 200+ skins. Full access!", "category": "accounts", "start_price": 300.00, "buyout_price": 1000.00, "current_bid": 450.00, "bids": 5, "status": AuctionStatus.ACTIVE},
                {"seller": sellers[1] if len(sellers) > 1 else sellers[0], "title": "Premium Domain - gaming.gg", "description": "Premium 2-letter domain with .gg extension!", "category": "domains", "start_price": 5000.00, "buyout_price": 15000.00, "current_bid": 7500.00, "bids": 15, "status": AuctionStatus.ACTIVE},
                {"seller": sellers[3] if len(sellers) > 3 else sellers[0], "title": "Valorant Account - Radiant Peak", "description": "Radiant account with Battle Pass skins. 50+ agents unlocked.", "category": "accounts", "start_price": 200.00, "buyout_price": None, "current_bid": 320.00, "bids": 6, "status": AuctionStatus.ACTIVE},
            ]
            
            auctions = []
            for a_data in auctions_data:
                check = await db.execute(select(Auction).where(Auction.title == a_data["title"]))
                if not check.scalar_one_or_none():
                    now = datetime.utcnow()
                    auction = Auction(
                        seller_id=a_data["seller"].id,
                        title=a_data["title"],
                        description=a_data["description"],
                        category=a_data["category"],
                        start_price=a_data["start_price"],
                        buyout_price=a_data["buyout_price"],
                        blitz_price=max(10, a_data["start_price"] * 0.05),  # 5% increment
                        current_bid=a_data["current_bid"],
                        bid_count=a_data["bids"],
                        status=a_data["status"],
                        starts_at=now - timedelta(days=random.randint(1, 5)),
                        ends_at=now + timedelta(days=random.randint(1, 7)),
                        last_bid_at=now - timedelta(hours=random.randint(1, 48)),
                        duration_days=2
                    )
                    db.add(auction)
                    auctions.append(auction)
            
            await db.flush()
            
            # Add bids to auctions
            auction_result = await db.execute(select(Auction).where(Auction.status == AuctionStatus.ACTIVE))
            all_auctions = auction_result.scalars().all()
            
            for auction in all_auctions:
                existing_bids = await db.execute(select(AuctionBid).where(AuctionBid.auction_id == auction.id))
                if not existing_bids.scalars().first():
                    # Add random bids
                    bid_amount = auction.start_price
                    for i in range(min(auction.bid_count, 5)):
                        bidder = random.choice(buyers)
                        bid_amount += auction.blitz_price * random.randint(1, 3)
                        bid = AuctionBid(
                            auction_id=auction.id,
                            bidder_id=bidder.id,
                            amount=bid_amount,
                            is_winning=(i == min(auction.bid_count, 5) - 1),  # Last bid is winning
                            created_at=datetime.utcnow() - timedelta(hours=random.randint(1, 48))
                        )
                        db.add(bid)
            
            print(f"✅ Created {len(auctions)} auctions with bids")
        
        # ─── Orders (Completed, Delivered, Disputed) ─────────────────────────
        if sellers and buyers:
            product_result = await db.execute(select(Product).limit(5))
            sample_products = product_result.scalars().all()
            
            orders_created = 0
            for i, buyer in enumerate(buyers[:4]):
                if sample_products:
                    product = sample_products[i % len(sample_products)]
                    
                    # Create a completed order
                    order = Order(
                        buyer_id=buyer.id,
                        total_amount=product.price,
                        status=random.choice([OrderStatus.COMPLETED, OrderStatus.DELIVERED, OrderStatus.PAID]),
                        payment_method="balance",
                        created_at=datetime.utcnow() - timedelta(days=random.randint(1, 30)),
                        paid_at=datetime.utcnow() - timedelta(days=random.randint(1, 29)),
                    )
                    
                    if order.status in [OrderStatus.DELIVERED, OrderStatus.COMPLETED]:
                        order.delivered_at = datetime.utcnow() - timedelta(days=random.randint(0, 5))
                        order.auto_complete_at = order.delivered_at + timedelta(hours=48)
                    
                    if order.status == OrderStatus.COMPLETED:
                        order.completed_at = order.delivered_at + timedelta(hours=random.randint(1, 24))
                        order.is_buyer_confirmed = True
                    
                    db.add(order)
                    await db.flush()
                    
                    # Add order item
                    order_item = OrderItem(
                        order_id=order.id,
                        product_id=product.id,
                        seller_id=product.seller_id,
                        quantity=1,
                        price=product.price
                    )
                    db.add(order_item)
                    
                    # Add system message
                    db.add(OrderMessage(
                        order_id=order.id,
                        sender_id=buyer.id,
                        content="Order created and paid.",
                        is_system=True
                    ))
                    
                    if order.status == OrderStatus.COMPLETED:
                        db.add(OrderMessage(
                            order_id=order.id,
                            sender_id=buyer.id,
                            content="Buyer confirmed the order. Order completed.",
                            is_system=True
                        ))
                    
                    orders_created += 1
            
            # Create one disputed order
            if buyers and sample_products:
                disputed_order = Order(
                    buyer_id=buyers[-1].id,
                    total_amount=sample_products[0].price,
                    status=OrderStatus.DISPUTED,
                    payment_method="balance",
                    created_at=datetime.utcnow() - timedelta(days=3),
                    paid_at=datetime.utcnow() - timedelta(days=3),
                    delivered_at=datetime.utcnow() - timedelta(days=2),
                )
                db.add(disputed_order)
                await db.flush()
                
                db.add(OrderItem(
                    order_id=disputed_order.id,
                    product_id=sample_products[0].id,
                    seller_id=sample_products[0].seller_id,
                    quantity=1,
                    price=sample_products[0].price
                ))
                
                # Add dispute
                dispute = Dispute(
                    order_id=disputed_order.id,
                    opened_by=buyers[-1].id,
                    reason="Key doesn't work. Getting 'already redeemed' error.",
                    status=DisputeStatus.OPEN
                )
                db.add(dispute)
                
                db.add(OrderMessage(
                    order_id=disputed_order.id,
                    sender_id=buyers[-1].id,
                    content="The key you sent me is invalid!",
                    is_system=False
                ))
                
                orders_created += 1
            
            print(f"✅ Created {orders_created} orders")
        
        # ─── Reviews ─────────────────────────────────────────────────────────
        if buyers and sample_products:
            reviews_data = [
                {"rating": 5, "comment": "Amazing seller! Key worked instantly. Will buy again!"},
                {"rating": 5, "comment": "Super fast delivery. Thank you!"},
                {"rating": 4, "comment": "Good product, delivery took a bit long but all good."},
                {"rating": 5, "comment": "Best prices on the market. Highly recommend!"},
                {"rating": 4, "comment": "Works as described. Solid seller."},
            ]
            
            reviews_created = 0
            for i, product in enumerate(sample_products[:5]):
                review_data = reviews_data[i % len(reviews_data)]
                buyer = buyers[i % len(buyers)]
                
                check = await db.execute(
                    select(Review).where(Review.product_id == product.id, Review.reviewer_id == buyer.id)
                )
                if not check.scalar_one_or_none():
                    review = Review(
                        product_id=product.id,
                        reviewer_id=buyer.id,
                        rating=review_data["rating"],
                        comment=review_data["comment"],
                        created_at=datetime.utcnow() - timedelta(days=random.randint(1, 60))
                    )
                    db.add(review)
                    reviews_created += 1
            
            print(f"✅ Created {reviews_created} reviews")
        
        # ─── Middleman Deals ─────────────────────────────────────────────────
        if buyers and sellers:
            deal = MiddlemanDeal(
                party_a_id=buyers[0].id,
                party_b_id=sellers[0].id,
                title="Account trade - Steam for PSN",
                description="Trading my Steam account (200 games) for PSN account with similar value.",
                amount=500.00,
                terms="Both parties provide full account credentials. Verified by middleman before swap.",
                fee_percent=5.0,
                status=MiddlemanStatus.CONFIRMED,
                party_a_confirmed=True,
                party_b_confirmed=True,
            )
            db.add(deal)
            await db.flush()
            
            db.add(MiddlemanMessage(
                deal_id=deal.id,
                sender_id=buyers[0].id,
                content="Hi, I'm ready to start the trade!",
                is_system=False
            ))
            db.add(MiddlemanMessage(
                deal_id=deal.id,
                sender_id=sellers[0].id,
                content="Great! I have the PSN credentials ready.",
                is_system=False
            ))
            db.add(MiddlemanMessage(
                deal_id=deal.id,
                sender_id=buyers[0].id,
                content="Terms confirmed by both parties.",
                is_system=True
            ))
            
            print("✅ Created 1 middleman deal")
        
        # ─── Notifications ───────────────────────────────────────────────────
        if buyers:
            notifications = [
                {"user": buyers[0], "type": "order_completed", "title": "Order #1 Completed", "body": "Your order has been marked as complete."},
                {"user": buyers[1], "type": "deposit_credited", "title": "Deposit Credited", "body": "Your $50 deposit has been credited to your account."},
                {"user": buyers[0], "type": "auction_outbid", "title": "You've been outbid!", "body": "Someone placed a higher bid on 'CS2 Knife'."},
            ]
            
            for n_data in notifications:
                db.add(Notification(
                    user_id=n_data["user"].id,
                    type=n_data["type"],
                    title=n_data["title"],
                    body=n_data["body"]
                ))
            
            print(f"✅ Created {len(notifications)} notifications")
        
        # ─── Commit All ──────────────────────────────────────────────────────
        await db.commit()
        print("\n🎉 Database seeding completed successfully!")


if __name__ == "__main__":
    asyncio.run(seed_database())
