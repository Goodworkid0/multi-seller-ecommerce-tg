"""
Gimmick Telegram Bot
Simple bot for notifications and Mini App access
"""
import os
import json
import logging
import httpx
from telegram import Update, WebAppInfo, MenuButtonWebApp
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters
from dotenv import load_dotenv
from pathlib import Path

# Setup logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.DEBUG
)
logger = logging.getLogger(__name__)

env_path = Path(__file__).resolve().with_name('.env')
load_dotenv(dotenv_path=env_path)

BOT_TOKEN = os.getenv('BOT_TOKEN')
WEBAPP_URL = os.getenv('WEBAPP_URL', 'http://localhost:3001')
API_URL = os.getenv('API_URL', 'http://localhost:8000')

logger.info(f"Loaded WEBAPP_URL: {WEBAPP_URL}")


async def _fetch_branding():
    """Fetch branding data (rules, links) from the API."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{API_URL}/api/branding")
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Failed to fetch branding: {e}")
    return {}


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Simple welcome used for announcements"""
    user = update.effective_user
    logger.info(f"Start command from user: {user.id} ({user.first_name})")
    logger.info(f"Using WEBAPP_URL: {WEBAPP_URL}")

    # Fetch branding data
    branding = await _fetch_branding()
    app_name = branding.get("app_name") or ""
    rules = branding.get("marketplace_rules", [])
    announcements_url = branding.get("announcements_url", "")
    suggestion_url = branding.get("suggestion_group_url", "")
    official_group_url = branding.get("official_group_url", "")

    rules_text = ""
    if rules:
        rules_text = "\n\n📋 *Marketplace Rules*\n"
        for i, rule in enumerate(rules, 1):
            rules_text += f"{i}. {rule}\n"

    links = []
    if announcements_url:
        links.append(f"📢 [Announcements]({announcements_url})")
    if official_group_url:
        links.append(f"👥 [Official Group]({official_group_url})")
    if suggestion_url:
        links.append(f"💡 [Suggestions]({suggestion_url})")

    links_text = ""
    if links:
        links_text = "\n\n" + "\n".join(links)

    # Use dynamic welcome message from branding, with {name} and {app} placeholders
    welcome_template = branding.get("bot_welcome_message", "").strip()
    if welcome_template:
        welcome_msg = welcome_template.replace("{name}", user.first_name or "").replace("{app}", app_name)
    elif app_name:
        welcome_msg = f"👋 Welcome to *{app_name}*, {user.first_name}!"
    else:
        welcome_msg = f"👋 Welcome, {user.first_name}!"

    await update.message.reply_text(
        f"{welcome_msg}"
        f"{rules_text}"
        f"{links_text}",
        parse_mode='Markdown'
    )


async def handle_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle data from Mini App (order confirmations etc)"""
    try:
        data = json.loads(update.effective_message.web_app_data.data)
        
        if data.get('action') == 'order_complete':
            order_id = data.get('order_id')
            items = data.get('items', [])
            
            message = f"✅ **Order #{order_id}**\n\n"
            for item in items:
                message += f"📦 {item['product_name']}\n"
                for key in item.get('keys', []):
                    message += f"`{key}`\n"
            
            await update.message.reply_text(message, parse_mode='Markdown')
            
    except Exception as e:
        print(f"Webapp data error: {e}")


async def post_init(application):
    """Set menu button after bot starts"""
    logger.info(f"Setting menu button with URL: {WEBAPP_URL}")
    try:
        # Menu button uses base URL - auth comes from Telegram WebApp context
        await application.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="🛒 Marketplace",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )
        )
        logger.info("✅ Menu button set successfully")
    except Exception as e:
        logger.error(f"Menu button error: {e}", exc_info=True)


def main():
    if not BOT_TOKEN:
        print("❌ BOT_TOKEN not set in .env")
        return
    
    app = Application.builder().token(BOT_TOKEN).post_init(post_init).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))
    
    print(f"🎮 Gimmick Bot started")
    print(f"📱 WebApp: {WEBAPP_URL}")
    
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
