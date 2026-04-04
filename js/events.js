// ==================== МЕНЕДЖЕР СОБЫТИЙ ====================

var EventManager = {
    hotkeys: {
        'f':      function() { UI.toggleFullscreen(); },
        'F':      function() { UI.toggleFullscreen(); },
        'Escape': function() { this._handleEscape(); },
        'm':      function() { UI.toggleMenu(); },
        'M':      function() { UI.toggleMenu(); },
        'r':      function() { UI.showRules(); },
        'R':      function() { UI.showRules(); },
        'c':      function() { this._copyLink(); },
        'C':      function() { this._copyLink(); }
    },

    init: function() {
        this._setupGlobalEvents();
        this._setupButtonEvents();
        this._setupModalEvents();
        this._setupHotkeys();
    },

    _setupGlobalEvents: function() {
        var self = this;

        window.addEventListener('beforeunload', function(e) {
            if (gameManager.gameState && gameManager.gameState.revealed) {
                for (var i = 0; i < gameManager.gameState.revealed.length; i++) {
                    if (gameManager.gameState.revealed[i]) {
                        e.preventDefault();
                        e.returnValue = '';
                        break;
                    }
                }
            }
        });

        window.addEventListener('focus', function() {
            if (!wsManager.isConnected) {
                var params = getUrlParams();
                if (params.roomId && params.role) {
                    wsManager.connect(params.roomId, params.role);
                }
            }
        });

        document.addEventListener('fullscreenchange',       function() { self._onFullscreenChange(); });
        document.addEventListener('webkitfullscreenchange', function() { self._onFullscreenChange(); });
        document.addEventListener('mozfullscreenchange',    function() { self._onFullscreenChange(); });
    },

    _setupButtonEvents: function() {
        var self = this;

        // Бургер (теперь в шапке)
        var burgerBtn = document.getElementById('burgerBtn');
        if (burgerBtn) burgerBtn.addEventListener('click', function() { UI.toggleMenu(); });

        var closeMenu = document.getElementById('closeMenu');
        if (closeMenu) closeMenu.addEventListener('click', function() { UI.closeMenu(); });

        var menuOverlay = document.getElementById('menuOverlay');
        if (menuOverlay) menuOverlay.addEventListener('click', function() { UI.closeMenu(); });

        this._setupMenuButtons();
    },

    _setupMenuButtons: function() {
        // Fullscreen теперь кнопка в меню
        var btnFullscreen = document.getElementById('btnFullscreen');
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', function() {
                UI.toggleFullscreen();
                UI.closeMenu();
            });
        }

        // Правила
        var showRules = document.getElementById('showRules');
        if (showRules) showRules.addEventListener('click', function() { UI.showRules(); });

        // Тема
        var themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.addEventListener('click', function() { UI.toggleTheme(); });
    },

    _setupModalEvents: function() {
        // Закрытие любой модалки кликом на фон
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
            }
        });
    },

    _setupHotkeys: function() {
        var self = this;
        document.addEventListener('keydown', function(e) {
            // Не перехватываем если фокус в поле ввода
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            var handler = self.hotkeys[e.key];
            if (handler) {
                e.preventDefault();
                handler.call(self);
            }
        });
    },

    _handleEscape: function() {
        UI.closeMenu();
        document.querySelectorAll('.modal.show').forEach(function(m) {
            m.classList.remove('show');
        });
        if (document.fullscreenElement) UI._exitFullscreen();
    },

    _copyLink: function() {
        if (copyToClipboard(window.location.href)) {
            showNotification('✅ Ссылка скопирована!', 'success');
        }
    },

    _onFullscreenChange: function() {
        var isFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement
        );
        UI._updateFullscreenBtn(isFullscreen);
    }
};

var eventManager = EventManager;
