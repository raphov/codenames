// ==================== МЕНЕДЖЕР СОБЫТИЙ ====================

var EventManager = {
        hotkeys: {
            'f': function() { UI.toggleFullscreen(); },
            'F': function() { UI.toggleFullscreen(); },
            'Escape': function() { this._handleEscape(); },
            // '1', '2', '3' - УДАЛИТЬ
            'm': function() { UI.toggleMenu(); },
            'M': function() { UI.toggleMenu(); },
            'r': function() { UI.showRules(); },
            'R': function() { UI.showRules(); },
            'c': function() { this._copyLink(); },
            'C': function() { this._copyLink(); }
        },

    /**
     * Инициализация всех обработчиков
     */
    init: function() {
        this._setupGlobalEvents();
        this._setupButtonEvents();
        this._setupModalEvents();
        this._setupHotkeys();
    },

    /**
     * Глобальные события
     */
    _setupGlobalEvents: function() {
        var self = this;
        
        // Подтверждение ухода со страницы
        window.addEventListener('beforeunload', function(e) {
            if (gameManager.gameState && gameManager.gameState.revealed) {
                var hasRevealed = false;
                for (var i = 0; i < gameManager.gameState.revealed.length; i++) {
                    if (gameManager.gameState.revealed[i]) {
                        hasRevealed = true;
                        break;
                    }
                }
                if (hasRevealed) {
                    e.preventDefault();
                    e.returnValue = 'У вас есть незавершённая игра. Вы уверены?';
                }
            }
        });
        
        // Восстановление соединения при возвращении
        window.addEventListener('focus', function() {
            if (!wsManager.isConnected) {
                var params = getUrlParams();
                if (params.roomId && params.role) {
                    wsManager.connect(params.roomId, params.role);
                }
            }
        });
        
        // Отслеживание полноэкранного режима
        document.addEventListener('fullscreenchange', function() { self._updateFullscreenButton(); });
        document.addEventListener('webkitfullscreenchange', function() { self._updateFullscreenButton(); });
        document.addEventListener('mozfullscreenchange', function() { self._updateFullscreenButton(); });
    },

    /**
     * Кнопки интерфейса
     */
    _setupButtonEvents: function() {
        var self = this;
        
        // Копирование ссылки
        var btnCopyLink = document.getElementById('btnCopyLink');
        if (btnCopyLink) {
            btnCopyLink.addEventListener('click', function() {
                self._copyLink();
            });
        }
        
        // Новая игра
        var btnNewGame = document.getElementById('btnNewGame');
        if (btnNewGame) {
            btnNewGame.addEventListener('click', function() {
                if (confirm('Начать новую игру в этой комнате?')) {
                    wsManager.send({ action: 'reset_game' });
                }
            });
        }
        
        // Бургер-меню
        var burgerBtn = document.getElementById('burgerBtn');
        var closeMenu = document.getElementById('closeMenu');
        var menuOverlay = document.getElementById('menuOverlay');
        
        if (burgerBtn) {
            burgerBtn.addEventListener('click', function() {
                UI.toggleMenu();
            });
        }
        
        if (closeMenu) {
            closeMenu.addEventListener('click', function() {
                UI.closeMenu();
            });
        }
        
        if (menuOverlay) {
            menuOverlay.addEventListener('click', function() {
                UI.closeMenu();
            });
        }
        
        // Полноэкранный режим
        var btnFullscreen = document.getElementById('btnFullscreen');
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', function() {
                UI.toggleFullscreen();
            });
        }
        
        // Кнопки меню
        this._setupMenuButtons();
    },

    /**
     * Кнопки в меню
     */
    _setupMenuButtons: function() {
        // Правила
        var showRules = document.getElementById('showRules');
        if (showRules) {
            showRules.addEventListener('click', function() {
                UI.showRules();
            });
        }
        
        // Горячие клавиши
        var showHotkeys = document.getElementById('showHotkeys');
        if (showHotkeys) {
            showHotkeys.addEventListener('click', function() {
                UI.showHotkeys();
            });
        }
        
        // О проекте
        var showAbout = document.getElementById('showAbout');
        if (showAbout) {
            showAbout.addEventListener('click', function() {
                UI.showAbout();
            });
        }
        
        // Звук
        var soundToggle = document.getElementById('soundToggle');
        if (soundToggle) {
            soundToggle.addEventListener('click', function() {
                this._toggleSound();
            }.bind(this));
        }
        
        // Смена роли
        var changeRole = document.getElementById('changeRole');
        if (changeRole) {
            changeRole.addEventListener('click', function() {
                showNotification('Роль можно сменить только при создании комнаты', 'info');
            });
        }

        // Обработчик кнопки темы
        var themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', function() {
                UI.toggleTheme();
            });
        }
    },

    /**
     * Модальные окна
     */
    _setupModalEvents: function() {
        // Модальное окно правил
        var rulesModal = document.getElementById('rulesModal');
        if (rulesModal) {
            var closeBtn = rulesModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    rulesModal.classList.remove('show');
                });
            }
            
            rulesModal.addEventListener('click', function(e) {
                if (e.target === rulesModal) {
                    rulesModal.classList.remove('show');
                }
            });
        }
        
        // Модальное окно горячих клавиш
        var hotkeysModal = document.getElementById('hotkeysModal');
        if (hotkeysModal) {
            var closeBtn = hotkeysModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    hotkeysModal.classList.remove('show');
                });
            }
            
            hotkeysModal.addEventListener('click', function(e) {
                if (e.target === hotkeysModal) {
                    hotkeysModal.classList.remove('show');
                }
            });
        }
        
        // Модальное окно о проекте
        var aboutModal = document.getElementById('aboutModal');
        if (aboutModal) {
            var closeBtn = aboutModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    aboutModal.classList.remove('show');
                });
            }
            
            aboutModal.addEventListener('click', function(e) {
                if (e.target === aboutModal) {
                    aboutModal.classList.remove('show');
                }
            });
        }
    },

    /**
     * Горячие клавиши
     */
    _setupHotkeys: function() {
        var self = this;
        
        document.addEventListener('keydown', function(e) {
            var handler = self.hotkeys[e.key];
            if (handler) {
                e.preventDefault();
                handler.call(self);
            }
        });
    },

    /**
     * Обработка Escape
     */
    _handleEscape: function() {
        // Закрываем меню
        UI.closeMenu();
        
        // Закрываем модальные окна
        var modals = document.querySelectorAll('.modal.show');
        for (var i = 0; i < modals.length; i++) {
            modals[i].classList.remove('show');
        }
        
        // Выходим из полноэкранного режима
        if (document.fullscreenElement) {
            UI._exitFullscreen();
        }
    },

    /**
     * Копирование ссылки
     */
    _copyLink: function() {
        var success = copyToClipboard(window.location.href);
        if (success) {
            showNotification('✅ Ссылка скопирована!', 'success');
        } else {
            showNotification('❌ Ошибка копирования', 'error');
        }
    },

    /**
     * Переключение звука
     */
    _toggleSound: function() {
        var btn = document.getElementById('soundToggle');
        var isEnabled = btn && btn.innerHTML.indexOf('Вкл') !== -1;
        
        if (btn) {
            btn.innerHTML = isEnabled ? 
                '<i class="fas fa-volume-mute"></i> Звуки: Выкл' : 
                '<i class="fas fa-volume-up"></i> Звуки: Вкл';
        }
        
        showNotification(isEnabled ? '🔇 Звуки выключены' : '🔊 Звуки включены', 'info');
    },

    /**
     * Обновление кнопки полноэкранного режима
     */
    _updateFullscreenButton: function() {
        var btn = document.getElementById('btnFullscreen');
        if (!btn) return;
        
        var isFullscreen = !!(document.fullscreenElement || 
                              document.webkitFullscreenElement || 
                              document.mozFullScreenElement);
        
        if (isFullscreen) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }
};

// Глобальный экземпляр
var eventManager = EventManager;