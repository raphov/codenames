# utils/config.py
import os

BOT_TOKEN = os.environ.get('BOT_TOKEN')
RENDER_URL = os.environ.get('RENDER_URL', 'https://codenames-u88n.onrender.com')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://raphov.github.io')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

if not BOT_TOKEN:
    print("\n" + "="*70)
    print("❌ КРИТИЧЕСКАЯ ОШИБКА: BOT_TOKEN не задан!")
    print("="*70 + "\n")

if not GEMINI_API_KEY:
    print("⚠️  GEMINI_API_KEY не задан — ИИ-подсказки будут недоступны")
