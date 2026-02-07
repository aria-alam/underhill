// ============================================================
// Underhill — NPC System
// ============================================================

const NPC = {
    list: [],
    nextId: 1,

    // NPC names pool (with gender)
    NAMES_MALE: [
        'Marcus', 'Devon', 'Ravi', 'Oscar', 'Jonas',
        'Felix', 'Tariq', 'Axel', 'Chen', 'Hugo',
    ],
    NAMES_FEMALE: [
        'Yuki', 'Anya', 'Priya', 'Lena', 'Mirabel',
        'Kira', 'Solange', 'Nora', 'Valentina', 'Amara',
    ],

    // Suit colors for recoloring (replace palette index 18 = orange)
    SUIT_COLORS: [
        '#C0392B', // red
        '#2980B9', // blue
        '#27AE60', // green
        '#8E44AD', // purple
        '#D4A843', // gold
        '#E67E22', // dark orange
        '#1ABC9C', // teal
        '#E74C3C', // bright red
    ],

    // Portraits are now 16x16 from PORTRAITS object (sprites.js)
    // Gender-specific portrait selection happens in spawn()

    init() {
        this.list = [];
        this.nextId = 1;
    },

    spawn(gameState) {
        // Find a landing pad to spawn near
        const pad = gameState.buildings.find(b => b.type === BUILDING.LANDING_PAD);
        let spawnCol, spawnRow;

        if (pad) {
            const def = BUILDING_DEFS[BUILDING.LANDING_PAD];
            const near = Grid.findWalkableNear(pad.col + 1, pad.row + def.height, 5);
            if (near) {
                spawnCol = near.col;
                spawnRow = near.row;
            }
        }

        if (spawnCol === undefined) {
            // Fallback: spawn near HQ first, then center
            const hq = gameState.buildings.find(b => b.type === BUILDING.COMMAND_CENTER);
            if (hq) {
                const near = Grid.findWalkableNear(hq.col + 1, hq.row + 2, 8);
                if (near) {
                    spawnCol = near.col;
                    spawnRow = near.row;
                }
            }
            if (spawnCol === undefined) {
                const near = Grid.findWalkableNear(Math.floor(GRID_COLS / 2), Math.floor(GRID_ROWS / 2), 8);
                if (near) {
                    spawnCol = near.col;
                    spawnRow = near.row;
                } else {
                    return null; // no walkable tile found
                }
            }
        }

        // Assign random gender
        const gender = Math.random() < 0.5 ? 'male' : 'female';
        const namePool = gender === 'male' ? this.NAMES_MALE : this.NAMES_FEMALE;

        const usedNames = this.list.map(n => n.name);
        const availNames = namePool.filter(n => !usedNames.includes(n));
        const name = availNames.length > 0
            ? availNames[Math.floor(Math.random() * availNames.length)]
            : 'Colonist ' + this.nextId;

        const suitColor = this.SUIT_COLORS[Math.floor(Math.random() * this.SUIT_COLORS.length)];
        const portrait = gender === 'male' ? PORTRAITS.COLONIST_MALE : PORTRAITS.COLONIST_FEMALE;

        const npc = {
            id: this.nextId++,
            name,
            gender,
            suitColor,
            x: spawnCol * TILE_SIZE,
            y: spawnRow * TILE_SIZE,
            direction: 'down',
            walkFrame: 0,
            walkTimer: 0,
            state: 'idle',      // 'idle', 'walking', 'talking'
            idleTimer: NPC_IDLE_MIN + Math.random() * (NPC_IDLE_MAX - NPC_IDLE_MIN),
            targetX: 0,
            targetY: 0,
            homeCol: spawnCol,
            homeRow: spawnRow,
            dialogueQueue: [],
            portrait,
            activity: null,      // e.g. 'rock_samples' — visible work activity
            idleLines: null,     // custom idle dialogue (null = use generic)
            workTimer: 0,        // time remaining in 'working' state
            faction: FACTION.NEUTRAL,
            assignedBuildingId: null,
            sabotageTimer: 0,
        };

        this.list.push(npc);
        return npc;
    },

    update(dt, gameState) {
        for (const npc of this.list) {
            switch (npc.state) {
                case 'idle':
                    this._updateIdle(npc, dt, gameState);
                    break;
                case 'walking':
                    this._updateWalking(npc, dt);
                    break;
                case 'working':
                    this._updateWorking(npc, dt);
                    break;
                case 'talking':
                    // Frozen, facing player
                    break;
            }

            // Sabotage check for idle Red NPCs
            WorkSystem.checkSabotage(npc, dt, gameState);

            // Walk animation
            if (npc.state === 'walking') {
                npc.walkTimer += dt;
                if (npc.walkTimer >= 0.25) {
                    npc.walkTimer -= 0.25;
                    npc.walkFrame = (npc.walkFrame + 1) % 2;
                }
            } else {
                npc.walkFrame = 0;
                npc.walkTimer = 0;
            }
        }
    },

    _updateIdle(npc, dt, gameState) {
        npc.idleTimer -= dt;
        if (npc.idleTimer <= 0) {
            // Assigned NPCs: walk toward their building and work there
            if (npc.assignedBuildingId !== null && gameState) {
                const building = gameState.buildings.find(b => b.id === npc.assignedBuildingId);
                if (building) {
                    const def = BUILDING_DEFS[building.type];
                    const bCenterX = (building.col + def.width / 2) * TILE_SIZE;
                    const bCenterY = (building.row + def.height) * TILE_SIZE;
                    const distToBuilding = Math.sqrt((npc.x - bCenterX) ** 2 + (npc.y - bCenterY) ** 2);

                    if (distToBuilding < TILE_SIZE * 2) {
                        // Close enough — enter working state
                        npc.state = 'working';
                        npc.workTimer = 6 + Math.random() * 8;
                        // Face the building
                        if (npc.y > building.row * TILE_SIZE) {
                            npc.direction = 'up';
                        } else {
                            npc.direction = 'down';
                        }
                        return;
                    } else {
                        // Walk toward building
                        const dest = Grid.findWalkableNear(building.col + Math.floor(def.width / 2), building.row + def.height, 3);
                        if (dest) {
                            npc.targetX = dest.col * TILE_SIZE;
                            npc.targetY = dest.row * TILE_SIZE;
                            npc.state = 'walking';
                            return;
                        }
                    }
                }
            }

            // NPCs with an activity sometimes stop to work instead of walking
            if (npc.activity && Math.random() < 0.4) {
                npc.state = 'working';
                npc.workTimer = 4 + Math.random() * 6; // work for 4-10 seconds
                npc.direction = ['down', 'left', 'right'][Math.floor(Math.random() * 3)];
                return;
            }

            // Pick a random walkable tile within wander radius of home
            const targetCol = npc.homeCol + Math.floor(Math.random() * NPC_WANDER_RADIUS * 2) - NPC_WANDER_RADIUS;
            const targetRow = npc.homeRow + Math.floor(Math.random() * NPC_WANDER_RADIUS * 2) - NPC_WANDER_RADIUS;
            const dest = Grid.findWalkableNear(targetCol, targetRow, 2);
            if (dest) {
                npc.targetX = dest.col * TILE_SIZE;
                npc.targetY = dest.row * TILE_SIZE;
                npc.state = 'walking';
            } else {
                npc.idleTimer = NPC_IDLE_MIN + Math.random() * (NPC_IDLE_MAX - NPC_IDLE_MIN);
            }
        }
    },

    _updateWorking(npc, dt) {
        npc.workTimer -= dt;
        if (npc.workTimer <= 0) {
            npc.state = 'idle';
            npc.idleTimer = NPC_IDLE_MIN + Math.random() * (NPC_IDLE_MAX - NPC_IDLE_MIN);
        }
    },

    _updateWalking(npc, dt) {
        const dx = npc.targetX - npc.x;
        const dy = npc.targetY - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
            npc.x = npc.targetX;
            npc.y = npc.targetY;
            // Assigned NPCs go into a longer working state when reaching their destination
            if (npc.assignedBuildingId !== null) {
                npc.state = 'working';
                npc.workTimer = 6 + Math.random() * 8;
                return;
            }
            npc.state = 'idle';
            npc.idleTimer = NPC_IDLE_MIN + Math.random() * (NPC_IDLE_MAX - NPC_IDLE_MIN);
            return;
        }

        // Determine direction
        if (Math.abs(dx) >= Math.abs(dy)) {
            npc.direction = dx > 0 ? 'right' : 'left';
        } else {
            npc.direction = dy > 0 ? 'down' : 'up';
        }

        const speed = NPC_SPEED;
        const moveX = (dx / dist) * speed * dt;
        const moveY = (dy / dist) * speed * dt;
        const inset = PLAYER_HITBOX_INSET;

        // Try to move (with collision)
        const newX = npc.x + moveX;
        if (this._canMoveTo(newX, npc.y, inset)) {
            npc.x = newX;
        }
        const newY = npc.y + moveY;
        if (this._canMoveTo(npc.x, newY, inset)) {
            npc.y = newY;
        }

        // If stuck, go back to idle
        const newDist = Math.sqrt((npc.targetX - npc.x) ** 2 + (npc.targetY - npc.y) ** 2);
        if (Math.abs(newDist - dist) < 0.1) {
            npc.state = 'idle';
            npc.idleTimer = NPC_IDLE_MIN;
        }
    },

    _canMoveTo(px, py, inset) {
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

    draw(ctx, npc, offsetX, offsetY, scale) {
        const sprite = Player.sprites[npc.direction][npc.walkFrame];
        const px = Math.round(npc.x) + offsetX;
        let py = Math.round(npc.y) + offsetY;

        // Working bob: crouch down slightly, rhythmic motion
        if (npc.state === 'working') {
            py += Math.abs(Math.sin(Date.now() / 400)) * 3;
        }

        drawSpriteRecolor(ctx, sprite, px, py, scale, 18, npc.suitColor);

        // Working indicator (activity icon above head)
        if (npc.state === 'working' && (npc.activity || npc.assignedBuildingId !== null)) {
            this._drawActivityIcon(ctx, px, py, npc);
        }

        // Speech bubble only for important (story) dialogue, not event notifications
        if (npc.state !== 'talking' && npc.dialogueQueue.some(e => e.showBubble)) {
            this._drawSpeechBubble(ctx, px, py);
        }
    },

    _drawActivityIcon(ctx, px, py, npc) {
        const bx = px + TILE_SIZE / 2;
        const by = py - 10;
        const bob = Math.sin(Date.now() / 500) * 2;

        // Small floating icon
        ctx.fillStyle = 'rgba(44, 24, 16, 0.7)';
        ctx.beginPath();
        ctx.arc(bx, by + bob, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '10px monospace';
        ctx.textAlign = 'center';

        // Assigned workers show faction-colored tool icon
        if (npc.assignedBuildingId !== null) {
            ctx.fillStyle = FACTION_COLORS[npc.faction] || COLORS.METAL;
            ctx.fillText('⚒', bx, by + bob + 4);
        } else if (npc.activity === 'rock_samples') {
            ctx.fillStyle = COLORS.ROCK_LIGHT;
            ctx.fillText('⛏', bx, by + bob + 4);
        } else {
            ctx.fillStyle = COLORS.METAL;
            ctx.fillText('⚙', bx, by + bob + 4);
        }
        ctx.textAlign = 'left';
    },

    _drawSpeechBubble(ctx, px, py) {
        const bx = px + TILE_SIZE / 2;
        const by = py - 8;
        const bob = Math.sin(Date.now() / 300) * 2;

        ctx.fillStyle = COLORS.UI_LIGHT;
        ctx.beginPath();
        ctx.arc(bx, by + bob - 4, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = COLORS.UI_DARK;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', bx, by + bob - 1);
        ctx.textAlign = 'left';
    },

    findAtTile(col, row) {
        for (const npc of this.list) {
            const nc = Math.round(npc.x / TILE_SIZE);
            const nr = Math.round(npc.y / TILE_SIZE);
            if (nc === col && nr === row) return npc;
        }
        return null;
    },

    queueDialogue(npcId, entry) {
        const npc = this.list.find(n => n.id === npcId);
        if (npc) {
            npc.dialogueQueue.push(entry);
        }
    },

    // Remove a random NPC (for colonist death)
    removeRandom(gameState) {
        if (this.list.length === 0) return null;
        const idx = Math.floor(Math.random() * this.list.length);
        const removed = this.list.splice(idx, 1)[0];
        // Clear building assignment when NPC dies
        if (removed && gameState) {
            WorkSystem.clearNpcFromBuilding(removed, gameState);
        }
        return removed;
    },

    // Get sort Y for a given NPC (bottom of sprite)
    getSortY(npc) {
        return npc.y + TILE_SIZE;
    },
};
