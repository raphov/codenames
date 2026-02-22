from telegram import Update
from telegram.ext import ContextTypes
import uuid

from game.room import active_rooms, GameRoom
from utils.config import FRONTEND_URL


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 Привет! Я бот для игры в Codenames.\n\n"
        "🎮 /new — создать новую комнату\n"
        "❓ /help — правила игры"
    )


async def new_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    room_id = str(uuid.uuid4())[:6].upper()
    room = GameRoom(room_id)
    active_rooms[room_id] = room

    captain_red = f"{FRONTEND_URL}?room={room_id}&role=captain_red"
    captain_blue = f"{FRONTEND_URL}?room={room_id}&role=captain_blue"
    agent_red = f"{FRONTEND_URL}?room={room_id}&role=agent_red"
    agent_blue = f"{FRONTEND_URL}?room={room_id}&role=agent_blue"

    text = (
        f"🎮 Комната {room_id} создана!\n\n"
        f"👑 Капитан красных:\n{captain_red}\n\n"
        f"👑 Капитан синих:\n{captain_blue}\n\n"
        f"🔎 Агент красных:\n{agent_red}\n\n"
        f"🔎 Агент синих:\n{agent_blue}\n\n"
        f"📌 Переходите по своим ссылкам и начинайте игру!"
    )
    await update.message.reply_text(text)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📖 Правила Codenames\n\n"
        "• Капитаны видят цвета всех карточек и дают подсказки.\n"
        "• Агенты угадывают слова по подсказкам.\n"
        "• Цель: открыть все карточки своей команды.\n"
        "• Чёрная карточка — мгновенное поражение.\n\n"
        "Как играть:\n"
        "1. Капитан даёт подсказку (одно слово и число).\n"
        "2. Агенты совещаются и открывают карты (удерживайте карту 1.5 сек).\n"
        "3. Если открыта карта своей команды, можно продолжать.\n"
        "4. Если ошибка — ход переходит к другой команде.\n\n"
        "Удачи! 🍀"
    )


async def unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "❓ Неизвестная команда. Используйте /new или /help"
    )