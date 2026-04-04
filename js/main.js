// ==================== ГЛАВНЫЙ ФАЙЛ ====================

var roomId   = null;
var role     = null;
var roleType = null;
var team     = null;

function initApp() {
    console.log('🎮 Codenames Online v' + CONFIG.VERSION);

    var params = getUrlParams();
    roomId = params.roomId;
    role   = params.role;

    if (!roomId || !role) {
        UI.showError(
            '❌ Ошибка: нет параметров комнаты',
            'Пожалуйста, откройте игру через ссылку от бота.<br>' +
            '<a href="https://t.me/codenames_raphov_bot" target="_blank" style="color:#60a5fa;">Перейти к боту</a>'
        );
        return;
    }

    var parsed = parseRole(role);
    roleType = parsed.type;
    team     = parsed.team;

    document.body.classList.add(roleType + '-view');
    console.log('📦 Комната:', roomId, '| Роль:', roleType, '| Команда:', team);

    localStorage.setItem('last_room', roomId);
    localStorage.setItem('last_role', role);

    if (UI.elements.roomDisplay) {
        UI.elements.roomDisplay.textContent = roomId;
    }

    mobileManager.init();
    eventManager.init();

    setupWebSocketHandlers();
    wsManager.connect(roomId, role);
}

function setupWebSocketHandlers() {
    wsManager.on('connected', function() {
        UI.updateConnectionStatus('connected');   // ФИКС: только тип, не текст
        showNotification('Соединение установлено', 'success');
    });

    wsManager.on('disconnected', function() {
        UI.updateConnectionStatus('error');
    });

    wsManager.on('reconnecting', function(data) {
        UI.updateConnectionStatus('connecting');
    });

    wsManager.on('reconnect_failed', function() {
        UI.updateConnectionStatus('error');
        showNotification('Не удалось подключиться к серверу', 'error');
    });

    wsManager.on('init', function(data) {
        gameManager.renderBoard(data.game_state);
        gameManager.updateGameInfo(data.game_state);
        UI.elements.gameArea.style.display = 'block';

        if (UI.elements.roomDisplay) {
            var roleText = roleType === 'captain'
                ? '👑 Капитан ' + (team === 'red' ? 'красных' : 'синих')
                : '🔎 Агент '   + (team === 'red' ? 'красных' : 'синих');
            UI.elements.roomDisplay.textContent = roomId + ' — ' + roleText;
        }

        // Показываем ИИ-панель только капитанам
        if (roleType === 'captain') {
            UI.showAIPanel();
        }
    });

    wsManager.on('state_update', function(data) {
        gameManager.renderBoard(data.game_state);
        gameManager.updateGameInfo(data.game_state);
    });

    wsManager.on('card_revealed', function(data) {
        gameManager.updateCard(data.index, data.color, data.red_score, data.blue_score);
    });

    wsManager.on('turn_switch', function(data) {
        if (gameManager.gameState) {
            gameManager.gameState.current_team = data.current_team;
            gameManager.updateGameInfo(gameManager.gameState);
            showNotification('Ход переходит к ' + TEAM_NAMES[data.current_team], 'info');
        }
    });

    wsManager.on('game_over', function(data) {
        gameManager.showGameOver(data.winner, 'Игра завершена!');
    });

    wsManager.on('game_reset', function(data) {
        gameManager.renderBoard(data.game_state);
        gameManager.updateGameInfo(data.game_state);
        gameManager.currentMove = 1;
        showNotification('🔄 Новая игра началась!', 'success');
    });

    // ── ИИ-подсказки ──────────────────────────────────────────────────

    wsManager.on('ai_hint_loading', function() {
        UI.setAIHintLoading();
    });

    wsManager.on('ai_hint', function(data) {
        UI.renderAIHint(data.hint);
    });

    // ── Ошибки ────────────────────────────────────────────────────────

    wsManager.on('error', function(data) {
        showNotification(data.message || 'Ошибка сервера', 'error');
    });
}

function showNotification(message, type, duration) {
    UI.showNotification(message, type, duration);
}

document.addEventListener('DOMContentLoaded', initApp);
