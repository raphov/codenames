import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional

active_rooms: Dict[str, 'GameRoom'] = {}

class GameRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.created_at = datetime.now()
        self.game_state = self._create_game_state()
        self.ws_connections = []

    def _create_game_state(self) -> Dict:
        words = self._load_words()
        # Красные начинают — у них 9 слов, поэтому их ход первый
        colors = (['red'] * 9) + (['blue'] * 8) + ['black'] + (['neutral'] * 7)
        random.shuffle(colors)
        return {
            'words': random.sample(words, 25),
            'colors': colors,
            'revealed': [False] * 25,
            'red_score': 9,
            'blue_score': 8,
            'current_team': 'red',   # ФИКС: добавлено поле
            'game_status': 'active',
            'winner': None,
        }

    def _load_words(self) -> List[str]:
        try:
            with open('words.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return ["яблоко", "гора", "мост", "врач", "луна", "книга", "огонь", "река", "часы"]

    def get_state(self, role: str, team: str) -> Dict:
        """Возвращает состояние игры для игрока с указанной ролью и командой"""
        return {
            'room_id': self.room_id,
            'words': self.game_state['words'],
            'colors': self.game_state['colors'],
            'revealed': self.game_state['revealed'],
            'red_score': self.game_state['red_score'],
            'blue_score': self.game_state['blue_score'],
            'current_team': self.game_state['current_team'],   # ФИКС: передаём фронтенду
            'game_status': self.game_state['game_status'],
            'winner': self.game_state['winner'],
            'role': role,
            'team': team,
        }

    def get_ai_hint_data(self, team: str) -> Dict:
        """Собирает данные для ИИ-подсказки: разбивает слова по категориям"""
        my_words = []
        enemy_words = []
        neutral_words = []
        black_words = []

        for i, (word, color, revealed) in enumerate(
            zip(self.game_state['words'],
                self.game_state['colors'],
                self.game_state['revealed'])
        ):
            if revealed:
                continue
            if color == team:
                my_words.append(word)
            elif color == 'black':
                black_words.append(word)
            elif color == 'neutral':
                neutral_words.append(word)
            else:
                enemy_words.append(word)

        return {
            'my_words': my_words,
            'enemy_words': enemy_words,
            'neutral_words': neutral_words,
            'black_words': black_words,
            'team': team,
        }

    def reveal_card(self, index: int, team: str) -> Dict:
        """team — команда, открывшая карту ('red' или 'blue')"""
        if not (0 <= index < 25):
            return {'error': 'Неверный индекс карты'}
        if self.game_state['revealed'][index]:
            return {'error': 'Карта уже открыта'}

        color = self.game_state['colors'][index]
        self.game_state['revealed'][index] = True

        if color == 'red':
            self.game_state['red_score'] = max(0, self.game_state['red_score'] - 1)
        elif color == 'blue':
            self.game_state['blue_score'] = max(0, self.game_state['blue_score'] - 1)

        # Определяем победителя
        if color == 'black':
            winner = 'blue' if team == 'red' else 'red'
            game_over = True
        elif self.game_state['red_score'] == 0:
            winner = 'red'
            game_over = True
        elif self.game_state['blue_score'] == 0:
            winner = 'blue'
            game_over = True
        else:
            winner = None
            game_over = False

        # Переключаем ход если открыта не своя карта (и игра не окончена)
        if not game_over:
            if color != team:
                self.game_state['current_team'] = 'blue' if team == 'red' else 'red'

        if game_over:
            self.game_state['game_status'] = 'finished'
            self.game_state['winner'] = winner

        return {
            'index': index,
            'color': color,
            'red_score': self.game_state['red_score'],
            'blue_score': self.game_state['blue_score'],
            'current_team': self.game_state['current_team'],
            'game_over': game_over,
            'winner': winner,
            'turn_switched': not game_over and color != team,
        }

    def reset_game(self) -> None:
        self.game_state = self._create_game_state()

    def is_active(self) -> bool:
        return datetime.now() - self.created_at < timedelta(hours=24)

    def cleanup(self) -> None:
        import asyncio
        for ws in self.ws_connections:
            if not ws.closed:
                asyncio.create_task(ws.close())
        self.ws_connections.clear()
