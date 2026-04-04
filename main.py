#!/usr/bin/env python3
import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path('.') / '.env'
load_dotenv(dotenv_path=env_path)

import json
import logging
import asyncio
import aiohttp
from datetime import datetime
from aiohttp import web
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from game.room import GameRoom, active_rooms
from handlers.commands import start_command, new_command, help_command, unknown_command
from utils.config import BOT_TOKEN, RENDER_URL, GEMINI_API_KEY

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

if not BOT_TOKEN:
    logger.critical("❌ BOT_TOKEN не задан!")
    raise ValueError("BOT_TOKEN обязателен")


# ==================== GEMINI AI ====================

async def generate_ai_hint(hint_data: dict) -> dict:
    if not GEMINI_API_KEY:
        return {'error': 'GEMINI_API_KEY не задан в .env'}

    my_words    = hint_data['my_words']
    enemy_words = hint_data['enemy_words']
    neutral     = hint_data['neutral_words']
    black       = hint_data['black_words']
    team_ru     = 'Красных' if hint_data['team'] == 'red' else 'Синих'

    prompt = f"""Ты — опытный капитан в игре «Кодовые слова» (Codenames), команда {team_ru}.

Твои слова (нужно чтобы агенты угадали): {my_words}
Слова врага (угадают — очко врагу): {enemy_words}
Нейтральные слова (угадают — просто теряют ход): {neutral}
Чёрное слово (угадают — мгновенный проигрыш!): {black}

Задача: придумай одно слово-подсказку, которое:
1. Связывает как можно больше ТВОИХ слов по смыслу, ассоциации или теме
2. НЕ подходит к чёрному слову
3. Минимально подходит к словам врага
4. Само слово не должно быть однокоренным ни с одним словом на поле

Верни ТОЛЬКО валидный JSON без markdown-обёртки (без ```json), строго такой формат:
{{
  "hint": "ПОДСКАЗКА",
  "count": 3,
  "targets": ["СЛОВО1", "СЛОВО2", "СЛОВО3"],
  "reasoning": "Краткое объяснение связи (1-2 предложения)",
  "risk": "Какие слова могут смутить агентов и почему",
  "alternatives": [
    {{"hint": "ПОДСКАЗКА2", "count": 2, "targets": ["СЛОВО1", "СЛОВО2"], "safety": "high"}},
    {{"hint": "ПОДСКАЗКА3", "count": 2, "targets": ["СЛОВО1", "СЛОВО2"], "safety": "medium"}}
  ]
}}

Значения safety: "high" (риск минимален), "medium" (небольшой риск), "low" (рискованно).
Пиши все слова ЗАГЛАВНЫМИ буквами.
Убедись что JSON полностью завершён закрывающей скобкой }}.
"""

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1200,
        }
    }

    raw_text = ''
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    logger.error(f"❌ Gemini API error {resp.status}: {text}")
                    try:
                        err_data = json.loads(text)
                        err_msg = err_data.get('error', {}).get('message', '')
                        if 'quota' in err_msg.lower() or resp.status == 429:
                            return {'error': 'Превышен лимит запросов к ИИ. Попробуйте через минуту.'}
                    except Exception:
                        pass
                    return {'error': f'Ошибка ИИ (код {resp.status})'}

                data = await resp.json()
                raw_text = data['candidates'][0]['content']['parts'][0]['text']

                clean = raw_text.strip()
                if clean.startswith('```'):
                    clean = clean.split('\n', 1)[-1]
                if clean.endswith('```'):
                    clean = clean.rsplit('```', 1)[0]
                clean = clean.strip()

                result = json.loads(clean)
                logger.info(f"✅ Gemini hint: {result.get('hint')} x{result.get('count')}")
                return result

    except json.JSONDecodeError as e:
        logger.error(f"❌ Gemini JSON parse error: {e}\nRaw: {raw_text}")
        return {'error': 'ИИ вернул некорректный ответ, попробуйте ещё раз'}
    except asyncio.TimeoutError:
        return {'error': 'ИИ не ответил за 20 секунд, попробуйте ещё раз'}
    except Exception as e:
        logger.exception(f"❌ generate_ai_hint exception: {e}")
        return {'error': 'Ошибка при обращении к ИИ'}


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
    logger.info(f"✅ WS подключён: {room_id} role={role_type} team={team} total={len(room.ws_connections)}")

    try:
        game_state = room.get_state(role_type, team)
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
                        result = room.reveal_card(index, ws.team)
                        if 'error' in result:
                            await ws.send_json({'type': 'error', 'message': result['error']})
                        else:
                            await broadcast_to_room(room_id, {
                                'type': 'card_revealed',
                                'index': result['index'],
                                'color': result['color'],
                                'red_score': result['red_score'],
                                'blue_score': result['blue_score'],
                            })
                            if result.get('turn_switched'):
                                await broadcast_to_room(room_id, {
                                    'type': 'turn_switch',
                                    'current_team': result['current_team'],
                                })
                            if result['game_over']:
                                await broadcast_to_room(room_id, {
                                    'type': 'game_over',
                                    'winner': result['winner'],
                                })

                    elif action == 'reset_game':
                        room.reset_game()
                        for conn in room.ws_connections:
                            if conn.closed:
                                continue
                            state = room.get_state(conn.role_type, conn.team)
                            await conn.send_json({'type': 'game_reset', 'game_state': state})

                    elif action == 'get_ai_hint':
                        if ws.role_type != 'captain':
                            await ws.send_json({'type': 'error', 'message': 'ИИ-подсказки доступны только капитану'})
                            continue
                        if room.game_state['game_status'] != 'active':
                            await ws.send_json({'type': 'error', 'message': 'Игра уже завершена'})
                            continue
                        await ws.send_json({'type': 'ai_hint_loading'})
                        hint_data = room.get_ai_hint_data(ws.team)
                        hint = await generate_ai_hint(hint_data)
                        if 'error' in hint:
                            await ws.send_json({'type': 'error', 'message': hint['error']})
                        else:
                            await ws.send_json({'type': 'ai_hint', 'hint': hint})

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
            logger.info(f"🔌 WS отключён: {room_id} осталось={len(room.ws_connections)}")

    return ws


async def broadcast_to_room(room_id: str, message: dict):
    if room_id not in active_rooms:
        return
    room = active_rooms[room_id]
    for conn in room.ws_connections:
        if not conn.closed:
            try:
                await conn.send_json(message)
            except Exception:
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
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    })


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
    await asyncio.Future()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Остановка по Ctrl+C")
    except Exception as e:
        logger.exception("❌ Критическая ошибка")
