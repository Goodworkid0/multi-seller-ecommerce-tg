"""Background tasks - auto-complete orders after 48h, finalize auctions, release escrow funds, auto-finish giveaways"""
import asyncio
import logging
import secrets as _secrets
from datetime import datetime, timedelta
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from app.database import async_session, get_fee_settings, calc_seller_amount
from app.models import Order, OrderItem, OrderStatus, OrderMessage, User, Notification, Auction, AuctionStatus, AuctionBid, MiddlemanDeal, MiddlemanStatus, Giveaway, GiveawayEntry, GiveawayWinner, CryptoDeposit, Referral, AppSettings
from app.telegram import create_notification

logger = logging.getLogger(__name__)

AUTO_COMPLETE_CHECK_INTERVAL = 300  # Check every 5 minutes
AUCTION_CHECK_INTERVAL = 60  # Check auctions every 1 minute
GIVEAWAY_CHECK_INTERVAL = 60  # Check giveaways every 1 minute
GIVEAWAY_KEYWORD_CHECK_INTERVAL = 3600  # Re-verify name keywords every 1 hour
PAYMENT_DEADLINE_HOURS = 48  # Winner has 48 hours to pay
DEPOSIT_EXPIRY_HOURS = 6  # Auto-expire unpaid deposits after 6 hours
DEPOSIT_EXPIRY_CHECK_INTERVAL = 300  # Check every 5 minutes
PENDING_ORDER_CHECK_INTERVAL = 300  # Check every 5 minutes


async def auto_complete_orders():
    """Check for delivered orders past their auto_complete_at deadline and complete them"""
    audit_logger = logging.getLogger("audit")
    while True:
        try:
            async with async_session() as db:
                now = datetime.utcnow()
                result = await db.execute(
                    select(Order).where(
                        Order.status == OrderStatus.DELIVERED,
                        Order.auto_complete_at != None,
                        Order.auto_complete_at <= now,
                        Order.is_buyer_confirmed == False
                    )
                )
                orders = result.scalars().all()
                order_ids = [o.id for o in orders]  # Store IDs for individual processing

            # Process each order in its own transaction for isolation
            completed_count = 0
            for order_id in order_ids:
                try:
                    async with async_session() as db:
                        # Re-fetch order with lock
                        result = await db.execute(
                            select(Order).where(Order.id == order_id).with_for_update()
                        )
                        order = result.scalar_one_or_none()
                        
                        if not order or order.status != OrderStatus.DELIVERED:
                            continue  # Skip if already processed
                        
                        order.status = OrderStatus.COMPLETED
                        order.completed_at = datetime.utcnow()
                        
                        # Release funds from pending_balance to balance and increment seller total_sales
                        fee_settings = await get_fee_settings(db)
                        items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
                        seller_ids_done = set()
                        total_released = 0
                        for item in items_result.scalars().all():
                            # Lock seller row to prevent race conditions on balance update
                            seller_result = await db.execute(
                                select(User).where(User.id == item.seller_id).with_for_update()
                            )
                            seller = seller_result.scalar_one()
                            
                            # Release escrow funds - auction items use auction fee, products use product fee
                            if item.auction_id:
                                item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["auction_fee"])
                            else:
                                item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["product_fee"])
                            seller.pending_balance = round(max(0, (seller.pending_balance or 0) - item_earnings), 2)
                            seller.balance = round((seller.balance or 0) + (item_earnings), 2)
                            total_released += item_earnings
                            
                            if item.seller_id not in seller_ids_done:
                                seller.total_sales = (seller.total_sales or 0) + 1
                                seller_ids_done.add(item.seller_id)
                        
                        # Add system message
                        msg = OrderMessage(
                            order_id=order.id,
                            sender_id=order.buyer_id,
                            content="Order auto-completed after 48 hours without dispute.",
                            is_system=True
                        )
                        db.add(msg)
                        
                        # Notify seller(s) about auto-completion
                        for sid in seller_ids_done:
                            await create_notification(
                                db, user_id=sid, type="order_completed",
                                title=f"Order #{order.id} auto-completed",
                                body="48h passed without dispute — funds are yours.",
                                link=f"/orders/{order.id}",
                            )
                            await create_notification(
                                db, user_id=sid, type="order_status_update",
                                title=f"Order #{order.id} status updated",
                                body="Order status changed to completed (auto-complete).",
                                link=f"/orders/{order.id}",
                            )

                        await create_notification(
                            db, user_id=order.buyer_id, type="order_completed",
                            title=f"Order #{order.id} auto-completed",
                            body="48h passed without dispute and the order was completed automatically.",
                            link=f"/orders/{order.id}",
                        )
                        await create_notification(
                            db, user_id=order.buyer_id, type="order_status_update",
                            title=f"Order #{order.id} status updated",
                            body="Order status changed to completed (auto-complete).",
                            link=f"/orders/{order.id}",
                        )
                        
                        await db.commit()
                        completed_count += 1
                        logger.info(f"Auto-completed order #{order.id}")
                        audit_logger.info(f"AUTO_COMPLETE: Order #{order.id} completed, ${total_released:.2f} released to sellers")
                        
                except Exception as e:
                    logger.error(f"Failed to auto-complete order #{order_id}: {e}")
                    # Continue with next order
            
            if completed_count > 0:
                logger.info(f"Auto-completed {completed_count} orders")

        except Exception as e:
            logger.error(f"Auto-complete task error: {e}")

        await asyncio.sleep(AUTO_COMPLETE_CHECK_INTERVAL)


async def finalize_auctions():
    """Check for ended auctions and set them to AWAITING_PAYMENT"""
    while True:
        try:
            async with async_session() as db:
                now = datetime.utcnow()
                
                # Find active auctions that have ended
                result = await db.execute(
                    select(Auction).where(
                        Auction.status == AuctionStatus.ACTIVE,
                        Auction.ends_at != None,
                        Auction.ends_at <= now
                    )
                )
                auctions = result.scalars().all()

                for auction in auctions:
                    if auction.bid_count > 0 and auction.current_bid:
                        # Has bids - find winning bidder
                        bid_result = await db.execute(
                            select(AuctionBid).where(
                                AuctionBid.auction_id == auction.id,
                                AuctionBid.is_winning == True
                            )
                        )
                        winning_bid = bid_result.scalar_one_or_none()
                        
                        if winning_bid:
                            auction.status = AuctionStatus.AWAITING_PAYMENT
                            auction.winner_id = winning_bid.bidder_id
                            auction.payment_deadline = now + timedelta(hours=PAYMENT_DEADLINE_HOURS)
                            
                            # Notify winner
                            await create_notification(
                                db, user_id=winning_bid.bidder_id, type="auction_won",
                                title=f"You won: {auction.title}",
                                body=f"Pay ${auction.current_bid:.2f} within 48 hours to claim your item.",
                                link=f"/auctions/{auction.id}",
                            )
                            
                            # Notify seller
                            await create_notification(
                                db, user_id=auction.seller_id, type="auction_ended",
                                title=f"Auction ended: {auction.title}",
                                body=f"Winning bid: ${auction.current_bid:.2f}. Waiting for buyer payment.",
                                link=f"/seller/auctions",
                            )
                            
                            logger.info(f"Auction #{auction.id} ended - awaiting payment from user #{winning_bid.bidder_id}")
                    else:
                        # No bids - mark as ended
                        auction.status = AuctionStatus.ENDED
                        
                        await create_notification(
                            db, user_id=auction.seller_id, type="auction_ended",
                            title=f"Auction ended: {auction.title}",
                            body="No bids received.",
                            link=f"/seller/auctions",
                        )
                        
                        logger.info(f"Auction #{auction.id} ended with no bids")

                if auctions:
                    await db.commit()
                    logger.info(f"Finalized {len(auctions)} auctions")

        except Exception as e:
            logger.error(f"Auction finalization task error: {e}")

        await asyncio.sleep(AUCTION_CHECK_INTERVAL)


async def check_auction_payment_deadlines():
    """Check for unpaid auctions and move to next bidder or cancel"""
    while True:
        try:
            async with async_session() as db:
                now = datetime.utcnow()
                
                # Find auctions past payment deadline
                result = await db.execute(
                    select(Auction).where(
                        Auction.status == AuctionStatus.AWAITING_PAYMENT,
                        Auction.payment_deadline != None,
                        Auction.payment_deadline <= now
                    )
                )
                auctions = result.scalars().all()

                for auction in auctions:
                # Get second highest bidder - sort by amount desc, then by created_at asc (earlier bid wins ties)
                    bids_result = await db.execute(
                        select(AuctionBid).where(
                            AuctionBid.auction_id == auction.id,
                            AuctionBid.bidder_id != auction.winner_id
                        ).order_by(AuctionBid.amount.desc(), AuctionBid.created_at.asc())
                    )
                    next_bidders = bids_result.scalars().all()
                    
                    if next_bidders:
                        # Move to next bidder
                        next_bid = next_bidders[0]
                        old_winner_id = auction.winner_id
                        
                        auction.winner_id = next_bid.bidder_id
                        auction.current_bid = next_bid.amount
                        auction.payment_deadline = now + timedelta(hours=PAYMENT_DEADLINE_HOURS)
                        
                        # Mark old winning bid as not winning
                        await db.execute(
                            AuctionBid.__table__.update()
                            .where(and_(
                                AuctionBid.auction_id == auction.id,
                                AuctionBid.bidder_id == old_winner_id,
                                AuctionBid.is_winning == True
                            ))
                            .values(is_winning=False)
                        )
                        
                        # Mark new winning bid
                        await db.execute(
                            AuctionBid.__table__.update()
                            .where(AuctionBid.id == next_bid.id)
                            .values(is_winning=True)
                        )
                        
                        # Notify new winner
                        await create_notification(
                            db, user_id=next_bid.bidder_id, type="auction_won",
                            title=f"You won: {auction.title}",
                            body=f"Previous winner didn't pay. Pay ${next_bid.amount:.2f} within 48h.",
                            link=f"/auctions/{auction.id}",
                        )
                        
                        # Notify old winner
                        await create_notification(
                            db, user_id=old_winner_id, type="auction_payment_failed",
                            title="Payment deadline passed",
                            body=f"You didn't pay for {auction.title} in time.",
                            link=f"/auctions/{auction.id}",
                        )
                        
                        logger.info(f"Auction #{auction.id} moved to next bidder #{next_bid.bidder_id}")
                    else:
                        # No other bidders - cancel auction
                        auction.status = AuctionStatus.CANCELLED
                        
                        await create_notification(
                            db, user_id=auction.seller_id, type="auction_cancelled",
                            title=f"Auction cancelled: {auction.title}",
                            body="Winner didn't pay and no other bidders.",
                            link=f"/seller/auctions",
                        )
                        
                        logger.info(f"Auction #{auction.id} cancelled - winner didn't pay, no other bidders")

                if auctions:
                    await db.commit()
                    logger.info(f"Processed {len(auctions)} unpaid auctions")

        except Exception as e:
            logger.error(f"Auction payment deadline task error: {e}")

        await asyncio.sleep(AUCTION_CHECK_INTERVAL)


ESCROW_RELEASE_CHECK_INTERVAL = 300  # Check every 5 minutes


async def release_escrow_funds():
    """Release middleman escrow funds to seller balance when lock-in period expires."""
    audit_logger = logging.getLogger("audit")
    while True:
        try:
            async with async_session() as db:
                now = datetime.utcnow()
                
                # Find completed deals past their release date that haven't been released yet
                result = await db.execute(
                    select(MiddlemanDeal).where(
                        MiddlemanDeal.status == MiddlemanStatus.COMPLETED,
                        MiddlemanDeal.funds_released == False,
                        MiddlemanDeal.funds_release_at != None,
                        MiddlemanDeal.funds_release_at <= now,
                    )
                )
                deals = result.scalars().all()
                
                released_count = 0
                for deal in deals:
                    try:
                        # Lock seller row
                        seller_result = await db.execute(
                            select(User).where(User.id == deal.seller_id).with_for_update()
                        )
                        seller = seller_result.scalar_one_or_none()
                        if not seller:
                            continue
                        
                        # Move from escrow_balance to balance
                        amount = deal.amount
                        escrow = seller.escrow_balance or 0
                        transfer = min(amount, escrow)  # Don't go negative
                        
                        if transfer > 0:
                            seller.escrow_balance = round(escrow - transfer, 2)
                            seller.balance = round((seller.balance or 0) + (transfer), 2)
                        
                        deal.funds_released = True
                        
                        # Notify seller
                        await create_notification(
                            db, user_id=seller.id, type="escrow_released",
                            title="Escrow Funds Released",
                            body=f"${transfer:.2f} from deal '{deal.title}' moved to your balance.",
                            link="/wallet", telegram_id=seller.telegram_id,
                        )
                        
                        await db.commit()
                        released_count += 1
                        audit_logger.info(
                            f"ESCROW_RELEASE: Deal #{deal.id} - ${transfer:.2f} released to seller "
                            f"@{seller.username} (ID:{seller.id}). Lock-in: {deal.lock_in_days} days."
                        )
                    except Exception as e:
                        logger.error(f"Failed to release escrow for deal #{deal.id}: {e}")
                        await db.rollback()
                
                if released_count > 0:
                    logger.info(f"Released escrow funds for {released_count} deals")
        
        except Exception as e:
            logger.error(f"Escrow release task error: {e}")
        
        await asyncio.sleep(ESCROW_RELEASE_CHECK_INTERVAL)


async def auto_finish_giveaways():
    """Check for ended giveaways with auto_pick_winner=True and pick a random winner"""
    audit_logger = logging.getLogger("audit")
    while True:
        try:
            async with async_session() as db:
                now = datetime.utcnow()
                
                # Find giveaways that:
                # - Are enabled
                # - Have auto_pick_winner enabled
                # - Have ended (ends_at <= now)
                # - Don't have a winner yet
                result = await db.execute(
                    select(Giveaway).where(
                        Giveaway.enabled == True,
                        Giveaway.auto_pick_winner == True,
                        Giveaway.ends_at != None,
                        Giveaway.ends_at <= now,
                        Giveaway.winner_user_id == None
                    )
                )
                giveaways = result.scalars().all()
                
                for g in giveaways:
                    try:
                        # Double-check no winners already exist (race condition guard)
                        existing_count = await db.scalar(
                            select(func.count()).select_from(GiveawayWinner).where(GiveawayWinner.giveaway_id == g.id)
                        ) or 0
                        if existing_count > 0:
                            # Winners already picked (by admin or earlier auto-pick), just set legacy field
                            if not g.winner_user_id:
                                first_winner = await db.scalar(
                                    select(GiveawayWinner.user_id).where(GiveawayWinner.giveaway_id == g.id).order_by(GiveawayWinner.place)
                                )
                                if first_winner:
                                    g.winner_user_id = first_winner
                                    g.winner_picked_at = datetime.utcnow()
                                    await db.commit()
                            continue

                        # Get all entries
                        entries_res = await db.execute(
                            select(GiveawayEntry)
                            .where(GiveawayEntry.giveaway_id == g.id)
                            .options(selectinload(GiveawayEntry.user))
                        )
                        entries = [e for e in entries_res.scalars().all() if e.user is not None]
                        
                        if not entries:
                            logger.info(f"Giveaway #{g.id} '{g.title}' ended with no entries, skipping auto-pick")
                            continue
                        
                        # If deposit_required, filter to only users with deposits
                        if g.deposit_required:
                            eligible = []
                            for e in entries:
                                has_deposit = await db.scalar(
                                    select(func.count(CryptoDeposit.id)).where(
                                        CryptoDeposit.user_id == e.user_id,
                                        CryptoDeposit.is_credited == True,
                                    )
                                )
                                if (has_deposit or 0) > 0:
                                    eligible.append(e)
                            entries = eligible
                            
                            if not entries:
                                logger.info(f"Giveaway #{g.id} '{g.title}' has no eligible entries (deposit required), skipping")
                                continue

                        # Re-verify name keyword at draw time
                        keyword = (getattr(g, "require_name_keyword", None) or "").strip()
                        if keyword:
                            kw_lower = keyword.lower()
                            entries = [
                                e for e in entries
                                if e.user and kw_lower in f"{e.user.first_name or ''} {getattr(e.user, 'last_name', '') or ''}".strip().lower()
                            ]
                            if not entries:
                                logger.info(f"Giveaway #{g.id} '{g.title}' no entries match name keyword '{keyword}', skipping")
                                continue

                        # Determine winner based on winner_mode
                        winner_mode = getattr(g, "winner_mode", "random") or "random"
                        winner_count = int(getattr(g, "winner_count", 1) or 1)
                        
                        selected_winners = []
                        
                        if winner_mode == "most_referrals":
                            # Tournament mode: pick entries sorted by referral count
                            entry_referral_counts = []
                            for e in entries:
                                ref_count = await db.scalar(
                                    select(func.count(Referral.id)).where(Referral.referrer_id == e.user_id)
                                ) or 0
                                entry_referral_counts.append((e, ref_count))
                            
                            # Sort by referral count descending
                            entry_referral_counts.sort(key=lambda x: x[1], reverse=True)
                            
                            # Pick top N winners
                            picked_user_ids = set()
                            remaining = list(entry_referral_counts)
                            
                            while len(selected_winners) < winner_count and remaining:
                                max_refs = remaining[0][1]
                                tied = [e for e, count in remaining if count == max_refs]
                                _secrets.SystemRandom().shuffle(tied)
                                
                                for e in tied:
                                    if e.user_id not in picked_user_ids and len(selected_winners) < winner_count:
                                        selected_winners.append(e)
                                        picked_user_ids.add(e.user_id)
                                
                                remaining = [(e, c) for e, c in remaining if e.user_id not in picked_user_ids]
                            
                            logger.info(f"Tournament mode: {len(selected_winners)} winners picked")
                        else:
                            # Random mode: pick N random unique winners
                            available = list(entries)
                            _secrets.SystemRandom().shuffle(available)
                            picked_user_ids = set()
                            
                            for e in available:
                                if e.user_id not in picked_user_ids and len(selected_winners) < winner_count:
                                    selected_winners.append(e)
                                    picked_user_ids.add(e.user_id)
                        
                        # Create GiveawayWinner records
                        now = datetime.utcnow()
                        for place, winner_entry in enumerate(selected_winners, start=1):
                            gw = GiveawayWinner(
                                giveaway_id=g.id,
                                user_id=winner_entry.user_id,
                                place=place,
                                picked_at=now,
                            )
                            db.add(gw)
                            
                            # Notify winner
                            place_text = f"{place}{'st' if place == 1 else 'nd' if place == 2 else 'rd' if place == 3 else 'th'} place"
                            await create_notification(
                                db, user_id=winner_entry.user_id, type="giveaway_won",
                                title=f"You won {place_text}: {g.title}!",
                                body=f"Congratulations! You got {place_text} in the giveaway. Prize: {g.prize or 'Prize'}",
                                link="/giveaways",
                                telegram_id=winner_entry.user.telegram_id if winner_entry.user else None,
                            )
                        
                        # Set legacy winner_user_id to 1st place
                        if selected_winners:
                            g.winner_user_id = selected_winners[0].user_id
                            g.winner_picked_at = now
                        
                        await db.commit()
                        logger.info(f"Auto-picked {len(selected_winners)} winners for giveaway #{g.id} '{g.title}'")
                        audit_logger.info(
                            f"GIVEAWAY_AUTO_PICK: Giveaway #{g.id} '{g.title}' - "
                            f"Winners: {len(selected_winners)}, "
                            f"Prize: {g.prize}, Entries: {len(entries)}"
                        )
                        
                    except Exception as e:
                        logger.error(f"Failed to auto-pick winner for giveaway #{g.id}: {e}")
                        await db.rollback()
        
        except Exception as e:
            logger.error(f"Auto-finish giveaways task error: {e}")
        
        await asyncio.sleep(GIVEAWAY_CHECK_INTERVAL)


async def cancel_stale_pending_orders():
    """Auto-cancel orders stuck in PENDING (unpaid) status.

    Reads pending_order_cancel_hours from AppSettings (default 24h).
    Setting the value to 0 disables this feature.
    """
    audit_logger = logging.getLogger("audit")
    while True:
        try:
            async with async_session() as db:
                # Read configurable timeout from AppSettings
                settings_result = await db.execute(
                    select(AppSettings).where(AppSettings.id == 1)
                )
                settings = settings_result.scalar_one_or_none()
                cancel_hours = getattr(settings, 'pending_order_cancel_hours', 24) or 0

                if cancel_hours > 0:
                    cutoff = datetime.utcnow() - timedelta(hours=cancel_hours)
                    result = await db.execute(
                        select(Order).where(
                            Order.status == OrderStatus.PENDING,
                            Order.created_at < cutoff
                        )
                    )
                    stale = result.scalars().all()
                    if stale:
                        for order in stale:
                            order.status = OrderStatus.CANCELLED
                            # Notify buyer
                            await create_notification(
                                db,
                                user_id=order.buyer_id,
                                type="order_cancelled",
                                title=f"Order #{order.id} auto-cancelled",
                                body=f"Your unpaid order was cancelled after {cancel_hours}h.",
                                link=f"/orders/{order.id}",
                            )
                        await db.commit()
                        logger.info(f"Auto-cancelled {len(stale)} pending orders older than {cancel_hours}h")
                        audit_logger.info(f"ORDER_CANCEL_STALE: Auto-cancelled {len(stale)} pending orders older than {cancel_hours}h")
        except Exception as e:
            logger.error(f"Cancel stale pending orders task error: {e}")

        await asyncio.sleep(PENDING_ORDER_CHECK_INTERVAL)


async def expire_stale_deposits():
    """Auto-expire crypto deposits in waiting/created status older than DEPOSIT_EXPIRY_HOURS"""
    audit_logger = logging.getLogger("audit")
    while True:
        try:
            async with async_session() as db:
                cutoff = datetime.utcnow() - timedelta(hours=DEPOSIT_EXPIRY_HOURS)
                result = await db.execute(
                    select(CryptoDeposit).where(
                        CryptoDeposit.payment_status.in_(["created", "waiting"]),
                        CryptoDeposit.is_credited == False,
                        CryptoDeposit.created_at < cutoff
                    )
                )
                stale = result.scalars().all()
                if stale:
                    for dep in stale:
                        dep.payment_status = "expired"
                    await db.commit()
                    logger.info(f"Auto-expired {len(stale)} stale deposits")
                    audit_logger.info(f"DEPOSIT_EXPIRE: Auto-expired {len(stale)} deposits older than {DEPOSIT_EXPIRY_HOURS}h")
        except Exception as e:
            logger.error(f"Expire stale deposits task error: {e}")

        await asyncio.sleep(DEPOSIT_EXPIRY_CHECK_INTERVAL)


async def check_giveaway_keyword_compliance():
    """Periodically re-check active giveaway participants: remove entries whose
    user no longer has the required keyword in their Telegram name and notify them."""
    while True:
        try:
            async with async_session() as db:
                now = datetime.utcnow()
                # Active giveaways with a name keyword requirement
                result = await db.execute(
                    select(Giveaway).where(
                        Giveaway.enabled == True,
                        Giveaway.winner_user_id == None,  # not finished
                        Giveaway.require_name_keyword != None,
                        Giveaway.require_name_keyword != "",
                    )
                )
                giveaways = result.scalars().all()

                for g in giveaways:
                    # Skip giveaways that haven't started yet
                    if g.starts_at and g.starts_at > now:
                        continue
                    # Skip giveaways that already ended (auto_finish will handle those)
                    if g.ends_at and g.ends_at <= now:
                        continue

                    keyword = (g.require_name_keyword or "").strip()
                    if not keyword:
                        continue
                    kw_lower = keyword.lower()

                    entries_res = await db.execute(
                        select(GiveawayEntry)
                        .where(GiveawayEntry.giveaway_id == g.id)
                        .options(selectinload(GiveawayEntry.user))
                    )
                    entries = entries_res.scalars().all()

                    for entry in entries:
                        if not entry.user:
                            continue
                        full_name = f"{entry.user.first_name or ''} {entry.user.last_name or ''}".strip()
                        if kw_lower in full_name.lower():
                            continue  # still compliant

                        # User no longer has keyword — remove entry and notify
                        await db.delete(entry)
                        await create_notification(
                            db,
                            user_id=entry.user_id,
                            type="giveaway_removed",
                            title=f"Removed from: {g.title}",
                            body=(
                                f'Your name "{full_name}" no longer contains "{keyword}". '
                                f"You've been removed from this giveaway. "
                                f"Change your name back and re-enter."
                            ),
                            link="/giveaways",
                            telegram_id=entry.user.telegram_id,
                        )
                        logger.info(
                            f"Removed user {entry.user_id} (name={full_name!r}) from giveaway #{g.id} "
                            f"— keyword '{keyword}' no longer in name"
                        )

                    await db.commit()

        except Exception as e:
            logger.error(f"Giveaway keyword compliance check error: {e}")

        await asyncio.sleep(GIVEAWAY_KEYWORD_CHECK_INTERVAL)