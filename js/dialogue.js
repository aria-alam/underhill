// ============================================================
// Underhill — RPG Dialogue System
// ============================================================

const Dialogue = {
    active: false,
    speaker: '',
    portrait: null,       // 8x8 sprite array or null
    portraitColor: null,   // suit recolor for NPC portraits
    lines: [],            // array of strings
    lineIndex: 0,
    charIndex: 0,
    charTimer: 0,
    choices: null,         // null or array of {label, action}
    choiceIndex: 0,
    choiceScroll: 0,       // scroll offset for choice menus with 3+ items
    onClose: null,
    npcId: null,

    // Build menu state
    isBuildMenu: false,
    buildItems: [],
    buildCol: 0,
    buildRow: 0,
    buildScroll: 0,

    // Name entry state
    isNameEntry: false,
    nameText: '',
    nameMaxLen: 20,
    nameCallback: null,  // function(name) called on confirm

    // Layout rects (calculated during render)
    boxRect: { x: 0, y: 0, w: 0, h: 0 },
    choiceRects: [],

    open(speaker, portrait, lines, choices, npcId, onClose, portraitColor) {
        this.active = true;
        this.speaker = speaker;
        this.portrait = portrait;
        this.portraitColor = portraitColor || null;
        this.lines = lines;
        this.lineIndex = 0;
        this.charIndex = 0;
        this.charTimer = 0;
        this.choices = choices;
        this.choiceIndex = 0;
        this.choiceScroll = 0;
        this.onClose = onClose || null;
        this.npcId = npcId || null;
        this.isBuildMenu = false;
    },

    openBuildMenu(gameState, col, row) {
        if (typeof Music !== 'undefined') Music.playSFX('menu_open');
        this.active = true;
        this.isBuildMenu = true;
        this.speaker = 'BUILD';
        this.portrait = null;
        this.portraitColor = null;
        this.lines = ['Select a structure to build:'];
        this.lineIndex = 0;
        this.charIndex = 999; // instant reveal
        this.charTimer = 0;
        this.choices = null;
        this.choiceIndex = 0;
        this.onClose = null;
        this.npcId = null;
        this.buildCol = col;
        this.buildRow = row;
        this.buildScroll = 0;

        // Build item list — all buildable types, gated by peakPopulation unlock tiers
        const types = [];
        for (const tier of Object.values(UNLOCK_TIERS)) {
            for (const bType of tier.buildings) {
                types.push(bType);
            }
        }
        const peakPop = gameState.peakPopulation || 0;
        this.buildItems = types.map(type => {
            const def = BUILDING_DEFS[type];
            const rule = ADJACENCY_BONUSES[type];
            // Determine unlock status
            let locked = false;
            let unlockReq = 0;
            for (const [tierNum, tier] of Object.entries(UNLOCK_TIERS)) {
                if (tier.buildings.includes(type) && peakPop < tier.pop) {
                    locked = true;
                    unlockReq = tier.pop;
                    break;
                }
            }
            return {
                type,
                name: def.name,
                cost: def.cost,
                desc: locked ? `[Locked \u2014 need ${unlockReq} pop]` : def.description,
                tip: rule ? rule.tip : null,
                icon: MENU_ICONS[type],
                canPlace: locked ? false : Grid.canPlace(col, row, def.width, def.height),
                canAfford: locked ? false : gameState.resources[RESOURCE.MATERIALS] >= def.cost,
                locked,
            };
        });
    },

    openNameEntry(speaker, promptText, callback) {
        this.active = true;
        this.isNameEntry = true;
        this.speaker = speaker;
        this.portrait = null;
        this.portraitColor = null;
        this.lines = [promptText];
        this.lineIndex = 0;
        this.charIndex = 999; // instant reveal
        this.charTimer = 0;
        this.choices = null;
        this.choiceIndex = 0;
        this.onClose = null;
        this.npcId = null;
        this.isBuildMenu = false;
        this.nameText = '';
        this.nameCallback = callback;
    },

    handleNameKey(key) {
        if (!this.isNameEntry) return;

        if (key === 'enter') {
            const name = this.nameText.trim() || 'Commander';
            const cb = this.nameCallback;
            this.close();
            if (cb) cb(name);
        }
    },

    update(dt) {
        if (!this.active) return;
        if (this.isBuildMenu) return;

        // Typewriter effect
        const line = this.lines[this.lineIndex];
        if (line && this.charIndex < line.length) {
            this.charTimer += dt;
            const charsToAdd = Math.floor(this.charTimer * DIALOGUE_TEXT_SPEED);
            if (charsToAdd > 0) {
                this.charIndex += charsToAdd;
                this.charTimer = 0;
            }
        }
    },

    advance() {
        if (!this.active) return;

        if (this.isBuildMenu) {
            // Confirm build selection
            this._confirmBuild();
            return;
        }

        const line = this.lines[this.lineIndex];

        // If text still typing, instant reveal
        if (line && this.charIndex < line.length) {
            this.charIndex = line.length;
            return;
        }

        // If choices are showing, select current choice
        if (this.choices && this.lineIndex >= this.lines.length - 1) {
            const choice = this.choices[this.choiceIndex];
            const action = choice ? choice.action : null;
            // Close FIRST so the action can safely open a new dialogue
            this.close();
            if (action) action();
            return;
        }

        // Next line
        this.lineIndex++;
        this.charIndex = 0;
        this.charTimer = 0;

        // If past last line, close
        if (this.lineIndex >= this.lines.length) {
            this.close();
        }
    },

    close() {
        // Save callback before cleanup so it can open a new dialogue
        const callback = this.onClose;

        // Release NPC from talking state
        if (this.npcId && typeof NPC !== 'undefined') {
            const npc = NPC.list.find(n => n.id === this.npcId);
            if (npc && npc.state === 'talking') {
                npc.state = 'idle';
                npc.idleTimer = NPC_IDLE_MIN + Math.random() * (NPC_IDLE_MAX - NPC_IDLE_MIN);
            }
        }

        this.active = false;
        this.speaker = '';
        this.portrait = null;
        this.portraitColor = null;
        this.lines = [];
        this.choices = null;
        this.onClose = null;
        this.npcId = null;
        this.isBuildMenu = false;
        this.buildItems = [];
        this.isNameEntry = false;
        this.nameText = '';
        this.nameCallback = null;

        // Fire callback AFTER cleanup so it can open a new dialogue
        if (callback) callback();
    },

    navigateChoice(dir) {
        if (this.isBuildMenu) {
            this.choiceIndex = Math.max(0, Math.min(this.choiceIndex + dir, this.buildItems.length - 1));
            // Scroll to keep selection visible
            if (this.choiceIndex < this.buildScroll) this.buildScroll = this.choiceIndex;
            if (this.choiceIndex >= this.buildScroll + 4) this.buildScroll = this.choiceIndex - 3;
            return;
        }
        if (!this.choices) return;
        this.choiceIndex = Math.max(0, Math.min(this.choiceIndex + dir, this.choices.length - 1));
        // Scroll to keep selection visible (max 3 visible choices)
        if (this.choiceIndex < this.choiceScroll) this.choiceScroll = this.choiceIndex;
        if (this.choiceIndex >= this.choiceScroll + 3) this.choiceScroll = this.choiceIndex - 2;
    },

    handleClick(x, y) {
        if (!this.active) return;

        if (this.isBuildMenu) {
            // Check if click is on a build item
            for (let i = 0; i < this.choiceRects.length; i++) {
                const r = this.choiceRects[i];
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                    if (this.choiceIndex === r.index) {
                        // Second tap on same item — confirm build
                        this._confirmBuild();
                    } else {
                        // First tap — select item
                        this.choiceIndex = r.index;
                    }
                    return;
                }
            }
            // Click anywhere else advances/closes
            this.close();
            return;
        }

        // Click on choice
        if (this.choices) {
            for (let i = 0; i < this.choiceRects.length; i++) {
                const r = this.choiceRects[i];
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                    this.choiceIndex = r.index;
                    this.advance();
                    return;
                }
            }
        }

        // Click on dialogue box advances text
        if (x >= this.boxRect.x && x <= this.boxRect.x + this.boxRect.w &&
            y >= this.boxRect.y && y <= this.boxRect.y + this.boxRect.h) {
            this.advance();
        }
    },

    _confirmBuild() {
        const item = this.buildItems[this.choiceIndex];
        if (!item) return;
        if (item.locked || !item.canAfford || !item.canPlace) return;

        const placed = Buildings.place(
            Input.gameState,
            item.type,
            this.buildCol,
            this.buildRow
        );
        if (placed) {
            if (typeof Music !== 'undefined') Music.playSFX('build');
            // Nudge player if standing on new building
            const pt = Player.getTile();
            const def = BUILDING_DEFS[item.type];
            if (pt.col >= this.buildCol && pt.col < this.buildCol + def.width &&
                pt.row >= this.buildRow && pt.row < this.buildRow + def.height) {
                const safe = Grid.findWalkableNear(this.buildCol, this.buildRow, 3);
                if (safe) {
                    Player.x = safe.col * TILE_SIZE;
                    Player.y = safe.row * TILE_SIZE;
                }
            }
        }
        this.close();
    },

    // === Rendering ===

    render(ctx, canvasW, canvasH) {
        if (!this.active) return;

        if (this.isBuildMenu) {
            this._renderBuildMenu(ctx, canvasW, canvasH);
            return;
        }

        if (this.isNameEntry) {
            this._renderNameEntry(ctx, canvasW, canvasH);
            return;
        }

        this._renderDialogue(ctx, canvasW, canvasH);
    },

    _renderDialogue(ctx, canvasW, canvasH) {
        const isMobile = Input.isTouchDevice;
        const boxH = isMobile ? 140 : 120;
        const boxY = isMobile ? canvasH - boxH - 180 : canvasH - boxH;
        const boxX = 0;
        const boxW = canvasW;
        this.boxRect = { x: boxX, y: boxY, w: boxW, h: boxH };

        // Pokemon-style double-bordered dialogue box
        ctx.fillStyle = '#1A0E08';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = '#2C1810';
        ctx.fillRect(boxX + 4, boxY + 4, boxW - 8, boxH - 8);
        // Outer border
        ctx.strokeStyle = COLORS.UI_LIGHT;
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);
        // Inner border
        ctx.strokeStyle = COLORS.METAL;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);

        let textX = boxX + 16;

        // Portrait (supports 8x8 or 16x16 sprites)
        if (this.portrait) {
            const pRows = this.portrait.length;
            const pScale = pRows >= 16 ? 4 : 8;
            const pSize = pRows * pScale;
            const pX = boxX + 12;
            const pY = boxY + (boxH - pSize) / 2;

            // Portrait frame
            ctx.fillStyle = '#1A0E08';
            ctx.fillRect(pX - 3, pY - 3, pSize + 6, pSize + 6);
            ctx.strokeStyle = COLORS.METAL;
            ctx.lineWidth = 1;
            ctx.strokeRect(pX - 2, pY - 2, pSize + 4, pSize + 4);

            if (this.portraitColor) {
                drawSpriteRecolor(ctx, this.portrait, pX, pY, pScale, 18, this.portraitColor);
            } else {
                drawSprite(ctx, this.portrait, pX, pY, pScale);
            }
            textX = pX + pSize + 16;
        }

        // Speaker name
        ctx.fillStyle = COLORS.POWER;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(this.speaker, textX, boxY + 22);

        // Text with typewriter effect
        const line = this.lines[this.lineIndex] || '';
        const visibleText = line.substring(0, Math.min(this.charIndex, line.length));
        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = '13px monospace';

        // Word-wrap
        const maxW = boxW - textX - 16;
        const wrappedLines = this._wrapText(ctx, visibleText, maxW);
        wrappedLines.forEach((wl, i) => {
            ctx.fillText(wl, textX, boxY + 42 + i * 18);
        });

        // Choices (max 3 visible with scroll)
        this.choiceRects = [];
        if (this.choices && this.charIndex >= line.length && this.lineIndex >= this.lines.length - 1) {
            const choiceY = boxY + 70;
            const maxVisibleChoices = 3;
            const totalChoices = this.choices.length;

            // Show item count when there are more choices than visible
            if (totalChoices > maxVisibleChoices) {
                ctx.fillStyle = COLORS.METAL;
                ctx.font = '10px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`${this.choiceIndex + 1}/${totalChoices}  [W/S to scroll]`, boxW - 16, choiceY - 6);
                ctx.textAlign = 'left';
            }

            // Draw scroll-up indicator
            if (this.choiceScroll > 0) {
                const blink = Math.floor(Date.now() / 500) % 2 === 0;
                ctx.fillStyle = blink ? COLORS.POWER : COLORS.METAL;
                ctx.font = '11px monospace';
                ctx.fillText('  \u25B2', textX, choiceY - 6);
            }

            for (let vi = 0; vi < maxVisibleChoices; vi++) {
                const idx = this.choiceScroll + vi;
                if (idx >= totalChoices) break;
                const choice = this.choices[idx];
                const cy = choiceY + vi * 20;
                const selected = idx === this.choiceIndex;
                ctx.fillStyle = selected ? COLORS.POWER : COLORS.UI_LIGHT;
                ctx.font = selected ? 'bold 12px monospace' : '12px monospace';
                const prefix = selected ? '> ' : '  ';
                ctx.fillText(prefix + choice.label, textX, cy);
                this.choiceRects.push({ x: textX, y: cy - 14, w: maxW, h: 18, index: idx });
            }

            // Draw scroll-down indicator
            if (this.choiceScroll + maxVisibleChoices < totalChoices) {
                const bottomY = choiceY + maxVisibleChoices * 20 - 6;
                const blink = Math.floor(Date.now() / 500) % 2 === 0;
                ctx.fillStyle = blink ? COLORS.POWER : COLORS.METAL;
                ctx.font = '11px monospace';
                ctx.fillText('  \u25BC more options below', textX, bottomY);
            }
        }

        // Advance indicator
        if (!this.choices && this.charIndex >= line.length) {
            const blink = Math.floor(Date.now() / 400) % 2 === 0;
            if (blink) {
                ctx.fillStyle = COLORS.UI_LIGHT;
                ctx.font = '12px monospace';
                ctx.textAlign = 'right';
                ctx.fillText('▼', boxW - 16, boxY + boxH - 12);
                ctx.textAlign = 'left';
            }
        }
    },

    _renderNameEntry(ctx, canvasW, canvasH) {
        const isMobile = Input.isTouchDevice;
        const boxH = 120;
        const boxY = isMobile ? canvasH - boxH - 180 : canvasH - boxH;
        const boxX = 0;
        const boxW = canvasW;
        this.boxRect = { x: boxX, y: boxY, w: boxW, h: boxH };

        // Pokemon-style double-bordered box
        ctx.fillStyle = '#1A0E08';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = '#2C1810';
        ctx.fillRect(boxX + 4, boxY + 4, boxW - 8, boxH - 8);
        ctx.strokeStyle = COLORS.UI_LIGHT;
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);
        ctx.strokeStyle = COLORS.METAL;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 6, boxY + 6, boxW - 12, boxH - 12);

        // Speaker name
        ctx.fillStyle = COLORS.POWER;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(this.speaker, boxX + 16, boxY + 22);

        // Prompt text
        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.font = '13px monospace';
        ctx.fillText(this.lines[0], boxX + 16, boxY + 44);

        // Name input field
        const fieldX = boxX + 16;
        const fieldY = boxY + 56;
        const fieldW = Math.min(280, boxW - 32);
        const fieldH = 28;

        ctx.fillStyle = '#1A0E08';
        ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
        ctx.strokeStyle = COLORS.UI_LIGHT;
        ctx.lineWidth = 1;
        ctx.strokeRect(fieldX, fieldY, fieldW, fieldH);

        // Typed name with blinking cursor
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        const displayText = this.nameText + (blink ? '_' : '');
        ctx.fillStyle = COLORS.POWER;
        ctx.font = 'bold 16px monospace';
        ctx.fillText(displayText, fieldX + 8, fieldY + 20);

        // Hint
        ctx.fillStyle = COLORS.METAL;
        ctx.font = '11px monospace';
        ctx.fillText('Type your name and press Enter to confirm', boxX + 16, boxY + 104);
    },

    _renderBuildMenu(ctx, canvasW, canvasH) {
        const isMobile = Input.isTouchDevice;
        const boxH = 200;
        const boxY = isMobile ? canvasH - boxH - 180 : canvasH - boxH;
        const boxW = canvasW;
        this.boxRect = { x: 0, y: boxY, w: boxW, h: boxH };

        // Pokemon-style double-bordered build menu
        ctx.fillStyle = '#1A0E08';
        ctx.fillRect(0, boxY, boxW, boxH);
        ctx.fillStyle = '#2C1810';
        ctx.fillRect(4, boxY + 4, boxW - 8, boxH - 8);
        // Outer border
        ctx.strokeStyle = COLORS.UI_LIGHT;
        ctx.lineWidth = 2;
        ctx.strokeRect(2, boxY + 2, boxW - 4, boxH - 4);
        // Inner border
        ctx.strokeStyle = COLORS.METAL;
        ctx.lineWidth = 1;
        ctx.strokeRect(6, boxY + 6, boxW - 12, boxH - 12);

        // Title
        ctx.fillStyle = COLORS.POWER;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(isMobile ? 'BUILD  [Swipe to scroll  Tap to select  Tap again to build]'
            : 'BUILD  [W/S Navigate  E Confirm  Esc Cancel]', 16, boxY + 22);

        // Build items (show 4 at a time)
        this.choiceRects = [];
        const itemH = 40;
        const startY = boxY + 34;
        const maxVisible = 4;

        for (let vi = 0; vi < maxVisible; vi++) {
            const idx = this.buildScroll + vi;
            if (idx >= this.buildItems.length) break;

            const item = this.buildItems[idx];
            const iy = startY + vi * itemH;
            const selected = idx === this.choiceIndex;

            // Selection highlight
            if (selected) {
                ctx.fillStyle = 'rgba(200, 160, 100, 0.2)';
                ctx.fillRect(8, iy, boxW - 16, itemH - 2);
            }

            // Icon
            const iconScale = 3;
            const iconX = 16;
            const iconY = iy + 4;
            if (item.locked || !item.canAfford) ctx.globalAlpha = 0.4;
            drawSprite(ctx, item.icon, iconX, iconY, iconScale);
            if (item.locked || !item.canAfford) ctx.globalAlpha = 1;

            // Name and cost
            const textX = iconX + SPRITE_SIZE * iconScale + 12;
            if (item.locked) {
                ctx.fillStyle = '#5A4A3A';
                ctx.font = '13px monospace';
            } else {
                ctx.fillStyle = selected ? COLORS.POWER : (item.canAfford ? COLORS.UI_LIGHT : '#8B6E5C');
                ctx.font = selected ? 'bold 13px monospace' : '13px monospace';
            }
            ctx.fillText(item.name, textX, iy + 16);

            // Cost and description
            if (item.locked) {
                ctx.fillStyle = '#5A4A3A';
                ctx.font = '11px monospace';
                ctx.fillText(`Cost: ${item.cost} MAT`, textX, iy + 30);
                ctx.fillStyle = COLORS.DANGER;
                ctx.fillText(item.desc, textX + 120, iy + 30);
            } else {
                ctx.fillStyle = item.canAfford ? COLORS.METAL : COLORS.DANGER;
                ctx.font = '11px monospace';
                ctx.fillText(`Cost: ${item.cost} MAT`, textX, iy + 30);

                ctx.fillStyle = '#9B8B7B';
                ctx.fillText(item.desc, textX + 120, iy + 30);
            }

            // Can't place indicator
            if (!item.locked && !item.canPlace && item.canAfford) {
                ctx.fillStyle = COLORS.DANGER;
                ctx.fillText('No room', boxW - 80, iy + 16);
            }

            this.choiceRects.push({ x: 8, y: iy, w: boxW - 16, h: itemH - 2, index: idx });
        }

        // Placement tip for selected item
        const selectedItem = this.buildItems[this.choiceIndex];
        if (selectedItem && selectedItem.tip) {
            ctx.fillStyle = COLORS.POWER;
            ctx.font = '11px monospace';
            ctx.fillText('Bonus: ' + selectedItem.tip, 16, boxY + boxH - 12);
        }

        // Scroll indicators
        if (this.buildScroll > 0) {
            ctx.fillStyle = COLORS.UI_LIGHT;
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('▲', boxW - 12, startY + 8);
            ctx.textAlign = 'left';
        }
        if (this.buildScroll + maxVisible < this.buildItems.length) {
            ctx.fillStyle = COLORS.UI_LIGHT;
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('▼', boxW - 12, startY + maxVisible * itemH - 8);
            ctx.textAlign = 'left';
        }
    },

    _wrapText(ctx, text, maxW) {
        const words = text.split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
            const test = current ? current + ' ' + word : word;
            if (ctx.measureText(test).width > maxW && current) {
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);
        if (lines.length === 0) lines.push('');
        return lines;
    },
};
