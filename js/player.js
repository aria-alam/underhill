// ============================================================
// Underhill — Player Character
// ============================================================

const Player = {
    x: 0,           // pixel position (top-left of player tile)
    y: 0,
    moveX: 0,       // movement input (-1, 0, 1)
    moveY: 0,
    direction: 'down', // 'up', 'down', 'left', 'right'
    walkFrame: 0,
    walkTimer: 0,
    moveTarget: null,  // for tap-to-move {x, y}

    // Identity
    name: 'Commander',
    gender: 'male',
    portrait: null,    // set during character creation (PORTRAITS.PLAYER_MALE/FEMALE)

    // Survival stats
    hp: PLAYER_MAX_HP,
    energy: PLAYER_MAX_ENERGY,
    hunger: PLAYER_MAX_HUNGER,
    speedMultiplier: 1,

    // 8x8 astronaut sprites — Pokemon GBC style with dark outlines (19)
    // Orange suit (18), white helmet (20), blue visor (7), highlight (10), metal (5)
    // Chibi proportions: big helmet head, compact body
    sprites: {
        down: [
            // Standing
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19,20,10, 7, 7,20,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,18,18,18,18,18, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,19,18,19,18,19, 0, 0],
                [ 0, 0,19, 0,19, 0, 0, 0],
            ],
            // Walking
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19,20,10, 7, 7,20,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,18,18,18,18,18, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,18,19, 0,19,18, 0, 0],
                [ 0,19, 0, 0, 0,19, 0, 0],
            ],
        ],
        up: [
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19,20,20, 5,20,20,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,18,18,18,18,18, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,19,18,19,18,19, 0, 0],
                [ 0, 0,19, 0,19, 0, 0, 0],
            ],
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19,20,20, 5,20,20,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,18,18,18,18,18, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,18,19, 0,19,18, 0, 0],
                [ 0,19, 0, 0, 0,19, 0, 0],
            ],
        ],
        left: [
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19, 7,10,20,20,20,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,19,18,18,18,19, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,19,18,19,18,19, 0, 0],
                [ 0, 0,19, 0,19, 0, 0, 0],
            ],
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19, 7,10,20,20,20,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,19,18,18,18,19, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,18,19, 0,19,18, 0, 0],
                [ 0,19, 0, 0, 0,19, 0, 0],
            ],
        ],
        right: [
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19,20,20,20,10, 7,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,19,18,18,18,19, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,19,18,19,18,19, 0, 0],
                [ 0, 0,19, 0,19, 0, 0, 0],
            ],
            [
                [ 0,19,20,20,20,19, 0, 0],
                [19,20,20,20,20,20,19, 0],
                [19,20,20,20,10, 7,19, 0],
                [ 0,19,20,20,20,19, 0, 0],
                [ 0,19,18,18,18,19, 0, 0],
                [ 0,19,18, 5,18,19, 0, 0],
                [ 0,18,19, 0,19,18, 0, 0],
                [ 0,19, 0, 0, 0,19, 0, 0],
            ],
        ],
    },

    init(col, row) {
        this.x = col * TILE_SIZE;
        this.y = row * TILE_SIZE;
        this.direction = 'down';
        this.walkFrame = 0;
        this.walkTimer = 0;
        this.moveX = 0;
        this.moveY = 0;
        this.moveTarget = null;
        this.hp = PLAYER_MAX_HP;
        this.energy = PLAYER_MAX_ENERGY;
        this.hunger = PLAYER_MAX_HUNGER;
        this.speedMultiplier = 1;
    },

    update(dt) {
        let dx = this.moveX;
        let dy = this.moveY;

        // Tap-to-move
        if (this.moveTarget && dx === 0 && dy === 0) {
            const tdx = this.moveTarget.x - this.x;
            const tdy = this.moveTarget.y - this.y;
            if (Math.abs(tdx) > 2) dx = tdx > 0 ? 1 : -1;
            if (Math.abs(tdy) > 2) dy = tdy > 0 ? 1 : -1;
            if (Math.abs(tdx) <= 2 && Math.abs(tdy) <= 2) {
                this.moveTarget = null;
            }
        }

        // Speed multiplier: half speed when energy is 0
        this.speedMultiplier = this.energy <= 0 ? 0.5 : 1;

        if (dx === 0 && dy === 0) {
            this.walkFrame = 0;
            this.walkTimer = 0;
            return;
        }

        // Update direction based on input
        if (Math.abs(dx) >= Math.abs(dy)) {
            this.direction = dx > 0 ? 'right' : 'left';
        } else {
            this.direction = dy > 0 ? 'down' : 'up';
        }

        // Walk animation
        this.walkTimer += dt;
        if (this.walkTimer >= 0.2) {
            this.walkTimer -= 0.2;
            this.walkFrame = (this.walkFrame + 1) % 2;
        }

        const speed = PLAYER_SPEED * this.speedMultiplier;
        const inset = PLAYER_HITBOX_INSET;

        // Axis-separated collision: move X first, then Y
        const newX = this.x + dx * speed * dt;
        if (this._canMoveTo(newX, this.y, inset)) {
            this.x = newX;
        }

        const newY = this.y + dy * speed * dt;
        if (this._canMoveTo(this.x, newY, inset)) {
            this.y = newY;
        }

        // Clamp to grid bounds
        this.x = Math.max(0, Math.min(this.x, (GRID_COLS - 1) * TILE_SIZE));
        this.y = Math.max(0, Math.min(this.y, (GRID_ROWS - 1) * TILE_SIZE));

        // If completely stuck (can't move in any direction), warp to nearest walkable tile
        if (dx !== 0 || dy !== 0) {
            const canMoveAnywhere =
                this._canMoveTo(this.x + 1, this.y, inset) ||
                this._canMoveTo(this.x - 1, this.y, inset) ||
                this._canMoveTo(this.x, this.y + 1, inset) ||
                this._canMoveTo(this.x, this.y - 1, inset);
            if (!canMoveAnywhere) {
                const col = Math.round(this.x / TILE_SIZE);
                const row = Math.round(this.y / TILE_SIZE);
                const safe = Grid.findWalkableNear(col, row, 10);
                if (safe) {
                    this.x = safe.col * TILE_SIZE;
                    this.y = safe.row * TILE_SIZE;
                }
            }
        }
    },

    // Update survival stats
    updateStats(dt, gameState) {
        const isMoving = this.moveX !== 0 || this.moveY !== 0;

        // Energy drain
        const energyDrain = isMoving ? ENERGY_DRAIN_MOVING : ENERGY_DRAIN_IDLE;
        this.energy = Math.max(0, this.energy - energyDrain * dt);

        // Hunger drain
        this.hunger = Math.max(0, this.hunger - HUNGER_DRAIN * dt);

        // Starvation damage
        if (this.hunger <= 0) {
            this.hp -= STARVATION_DAMAGE * dt;
        }

        // Night cold damage (if not sheltered)
        if (gameState.isNighttime && !this.isSheltered(gameState)) {
            this.hp -= NIGHT_COLD_DAMAGE * dt;
        }

        // Dust storm damage
        if (gameState.dustStormActive) {
            this.hp -= STORM_DAMAGE * dt;
        }

        // Medical Bay passive healing: +0.5 HP/s when near a staffed Medical Bay
        this._healFromMedBay(dt, gameState);

        // Clamp HP
        this.hp = Math.max(0, Math.min(this.hp, PLAYER_MAX_HP));

        // Pass out check
        if (this.hp <= 0) {
            this.passOut(gameState);
        }
    },

    isNighttime(gameState) {
        const solProgress = (gameState.solTime % SOL_DURATION) / SOL_DURATION;
        return solProgress > 0.75 || solProgress < 0.1;
    },

    isSheltered(gameState) {
        const pcol = Math.round(this.x / TILE_SIZE);
        const prow = Math.round(this.y / TILE_SIZE);

        for (const building of gameState.buildings) {
            const def = BUILDING_DEFS[building.type];
            // Check if player is within shelter radius of any tile of any building
            for (let r = building.row; r < building.row + def.height; r++) {
                for (let c = building.col; c < building.col + def.width; c++) {
                    if (Math.abs(pcol - c) <= HQ_SHELTER_RADIUS && Math.abs(prow - r) <= HQ_SHELTER_RADIUS) {
                        return true;
                    }
                }
            }
        }
        return false;
    },

    passOut(gameState) {
        this.hp = PASSOUT_STAT_VALUE;
        this.energy = PASSOUT_STAT_VALUE;
        this.hunger = PASSOUT_STAT_VALUE;

        // Teleport to HQ
        const hq = gameState.buildings.find(b => b.type === BUILDING.COMMAND_CENTER);
        if (hq) {
            const safe = Grid.findWalkableNear(hq.col + 1, hq.row + 2, 3);
            if (safe) {
                this.x = safe.col * TILE_SIZE;
                this.y = safe.row * TILE_SIZE;
            }
        }

        // Time penalty
        gameState.solTime += PASSOUT_TIME_PENALTY;

        UI.addNotification('You passed out! Woke up at HQ...', 'danger');
    },

    _healFromMedBay(dt, gameState) {
        const pcol = Math.round(this.x / TILE_SIZE);
        const prow = Math.round(this.y / TILE_SIZE);
        for (const building of gameState.buildings) {
            if (building.type !== BUILDING.MEDICAL_BAY) continue;
            if (building.offline || building.malfunctioning) continue;
            if (!building.assignedNpcId) continue; // must be staffed
            const dist = Math.max(
                Math.abs(pcol - building.col),
                Math.abs(prow - building.row)
            );
            if (dist <= MEDICAL_BAY_RANGE) {
                this.hp += MEDICAL_BAY_HEAL_RATE * dt;
                return;
            }
        }
    },

    _canMoveTo(px, py, inset) {
        // Check all four corners of the inset hitbox
        const left   = px + inset;
        const right  = px + TILE_SIZE - inset - 1;
        const top    = py + inset;
        const bottom = py + TILE_SIZE - inset - 1;

        const corners = [
            { col: Math.floor(left / TILE_SIZE),  row: Math.floor(top / TILE_SIZE) },
            { col: Math.floor(right / TILE_SIZE), row: Math.floor(top / TILE_SIZE) },
            { col: Math.floor(left / TILE_SIZE),  row: Math.floor(bottom / TILE_SIZE) },
            { col: Math.floor(right / TILE_SIZE), row: Math.floor(bottom / TILE_SIZE) },
        ];

        for (const c of corners) {
            if (!Grid.isWalkable(c.col, c.row)) return false;
        }
        return true;
    },

    draw(ctx, offsetX, offsetY, scale) {
        const sprite = this.sprites[this.direction][this.walkFrame];
        const px = Math.round(this.x) + offsetX;
        const py = Math.round(this.y) + offsetY;
        drawSprite(ctx, sprite, px, py, scale);
    },

    // Get the tile the player is facing
    getFacingTile() {
        const pcol = Math.round(this.x / TILE_SIZE);
        const prow = Math.round(this.y / TILE_SIZE);
        switch (this.direction) {
            case 'up':    return { col: pcol, row: prow - 1 };
            case 'down':  return { col: pcol, row: prow + 1 };
            case 'left':  return { col: pcol - 1, row: prow };
            case 'right': return { col: pcol + 1, row: prow };
        }
    },

    // Get the tile the player is currently standing on
    getTile() {
        return {
            col: Math.round(this.x / TILE_SIZE),
            row: Math.round(this.y / TILE_SIZE),
        };
    },

    // Get Y position for sorting (bottom of sprite)
    getSortY() {
        return this.y + TILE_SIZE;
    },
};
