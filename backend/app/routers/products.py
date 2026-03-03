"""Products Router"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload, joinedload
from typing import Optional, List
import csv
import json
import io

from app.database import get_db
from app.models import Product, Category, User, ProductKey, UserRole, Review, Order, OrderItem, OrderStatus, PredefinedTag, ProductVariant, Service, Auction, AuctionStatus, WtbPost, WtbStatus
from app.schemas import (
    Product as ProductSchema, 
    ProductCreate, 
    ProductUpdate, 
    ProductDetail,
    ProductList,
    ProductKeyBulkCreate,
    Category as CategorySchema,
    ReviewCreate,
    Review as ReviewSchema,
    PredefinedTagSchema,
    TagCategory,
    TagWithCount,
    ProductVariant as ProductVariantSchema,
    ProductVariantCreate,
    ProductVariantUpdate
)
from app.auth import get_current_seller, get_current_active_user

router = APIRouter()

PRODUCT_IMG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "products")
os.makedirs(PRODUCT_IMG_DIR, exist_ok=True)
ALLOWED_IMG_EXT = {"png", "jpg", "jpeg", "webp", "gif"}
MAX_IMG_SIZE = 5 * 1024 * 1024  # 5MB


@router.get("", response_model=ProductList)
async def list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tag: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort: Optional[str] = None,  # name_asc, name_desc, price_asc, price_desc, most_reviewed, newest
    db: AsyncSession = Depends(get_db)
):
    """List all active products with filtering and sorting"""
    query = select(Product).outerjoin(User, Product.seller_id == User.id).where(Product.is_active == True, Product.stock_count > 0)
    
    if search:
        escaped = search.replace("%", r"\%").replace("_", r"\_")
        term = f"%{escaped}%"
        query = query.where(
            or_(
                Product.name.ilike(term),
                Product.description.ilike(term),
                Product.tags.ilike(term),
                Product.platform.ilike(term),
                Product.game_name.ilike(term),
                User.shop_name.ilike(term),
                User.shop_description.ilike(term),
            )
        )
    if tag:
        # Support multiple comma-separated tags (OR logic - show products with ANY of the tags)
        tag_list = [t.strip() for t in tag.split(',') if t.strip()]
        tag_conditions = []
        for t in tag_list:
            tag_conditions.append(Product.tags.ilike(f'%"{t}"%'))
            tag_conditions.append(Product.platform.ilike(f"%{t}%"))
        query = query.where(or_(*tag_conditions))
    if min_price:
        query = query.where(Product.price >= min_price)
    if max_price:
        query = query.where(Product.price <= max_price)
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # Sort
    if sort == 'name_asc':
        query = query.order_by(Product.name.asc())
    elif sort == 'name_desc':
        query = query.order_by(Product.name.desc())
    elif sort == 'price_asc':
        query = query.order_by(Product.price.asc())
    elif sort == 'price_desc':
        query = query.order_by(Product.price.desc())
    elif sort == 'most_reviewed':
        query = query.order_by(Product.review_count.desc())
    elif sort == 'newest':
        query = query.order_by(Product.created_at.desc())
    else:
        query = query.order_by(Product.sales_count.desc())
    
    # Paginate
    query = query.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    products = result.scalars().all()
    
    return {
        "items": products,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


@router.get("/featured", response_model=List[ProductSchema])
async def featured_products(db: AsyncSession = Depends(get_db)):
    """Get featured/top products"""
    query = (
        select(Product)
        .where(Product.is_active == True, Product.stock_count > 0)
        .order_by(Product.sales_count.desc())
        .limit(8)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/marketplace-counts")
async def marketplace_counts(db: AsyncSession = Depends(get_db)):
    """Get total counts for each marketplace type"""
    products_count = await db.scalar(
        select(func.count()).select_from(Product).where(Product.is_active == True, Product.stock_count > 0)
    ) or 0
    services_count = await db.scalar(
        select(func.count()).select_from(Service).where(Service.is_active == True)
    ) or 0
    auctions_count = await db.scalar(
        select(func.count()).select_from(Auction).where(Auction.status == AuctionStatus.ACTIVE)
    ) or 0
    wtb_count = await db.scalar(
        select(func.count()).select_from(WtbPost).where(WtbPost.status == WtbStatus.ACTIVE)
    ) or 0
    return {
        "products": products_count,
        "services": services_count,
        "auctions": auctions_count,
        "wtb": wtb_count,
    }


@router.get("/tags")
async def get_popular_tags(db: AsyncSession = Depends(get_db)):
    """Get popular tags with product counts (aggregated from products.tags JSON)"""
    # Fetch all active products' tags
    result = await db.execute(
        select(Product.tags, Product.platform)
        .where(
            Product.is_active == True,
            Product.stock_count > 0,
        )
    )
    tag_counts = {}
    for row in result.all():
        row_tags = []
        if row[0]:  # tags JSON column
            try:
                parsed = json.loads(row[0]) if isinstance(row[0], str) else row[0]
                if isinstance(parsed, list):
                    row_tags.extend(parsed)
            except (json.JSONDecodeError, TypeError):
                pass
        if not row_tags and row[1]:  # fallback to legacy platform
            row_tags.append(row[1])
        for t in row_tags:
            t_stripped = t.strip()
            if t_stripped:
                tag_counts[t_stripped] = tag_counts.get(t_stripped, 0) + 1
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:20]
    return [{"tag": t, "count": c} for t, c in sorted_tags]


@router.get("/predefined-tags", response_model=List[PredefinedTagSchema])
async def get_predefined_tags(db: AsyncSession = Depends(get_db)):
    """Get all predefined tags"""
    result = await db.execute(select(PredefinedTag).order_by(PredefinedTag.name))
    return result.scalars().all()


@router.get("/tag-categories", response_model=List[TagCategory])
async def get_tag_categories(db: AsyncSession = Depends(get_db)):
    """Get hierarchical tag categories with product counts for Shop page"""
    # Get all predefined tags
    result = await db.execute(
        select(PredefinedTag).order_by(PredefinedTag.sort_order, PredefinedTag.name)
    )
    all_tags = result.scalars().all()
    
    # Get product counts for each tag
    products_result = await db.execute(
        select(Product.tags)
        .where(Product.is_active == True, Product.stock_count > 0)
    )
    
    # Count products per tag
    tag_counts = {}
    for row in products_result.all():
        if row[0]:
            try:
                parsed = json.loads(row[0]) if isinstance(row[0], str) else row[0]
                if isinstance(parsed, list):
                    for t in parsed:
                        t_stripped = t.strip()
                        if t_stripped:
                            tag_counts[t_stripped] = tag_counts.get(t_stripped, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass
    
    # Build hierarchy
    parents = [t for t in all_tags if t.is_parent]
    children_by_parent = {}
    orphan_tags = []
    
    for tag in all_tags:
        if not tag.is_parent:
            if tag.parent_id:
                if tag.parent_id not in children_by_parent:
                    children_by_parent[tag.parent_id] = []
                children_by_parent[tag.parent_id].append(tag)
            else:
                orphan_tags.append(tag)
    
    categories = []
    
    for parent in parents:
        children = children_by_parent.get(parent.id, [])
        child_list = []
        total = 0
        
        for child in children:
            count = tag_counts.get(child.name, 0)
            total += count
            child_list.append(TagWithCount(
                id=child.id,
                name=child.name,
                count=count,
                sort_order=child.sort_order
            ))
        
        # Sort children by count descending, then name
        child_list.sort(key=lambda x: (-x.count, x.name))
        
        categories.append(TagCategory(
            id=parent.id,
            name=parent.name,
            sort_order=parent.sort_order,
            total_count=total,
            children=child_list
        ))
    
    # Add orphan tags as "Other" category if any exist
    if orphan_tags:
        other_children = []
        total = 0
        for tag in orphan_tags:
            count = tag_counts.get(tag.name, 0)
            total += count
            other_children.append(TagWithCount(
                id=tag.id,
                name=tag.name,
                count=count,
                sort_order=tag.sort_order
            ))
        other_children.sort(key=lambda x: (-x.count, x.name))
        categories.append(TagCategory(
            id=0,
            name="Other",
            sort_order=9999,
            total_count=total,
            children=other_children
        ))
    
    # Sort categories by sort_order
    categories.sort(key=lambda x: x.sort_order)
    
    return categories


@router.get("/categories", response_model=List[CategorySchema])
async def list_categories(db: AsyncSession = Depends(get_db)):
    """List all categories"""
    result = await db.execute(select(Category).order_by(Category.parent_id.is_(None).desc(), Category.name))
    return result.scalars().all()


@router.get("/image/{filename}")
async def serve_product_image(filename: str):
    """Serve an uploaded product image."""
    safe = os.path.basename(filename)
    fpath = os.path.join(PRODUCT_IMG_DIR, safe)
    if not os.path.isfile(fpath):
        raise HTTPException(404, "Image not found")
    return FileResponse(fpath, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(product_id: int, db: AsyncSession = Depends(get_db)):
    """Get single product with details"""
    query = (
        select(Product)
        .options(selectinload(Product.seller), selectinload(Product.category), selectinload(Product.subcategory))
        .where(Product.id == product_id)
    )
    result = await db.execute(query)
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Hide inactive products from public (seller can still see via seller endpoints)
    if not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return product


# ============ Seller Endpoints ============

@router.post("", response_model=ProductSchema)
async def create_product(
    product: ProductCreate,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Create a new product (seller only). Free tier limited to 5 products."""
    # Enforce product limit for free tier (rank 0)
    seller_rank = current_user.seller_rank or 0
    if seller_rank == 0 and current_user.role != UserRole.ADMIN:
        product_count = await db.scalar(
            select(func.count()).select_from(Product).where(Product.seller_id == current_user.id)
        )
        if product_count >= 5:
            raise HTTPException(
                status_code=403,
                detail="Free sellers can list up to 5 products. Upgrade your rank for unlimited listings."
            )
    data = product.model_dump()
    if data.get('bulk_discounts') is not None:
        data['bulk_discounts'] = json.dumps([d.model_dump() if hasattr(d, 'model_dump') else d for d in product.bulk_discounts])
    else:
        data['bulk_discounts'] = None
    # Serialize tags list to JSON string
    if data.get('tags') is not None:
        tags_list = data['tags'][:5]  # enforce max 5 tags
        data['tags'] = json.dumps(tags_list)
        # Also set platform to first tag for legacy compat
        data['platform'] = tags_list[0] if tags_list else data.get('platform')
    else:
        data['tags'] = None
    db_product = Product(
        seller_id=current_user.id,
        **data
    )
    db.add(db_product)
    await db.commit()
    await db.refresh(db_product)
    return db_product


@router.put("/{product_id}", response_model=ProductSchema)
async def update_product(
    product_id: int,
    product_update: ProductUpdate,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Update product (owner or admin only)"""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = product_update.model_dump(exclude_unset=True)
    if 'bulk_discounts' in update_data:
        bd = update_data['bulk_discounts']
        update_data['bulk_discounts'] = json.dumps([d.model_dump() if hasattr(d, 'model_dump') else d for d in bd]) if bd else None
    if 'tags' in update_data:
        tags_list = update_data['tags'][:5] if update_data['tags'] else []
        update_data['tags'] = json.dumps(tags_list) if tags_list else None
        update_data['platform'] = tags_list[0] if tags_list else product.platform
    for field, value in update_data.items():
        setattr(product, field, value)
    
    await db.commit()
    await db.refresh(product)
    return product


# ============ Product Image Upload ============

@router.post("/{product_id}/image")
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db),
):
    """Upload an image for a product (seller only, max 5MB, PNG/JPG/WebP/GIF)."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Not authorized")

    content = await file.read()
    if len(content) > MAX_IMG_SIZE:
        raise HTTPException(413, "Image too large (max 5MB)")

    ext = (file.filename or "image.png").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMG_EXT:
        raise HTTPException(400, f"Only {', '.join(ALLOWED_IMG_EXT)} allowed")

    # Delete old image if exists
    if product.image_url and product.image_url.startswith("/api/products/image/"):
        old_name = product.image_url.rsplit("/", 1)[-1]
        old_path = os.path.join(PRODUCT_IMG_DIR, old_name)
        if os.path.isfile(old_path):
            os.remove(old_path)

    filename = f"{product_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(PRODUCT_IMG_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    product.image_url = f"/api/products/image/{filename}"
    await db.commit()

    return {"ok": True, "image_url": product.image_url}


@router.delete("/{product_id}/image")
async def delete_product_image(
    product_id: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db),
):
    """Remove a product's image."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Not authorized")

    if product.image_url and product.image_url.startswith("/api/products/image/"):
        fname = product.image_url.rsplit("/", 1)[-1]
        fpath = os.path.join(PRODUCT_IMG_DIR, fname)
        if os.path.isfile(fpath):
            os.remove(fpath)

    product.image_url = None
    await db.commit()
    return {"ok": True}


@router.post("/{product_id}/keys")
async def add_product_keys(
    product_id: int,
    keys_data: ProductKeyBulkCreate,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Add keys to a product (seller only)"""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Add keys
    for key_value in keys_data.keys:
        key = ProductKey(product_id=product_id, key_value=key_value)
        db.add(key)
    
    # Update stock count
    product.stock_count += len(keys_data.keys)
    
    await db.commit()
    
    return {"message": f"Added {len(keys_data.keys)} keys", "stock": product.stock_count}


@router.get("/{product_id}/keys")
async def list_product_keys(
    product_id: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """List all unsold keys for a product (seller/admin only)"""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")

    keys_result = await db.execute(
        select(ProductKey)
        .where(ProductKey.product_id == product_id, ProductKey.is_sold == False)
        .order_by(ProductKey.created_at.desc())
    )
    keys = keys_result.scalars().all()

    return [
        {"id": k.id, "key_value": k.key_value, "created_at": k.created_at.isoformat() if k.created_at else None}
        for k in keys
    ]


@router.delete("/{product_id}/keys/{key_id}")
async def delete_product_key(
    product_id: int,
    key_id: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Delete an unsold key"""
    result = await db.execute(
        select(ProductKey).where(ProductKey.id == key_id, ProductKey.product_id == product_id, ProductKey.is_sold == False)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")

    prod_result = await db.execute(select(Product).where(Product.id == product_id))
    product = prod_result.scalar_one_or_none()

    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.delete(key)
    product.stock_count = max(0, product.stock_count - 1)
    await db.commit()

    return {"message": "Key deleted", "stock": product.stock_count}


@router.post("/{product_id}/keys/upload")
async def upload_product_keys_file(
    product_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Upload keys from a CSV or JSON file"""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Enforce file size limit (5MB)
    MAX_FILE_SIZE = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")
    text = content.decode("utf-8").strip()
    keys = []

    filename = (file.filename or "").lower()

    if filename.endswith(".json"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                keys = [str(k).strip() for k in parsed if str(k).strip()]
            elif isinstance(parsed, dict) and "keys" in parsed:
                keys = [str(k).strip() for k in parsed["keys"] if str(k).strip()]
            else:
                raise HTTPException(status_code=400, detail="JSON must be an array of keys or {\"keys\": [...]}")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON file")
    elif filename.endswith(".csv"):
        try:
            reader = csv.reader(io.StringIO(text))
            for row in reader:
                for cell in row:
                    val = cell.strip()
                    if val:
                        keys.append(val)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid CSV file")
    else:
        # Fallback: treat as plain text, one key per line
        keys = [line.strip() for line in text.splitlines() if line.strip()]

    if not keys:
        raise HTTPException(status_code=400, detail="No keys found in file")

    for key_value in keys:
        db.add(ProductKey(product_id=product_id, key_value=key_value))

    product.stock_count += len(keys)
    await db.commit()

    return {"message": f"Uploaded {len(keys)} keys from file", "stock": product.stock_count}


@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Deactivate product (soft delete)"""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if product.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    product.is_active = False
    await db.commit()
    
    return {"message": "Product deactivated"}


# ============ Review Endpoints ============

@router.get("/{product_id}/reviews", response_model=List[ReviewSchema])
async def get_product_reviews(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get all reviews for a product"""
    result = await db.execute(
        select(Review)
        .options(selectinload(Review.reviewer), selectinload(Review.product))
        .where(Review.product_id == product_id)
        .order_by(Review.created_at.desc())
    )
    reviews = result.scalars().all()
    return reviews


@router.post("/{product_id}/reviews", response_model=ReviewSchema)
async def create_review(
    product_id: int,
    review_data: ReviewCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a review for a product (buyer only, 1 review per order)"""
    # Check product exists
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Only buyers can review (not the seller of this product)
    if product.seller_id == current_user.id:
        raise HTTPException(status_code=403, detail="Sellers cannot review their own products")

    # Check buyer has a completed/delivered order with this product
    order_query = (
        select(Order)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(
            Order.buyer_id == current_user.id,
            OrderItem.product_id == product_id,
            Order.status.in_([OrderStatus.COMPLETED, OrderStatus.DELIVERED])
        )
    )
    if review_data.order_id:
        order_query = order_query.where(Order.id == review_data.order_id)
    order_query = order_query.limit(1)

    result = await db.execute(order_query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=403, detail="You must purchase this product before reviewing")

    # Check no duplicate review for this order+product combo
    duplicate_query = select(Review).where(
        Review.product_id == product_id,
        Review.reviewer_id == current_user.id,
    )
    if review_data.order_id:
        duplicate_query = duplicate_query.where(Review.order_id == review_data.order_id)
    else:
        duplicate_query = duplicate_query.where(Review.order_id == order.id)

    result = await db.execute(duplicate_query)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="You already reviewed this product for this order")

    # Validate rating
    if review_data.rating < 1 or review_data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Create review
    review = Review(
        product_id=product_id,
        reviewer_id=current_user.id,
        order_id=review_data.order_id or order.id,
        rating=review_data.rating,
        comment=review_data.comment
    )
    db.add(review)
    await db.flush()

    # Update product rating aggregation
    result = await db.execute(
        select(func.avg(Review.rating), func.count(Review.id))
        .where(Review.product_id == product_id)
    )
    avg_rating, count = result.one()
    product.rating = round(float(avg_rating), 2)
    product.review_count = count

    # Update seller rating aggregation (avg of all their products' ratings that have reviews)
    seller_id = product.seller_id
    result = await db.execute(
        select(func.avg(Review.rating), func.count(Review.id))
        .join(Product, Product.id == Review.product_id)
        .where(Product.seller_id == seller_id)
    )
    seller_avg, seller_count = result.one()
    seller_result = await db.execute(select(User).where(User.id == seller_id))
    seller = seller_result.scalar_one_or_none()
    if seller:
        seller.seller_rating = round(float(seller_avg), 2)
        seller.seller_review_count = seller_count

    await db.commit()

    # Reload with reviewer and product
    result = await db.execute(
        select(Review)
        .options(selectinload(Review.reviewer), selectinload(Review.product))
        .where(Review.id == review.id)
    )
    return result.scalar_one()


# ============ Product Variants ============

@router.get("/{product_id}/variants", response_model=List[ProductVariantSchema])
async def list_variants(
    product_id: int,
    db: AsyncSession = Depends(get_db)
):
    """List all variants for a product"""
    result = await db.execute(
        select(ProductVariant)
        .where(ProductVariant.product_id == product_id, ProductVariant.is_active == True)
        .order_by(ProductVariant.price.asc())
    )
    return result.scalars().all()


@router.post("/{product_id}/variants", response_model=ProductVariantSchema)
async def create_variant(
    product_id: int,
    data: ProductVariantCreate,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Create a new product variant (seller only)"""
    # Check product ownership
    result = await db.execute(
        select(Product).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    
    if not product or product.seller_id != current_user.id:
        raise HTTPException(status_code=404, detail="Product not found")
    
    variant = ProductVariant(
        product_id=product_id,
        name=data.name,
        price=data.price
    )
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return variant


@router.put("/{product_id}/variants/{variant_id}", response_model=ProductVariantSchema)
async def update_variant(
    product_id: int,
    variant_id: int,
    data: ProductVariantUpdate,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Update a product variant (seller only)"""
    result = await db.execute(
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
            Product.seller_id == current_user.id
        )
    )
    variant = result.scalar_one_or_none()
    
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(variant, key, value)
    
    await db.commit()
    await db.refresh(variant)
    return variant


@router.delete("/{product_id}/variants/{variant_id}")
async def delete_variant(
    product_id: int,
    variant_id: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Delete a product variant (seller only)"""
    result = await db.execute(
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
            Product.seller_id == current_user.id
        )
    )
    variant = result.scalar_one_or_none()
    
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    
    # Check if there are keys linked to this variant
    keys_count = await db.scalar(
        select(func.count()).select_from(ProductKey).where(
            ProductKey.variant_id == variant_id,
            ProductKey.is_sold == False
        )
    )
    
    if keys_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete variant with {keys_count} unsold keys. Delete or reassign keys first.")
    
    await db.delete(variant)
    await db.commit()
    return {"message": "Variant deleted"}


@router.post("/{product_id}/variants/{variant_id}/keys")
async def add_keys_to_variant(
    product_id: int,
    variant_id: int,
    data: ProductKeyBulkCreate,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Add keys to a specific variant (seller only)"""
    # Check ownership
    result = await db.execute(
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
            Product.seller_id == current_user.id
        )
    )
    variant = result.scalar_one_or_none()
    
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    
    added_count = 0
    for key_value in data.keys:
        key_value = key_value.strip()
        if not key_value:
            continue
        # Check for duplicates
        existing = await db.execute(
            select(ProductKey).where(
                ProductKey.product_id == product_id,
                ProductKey.key_value == key_value
            )
        )
        if existing.scalar_one_or_none():
            continue
        
        key = ProductKey(
            product_id=product_id,
            variant_id=variant_id,
            key_value=key_value
        )
        db.add(key)
        added_count += 1
    
    # Update variant stock count
    variant.stock_count += added_count
    
    await db.commit()
    return {"message": f"Added {added_count} keys to variant", "added": added_count}


@router.get("/{product_id}/variants/{variant_id}/keys")
async def get_variant_keys(
    product_id: int,
    variant_id: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Get keys for a specific variant (seller only)"""
    result = await db.execute(
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
            Product.seller_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Variant not found")
    
    result = await db.execute(
        select(ProductKey)
        .where(ProductKey.variant_id == variant_id)
        .order_by(ProductKey.created_at.desc())
    )
    keys = result.scalars().all()
    
    return [{
        "id": k.id,
        "key_value": k.key_value[:20] + "..." if len(k.key_value) > 20 else k.key_value,
        "is_sold": k.is_sold,
        "sold_at": k.sold_at.isoformat() if k.sold_at else None,
        "created_at": k.created_at.isoformat() if k.created_at else None
    } for k in keys]


@router.post("/{product_id}/variants/{variant_id}/keys/upload")
async def upload_variant_keys_file(
    product_id: int,
    variant_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Upload keys from a CSV or JSON file to a variant"""
    # Check ownership
    result = await db.execute(
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
            Product.seller_id == current_user.id
        )
    )
    variant = result.scalar_one_or_none()
    
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    # Enforce file size limit (5MB)
    MAX_FILE_SIZE = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")
    text = content.decode("utf-8").strip()
    keys = []

    filename = (file.filename or "").lower()

    if filename.endswith(".json"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                keys = [str(k).strip() for k in parsed if str(k).strip()]
            elif isinstance(parsed, dict) and "keys" in parsed:
                keys = [str(k).strip() for k in parsed["keys"] if str(k).strip()]
            else:
                raise HTTPException(status_code=400, detail="JSON must be an array of keys or {\"keys\": [...]}")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON file")
    elif filename.endswith(".csv"):
        try:
            reader = csv.reader(io.StringIO(text))
            for row in reader:
                for cell in row:
                    val = cell.strip()
                    if val:
                        keys.append(val)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid CSV file")
    else:
        # Fallback: treat as plain text, one key per line
        keys = [line.strip() for line in text.splitlines() if line.strip()]

    if not keys:
        raise HTTPException(status_code=400, detail="No keys found in file")

    added_count = 0
    for key_value in keys:
        # Check for duplicates
        existing = await db.execute(
            select(ProductKey).where(
                ProductKey.product_id == product_id,
                ProductKey.key_value == key_value
            )
        )
        if existing.scalar_one_or_none():
            continue
        
        db.add(ProductKey(product_id=product_id, variant_id=variant_id, key_value=key_value))
        added_count += 1

    variant.stock_count += added_count
    await db.commit()

    return {"message": f"Uploaded {added_count} keys from file", "stock": variant.stock_count}
