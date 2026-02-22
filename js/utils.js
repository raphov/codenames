// ==================== УТИЛИТЫ ====================

/**
 * Получение параметров URL
 */
function getUrlParams() {
    var params = new URLSearchParams(window.location.search);
    return {
        roomId: params.get('room') ? params.get('room').toUpperCase() : null,
        role: params.get('role') || null   // например, captain_red
    };
}

/**
 * Разбор строки роли на тип и команду
 */
function parseRole(role) {
    if (!role) return { type: null, team: null };
    var parts = role.split('_');
    return {
        type: parts[0],  // 'captain' или 'agent'
        team: parts[1]   // 'red' или 'blue'
    };
}

/**
 * Копирование текста в буфер обмена
 */
function copyToClipboard(text) {
    try {
        navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        var textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
    }
}

/**
 * Debounce для оптимизации
 */
function debounce(func, wait) {
    var timeout;
    return function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            func.apply(context, args);
        }, wait);
    };
}

/**
 * Цвет команды для отображения
 */
function getTeamColor(team) {
    switch (team) {
        case 'red': return '#f87171';
        case 'blue': return '#60a5fa';
        default: return '#d97706';
    }
}

/**
 * Название команды
 */
var TEAM_NAMES = {
    red: 'Красные',
    blue: 'Синие',
    black: 'Чёрная',
    neutral: 'Нейтральная'
};