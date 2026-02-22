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
        colors = (['red'] * 9) + (['blue'] * 8) + ['black'] + (['neutral'] * 7)
        random.shuffle(colors)
        return {
            'words': random.sample(words, 25),
            'colors': colors,
            'revealed': [False] * 25,
            'current_team': 'red',
            'current_turn': 1,
            'red_score': 9,
            'blue_score': 8,
            'game_status': 'waiting',
            'winner': None,
        }

    def _load_words(self) -> List[str]:
        try:
            with open('words.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return ["яблоко", "гора", "мост", "врач", "луна", "книга", "огонь", "река", "часы"]

    def get_state_for_captain(self, team: str) -> Dict:
        return {
            'room_id': self.room_id,
            'words': self.game_state['words'],
            'colors': self.game_state['colors'],
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
        return {
            'room_id': self.room_id,
            'words': self.game_state['words'],
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

    def reveal_card(self, index: int, agent_team: str) -> Dict:
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

        if color == 'red':
            self.game_state['red_score'] = max(0, self.game_state['red_score'] - 1)
        elif color == 'blue':
            self.game_state['blue_score'] = max(0, self.game_state['blue_score'] - 1)

        winner_check = self._check_winner(color)
        game_over = winner_check['game_over']
        winner = winner_check['winner']

        if game_over:
            self.game_state['game_status'] = 'finished'
            self.game_state['winner'] = winner
        else:
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
        if last_color == 'black':
            winner = 'blue' if self.game_state['current_team'] == 'red' else 'red'
            return {'game_over': True, 'winner': winner}
        if self.game_state['red_score'] == 0:
            return {'game_over': True, 'winner': 'red'}
        if self.game_state['blue_score'] == 0:
            return {'game_over': True, 'winner': 'blue'}
        return {'game_over': False, 'winner': None}

    def switch_team(self) -> None:
        self.game_state['current_team'] = 'blue' if self.game_state['current_team'] == 'red' else 'red'
        self.game_state['current_turn'] += 1

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