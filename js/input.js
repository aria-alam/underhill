// ============================================================
// Underhill — Input Handling (RPG Mode)
// ============================================================

const Input = {
    keys: {},           // currently held keys
    _bound: false,
    canvas: null,
    gameState: null,

    // Virtual D-pad state (for mobile)
    dpadDir: null,      // 'up','down','left','right' or null
    interactPressed: false,
    isTouchDevice: false,

    // Touch tracking for swipe-to-scroll in menus
    _touchStartY: 0,
    _touchStartX: 0,
    _touchWasDrag: false,

    // D-pad and interact button rects (set during UI render)
    dpadCenter: { x: 80, y: 0 },
    dpadRadius: 40,
    interactBtn: { x: 0, y: 0, w: 56, h: 56 },

    init(canvas, gameState) {
        this.canvas = canvas;
        this.gameState = gameState;

        if (!this._bound) {
            this._bound = true;

            // Keyboard
            window.addEventListener('keydown', (e) => this.onKeyDown(e));
            window.addEventListener('keyup', (e) => this.onKeyUp(e));

            // Clear all held keys when window loses focus (fixes stuck movement
            // when CMD+D or other shortcuts steal focus before keyup fires)
            window.addEventListener('blur', () => { this.keys = {}; });

            // Touch
            canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
            canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
            canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

            // Mouse click (for UI buttons only)
            canvas.addEventListener('click', (e) => this.onClick(e));
        }
    },

    onKeyDown(e) {
        // Resume AudioContext on user gesture (browsers require this)
        if (typeof Music !== 'undefined' && Music.ctx && Music.ctx.state === 'suspended') {
            Music.ctx.resume();
        }

        const key = e.key.toLowerCase();

        // Name entry mode: capture all keys for text input
        if (Dialogue.active && Dialogue.isNameEntry) {
            e.preventDefault();
            if (e.key === 'Backspace') {
                Dialogue.nameText = Dialogue.nameText.slice(0, -1);
            } else if (e.key === 'Enter') {
                Dialogue.handleNameKey('enter');
            } else if (e.key.length === 1) {
                // Type character with original case preserved
                Dialogue.nameText = (Dialogue.nameText + e.key).slice(0, Dialogue.nameMaxLen);
            }
            return;
        }

        if (this.keys[key]) return; // ignore repeats
        this.keys[key] = true;

        // Interact / advance dialogue
        if (key === INTERACT_KEY || key === 'enter') {
            e.preventDefault();
            if (Dialogue.active) {
                Dialogue.advance();
            } else {
                Interaction.execute(this.gameState);
            }
        }

        // Escape: universal unstick — clears all blocking states, or pauses if nothing is blocking
        if (key === 'escape') {
            // Dismiss terraform win overlay
            if (this.gameState.terraformWon && !this.gameState.terraformWinAcknowledged) {
                this.gameState.terraformWinAcknowledged = true;
                return;
            }

            // Close about overlay if open
            const aboutOverlay = document.getElementById('about-overlay');
            if (aboutOverlay && aboutOverlay.style.display !== 'none') {
                aboutOverlay.style.display = 'none';
                this.gameState.paused = false;
                return;
            }

            const wasBlocked = Dialogue.active || this.gameState.paused;
            if (Dialogue.active) {
                Dialogue.close();
            }
            if (wasBlocked) {
                this.gameState.paused = false;
            } else {
                this.gameState.paused = true;
            }
        }

        // Backtick (`): restart in test mode
        if (key === '`') {
            e.preventDefault();
            Game.isTestMode = true;
            Game.newGame();
            return;
        }

        // Pause
        if (key === 'p' || key === ' ') {
            if (!Dialogue.active) {
                e.preventDefault();
                this.gameState.paused = !this.gameState.paused;
            }
        }

        // Mute toggle
        if (key === 'm') {
            if (!Dialogue.active && typeof Music !== 'undefined') {
                Music.toggleMute();
            }
        }

        // Dialogue navigation (W/S or arrows for choices and build menu)
        if (Dialogue.active && (Dialogue.choices || Dialogue.isBuildMenu)) {
            if (key === 'w' || key === 'arrowup') {
                e.preventDefault();
                Dialogue.navigateChoice(-1);
            }
            if (key === 's' || key === 'arrowdown') {
                e.preventDefault();
                Dialogue.navigateChoice(1);
            }
        }
    },

    onKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
    },

    // Called every frame to set Player movement from held keys
    updateMovement() {
        if (Dialogue.active || this.gameState.paused || this.gameState.gameOver) {
            Player.moveX = 0;
            Player.moveY = 0;
            return;
        }

        let mx = 0, my = 0;

        // Keyboard
        if (this.keys['a'] || this.keys['arrowleft'])  mx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) mx += 1;
        if (this.keys['w'] || this.keys['arrowup'])    my -= 1;
        if (this.keys['s'] || this.keys['arrowdown'])  my += 1;

        // D-pad override
        if (this.dpadDir) {
            mx = 0; my = 0;
            if (this.dpadDir === 'left')  mx = -1;
            if (this.dpadDir === 'right') mx = 1;
            if (this.dpadDir === 'up')    my = -1;
            if (this.dpadDir === 'down')  my = 1;
        }

        Player.moveX = mx;
        Player.moveY = my;
    },

    onClick(e) {
        // On touch devices, all input is handled by touch events — skip click
        // (prevents mobile browsers firing a synthetic click after touchstart,
        //  which would double-trigger Game.newGame() or advance dialogues)
        if (this.isTouchDevice) return;

        // Resume AudioContext on user gesture (browsers require this)
        if (typeof Music !== 'undefined' && Music.ctx && Music.ctx.state === 'suspended') {
            Music.ctx.resume();
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // UI buttons always work (pause, save, new, test)
        if (UI.handleClick(x, y, this.gameState)) return;

        // Dialogue click
        if (Dialogue.active) {
            Dialogue.handleClick(x, y);
            return;
        }
    },

    onTouchStart(e) {
        e.preventDefault();
        // Resume AudioContext on user gesture (browsers require this)
        if (typeof Music !== 'undefined' && Music.ctx && Music.ctx.state === 'suspended') {
            Music.ctx.resume();
        }
        this.isTouchDevice = true;

        for (const touch of e.changedTouches) {
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            // Dismiss terraform win overlay on tap
            if (this.gameState.terraformWon && !this.gameState.terraformWinAcknowledged) {
                this.gameState.terraformWinAcknowledged = true;
                continue;
            }

            // If paused (and no dialogue), tap anywhere to unpause
            if (this.gameState.paused && !Dialogue.active) {
                // Only check pause button — tap it to unpause
                if (UI.isInside(x, y, UI.pauseButton)) {
                    this.gameState.paused = false;
                }
                // Also allow tapping center of screen to unpause
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                if (Math.abs(x - cx) < 120 && Math.abs(y - cy) < 60) {
                    this.gameState.paused = false;
                }
                continue;
            }

            // UI buttons — only check if touch is in the top HUD area
            if (y < 100) {
                if (UI.handleClick(x, y, this.gameState)) continue;
            }

            // Track touch start for swipe detection in menus
            this._touchStartX = x;
            this._touchStartY = y;
            this._touchWasDrag = false;

            // Dialogue: don't handle tap on touchstart for build menus
            // (wait for touchend to distinguish tap vs swipe scroll)
            if (Dialogue.active) {
                if (Dialogue.isBuildMenu) {
                    continue; // handled on touchend
                }
                Dialogue.handleClick(x, y);
                continue;
            }

            // Check interact button first (bottom-right)
            if (this._isInRect(x, y, this.interactBtn)) {
                this.interactPressed = true;
                Interaction.execute(this.gameState);
                continue;
            }

            // Check D-pad (bottom-left)
            const dpad = this._getDpadDir(x, y);
            if (dpad) {
                this.dpadDir = dpad;
                continue;
            }

            // Tap-to-move on grid (only in the middle area, not near controls)
            if (y < rect.height - 200 && y > 100) {
                const worldX = x + Renderer.cameraX;
                const worldY = y + Renderer.cameraY;
                if (worldX >= 0 && worldY >= 0 && worldX < GRID_COLS * TILE_SIZE && worldY < GRID_ROWS * TILE_SIZE) {
                    const col = Math.floor(worldX / TILE_SIZE);
                    const row = Math.floor(worldY / TILE_SIZE);
                    Player.moveTarget = { x: col * TILE_SIZE, y: row * TILE_SIZE };
                }
            }
        }
    },

    onTouchMove(e) {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            // Swipe scroll in build menu
            if (Dialogue.active && Dialogue.isBuildMenu) {
                const dy = y - this._touchStartY;
                if (Math.abs(dy) > 15) {
                    this._touchWasDrag = true;
                    // Scroll by 1 item per 40px of drag
                    const scrollDir = dy < 0 ? 1 : -1;
                    this._touchStartY = y;
                    Dialogue.navigateChoice(scrollDir);
                }
                continue;
            }

            const dpad = this._getDpadDir(x, y);
            if (dpad) {
                this.dpadDir = dpad;
            }
        }
    },

    onTouchEnd(e) {
        e.preventDefault();

        // Build menu: handle tap (not drag) on touchend
        if (Dialogue.active && Dialogue.isBuildMenu && !this._touchWasDrag) {
            const touch = e.changedTouches[0];
            if (touch) {
                const rect = this.canvas.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                Dialogue.handleClick(x, y);
            }
        }

        this.dpadDir = null;
        this.interactPressed = false;
        this._touchWasDrag = false;
    },

    _getDpadDir(x, y) {
        const cx = this.dpadCenter.x;
        const cy = this.dpadCenter.y;
        const r = this.dpadRadius;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r * 1.8 || dist < 10) return null;

        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy > 0 ? 'down' : 'up';
        }
    },

    _isInRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    },
};
