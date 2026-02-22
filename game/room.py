"""
Модуль для управления игровой комнатой Codenames
Версия 4.0 - без привязки к пользователям, только роли
"""

import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# Глобальное хранилище активных комнат (импортируется в других модулях)
active_rooms: Dict[str, 'GameRoom'] = {}


class GameRoom:
    """Игровая комната с состоянием игры и списком WebSocket-соединений"""

    def __init__(self, room_id: str):
        self.room_id = room_id
        self.created_at = datetime.now()
        self.game_state = self._create_game_state()
        self.ws_connections = []  # список соединений, у каждого есть атрибут 'role'

    def _create_game_state(self) -> Dict:
        """Создаёт начальное состояние игры"""
        words = self._load_words()
        # 9 красных, 8 синих, 1 чёрная, 7 нейтральных
        colors = (['red'] * 9) + (['blue'] * 8) + ['black'] + (['neutral'] * 7)
        random.shuffle(colors)

        return {
            'words': random.sample(words, 25),
            'colors': colors,
            'revealed': [False] * 25,
            'current_team': 'red',          # красные ходят первыми
            'current_turn': 1,
            'red_score': 9,
            'blue_score': 8,
            'game_status': 'waiting',        # waiting, active, finished
            'winner': None,
        }

    def _load_words(self) -> List[str]:
        """Загружает слова из файла или возвращает резервный список"""
        try:
            with open('words.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return [
                "яблоко", "гора", "мост", "врач", "луна", "книга", "огонь", "река", "часы",
                "снег", "глаз", "дом", "змея", "кольцо", "корабль", "лев", "лес", "машина",
                "медведь", "нос", "океан", "перо", "пила", "поле", "пуля", "работа", "роза",
                "рука", "сапог", "сок", "стол", "театр", "тень", "фонтан", "хлеб", "школа",
                "шляпа", "ящик", "игла", "йогурт", "зонт", "ксерокс", "эхо", "юла", "якорь",
                "аэропорт", "балерина", "вентилятор", "градусник", "дерево", "ёжик", "железо",
                "замок", "игрушка", "капуста", "лампа", "метро", "ноутбук", "облако", "пальто",
                "ракета", "самолет", "телефон", "улица", "фонарь", "хоккей", "цветок", "человек",
                "шапка", "щука", "экран", "юбка", "язык", "аптека", "бензин", "велосипед", "газета"
            ]

    # ==================== ПОЛУЧЕНИЕ СОСТОЯНИЯ ДЛЯ КЛИЕНТА ====================

    def get_state_for_captain(self, team: str) -> Dict:
        """Для капитана — все цвета карточек"""
        return {
            'room_id': self.room_id,
            'words': self.game_state['words'],
            'colors': self.game_state['colors'],          # капитаны видят всё
            'revealed': self.game_state['revealed'],
            'current_team': self.game_state['current_team'],
            'current_turn': self.game_state['current_turn'],
            'red_score': self.game_state['red_score'],
            'blue_score': self.game_state['blue_score'],
            'game_status': self.game_state['game_status'],
            'winner': self.game_state['winner'],
            'role': 'captain',
            'team': team,
        }

    def get_state_for_agent(self, team: str) -> Dict:
        """Для агента — без цветов неоткрытых карт"""
        return {
            'room_id': self.room_id,
            'words': self.game_state['words'],
            # поле 'colors' отсутствует
            'revealed': self.game_state['revealed'],
            'current_team': self.game_state['current_team'],
            'current_turn': self.game_state['current_turn'],
            'red_score': self.game_state['red_score'],
            'blue_score': self.game_state['blue_score'],
            'game_status': self.game_state['game_status'],
            'winner': self.game_state['winner'],
            'role': 'agent',
            'team': team,
        }

    # ==================== ИГРОВАЯ ЛОГИКА ====================

    def reveal_card(self, index: int, agent_team: str) -> Dict:
        """
        Открывает карточку от имени агента указанной команды.
        Возвращает словарь с результатами для рассылки.
        """
        if not (0 <= index < 25):
            return {'error': 'Неверный индекс карты'}
        if self.game_state['revealed'][index]:
            return {'error': 'Карта уже открыта'}
        if self.game_state['game_status'] != 'active':
            return {'error': 'Игра ещё не началась или уже закончена'}
        if agent_team != self.game_state['current_team']:
            return {'error': 'Сейчас не ваш ход'}

        color = self.game_state['colors'][index]
        self.game_state['revealed'][index] = True

        # обновляем счёт
        if color == 'red':
            self.game_state['red_score'] = max(0, self.game_state['red_score'] - 1)
        elif color == 'blue':
            self.game_state['blue_score'] = max(0, self.game_state['blue_score'] - 1)

        # проверяем победу
        winner_check = self._check_winner(color)
        game_over = winner_check['game_over']
        winner = winner_check['winner']

        if game_over:
            self.game_state['game_status'] = 'finished'
            self.game_state['winner'] = winner
        else:
            # после каждого открытия (кроме конца игры) ход переходит к другой команде
            # в классических правилах можно открыть несколько карт своей команды,
            # но для упрощения сделаем так
            self.switch_team()

        return {
            'index': index,
            'color': color,
            'red_score': self.game_state['red_score'],
            'blue_score': self.game_state['blue_score'],
            'game_over': game_over,
            'winner': winner,
        }

    def _check_winner(self, last_color: str) -> Dict:
        """Проверяет, закончилась ли игра"""
        if last_color == 'black':
            # команда, открывшая чёрную, проигрывает
            winner = 'blue' if self.game_state['current_team'] == 'red' else 'red'
            return {'game_over': True, 'winner': winner}
        if self.game_state['red_score'] == 0:
            return {'game_over': True, 'winner': 'red'}
        if self.game_state['blue_score'] == 0:
            return {'game_over': True, 'winner': 'blue'}
        return {'game_over': False, 'winner': None}

    def switch_team(self) -> None:
        """Переключает текущую команду"""
        self.game_state['current_team'] = 'blue' if self.game_state['current_team'] == 'red' else 'red'
        self.game_state['current_turn'] += 1

    def reset_game(self) -> None:
        """Сбрасывает игру, оставляя комнату активной"""
        self.game_state = self._create_game_state()

    def is_active(self) -> bool:
        """Проверяет, не прошло ли 24 часа с создания комнаты"""
        return datetime.now() - self.created_at < timedelta(hours=24)

    def cleanup(self) -> None:
        """Закрывает все WebSocket-соединения и очищает список"""
        import asyncio
        for ws in self.ws_connections:
            if not ws.closed:
                asyncio.create_task(ws.close())
        self.ws_connections.clear()