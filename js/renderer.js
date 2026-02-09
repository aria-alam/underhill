// ============================================================
// Underhill — Renderer (Scrolling Camera)
// ============================================================

const Renderer = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    pixelScale: 4,
    dustStormAlpha: 0,

    // Camera position (top-left corner in world pixels)
    cameraX: 0,
    cameraY: 0,
    // Viewport size in tiles
    viewCols: 20,
    viewRows: 15,

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        if (!this.ctx) {
            console.error('Failed to get 2D context');
            return;
        }
        this.ctx.imageSmoothingEnabled = false;
        this.resize();
    },

    resize() {
        this.width = this.canvas.parentElement.clientWidth;
        this.height = this.canvas.parentElement.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx.imageSmoothingEnabled = false;

        // Calculate how many tiles fit in the viewport
        this.viewCols = Math.ceil(this.width / TILE_SIZE) + 1;
        this.viewRows = Math.ceil(this.height / TILE_SIZE) + 1;
    },

    updateCamera() {
        // Center camera on player
        const targetX = Player.x + TILE_SIZE / 2 - this.width / 2;
        const targetY = Player.y + TILE_SIZE / 2 - this.height / 2;

        // Clamp to world bounds
        const worldW = GRID_COLS * TILE_SIZE;
        const worldH = GRID_ROWS * TILE_SIZE;
        this.cameraX = Math.max(0, Math.min(targetX, worldW - this.width));
        this.cameraY = Math.max(0, Math.min(targetY, worldH - this.height));

        // If world is smaller than viewport, center it
        if (worldW < this.width) this.cameraX = -(this.width - worldW) / 2;
        if (worldH < this.height) this.cameraY = -(this.height - worldH) / 2;

        // Derive offset (world-to-screen transform)
        this.offsetX = -Math.round(this.cameraX);
        this.offsetY = -Math.round(this.cameraY);
    },

    render(gameState) {
        const ctx = this.ctx;

        // Update camera before rendering
        this.updateCamera();

        // Rebuild greening cache if dirty
        if (Grid.greeningDirty) {
            Grid.rebuildGreeningCache(gameState);
        }

        // Clear
        ctx.fillStyle = COLORS.UI_DARK;
        ctx.fillRect(0, 0, this.width, this.height);

        // Terrain (viewport culled)
        this.drawTerrain();

        // Buildings (viewport culled)
        this.drawBuildings(gameState);

        // Building footprint preview
        this.drawBuildPreview(gameState);

        // Entities (player + NPCs, Y-sorted, viewport culled)
        this.drawEntities(gameState);

        // Interact highlight
        this.drawInteractHighlight(gameState);

        // Meteor warning
        if (gameState.meteorWarning) {
            this.drawMeteorWarning(gameState.meteorWarning);
        }

        // Dust storm overlay
        if (this.dustStormAlpha > 0) {
            ctx.fillStyle = `rgba(180, 120, 60, ${this.dustStormAlpha * 0.3})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // Day/night cycle
        this.drawDayNight(gameState);
    },

    drawBuildPreview(gameState) {
        if (!Dialogue.active || !Dialogue.isBuildMenu) return;
        const item = Dialogue.buildItems[Dialogue.choiceIndex];
        if (!item) return;

        const def = BUILDING_DEFS[item.type];
        const col = Dialogue.buildCol;
        const row = Dialogue.buildRow;
        const canPlace = item.canPlace && item.canAfford && !item.locked;
        const ctx = this.ctx;

        ctx.globalAlpha = 0.3;
        ctx.fillStyle = canPlace ? '#27AE60' : '#C0392B';
        ctx.fillRect(
            col * TILE_SIZE + this.offsetX,
            row * TILE_SIZE + this.offsetY,
            def.width * TILE_SIZE,
            def.height * TILE_SIZE
        );
        ctx.globalAlpha = 1;

        ctx.strokeStyle = canPlace ? '#27AE60' : '#C0392B';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            col * TILE_SIZE + this.offsetX,
            row * TILE_SIZE + this.offsetY,
            def.width * TILE_SIZE,
            def.height * TILE_SIZE
        );
    },

    drawTerrain() {
        const scale = this.pixelScale;

        // Calculate visible tile range
        const startCol = Math.max(0, Math.floor(this.cameraX / TILE_SIZE));
        const startRow = Math.max(0, Math.floor(this.cameraY / TILE_SIZE));
        const endCol = Math.min(GRID_COLS, startCol + this.viewCols + 1);
        const endRow = Math.min(GRID_ROWS, startRow + this.viewRows + 1);

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const sprite = Grid.getTerrainSprite(r, c);
                const x = c * TILE_SIZE + this.offsetX;
                const y = r * TILE_SIZE + this.offsetY;
                drawSprite(this.ctx, sprite, x, y, scale);

                // Vegetation overlay
                const vegTier = Grid.greeningCache[r] ? Grid.greeningCache[r][c] : 0;
                if (vegTier > 0) {
                    const vegSprite = [null, SPRITES.LICHEN, SPRITES.SHRUB, SPRITES.GRASS, SPRITES.SMALL_TREE][vegTier];
                    if (vegSprite) {
                        this.ctx.globalAlpha = 0.7;
                        drawSprite(this.ctx, vegSprite, x, y, scale);
                        this.ctx.globalAlpha = 1;
                    }
                }
            }
        }
    },

    drawBuildings(gameState) {
        const ctx = this.ctx;
        const scale = this.pixelScale;

        for (const building of gameState.buildings) {
            const def = BUILDING_DEFS[building.type];
            const tiles = BUILDING_SPRITES[building.type];
            if (!tiles) continue;

            // Viewport culling for buildings
            const bx = building.col * TILE_SIZE + this.offsetX;
            const by = building.row * TILE_SIZE + this.offsetY;
            const bw = def.width * TILE_SIZE;
            const bh = def.height * TILE_SIZE;
            if (bx + bw < 0 || bx > this.width || by + bh < 0 || by > this.height) continue;

            const isOffline = building.offline || building.malfunctioning;
            const alpha = isOffline ? 0.5 : 1;

            if (alpha < 1) ctx.globalAlpha = alpha;

            for (const tile of tiles) {
                const x = (building.col + tile.dx) * TILE_SIZE + this.offsetX;
                const y = (building.row + tile.dy) * TILE_SIZE + this.offsetY;
                drawSprite(ctx, tile.sprite, x, y, scale);
            }

            this.drawBuildingAnimation(building, gameState.time);

            if (alpha < 1) ctx.globalAlpha = 1;

            if (isOffline) {
                const cx = (building.col + def.width / 2) * TILE_SIZE + this.offsetX;
                const cy = (building.row + def.height / 2) * TILE_SIZE + this.offsetY;
                if (Math.floor(gameState.time * 3) % 2 === 0) {
                    ctx.strokeStyle = COLORS.DANGER;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(cx - 8, cy - 8);
                    ctx.lineTo(cx + 8, cy + 8);
                    ctx.moveTo(cx + 8, cy - 8);
                    ctx.lineTo(cx - 8, cy + 8);
                    ctx.stroke();
                }
            }
        }
    },

    drawBuildingAnimation(building, time) {
        const ctx = this.ctx;
        if (building.offline || building.malfunctioning) return;

        const x = building.col * TILE_SIZE + this.offsetX;
        const y = building.row * TILE_SIZE + this.offsetY;

        switch (building.type) {
            case BUILDING.SOLAR_PANEL:
                if (Math.floor(time * 2) % 3 === 0) {
                    ctx.fillStyle = 'rgba(255, 255, 200, 0.15)';
                    ctx.fillRect(x + 8, y + 4, 16, 8);
                }
                break;

            case BUILDING.HABITAT:
                if (Math.floor(time * 1.5) % 4 < 3) {
                    ctx.fillStyle = 'rgba(255, 230, 150, 0.4)';
                    ctx.fillRect(x + 4, y + TILE_SIZE + 4, 8, 8);
                }
                break;

            case BUILDING.O2_GENERATOR: {
                const pulse = Math.sin(time * 4) * 0.2 + 0.3;
                ctx.fillStyle = `rgba(200, 240, 255, ${pulse})`;
                ctx.fillRect(x + 4, y + 20, 8, 4);
                ctx.fillRect(x + 20, y + 20, 8, 4);
                break;
            }

            case BUILDING.GREENHOUSE: {
                const glow = Math.sin(time * 2) * 0.1 + 0.15;
                ctx.fillStyle = `rgba(100, 200, 80, ${glow})`;
                ctx.fillRect(x + 8, y + 8, TILE_SIZE * 2 - 16, 16);
                break;
            }

            case BUILDING.WATER_EXTRACTOR: {
                const drip = (time * 2) % 1;
                ctx.fillStyle = COLORS.WATER;
                ctx.fillRect(x + 14, y + 20 + drip * 8, 4, 4);
                break;
            }

            case BUILDING.LANDING_PAD:
                if (Math.floor(time * 2) % 2 === 0) {
                    ctx.fillStyle = COLORS.POWER;
                    ctx.fillRect(x + 4, y + 4, 4, 4);
                    ctx.fillRect(x + TILE_SIZE * 2 - 8, y + 4, 4, 4);
                    ctx.fillRect(x + 4, y + TILE_SIZE * 2 - 8, 4, 4);
                    ctx.fillRect(x + TILE_SIZE * 2 - 8, y + TILE_SIZE * 2 - 8, 4, 4);
                }
                break;

            case BUILDING.COMMAND_CENTER: {
                // Blinking antenna light
                if (Math.floor(time * 3) % 2 === 0) {
                    ctx.fillStyle = COLORS.DANGER;
                    ctx.fillRect(x + 10, y + 2, 4, 4);
                }
                // Pulsing display
                const hqPulse = Math.sin(time * 2) * 0.15 + 0.3;
                ctx.fillStyle = `rgba(212, 168, 67, ${hqPulse})`;
                ctx.fillRect(x + 8, y + TILE_SIZE + 16, TILE_SIZE * 2 - 16, 8);
                break;
            }

            case BUILDING.SOLAR_FARM: {
                // Bright solar shimmer across the array
                const shimmer = Math.sin(time * 3 + x * 0.1) * 0.15 + 0.2;
                ctx.fillStyle = `rgba(255, 255, 180, ${shimmer})`;
                ctx.fillRect(x + 4, y + 4, TILE_SIZE * 2 - 8, 12);
                break;
            }

            case BUILDING.HYDROPONICS_LAB: {
                // Green hydro glow with flowing water
                const hydroGlow = Math.sin(time * 2.5) * 0.12 + 0.18;
                ctx.fillStyle = `rgba(80, 200, 120, ${hydroGlow})`;
                ctx.fillRect(x + 8, y + 8, TILE_SIZE * 2 - 16, 16);
                // Water channel shimmer
                const waterShift = (time * 1.5) % 1;
                ctx.fillStyle = `rgba(91, 143, 168, 0.3)`;
                ctx.fillRect(x + 12 + waterShift * 8, y + 24, 6, 3);
                break;
            }

            case BUILDING.MEDICAL_BAY: {
                // Pulsing red cross glow
                const medPulse = Math.sin(time * 3) * 0.2 + 0.3;
                ctx.fillStyle = `rgba(192, 57, 43, ${medPulse})`;
                ctx.fillRect(x + 10, y + 6, 12, 4);
                ctx.fillRect(x + 14, y + 2, 4, 12);
                break;
            }

            case BUILDING.RESEARCH_LAB: {
                // Scanning beam sweeping across
                const scanPos = ((time * 1.5) % 1) * (TILE_SIZE * 2 - 16);
                ctx.fillStyle = 'rgba(200, 240, 255, 0.35)';
                ctx.fillRect(x + 8 + scanPos, y + 8, 4, 16);
                break;
            }

            case BUILDING.FUSION_REACTOR: {
                // Plasma core glow — pulsing center
                const plasmaR = Math.sin(time * 4) * 3 + 8;
                const plasmaAlpha = Math.sin(time * 3) * 0.15 + 0.35;
                const cx = x + TILE_SIZE;
                const cy = y + TILE_SIZE;
                ctx.fillStyle = `rgba(212, 168, 67, ${plasmaAlpha})`;
                ctx.beginPath();
                ctx.arc(cx, cy, plasmaR, 0, Math.PI * 2);
                ctx.fill();
                // Secondary glow ring
                ctx.strokeStyle = `rgba(255, 200, 100, ${plasmaAlpha * 0.5})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, cy, plasmaR + 6, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }

            case BUILDING.TERRAFORMING_TOWER: {
                // Atmospheric particles rising
                for (let p = 0; p < 3; p++) {
                    const px = x + 16 + Math.sin(time * 2 + p * 2.1) * 12;
                    const py = y + 8 - ((time * 15 + p * 10) % 24);
                    const pAlpha = Math.max(0, 0.4 - ((time * 15 + p * 10) % 24) / 60);
                    ctx.fillStyle = `rgba(100, 200, 80, ${pAlpha})`;
                    ctx.fillRect(px, py, 3, 3);
                }
                break;
            }

            case BUILDING.BIODOME: {
                // Inner ecosystem glow
                const bioGlow = Math.sin(time * 1.5) * 0.1 + 0.15;
                ctx.fillStyle = `rgba(100, 200, 80, ${bioGlow})`;
                ctx.fillRect(x + 12, y + 12, TILE_SIZE * 2 - 24, TILE_SIZE - 8);
                // Water glint
                if (Math.floor(time * 2) % 3 === 0) {
                    ctx.fillStyle = 'rgba(91, 143, 168, 0.3)';
                    ctx.fillRect(x + 20, y + TILE_SIZE + 8, 16, 4);
                }
                break;
            }

            case BUILDING.ADVANCED_DRILL: {
                // Fast drill rotation — spinning indicator
                const drillAngle = (time * 6) % 1;
                const drillX = x + 14;
                const drillY = y + 4 + drillAngle * 4;
                ctx.fillStyle = COLORS.DANGER;
                ctx.fillRect(drillX, drillY, 4, 4);
                // Sparks
                if (Math.floor(time * 8) % 3 === 0) {
                    ctx.fillStyle = COLORS.POWER;
                    ctx.fillRect(x + 10 + Math.random() * 12, y + 24, 2, 2);
                }
                break;
            }

            case BUILDING.MINING_DRILL: {
                // Drill rotation
                const mdrillY = (time * 3) % 1;
                ctx.fillStyle = COLORS.DANGER;
                ctx.fillRect(x + 14, y + 2 + mdrillY * 4, 4, 4);
                break;
            }
        }
    },

    // Y-sorted rendering of player + all NPCs
    drawEntities(gameState) {
        const ctx = this.ctx;
        const scale = this.pixelScale;
        const ox = this.offsetX;
        const oy = this.offsetY;

        // Collect all entities with their sort Y
        const entities = [];

        // Player (always visible)
        entities.push({
            type: 'player',
            sortY: Player.getSortY(),
        });

        // NPCs — viewport cull
        for (const npc of NPC.list) {
            const sx = npc.x + ox;
            const sy = npc.y + oy;
            if (sx + TILE_SIZE < 0 || sx > this.width || sy + TILE_SIZE < 0 || sy > this.height) continue;
            entities.push({
                type: 'npc',
                npc,
                sortY: NPC.getSortY(npc),
            });
        }

        // Sort by Y (bottom of sprite)
        entities.sort((a, b) => a.sortY - b.sortY);

        // Draw
        for (const ent of entities) {
            if (ent.type === 'player') {
                Player.draw(ctx, ox, oy, scale);
            } else {
                NPC.draw(ctx, ent.npc, ox, oy, scale);
            }
        }
    },

    // Subtle highlight on the tile the player is facing
    drawInteractHighlight(gameState) {
        if (Dialogue.active || gameState.paused || gameState.gameOver) return;

        const facing = Player.getFacingTile();
        if (!facing) return;
        if (facing.col < 0 || facing.col >= GRID_COLS || facing.row < 0 || facing.row >= GRID_ROWS) return;

        const x = facing.col * TILE_SIZE + this.offsetX;
        const y = facing.row * TILE_SIZE + this.offsetY;

        this.ctx.strokeStyle = 'rgba(245, 230, 211, 0.35)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    },

    drawMeteorWarning(warning) {
        const ctx = this.ctx;
        const building = warning.target;
        const def = BUILDING_DEFS[building.type];
        const x = building.col * TILE_SIZE + this.offsetX;
        const y = building.row * TILE_SIZE + this.offsetY;
        const w = def.width * TILE_SIZE;
        const h = def.height * TILE_SIZE;

        if (Math.floor(warning.timeLeft * 4) % 2 === 0) {
            ctx.strokeStyle = COLORS.DANGER;
            ctx.lineWidth = 3;
            ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        }

        ctx.fillStyle = COLORS.DANGER;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', x + w / 2, y - 8);
    },

    drawDayNight(gameState) {
        const ctx = this.ctx;
        const solProgress = (gameState.solTime % SOL_DURATION) / SOL_DURATION;

        let nightAlpha = 0;
        let tintR = 10, tintG = 5, tintB = 30;

        if (solProgress < 0.05) {
            // Deep night
            nightAlpha = 0.45;
        } else if (solProgress < 0.15) {
            // Dawn — fade from night to warm sunrise
            const t = (solProgress - 0.05) / 0.10;
            nightAlpha = 0.45 * (1 - t);
            tintR = 10 + 50 * (1 - t);
            tintG = 5 + 20 * (1 - t);
            tintB = 30 * (1 - t);
        } else if (solProgress < 0.70) {
            // Day — no overlay
            nightAlpha = 0;
        } else if (solProgress < 0.80) {
            // Dusk — warm orange fade into night
            const t = (solProgress - 0.70) / 0.10;
            nightAlpha = 0.35 * t;
            tintR = 60 - 50 * t;
            tintG = 25 - 20 * t;
            tintB = 10 + 20 * t;
        } else {
            // Night — deepening darkness
            const t = (solProgress - 0.80) / 0.20;
            nightAlpha = 0.35 + 0.10 * t;
            tintR = 10;
            tintG = 5;
            tintB = 30;
        }

        // Apply night overlay
        if (nightAlpha > 0) {
            ctx.fillStyle = `rgba(${Math.round(tintR)}, ${Math.round(tintG)}, ${Math.round(tintB)}, ${nightAlpha})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // Stars during night phases (solProgress > 0.80 or < 0.10)
        if (solProgress > 0.80 || solProgress < 0.10) {
            const starAlpha = solProgress > 0.80
                ? Math.min(1, (solProgress - 0.80) / 0.10)
                : Math.max(0, 1 - solProgress / 0.10);
            this.drawStars(ctx, starAlpha * 0.6, gameState.time);
        }
    },

    drawStars(ctx, alpha, time) {
        if (alpha <= 0) return;

        // Fixed star positions (seeded from constants for consistency)
        for (let i = 0; i < 40; i++) {
            const sx = ((i * 7919 + 12345) % this.width);
            const sy = ((i * 104729 + 54321) % (this.height * 0.4)); // upper 40%
            const twinkle = Math.sin(time * 2 + i * 1.7) * 0.3 + 0.7;
            const size = (i % 3 === 0) ? 2 : 1;

            ctx.fillStyle = COLORS.UI_LIGHT;
            ctx.globalAlpha = alpha * twinkle;
            ctx.fillRect(sx, sy, size, size);
        }
        ctx.globalAlpha = 1;
    },
};
