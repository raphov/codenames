#!/usr/bin/env python3
import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем .env до всех остальных импортов
env_path = Path('.') / '.env'
load_dotenv(dotenv_path=env_path)

# Теперь можно импортировать модули, которые используют переменные окружения
import json
import logging
import asyncio
from datetime import datetime
from aiohttp import web
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from game.room import GameRoom, active_rooms
from handlers.commands import start_command, new_command, help_command, unknown_command
from utils.config import BOT_TOKEN, RENDER_URL

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

if not BOT_TOKEN:
    logger.critical("❌ BOT_TOKEN не задан!")
    raise ValueError("BOT_TOKEN обязателен")

# ==================== WEBSOCKET ====================
async def websocket_handler(request):
    ws = web.WebSocketResponse(autoping=True, heartbeat=30)
    await ws.prepare(request)

    room_id = request.query.get('room', '').upper()
    role_param = request.query.get('role', '')

    if not room_id or not role_param:
        await ws.close(code=1008, message=b'Missing room or role')
        return ws

    parts = role_param.split('_')
    if len(parts) != 2 or parts[0] not in ('captain', 'agent') or parts[1] not in ('red', 'blue'):
        await ws.close(code=1008, message=b'Invalid role format')
        return ws

    role_type, team = parts[0], parts[1]

    if room_id not in active_rooms:
        logger.error(f"❌ Комната {room_id} не найдена")
        await ws.close(code=1008, message=b'Room not found')
        return ws

    room = active_rooms[room_id]

    ws.role_type = role_type
    ws.team = team
    room.ws_connections.append(ws)
    logger.info(f"✅ WebSocket подключен: комната {room_id}, роль={role_type}, команда={team}, всего={len(room.ws_connections)}")

    try:
        if role_type == 'captain':
            game_state = room.get_state_for_captain(team)
        else:
            game_state = room.get_state_for_agent(team)

        await ws.send_json({'type': 'init', 'game_state': game_state})

        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    action = data.get('action')

                    if action == 'click_card':
                        index = data.get('index')
                        if index is None:
                            continue

                        if ws.role_type != 'agent':
                            await ws.send_json({'type': 'error', 'message': 'Только агенты открывают карты'})
                            continue

                        result = room.reveal_card(index, ws.team)
                        if 'error' in result:
                            await ws.send_json({'type': 'error', 'message': result['error']})
                        else:
                            update_msg = {
                                'type': 'card_revealed',
                                'index': result['index'],
                                'color': result['color'],
                                'red_score': result['red_score'],
                                'blue_score': result['blue_score']
                            }
                            await broadcast_to_room(room_id, update_msg)

                            if result['game_over']:
                                await broadcast_to_room(room_id, {
                                    'type': 'game_over',
                                    'winner': result['winner']
                                })

                    elif action == 'reset_game':
                        room.reset_game()
                        for conn in room.ws_connections:
                            if conn.closed:
                                continue
                            if conn.role_type == 'captain':
                                state = room.get_state_for_captain(conn.team)
                            else:
                                state = room.get_state_for_agent(conn.team)
                            await conn.send_json({'type': 'game_reset', 'game_state': state})

                    elif action == 'ping':
                        await ws.send_json({'type': 'pong'})

                except json.JSONDecodeError:
                    logger.error("❌ JSON parsing error")
                except Exception as e:
                    logger.exception(f"❌ Error handling message: {e}")

            elif msg.type == web.WSMsgType.ERROR:
                logger.error(f"❌ WebSocket error: {ws.exception()}")

    except Exception as e:
        logger.exception(f"❌ WebSocket exception: {e}")
    finally:
        if ws in room.ws_connections:
            room.ws_connections.remove(ws)
            logger.info(f"🔌 WebSocket отключен: комната {room_id}, осталось={len(room.ws_connections)}")

    return ws


async def broadcast_to_room(room_id: str, message: dict):
    if room_id not in active_rooms:
        return
    room = active_rooms[room_id]
    for conn in room.ws_connections:
        if not conn.closed:
            try:
                await conn.send_json(message)
            except:
                pass


# ==================== HTTP ====================
async def telegram_webhook(request):
    try:
        data = await request.json()
        update = Update.de_json(data, application.bot)
        await application.process_update(update)
        return web.Response(text='OK')
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        return web.Response(text='Error', status=500)


async def health_check(request):
    total_connections = sum(len(r.ws_connections) for r in active_rooms.values())
    return web.json_response({
        'status': 'ok',
        'rooms': len(active_rooms),
        'connections': total_connections,
        'timestamp': datetime.now().isoformat()
    })


async def cors_handler(request):
    return web.Response(
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )


# ==================== ОЧИСТКА ====================
async def cleanup_old_rooms():
    while True:
        await asyncio.sleep(300)
        to_remove = []
        for rid, room in list(active_rooms.items()):
            if not room.is_active():
                room.cleanup()
                to_remove.append(rid)
        for rid in to_remove:
            del active_rooms[rid]
        if to_remove:
            logger.info(f"🧹 Очищено {len(to_remove)} неактивных комнат")


# ==================== ЗАПУСК ====================
application = Application.builder().token(BOT_TOKEN).build()


async def main():
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("new", new_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(MessageHandler(filters.COMMAND, unknown_command))

    await application.initialize()
    await application.start()

    webhook_url = f"{RENDER_URL}/telegram"
    await application.bot.set_webhook(webhook_url)
    logger.info(f"✅ Вебхук установлен: {webhook_url}")

    server = web.Application()
    server.router.add_get('/', health_check)
    server.router.add_get('/health', health_check)
    server.router.add_post('/telegram', telegram_webhook)
    server.router.add_get('/ws', websocket_handler)
    server.router.add_options('/{tail:.*}', cors_handler)

    runner = web.AppRunner(server)
    await runner.setup()
    port = int(os.environ.get('PORT', 8080))
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()

    asyncio.create_task(cleanup_old_rooms())

    logger.info(f"🚀 Сервер запущен на порту {port}")
    logger.info(f"🔌 WebSocket endpoint: ws://.../ws?room=XXX&role=XXX")

    await asyncio.Future()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Остановка по Ctrl+C")
    except Exception as e:
        logger.exception("❌ Критическая ошибка")