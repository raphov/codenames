// ==================== UI МЕНЕДЖЕР ====================

var UIManager = {
    elements: {},
    notificationTimeout: null,
    currentTheme: localStorage.getItem('codenames_theme') || CONFIG.THEMES.DARK,
    aiPanelCollapsed: localStorage.getItem('ai_panel_collapsed') === 'true',

    init: function() {
        this.elements = {
            roomDisplay:      document.getElementById('roomDisplay'),
            connectionStatus: document.getElementById('connectionStatus'),
            gameArea:         document.getElementById('gameArea'),
            gameBoard:        document.getElementById('gameBoard'),
            notification:     document.getElementById('notification'),
            redCount:         document.getElementById('redCount'),
            blueCount:        document.getElementById('blueCount'),
            openedCards:      document.getElementById('openedCards'),
            currentMove:      document.getElementById('currentMove'),
            menuContent:      document.getElementById('menuContent'),
            menuOverlay:      document.getElementById('menuOverlay'),
            burgerBtn:        document.getElementById('burgerBtn'),
            closeMenu:        document.getElementById('closeMenu'),
            btnFullscreen:    document.getElementById('btnFullscreen'),
            themeToggle:      document.getElementById('themeToggle'),
            aiHintPanel:      document.getElementById('aiHintPanel'),
            aiHintBtn:        document.getElementById('aiHintBtn'),
            aiHintContent:    document.getElementById('aiHintContent'),
            aiCollapseBtn:    document.getElementById('aiCollapseBtn'),
        };
        this.applyTheme(this.currentTheme);
        this.updateThemeButton();
        this._setupAICollapseBtn();
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
            ? CONFIG.THEMES.LIGHT : CONFIG.THEMES.DARK;
        this.applyTheme(newTheme);
    },

    updateThemeButton: function() {
        var btn = this.elements.themeToggle;
        if (!btn) return;
        var isDark = this.currentTheme === CONFIG.THEMES.DARK;
        btn.innerHTML = isDark
            ? '<i class="fas fa-sun"></i> Светлая тема'
            : '<i class="fas fa-moon"></i> Тёмная тема';
    },

    // ФИКС: только className точки
    updateConnectionStatus: function(type) {
        var dot = this.elements.connectionStatus;
        if (!dot) return;
        dot.className = 'status-dot' + (type ? ' ' + type : '');
    },

    showNotification: function(message, type, duration) {
        var self = this;
        var el = this.elements.notification;
        if (!el) return;
        if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
        el.textContent = message;
        el.className = 'notification ' + (type || 'info') + ' show';
        this.notificationTimeout = setTimeout(function() {
            el.classList.remove('show');
        }, duration || 3000);
        el.onclick = function() {
            el.classList.remove('show');
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
        }
    },

    closeMenu: function() {
        var menu = this.elements.menuContent;
        var overlay = this.elements.menuOverlay;
        if (menu)    menu.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
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
        if (elem.requestFullscreen)            elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.mozRequestFullScreen)    elem.mozRequestFullScreen();
        else { this.showNotification('Полный экран не поддерживается', 'error'); return; }
        this._updateFullscreenBtn(true);
    },

    _exitFullscreen: function() {
        if (document.exitFullscreen)            document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen)  document.mozCancelFullScreen();
        this._updateFullscreenBtn(false);
    },

    _updateFullscreenBtn: function(isFullscreen) {
        var btn = this.elements.btnFullscreen;
        if (!btn) return;
        btn.innerHTML = isFullscreen
            ? '<i class="fas fa-compress"></i> Выйти из полного экрана'
            : '<i class="fas fa-expand"></i> Во весь экран';
    },

    showError: function(title, message) {
        var gameArea = this.elements.gameArea;
        if (!gameArea) return;
        gameArea.style.display = 'block';
        gameArea.innerHTML =
            '<div class="error-container">' +
            '<h2>' + title + '</h2>' +
            '<div style="margin:20px 0;">' + message + '</div>' +
            '<button onclick="location.reload()" style="padding:10px 20px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:1rem;cursor:pointer;">' +
            '<i class="fas fa-redo"></i> Попробовать снова</button>' +
            '</div>';
    },

    showRules: function() {
        var m = document.getElementById('rulesModal');
        if (m) { m.classList.add('show'); this.closeMenu(); }
    },

    // ── ИИ-панель ────────────────────────────────────────────────

    showAIPanel: function() {
        var panel = this.elements.aiHintPanel;
        if (!panel) return;
        panel.style.display = 'block';
        // Восстанавливаем сохранённое состояние
        if (this.aiPanelCollapsed) {
            panel.classList.add('collapsed');
            this._setCollapseIcon(true);
        }
    },

    _setupAICollapseBtn: function() {
        var self = this;
        var btn = this.elements.aiCollapseBtn;
        if (!btn) return;
        btn.addEventListener('click', function() {
            self._toggleAIPanel();
        });
    },

    _toggleAIPanel: function() {
        var panel = this.elements.aiHintPanel;
        if (!panel) return;
        var collapsed = panel.classList.toggle('collapsed');
        this.aiPanelCollapsed = collapsed;
        localStorage.setItem('ai_panel_collapsed', collapsed ? 'true' : 'false');
        this._setCollapseIcon(collapsed);
    },

    _setCollapseIcon: function(collapsed) {
        var btn = this.elements.aiCollapseBtn;
        if (!btn) return;
        btn.title = collapsed ? 'Развернуть' : 'Свернуть';
    },

    setAIHintLoading: function() {
        var content = this.elements.aiHintContent;
        var btn = this.elements.aiHintBtn;
        // Разворачиваем если свёрнуто
        var panel = this.elements.aiHintPanel;
        if (panel && panel.classList.contains('collapsed')) {
            this._toggleAIPanel();
        }
        if (content) content.innerHTML =
            '<div class="ai-loading">' +
            '<i class="fas fa-spinner fa-spin"></i> Думаю...</div>';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    },

    renderAIHint: function(hint) {
        var content = this.elements.aiHintContent;
        var btn = this.elements.aiHintBtn;
        if (!content) return;

        if (!hint || hint.error) {
            content.innerHTML =
                '<div class="ai-error"><i class="fas fa-exclamation-circle"></i> ' +
                (hint && hint.error ? hint.error : 'Не удалось получить подсказку') +
                '</div>';
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot"></i> Спросить'; }
            return;
        }

        var targetsHtml = '';
        if (hint.targets && hint.targets.length) {
            for (var j = 0; j < hint.targets.length; j++) {
                targetsHtml += '<span class="ai-target">' + hint.targets[j] + '</span>';
            }
        }

        var altsHtml = '';
        if (hint.alternatives && hint.alternatives.length) {
            altsHtml = '<div class="ai-alts-label">Альтернативы:</div><div class="ai-alts">';
            for (var i = 0; i < hint.alternatives.length; i++) {
                var a = hint.alternatives[i];
                altsHtml +=
                    '<div class="ai-alt safety-' + (a.safety || 'medium') + '">' +
                    '<span class="ai-alt-word">' + a.hint + '</span>' +
                    '<span class="ai-alt-count">×' + a.count + '</span>' +
                    '</div>';
            }
            altsHtml += '</div>';
        }

        content.innerHTML =
            '<div class="ai-main-hint">' +
            '<span class="ai-hint-word">' + hint.hint + '</span>' +
            '<span class="ai-hint-count">× ' + hint.count + '</span>' +
            '</div>' +
            '<div class="ai-targets">' + targetsHtml + '</div>' +
            (hint.reasoning ? '<div class="ai-reasoning"><i class="fas fa-lightbulb"></i>' + hint.reasoning + '</div>' : '') +
            (hint.risk      ? '<div class="ai-risk"><i class="fas fa-exclamation-triangle"></i>' + hint.risk + '</div>' : '') +
            altsHtml;

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Обновить'; }
    },
};

var UI = UIManager;
UI.init();
