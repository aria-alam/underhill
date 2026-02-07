// ============================================================
// Underhill — UI (HUD, Notifications, Mobile Controls)
// ============================================================

const UI = {
    notifications: [],
    pauseButton: { x: 0, y: 0, w: 0, h: 0 },
    saveButton: { x: 0, y: 0, w: 0, h: 0 },
    newGameButton: { x: 0, y: 0, w: 0, h: 0 },
    muteButton: { x: 0, y: 0, w: 0, h: 0 },
    achievementPopup: null,
    achievementTimer: 0,

    init() {
        this.notifications = [];
    },

    addNotification(message, type = 'info') {
        this.notifications.push({
            message,
            type,
            timer: 3,
        });
        if (this.notifications.length > 5) {
            this.notifications.shift();
        }
    },

    showAchievement(milestone) {
        this.achievementPopup = milestone;
        this.achievementTimer = 4;
        if (typeof Music !== 'undefined') Music.playSFX('achievement');
    },

    updateTimers(dt) {
        for (let i = this.notifications.length - 1; i >= 0; i--) {
            this.notifications[i].timer -= dt;
            if (this.notifications[i].timer <= 0) {
                this.notifications.splice(i, 1);
            }
        }
        if (this.achievementTimer > 0) {
            this.achievementTimer -= dt;
            if (this.achievementTimer <= 0) {
                this.achievementPopup = null;
            }
        }
    },

    render(ctx, gameState, canvasW, canvasH) {
        this.drawResourceBar(ctx, gameState, canvasW);
        this.drawPlayerStats(ctx, gameState, canvasW);
        this.drawSolCounter(ctx, gameState, canvasW);
        this.drawTerraformBar(ctx, gameState, canvasW);
        this.drawMoraleIndicators(ctx, gameState, canvasW);
        this.drawPauseButton(ctx, gameState, canvasW);
        this.drawNightWarning(ctx, gameState, canvasW, canvasH);
        this.drawInteractHint(ctx, gameState, canvasW, canvasH);
        this.drawNotifications(ctx, canvasW, canvasH);
        this.drawAchievementPopup(ctx, canvasW, canvasH);

        if (Input.isTouchDevice) {
            this.drawMobileControls(ctx, canvasW, canvasH);
        }

        if (gameState.paused && !Dialogue.active) {
            this.drawPauseOverlay(ctx, canvasW, canvasH);
        }

        // Debug: show blocking state when movement should work but might not
        this.drawDebugState(ctx, gameState, canvasW, canvasH);

        if (gameState.gameOver) {
            this.drawGameOver(ctx, gameState, canvasW, canvasH);
        }

        this.drawTerraformWin(ctx, gameState, canvasW, canvasH);
    },

    drawResourceBar(ctx, gameState, canvasW) {
        const barH = 52;
        ctx.fillStyle = 'rgba(44, 24, 16, 0.92)';
        ctx.fillRect(0, 0, canvasW, barH);

        const resources = [
            { key: RESOURCE.POWER,      label: 'PWR',  color: COLORS.POWER,    barColor: '#D4A843' },
            { key: RESOURCE.WATER,      label: 'H2O',  color: COLORS.WATER,    barColor: '#5B8FA8' },
            { key: RESOURCE.OXYGEN,     label: 'O2',   color: COLORS.UI_LIGHT, barColor: '#A8C8D8' },
            { key: RESOURCE.FOOD,       label: 'FOOD', color: COLORS.GREEN,    barColor: '#6B8E5A' },
            { key: RESOURCE.MATERIALS,  label: 'MAT',  color: COLORS.ORANGE,   barColor: '#D48043' },
            { key: RESOURCE.POPULATION, label: 'POP',  color: COLORS.UI_LIGHT, barColor: '#B8A898' },
        ];

        const spacing = Math.min(130, (canvasW - 20) / resources.length);

        resources.forEach((res, i) => {
            const x = 10 + i * spacing;
            const val = Math.floor(gameState.resources[res.key]);
            const max = gameState.maxStorage[res.key];

            // Label
            ctx.fillStyle = res.color;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(res.label, x, 14);

            // Value
            ctx.fillStyle = COLORS.UI_LIGHT;
            ctx.font = '12px monospace';
            let text = `${val}`;
            if (max > 0) text += `/${max}`;
            ctx.fillText(text, x, 28);

            // Progress bar
            if (max > 0) {
                const barW = Math.min(100, spacing - 10);
                const barX = x;
                const barY = 33;
                const bH = 5;
                const fill = Math.min(1, val / max);

                ctx.fillStyle = '#4A3828';
                ctx.fillRect(barX, barY, barW, bH);

                // Color warning when low (<20%)
                const isLow = fill < 0.2 && res.key !== RESOURCE.MATERIALS && res.key !== RESOURCE.POPULATION;
                ctx.fillStyle = isLow ? COLORS.DANGER : res.barColor;
                ctx.fillRect(barX, barY, barW * fill, bH);
            }

            // Resource alert blink
            const isVital = [RESOURCE.POWER, RESOURCE.WATER, RESOURCE.OXYGEN, RESOURCE.FOOD].includes(res.key);
            if (isVital && max > 0) {
                const alertPct = (val / max) * 100;
                if (alertPct < RESOURCE_CRITICAL_PERCENT && Math.floor(Date.now() / 300) % 2 === 0) {
                    // Critical blink — red flash over label
                    ctx.fillStyle = 'rgba(192, 57, 43, 0.6)';
                    ctx.fillRect(x - 2, 2, spacing - 6, 48);
                } else if (alertPct < RESOURCE_ALERT_PERCENT && alertPct >= RESOURCE_CRITICAL_PERCENT) {
                    // Warning — subtle amber tint
                    ctx.fillStyle = 'rgba(212, 168, 67, 0.2)';
                    ctx.fillRect(x - 2, 2, spacing - 6, 48);
                }
            }

            // Net rate
            if (gameState.netRates && gameState.netRates[res.key] !== undefined) {
                const rate = gameState.netRates[res.key];
                ctx.fillStyle = rate >= 0 ? '#6B8E5A' : COLORS.DANGER;
                ctx.font = '10px monospace';
                const sign = rate >= 0 ? '+' : '';
                ctx.fillText(`${sign}${rate.toFixed(1)}/s`, x, 48);
            } else if (res.key === RESOURCE.POPULATION) {
                ctx.fillStyle = '#7B8794';
                ctx.font = '10px monospace';
                ctx.fillText(`cap:${gameState.popCapacity || 0}`, x, 48);
            }
        });
    },

    drawPlayerStats(ctx, gameState, canvasW) {
        const barY = 54;
        const barH = 20;
        ctx.fillStyle = 'rgba(44, 24, 16, 0.88)';
        ctx.fillRect(0, barY, canvasW, barH);

        const stats = [
            { label: 'HP',     val: Player.hp,     max: PLAYER_MAX_HP,     color: COLORS.DANGER,  barColor: '#C0392B' },
            { label: 'NRG',    val: Player.energy,  max: PLAYER_MAX_ENERGY, color: COLORS.POWER,   barColor: '#D4A843' },
            { label: 'HUNGER', val: Player.hunger,  max: PLAYER_MAX_HUNGER, color: COLORS.GREEN,   barColor: '#6B8E5A' },
        ];

        const spacing = Math.min(160, (canvasW - 20) / stats.length);

        stats.forEach((stat, i) => {
            const x = 10 + i * spacing;
            const fill = Math.min(1, stat.val / stat.max);
            const isLow = fill < 0.25;

            // Label
            ctx.fillStyle = stat.color;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(stat.label, x, barY + 11);

            // Bar background
            const bx = x + 50;
            const by = barY + 4;
            const bw = Math.min(90, spacing - 60);
            const bh = 10;
            ctx.fillStyle = '#4A3828';
            ctx.fillRect(bx, by, bw, bh);

            // Bar fill
            ctx.fillStyle = isLow ? COLORS.DANGER : stat.barColor;
            ctx.fillRect(bx, by, bw * fill, bh);

            // Value text
            ctx.fillStyle = COLORS.UI_LIGHT;
            ctx.font = '9px monospace';
            ctx.fillText(`${Math.ceil(stat.val)}`, bx + bw + 4, barY + 13);
        });
    },

    drawNightWarning(ctx, gameState, canvasW, canvasH) {
        if (!gameState.isNighttime) return;

        const sheltered = Player.isSheltered(gameState);
        const label = sheltered ? 'NIGHT (SHELTERED)' : 'NIGHT - SEEK SHELTER!';
        const color = sheltered ? COLORS.WATER : COLORS.DANGER;

        ctx.fillStyle = 'rgba(44, 24, 16, 0.85)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width + 16;
        const nx = canvasW / 2;
        const ny = 82;
        ctx.fillRect(nx - tw / 2, ny - 10, tw, 18);
        ctx.fillStyle = color;

        // Blink for danger
        if (!sheltered && Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillText(label, nx, ny + 3);
        } else if (sheltered) {
            ctx.fillText(label, nx, ny + 3);
        }
        ctx.textAlign = 'left';
    },

    drawSolCounter(ctx, gameState, canvasW) {
        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Sol ${gameState.sol}`, canvasW - 10, 90);

        const progress = gameState.solTime / SOL_DURATION;
        const barW = 60;
        const barH = 4;
        const barX = canvasW - 10 - barW;
        const barY = 94;
        ctx.fillStyle = '#4A3828';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = COLORS.POWER;
        ctx.fillRect(barX, barY, barW * progress, barH);
    },

    drawTerraformBar(ctx, gameState, canvasW) {
        const pct = gameState.terraformPercent || 0;
        if (pct <= 0 && gameState.buildings.length < 3) return;

        const barW = 80;
        const barH = 8;
        const x = canvasW - 10 - barW;
        const y = 107;

        // Label
        ctx.fillStyle = COLORS.GREEN;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`TERRAFORM ${Math.floor(pct)}%`, canvasW - 10, y - 2);

        // Bar bg
        ctx.fillStyle = '#4A3828';
        ctx.fillRect(x, y, barW, barH);

        // Bar fill
        const fill = Math.min(1, pct / 100);
        ctx.fillStyle = pct >= 85 ? '#27AE60' : pct >= 50 ? '#6B8E5A' : '#4A7A3A';
        ctx.fillRect(x, y, barW * fill, barH);

        ctx.textAlign = 'left';
    },

    drawMoraleIndicators(ctx, gameState, canvasW) {
        if (gameState.colonyMode !== 'conflict') return;
        if (!gameState.greenMorale && !gameState.redMorale) return;

        const x = canvasW - 95;
        const y = 120;
        const barW = 40;
        const barH = 4;

        // Green morale
        ctx.fillStyle = '#27AE60';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('GRN', x - 2, y + 4);
        ctx.fillStyle = '#4A3828';
        ctx.fillRect(x, y, barW, barH);
        ctx.fillStyle = '#27AE60';
        ctx.fillRect(x, y, barW * (gameState.greenMorale / 100), barH);

        // Red morale
        ctx.fillStyle = '#C0392B';
        ctx.fillText('RED', x - 2, y + 13);
        ctx.fillStyle = '#4A3828';
        ctx.fillRect(x, y + 9, barW, barH);
        ctx.fillStyle = '#C0392B';
        ctx.fillRect(x, y + 9, barW * (gameState.redMorale / 100), barH);

        ctx.textAlign = 'left';
    },

    drawTerraformWin(ctx, gameState, canvasW, canvasH) {
        if (!gameState.terraformWon) return;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.fillStyle = '#27AE60';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TERRAFORMING COMPLETE', canvasW / 2, canvasH / 2 - 40);

        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = '14px monospace';
        ctx.fillText('Mars is transforming. Underhill will endure.', canvasW / 2, canvasH / 2);
        ctx.fillText(`Achieved in ${gameState.sol} sols`, canvasW / 2, canvasH / 2 + 25);

        ctx.font = '12px monospace';
        ctx.fillStyle = COLORS.POWER;
        ctx.fillText('You may continue playing or start a new colony.', canvasW / 2, canvasH / 2 + 55);
        ctx.textAlign = 'left';
    },

    drawPauseButton(ctx, gameState, canvasW) {
        const btnW = 60;
        const btnH = 22;
        const x = canvasW - btnW - 10;
        const y = 140;
        this.pauseButton = { x, y, w: btnW, h: btnH };

        ctx.fillStyle = gameState.paused ? COLORS.DANGER : 'rgba(80, 60, 40, 0.6)';
        ctx.fillRect(x, y, btnW, btnH);
        ctx.strokeStyle = COLORS.METAL;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, btnW, btnH);

        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(gameState.paused ? 'PLAY' : 'PAUSE', x + btnW / 2, y + 15);

        // Save button
        const saveX = x - btnW - 8;
        this.saveButton = { x: saveX, y, w: btnW, h: btnH };
        ctx.fillStyle = 'rgba(80, 60, 40, 0.6)';
        ctx.fillRect(saveX, y, btnW, btnH);
        ctx.strokeStyle = COLORS.METAL;
        ctx.strokeRect(saveX, y, btnW, btnH);
        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.fillText('SAVE', saveX + btnW / 2, y + 15);

        // New game button
        const newX = saveX - btnW - 8;
        this.newGameButton = { x: newX, y, w: btnW, h: btnH };
        ctx.fillStyle = 'rgba(80, 60, 40, 0.6)';
        ctx.fillRect(newX, y, btnW, btnH);
        ctx.strokeStyle = COLORS.METAL;
        ctx.strokeRect(newX, y, btnW, btnH);
        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.fillText('NEW', newX + btnW / 2, y + 15);

        // Mute button
        const muteX = newX - btnW - 8;
        this.muteButton = { x: muteX, y, w: btnW, h: btnH };
        const isMuted = typeof Music !== 'undefined' && Music.muted;
        ctx.fillStyle = isMuted ? COLORS.DANGER : 'rgba(80, 60, 40, 0.6)';
        ctx.fillRect(muteX, y, btnW, btnH);
        ctx.strokeStyle = COLORS.METAL;
        ctx.strokeRect(muteX, y, btnW, btnH);
        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.fillText(isMuted ? 'UNMUTE' : 'MUTE', muteX + btnW / 2, y + 15);

        ctx.textAlign = 'left';
    },

    drawInteractHint(ctx, gameState, canvasW, canvasH) {
        if (Dialogue.active || gameState.paused || gameState.gameOver) return;
        if (!Interaction.canInteract(gameState)) return;

        const facing = Player.getFacingTile();
        if (!facing) return;

        const px = facing.col * TILE_SIZE + Renderer.offsetX + TILE_SIZE / 2;
        const py = facing.row * TILE_SIZE + Renderer.offsetY - 4;

        ctx.fillStyle = 'rgba(44, 24, 16, 0.8)';
        const label = Input.isTouchDevice ? 'TAP' : '[E]';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width + 8;
        ctx.fillRect(px - tw / 2, py - 12, tw, 16);
        ctx.fillStyle = COLORS.POWER;
        ctx.fillText(label, px, py);
        ctx.textAlign = 'left';
    },

    drawMobileControls(ctx, canvasW, canvasH) {
        // D-pad (bottom-left)
        const dpadX = 80;
        const dpadY = canvasH - 100;
        const r = 40;
        Input.dpadCenter = { x: dpadX, y: dpadY };
        Input.dpadRadius = r;

        // D-pad background circle
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#4A3828';
        ctx.beginPath();
        ctx.arc(dpadX, dpadY, r + 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Direction arrows
        const arrowColor = 'rgba(245, 230, 211, 0.6)';
        ctx.fillStyle = arrowColor;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▲', dpadX, dpadY - r + 14);
        ctx.fillText('▼', dpadX, dpadY + r - 2);
        ctx.fillText('◀', dpadX - r + 6, dpadY + 7);
        ctx.fillText('▶', dpadX + r - 6, dpadY + 7);

        // Center dot
        ctx.fillStyle = 'rgba(245, 230, 211, 0.3)';
        ctx.beginPath();
        ctx.arc(dpadX, dpadY, 8, 0, Math.PI * 2);
        ctx.fill();

        // Interact button (bottom-right)
        const btnSize = 56;
        const btnX = canvasW - btnSize - 24;
        const btnY = canvasH - btnSize - 70;
        Input.interactBtn = { x: btnX, y: btnY, w: btnSize, h: btnSize };

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = COLORS.POWER;
        ctx.beginPath();
        ctx.arc(btnX + btnSize / 2, btnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = COLORS.UI_DARK;
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('E', btnX + btnSize / 2, btnY + btnSize / 2 + 6);
        ctx.textAlign = 'left';
    },

    drawNotifications(ctx, canvasW, canvasH) {
        let y = canvasH - 10;

        for (let i = this.notifications.length - 1; i >= 0; i--) {
            const notif = this.notifications[i];
            const alpha = Math.min(1, notif.timer);

            ctx.globalAlpha = alpha;

            let bgColor;
            switch (notif.type) {
                case 'danger': bgColor = 'rgba(192, 57, 43, 0.85)'; break;
                case 'success': bgColor = 'rgba(107, 142, 90, 0.85)'; break;
                case 'warning': bgColor = 'rgba(212, 168, 67, 0.85)'; break;
                default: bgColor = 'rgba(44, 24, 16, 0.85)';
            }
            ctx.fillStyle = bgColor;

            ctx.font = '12px monospace';
            const textW = ctx.measureText(notif.message).width;
            const boxW = textW + 20;
            const boxH = 24;
            const boxX = canvasW / 2 - boxW / 2;

            ctx.fillRect(boxX, y - boxH, boxW, boxH);
            ctx.fillStyle = COLORS.UI_LIGHT;
            ctx.textAlign = 'center';
            ctx.fillText(notif.message, canvasW / 2, y - 7);

            y -= boxH + 4;
            ctx.globalAlpha = 1;
        }
    },

    drawAchievementPopup(ctx, canvasW, canvasH) {
        if (!this.achievementPopup) return;

        const alpha = Math.min(1, this.achievementTimer);
        ctx.globalAlpha = alpha;

        const w = 260;
        const h = 60;
        const x = canvasW / 2 - w / 2;
        const y = 132;

        ctx.fillStyle = 'rgba(107, 142, 90, 0.95)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = COLORS.POWER;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = COLORS.POWER;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ACHIEVEMENT UNLOCKED', canvasW / 2, y + 20);

        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = '12px monospace';
        ctx.fillText(this.achievementPopup.name, canvasW / 2, y + 38);
        ctx.font = '10px monospace';
        ctx.fillText(this.achievementPopup.desc, canvasW / 2, y + 52);

        ctx.globalAlpha = 1;
    },

    drawGameOver(ctx, gameState, canvasW, canvasH) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.fillStyle = COLORS.DANGER;
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvasW / 2, canvasH / 2 - 30);

        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = '14px monospace';
        ctx.fillText(gameState.gameOverReason, canvasW / 2, canvasH / 2 + 10);
        ctx.fillText(`Survived ${gameState.sol} sols`, canvasW / 2, canvasH / 2 + 35);

        ctx.font = '12px monospace';
        ctx.fillText('Click NEW to start again', canvasW / 2, canvasH / 2 + 65);
    },

    drawPauseOverlay(ctx, canvasW, canvasH) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvasW / 2, canvasH / 2);
        ctx.font = '13px monospace';
        ctx.fillText('Press P or ESC to resume', canvasW / 2, canvasH / 2 + 30);
        ctx.textAlign = 'left';
    },

    drawDebugState(ctx, gameState, canvasW, canvasH) {
        // Only show when something is blocking movement unexpectedly
        const blocked = Dialogue.active || gameState.paused || gameState.gameOver;
        if (!blocked) return; // everything normal, don't clutter screen

        const reasons = [];
        if (Dialogue.active) reasons.push('DLG:on');
        if (Dialogue.isBuildMenu) reasons.push('BUILD');
        if (Dialogue.isNameEntry) reasons.push('NAME');
        if (gameState.paused) reasons.push('PAUSED');
        if (gameState.gameOver) reasons.push('GAMEOVER');

        if (reasons.length > 0) {
            const text = '[' + reasons.join(' | ') + '] Press ESC to unstick';
            ctx.fillStyle = 'rgba(192, 57, 43, 0.85)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            const tw = ctx.measureText(text).width + 10;
            ctx.fillRect(4, canvasH - 18, tw, 16);
            ctx.fillStyle = COLORS.UI_LIGHT;
            ctx.fillText(text, 8, canvasH - 6);
        }
    },

    handleClick(x, y, gameState) {
        if (this.isInside(x, y, this.pauseButton)) {
            gameState.paused = !gameState.paused;
            return true;
        }
        if (this.isInside(x, y, this.saveButton)) {
            Save.save(gameState);
            this.addNotification('Game saved!', 'success');
            return true;
        }
        if (this.isInside(x, y, this.newGameButton)) {
            Game.isTestMode = false;
            Game.newGame();
            return true;
        }
        if (this.isInside(x, y, this.muteButton)) {
            if (typeof Music !== 'undefined') Music.toggleMute();
            return true;
        }
        return false;
    },

    isInside(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    },
};
