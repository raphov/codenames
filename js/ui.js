// ==================== UI МЕНЕДЖЕР ====================

var UIManager = {
    elements: {},
    notificationTimeout: null,
    currentTheme: localStorage.getItem('codenames_theme') || CONFIG.THEMES.DARK,

    init: function() {
        this.elements = {
            roomDisplay:      document.getElementById('roomDisplay'),
            connectionStatus: document.getElementById('connectionStatus'),
            gameArea:         document.getElementById('gameArea'),
            gameBoard:        document.getElementById('gameBoard'),
            notification:     document.getElementById('notification'),
            redCount:         document.getElementById('redCount'),
            blueCount:        document.getElementById('blueCount'),
            currentTurn:      document.getElementById('currentTurn'),
            openedCards:      document.getElementById('openedCards'),
            currentMove:      document.getElementById('currentMove'),
            menuContent:      document.getElementById('menuContent'),
            menuOverlay:      document.getElementById('menuOverlay'),
            burgerBtn:        document.getElementById('burgerBtn'),
            closeMenu:        document.getElementById('closeMenu'),
            btnFullscreen:    document.getElementById('btnFullscreen'),
            themeToggle:      document.getElementById('themeToggle'),
            // AI hint panel
            aiHintPanel:      document.getElementById('aiHintPanel'),
            aiHintBtn:        document.getElementById('aiHintBtn'),
            aiHintContent:    document.getElementById('aiHintContent'),
        };
        this.applyTheme(this.currentTheme);
        this.updateThemeButton();
    },

    applyTheme: function(theme) {
        document.body.classList.remove(CONFIG.THEMES.DARK, CONFIG.THEMES.LIGHT);
        document.body.classList.add(theme);
        localStorage.setItem('codenames_theme', theme);
        this.currentTheme = theme;
        this.updateThemeButton();
    },

    toggleTheme: function() {
        var newTheme = this.currentTheme === CONFIG.THEMES.DARK
            ? CONFIG.THEMES.LIGHT
            : CONFIG.THEMES.DARK;
        this.applyTheme(newTheme);
    },

    updateThemeButton: function() {
        var btn = this.elements.themeToggle;
        if (!btn) return;
        var isDark = this.currentTheme === CONFIG.THEMES.DARK;
        btn.innerHTML = isDark
            ? '<i class="fas fa-sun"></i> Светлая'
            : '<i class="fas fa-moon"></i> Тёмная';
    },

    // ФИКС: меняем только className точки, не textContent
    updateConnectionStatus: function(type) {
        var dot = this.elements.connectionStatus;
        if (!dot) return;
        dot.className = 'status-dot' + (type ? ' ' + type : '');
    },

    showNotification: function(message, type, duration) {
        var self = this;
        var notification = this.elements.notification;
        if (!notification) return;

        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        notification.textContent = message;
        notification.className = 'notification ' + (type || 'info') + ' show';

        this.notificationTimeout = setTimeout(function() {
            notification.classList.remove('show');
        }, duration || 3000);

        notification.onclick = function() {
            notification.classList.remove('show');
            clearTimeout(self.notificationTimeout);
        };
    },

    toggleMenu: function() {
        var menu = this.elements.menuContent;
        var overlay = this.elements.menuOverlay;
        if (!menu || !overlay) return;
        if (menu.style.display === 'block') {
            this.closeMenu();
        } else {
            menu.style.display = 'block';
            overlay.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    },

    closeMenu: function() {
        var menu = this.elements.menuContent;
        var overlay = this.elements.menuOverlay;
        if (menu)    menu.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = '';
    },

    toggleFullscreen: function() {
        if (!document.fullscreenElement) {
            this._enterFullscreen();
        } else {
            this._exitFullscreen();
        }
    },

    _enterFullscreen: function() {
        var elem = document.documentElement;
        if (elem.requestFullscreen)       elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.mozRequestFullScreen)    elem.mozRequestFullScreen();
        else if (elem.msRequestFullscreen)     elem.msRequestFullscreen();
        else { this.showNotification('Полный экран не поддерживается', 'error'); return; }

        if (this.elements.btnFullscreen) {
            this.elements.btnFullscreen.innerHTML = '<i class="fas fa-compress"></i>';
        }
    },

    _exitFullscreen: function() {
        if (document.exitFullscreen)            document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen)  document.mozCancelFullScreen();
        else if (document.msExitFullscreen)     document.msExitFullscreen();

        if (this.elements.btnFullscreen) {
            this.elements.btnFullscreen.innerHTML = '<i class="fas fa-expand"></i>';
        }
    },

    showError: function(title, message) {
        var gameArea = this.elements.gameArea;
        if (!gameArea) return;
        gameArea.style.display = 'block';
        gameArea.innerHTML =
            '<div class="error-container">' +
            '<h2>' + title + '</h2>' +
            '<div style="margin:20px 0;">' + message + '</div>' +
            '<button class="btn-primary" onclick="location.reload()">' +
            '<i class="fas fa-redo"></i> Попробовать снова</button>' +
            '</div>';
    },

    showRules:   function() { var m = document.getElementById('rulesModal');   if (m) { m.classList.add('show'); this.closeMenu(); } },
    showHotkeys: function() { var m = document.getElementById('hotkeysModal'); if (m) { m.classList.add('show'); this.closeMenu(); } },
    showAbout:   function() { var m = document.getElementById('aboutModal');   if (m) { m.classList.add('show'); this.closeMenu(); } },

    // ── ИИ-панель ────────────────────────────────────────────────────────

    showAIPanel: function() {
        var panel = this.elements.aiHintPanel;
        if (panel) panel.style.display = 'block';
    },

    setAIHintLoading: function() {
        var content = this.elements.aiHintContent;
        var btn     = this.elements.aiHintBtn;
        if (content) content.innerHTML =
            '<div class="ai-loading">' +
            '<i class="fas fa-spinner fa-spin"></i> Думаю...' +
            '</div>';
        if (btn) { btn.disabled = true; btn.textContent = 'Думаю...'; }
    },

    renderAIHint: function(hint) {
        var content = this.elements.aiHintContent;
        var btn     = this.elements.aiHintBtn;
        if (!content) return;

        if (!hint || hint.error) {
            content.innerHTML =
                '<div class="ai-error"><i class="fas fa-exclamation-circle"></i> ' +
                (hint && hint.error ? hint.error : 'Не удалось получить подсказку') +
                '</div>';
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot"></i> Спросить ИИ'; }
            return;
        }

        var altsHtml = '';
        if (hint.alternatives && hint.alternatives.length) {
            altsHtml = '<div class="ai-alts-label">Альтернативы:</div><div class="ai-alts">';
            for (var i = 0; i < hint.alternatives.length; i++) {
                var a = hint.alternatives[i];
                var safetyClass = 'safety-' + (a.safety || 'medium');
                altsHtml +=
                    '<div class="ai-alt ' + safetyClass + '">' +
                    '<span class="ai-alt-word">' + a.hint + '</span>' +
                    '<span class="ai-alt-count">×' + a.count + '</span>' +
                    '</div>';
            }
            altsHtml += '</div>';
        }

        var targetsHtml = '';
        if (hint.targets && hint.targets.length) {
            for (var j = 0; j < hint.targets.length; j++) {
                targetsHtml += '<span class="ai-target">' + hint.targets[j] + '</span>';
            }
        }

        content.innerHTML =
            '<div class="ai-main-hint">' +
            '<div class="ai-hint-word">' + hint.hint + '</div>' +
            '<div class="ai-hint-count">× ' + hint.count + '</div>' +
            '</div>' +
            '<div class="ai-targets">' + targetsHtml + '</div>' +
            '<div class="ai-reasoning"><i class="fas fa-lightbulb"></i> ' + hint.reasoning + '</div>' +
            (hint.risk ? '<div class="ai-risk"><i class="fas fa-exclamation-triangle"></i> ' + hint.risk + '</div>' : '') +
            altsHtml;

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Обновить'; }
    },

    updatePlayersList: function(count) {
        var countEl = this.elements.playerCount;
        if (countEl) countEl.textContent = count || 1;
    }
};

var UI = UIManager;
UI.init();
