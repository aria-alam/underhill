// ============================================================
// Underhill — Buildings System
// ============================================================

const Buildings = {
    nextId: 1,

    // Create a new building instance
    create(type, col, row) {
        return {
            id: this.nextId++,
            type,
            col,
            row,
            active: true,
            offline: false,
            malfunctioning: false,
            malfunctionTimer: 0,
            assignedNpcId: null,
            sabotaged: false,
            sabotageTimer: 0,
        };
    },

    // Try to place a building
    place(gameState, type, col, row) {
        const def = BUILDING_DEFS[type];
        if (!def) return false;

        // Check placement validity
        if (!Grid.canPlace(col, row, def.width, def.height)) return false;

        // Check material cost
        if (gameState.resources[RESOURCE.MATERIALS] < def.cost) return false;

        // Deduct cost
        gameState.resources[RESOURCE.MATERIALS] -= def.cost;

        // Create building
        const building = this.create(type, col, row);

        // Mark grid tiles as occupied
        Grid.placeBuilding(col, row, def.width, def.height, building.id);

        // Add to game state
        gameState.buildings.push(building);

        // Update derived state
        this.recalculate(gameState);
        Grid.greeningDirty = true;

        // Landing pad tip
        if (type === BUILDING.LANDING_PAD) {
            UI.addNotification('Landing Pad built! Colonists will arrive when you have housing capacity.', 'info');
        }

        // Nudge player if they're standing on the new building
        const pt = Player.getTile();
        if (pt.col >= col && pt.col < col + def.width &&
            pt.row >= row && pt.row < row + def.height) {
            const safe = Grid.findWalkableNear(col, row, 3);
            if (safe) {
                Player.x = safe.col * TILE_SIZE;
                Player.y = safe.row * TILE_SIZE;
            }
        }

        // Check if player or any NPC is now boxed in
        this._unstickEntity(Player, gameState);
        if (typeof NPC !== 'undefined') {
            for (const npc of NPC.list) {
                this._unstickEntity(npc, gameState);
            }
        }

        return true;
    },

    // Check if an entity is enclosed by doing a BFS to see if they can
    // reach a tile far from the colony center. If not, teleport them out.
    _unstickEntity(entity, gameState) {
        const eCol = Math.floor(entity.x / TILE_SIZE);
        const eRow = Math.floor(entity.y / TILE_SIZE);
        const hq = gameState.buildings[0];
        if (!hq) return;
        const hcx = hq.col + 1;
        const hcy = hq.row + 1;

        // If already far from colony center, no risk of being boxed
        if (Math.abs(eCol - hcx) > 20 || Math.abs(eRow - hcy) > 20) return;

        // BFS: can the entity reach a tile 18+ manhattan distance from HQ?
        const visited = new Set();
        const queue = [{ c: eCol, r: eRow }];
        visited.add(eCol + ',' + eRow);
        let escaped = false;
        let steps = 0;

        while (queue.length > 0 && steps < 800 && !escaped) {
            const { c, r } = queue.shift();
            steps++;
            if (Math.abs(c - hcx) + Math.abs(r - hcy) > 18) {
                escaped = true;
                break;
            }
            for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                const nc = c + dc;
                const nr = r + dr;
                const key = nc + ',' + nr;
                if (!visited.has(key) && nc >= 0 && nc < GRID_COLS &&
                    nr >= 0 && nr < GRID_ROWS && Grid.isWalkable(nc, nr)) {
                    visited.add(key);
                    queue.push({ c: nc, r: nr });
                }
            }
        }

        if (escaped) return;

        // Trapped — teleport far from colony
        const name = entity.name || 'Player';
        console.log(`[Buildings] ${name} trapped at (${eCol},${eRow}) — teleporting out`);
        for (let d = 15; d < 40; d++) {
            for (const [dc, dr] of [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,d],[d,-d],[-d,-d]]) {
                const tc = hcx + dc;
                const tr = hcy + dr;
                if (tc >= 0 && tc < GRID_COLS && tr >= 0 && tr < GRID_ROWS &&
                    Grid.isWalkable(tc, tr)) {
                    entity.x = tc * TILE_SIZE;
                    entity.y = tr * TILE_SIZE;
                    if (entity.moveTarget) entity.moveTarget = null;
                    return;
                }
            }
        }
    },

    // Remove a building (e.g., meteor strike)
    remove(gameState, buildingId) {
        const idx = gameState.buildings.findIndex(b => b.id === buildingId);
        if (idx === -1) return false;

        const building = gameState.buildings[idx];
        const def = BUILDING_DEFS[building.type];

        // Protect indestructible buildings (HQ)
        if (def.indestructible) return false;

        // Clear NPC assignment when building is destroyed
        WorkSystem.unassignBuilding(building, NPC.list);

        // Free grid tiles
        Grid.removeBuilding(building.col, building.row, def.width, def.height);

        // Remove from array
        gameState.buildings.splice(idx, 1);

        // Recalculate
        this.recalculate(gameState);
        Grid.greeningDirty = true;
        return true;
    },

    // Recalculate derived values (population capacity, max storage)
    recalculate(gameState) {
        let popCap = 0;
        let storageBonus = 0;

        for (const building of gameState.buildings) {
            const def = BUILDING_DEFS[building.type];
            if (def.popCapacity) popCap += def.popCapacity;
            if (def.storageBonus) storageBonus += def.storageBonus;
        }

        gameState.popCapacity = popCap;

        // Update max storage
        gameState.maxStorage = {};
        for (const key of Object.keys(STARTING_MAX_STORAGE)) {
            if (key === RESOURCE.POPULATION) {
                gameState.maxStorage[key] = popCap;
            } else {
                gameState.maxStorage[key] = STARTING_MAX_STORAGE[key] + storageBonus;
            }
        }
    },

    // Calculate adjacency bonus multiplier for a building (0 = no bonus, e.g. 0.25 = +25%)
    getAdjacencyBonus(building, gameState) {
        const rule = ADJACENCY_BONUSES[building.type];
        if (!rule) return 0;

        const def = BUILDING_DEFS[building.type];
        const r = ADJACENCY_RADIUS;

        // Scan all tiles within radius of the building's footprint
        const minRow = building.row - r;
        const maxRow = building.row + def.height - 1 + r;
        const minCol = building.col - r;
        const maxCol = building.col + def.width - 1 + r;

        if (rule.nearType) {
            const nearTypes = Array.isArray(rule.nearType) ? rule.nearType : [rule.nearType];
            for (const other of gameState.buildings) {
                if (other.id === building.id) continue;
                if (!nearTypes.includes(other.type)) continue;
                if (other.offline || other.malfunctioning) continue;
                const oDef = BUILDING_DEFS[other.type];
                // Check if any tile of 'other' falls within the radius zone
                const oMaxCol = other.col + oDef.width - 1;
                const oMaxRow = other.row + oDef.height - 1;
                if (oMaxCol >= minCol && other.col <= maxCol &&
                    oMaxRow >= minRow && other.row <= maxRow) {
                    return rule.bonus;
                }
            }
        }

        if (rule.nearTerrain) {
            for (let row = Math.max(0, minRow); row <= Math.min(GRID_ROWS - 1, maxRow); row++) {
                for (let col = Math.max(0, minCol); col <= Math.min(GRID_COLS - 1, maxCol); col++) {
                    if (Grid.tiles[row] && Grid.tiles[row][col] === rule.nearTerrain) {
                        return rule.bonus;
                    }
                }
            }
        }

        return 0;
    },

    // Get Research Lab bonus for a building (0 or RESEARCH_LAB_BONUS)
    // One Research Lab per bonus — multiple don't stack on the same building
    getResearchLabBonus(building, gameState) {
        const def = BUILDING_DEFS[building.type];
        // Research Labs don't boost themselves
        if (building.type === BUILDING.RESEARCH_LAB) return 0;
        const r = RESEARCH_LAB_RANGE;
        const minRow = building.row - r;
        const maxRow = building.row + def.height - 1 + r;
        const minCol = building.col - r;
        const maxCol = building.col + def.width - 1 + r;

        for (const lab of gameState.buildings) {
            if (lab.type !== BUILDING.RESEARCH_LAB) continue;
            if (lab.offline || lab.malfunctioning || !lab.active) continue;
            const labDef = BUILDING_DEFS[lab.type];
            const labMaxCol = lab.col + labDef.width - 1;
            const labMaxRow = lab.row + labDef.height - 1;
            if (labMaxCol >= minCol && lab.col <= maxCol &&
                labMaxRow >= minRow && lab.row <= maxRow) {
                return RESEARCH_LAB_BONUS;
            }
        }
        return 0;
    },

    // Check if colony has any active Medical Bay
    hasMedicalBay(gameState) {
        return gameState.buildings.some(b =>
            b.type === BUILDING.MEDICAL_BAY && !b.offline && !b.malfunctioning
        );
    },

    // Check if colony has a landing pad
    hasLandingPad(gameState) {
        return gameState.buildings.some(b => b.type === BUILDING.LANDING_PAD && !b.offline && !b.malfunctioning);
    },

    // Get a random active building (for malfunction/meteor events) — excludes indestructible
    getRandomActive(gameState) {
        const active = gameState.buildings.filter(b => {
            if (b.offline || b.malfunctioning) return false;
            const def = BUILDING_DEFS[b.type];
            if (def.indestructible) return false;
            return true;
        });
        if (active.length === 0) return null;
        return active[Math.floor(Math.random() * active.length)];
    },
};
