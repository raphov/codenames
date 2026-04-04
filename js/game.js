// ==================== ИГРОВАЯ ЛОГИКА ====================

var GameManager = {
    gameState: null,
    holdTimers: {},
    currentMove: 1,

    renderBoard: function(gameState) {
        if (!gameState || !gameState.words) {
            console.error('❌ Нет данных для отрисовки');
            return;
        }

        this.gameState = gameState;
        var board = document.getElementById('gameBoard');
        if (!board) return;

        board.innerHTML = '';
        this._clearHoldTimers();

        // ФИКС: класс captain-view / agent-view ставим на board,
        // чтобы CSS-селекторы типа .captain-view .card работали корректно
        board.classList.remove('captain-view', 'agent-view');
        board.classList.add(gameState.role === ROLES.CAPTAIN ? 'captain-view' : 'agent-view');

        var words = gameState.words;
        for (var i = 0; i < words.length; i++) {
            var card = this._createCard(words[i], i, gameState);
            board.appendChild(card);
        }

        console.log('🎮 Поле отрисовано, ' + words.length + ' карточек');
    },

    _createCard: function(word, index, gameState) {
        var card = document.createElement('div');
        card.className = 'card';
        card.textContent = word;
        card.dataset.index = index;

        var isCaptain = (gameState.role === ROLES.CAPTAIN);
        var color     = gameState.colors && gameState.colors[index];
        var revealed  = gameState.revealed[index];

        if (revealed) {
            // Открытая карта — цвет видят все
            card.classList.add('opened');
            if (color) card.classList.add(color);
        } else if (isCaptain) {
            // Капитан: не открытые карты имеют цвет команды
            // Класс captain-view уже на board — CSS сам окрасит
            if (color) card.classList.add(color);
        } else {
            // Агент: карты закрыты, вешаем hold-события
            this._setupHoldEvents(card, index);
        }

        return card;
    },

    _setupHoldEvents: function(card, index) {
        var self = this;
        var holdTimer = null;
        var isHolding = false;
        var holdProgress = 0;
        var progressInterval = null;

        var progressBar = document.createElement('div');
        progressBar.className = 'hold-progress';
        card.appendChild(progressBar);

        var startHold = function(e) {
            if (self.gameState && self.gameState.revealed[index]) return;
            if (!wsManager.isConnected) {
                showNotification('Нет соединения с сервером', 'error');
                return;
            }
            e.preventDefault();
            self._clearHoldTimer(index);

            card.classList.add('holding');
            isHolding = true;
            holdProgress = 0;
            progressBar.style.width = '0%';

            progressInterval = setInterval(function() {
                holdProgress += 100 / (CONFIG.HOLD_DURATION / 100);
                progressBar.style.width = Math.min(holdProgress, 100) + '%';
            }, 100);

            holdTimer = setTimeout(function() {
                if (wsManager.isConnected) {
                    wsManager.send({ action: 'click_card', index: index });
                    if (navigator.vibrate) navigator.vibrate(50);
                }
                isHolding = false;
                self._clearHoldTimer(index);
            }, CONFIG.HOLD_DURATION);

            self.holdTimers[index] = holdTimer;
        };

        var endHold = function() {
            self._clearHoldTimer(index);
            if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            card.classList.remove('holding');
            progressBar.style.width = '0%';
            if (isHolding) showNotification('Удерживайте ' + (CONFIG.HOLD_DURATION / 1000) + ' сек для выбора', 'info', 1000);
            isHolding = false;
        };

        var cancelHold = function() {
            self._clearHoldTimer(index);
            if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            card.classList.remove('holding');
            progressBar.style.width = '0%';
            isHolding = false;
        };

        card.addEventListener('mousedown',   startHold);
        card.addEventListener('mouseup',     endHold);
        card.addEventListener('mouseleave',  cancelHold);
        card.addEventListener('touchstart',  startHold,  { passive: false });
        card.addEventListener('touchend',    endHold);
        card.addEventListener('touchcancel', cancelHold);
        card.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    },

    updateCard: function(index, color, redScore, blueScore) {
        var cards = document.querySelectorAll('.card');
        if (!cards[index]) return;

        var card = cards[index];
        card.classList.add('opened', color);

        // Убираем прогресс-бар и события
        var progress = card.querySelector('.hold-progress');
        if (progress) progress.remove();

        // Обновляем локальное состояние
        if (this.gameState && this.gameState.revealed) {
            this.gameState.revealed[index] = true;
        }

        // Счётчики
        var redCount  = document.getElementById('redCount');
        var blueCount = document.getElementById('blueCount');
        if (redCount  && redScore  !== undefined) redCount.textContent  = redScore;
        if (blueCount && blueScore !== undefined) blueCount.textContent = blueScore;

        this.currentMove++;
        this._updateStats();
    },

    updateGameInfo: function(gameState) {
        this.gameState = gameState;

        var redCount   = document.getElementById('redCount');
        var blueCount  = document.getElementById('blueCount');
        var currentTurn = document.getElementById('currentTurn');

        if (redCount)  redCount.textContent  = gameState.red_score  || 0;
        if (blueCount) blueCount.textContent = gameState.blue_score || 0;

        if (currentTurn && gameState.current_team) {
            var teamName  = TEAM_NAMES[gameState.current_team] || 'Красные';
            var teamClass = gameState.current_team;
            currentTurn.style.display = 'block';
            currentTurn.innerHTML =
                '<div class="turn-label">Сейчас ходят:</div>' +
                '<div class="turn-team ' + teamClass + '">' + teamName + '</div>';
        }

        this._updateStats();
    },

    _updateStats: function() {
        var openedCards  = document.getElementById('openedCards');
        var currentMoveEl = document.getElementById('currentMove');

        if (openedCards && this.gameState && this.gameState.revealed) {
            var opened = 0;
            for (var i = 0; i < this.gameState.revealed.length; i++) {
                if (this.gameState.revealed[i]) opened++;
            }
            openedCards.textContent = opened;
        }
        if (currentMoveEl) currentMoveEl.textContent = this.currentMove;
    },

    _clearHoldTimer: function(index) {
        if (this.holdTimers[index]) {
            clearTimeout(this.holdTimers[index]);
            delete this.holdTimers[index];
        }
    },

    _clearHoldTimers: function() {
        for (var key in this.holdTimers) clearTimeout(this.holdTimers[key]);
        this.holdTimers = {};
    },

    showGameOver: function(winner, reason) {
        var winnerName  = TEAM_NAMES[winner] || winner;
        var winnerColor = getTeamColor(winner);

        var modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML =
            '<div class="modal-content" style="max-width:500px;">' +
            '<div class="modal-header">' +
            '<h3>🏆 Игра окончена!</h3>' +
            '<button class="modal-close">&times;</button>' +
            '</div>' +
            '<div class="modal-body" style="text-align:center;">' +
            '<div style="font-size:2rem;color:' + winnerColor + ';margin:20px 0;">' +
            '<i class="fas fa-crown"></i> Победили ' + winnerName + '</div>' +
            '<p style="color:#94a3b8;">' + (reason || 'Поздравляем!') + '</p>' +
            '<div style="display:flex;gap:15px;justify-content:center;margin-top:30px;">' +
            '<button class="btn-primary" onclick="location.reload()">🔄 Новая игра</button>' +
            '<button class="btn-secondary" id="shareResultsBtn">📋 Поделиться</button>' +
            '</div></div></div>';

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').onclick = function() { document.body.removeChild(modal); };
        modal.onclick = function(e) { if (e.target === modal) document.body.removeChild(modal); };

        var shareBtn = modal.querySelector('#shareResultsBtn');
        if (shareBtn) {
            shareBtn.onclick = function() {
                var text = '🎮 Codenames — победили ' + winnerName + '!\nКомната: ' +
                    (gameManager.gameState ? gameManager.gameState.room_id : '') +
                    '\n' + window.location.href;
                copyToClipboard(text);
                showNotification('✅ Результаты скопированы!', 'success');
            };
        }
    }
};

var gameManager = GameManager;
