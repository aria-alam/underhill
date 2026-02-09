// ============================================================
// Underhill — Save/Load System
// ============================================================

const Save = {
    SAVE_KEY: 'mars_colony_save',
    autoSaveTimer: 0,

    save(gameState) {
        const data = {
            version: 6,
            colonyMode: gameState.colonyMode || 'chill',
            peakPopulation: gameState.peakPopulation || 0,
            unlockedTiers: gameState.unlockedTiers || [1],
            terraformPoints: gameState.terraformPoints || 0,
            greenMorale: gameState.greenMorale || MORALE_START,
            redMorale: gameState.redMorale || MORALE_START,
            factionsExplained: gameState.factionsExplained || false,
            resources: gameState.resources,
            buildings: gameState.buildings.map(b => ({
                id: b.id,
                type: b.type,
                col: b.col,
                row: b.row,
                active: b.active,
                offline: b.offline,
                assignedNpcId: b.assignedNpcId || null,
            })),
            sol: gameState.sol,
            solTime: gameState.solTime,
            time: gameState.time,
            achievements: gameState.achievements,
            hadPopulation: gameState.hadPopulation,
            nextBuildingId: Buildings.nextId,
            // Player data
            player: {
                x: Player.x,
                y: Player.y,
                direction: Player.direction,
                hp: Player.hp,
                energy: Player.energy,
                hunger: Player.hunger,
                name: Player.name,
                gender: Player.gender,
            },
            // NPC data
            npcs: NPC.list.map(n => ({
                id: n.id,
                name: n.name,
                gender: n.gender || 'male',
                suitColor: n.suitColor,
                x: n.x,
                y: n.y,
                direction: n.direction,
                homeCol: n.homeCol,
                homeRow: n.homeRow,
                dialogueQueue: n.dialogueQueue,
                activity: n.activity || null,
                idleLines: n.idleLines || null,
                faction: n.faction || FACTION.NEUTRAL,
                assignedBuildingId: n.assignedBuildingId || null,
            })),
            npcNextId: NPC.nextId,
        };

        try {
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Save failed:', e);
            return false;
        }
    },

    load() {
        try {
            const raw = localStorage.getItem(this.SAVE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            // Accept v5 or v6 saves (backward compatible)
            if (data.version !== 5 && data.version !== 6) {
                console.warn('Incompatible save version', data.version, '— deleting old save.');
                this.deleteSave();
                return null;
            }
            return data;
        } catch (e) {
            console.error('Load failed:', e);
            return null;
        }
    },

    hasSave() {
        return localStorage.getItem(this.SAVE_KEY) !== null;
    },

    deleteSave() {
        try { localStorage.removeItem(this.SAVE_KEY); } catch(e) {}
    },

    applyLoad(gameState, data) {
        // Restore resources
        gameState.resources = data.resources;
        gameState.sol = data.sol;
        gameState.solTime = data.solTime;
        gameState.time = data.time || 0;
        gameState.achievements = data.achievements || [];
        gameState.hadPopulation = data.hadPopulation || false;
        gameState.colonyMode = data.colonyMode || 'chill';
        gameState.peakPopulation = data.peakPopulation || 0;
        gameState.unlockedTiers = data.unlockedTiers || [1];
        gameState.terraformPoints = data.terraformPoints || 0;
        gameState.terraformPercent = Math.min(100, (gameState.terraformPoints / TERRAFORM_GOAL) * 100);
        gameState.terraformWon = gameState.terraformPercent >= TERRAFORM_WIN_PERCENT;
        gameState.greenMorale = data.greenMorale || MORALE_START;
        gameState.redMorale = data.redMorale || MORALE_START;
        gameState.factionsExplained = data.factionsExplained || false;
        Buildings.nextId = data.nextBuildingId || 1;

        // Restore buildings
        gameState.buildings = data.buildings.map(b => ({
            ...b,
            malfunctioning: false,
            malfunctionTimer: 0,
            assignedNpcId: b.assignedNpcId || null,
            sabotaged: false,
            sabotageTimer: 0,
        }));

        // Rebuild grid occupation
        Grid.init();
        for (const building of gameState.buildings) {
            const def = BUILDING_DEFS[building.type];
            // Clear dark rock under buildings (especially HQ)
            for (let r = building.row; r < building.row + def.height; r++) {
                for (let c = building.col; c < building.col + def.width; c++) {
                    if (Grid.tiles[r] && Grid.tiles[r][c] === TERRAIN.DARK_ROCK) {
                        Grid.tiles[r][c] = TERRAIN.SAND;
                    }
                }
            }
            Grid.placeBuilding(building.col, building.row, def.width, def.height, building.id);
        }

        // Recalculate derived state
        Buildings.recalculate(gameState);

        // Restore player position, stats, and identity
        if (data.player) {
            Player.x = data.player.x;
            Player.y = data.player.y;
            Player.direction = data.player.direction || 'down';
            Player.hp = data.player.hp !== undefined ? data.player.hp : PLAYER_MAX_HP;
            Player.energy = data.player.energy !== undefined ? data.player.energy : PLAYER_MAX_ENERGY;
            Player.hunger = data.player.hunger !== undefined ? data.player.hunger : PLAYER_MAX_HUNGER;
            Player.name = data.player.name || 'Commander';
            Player.gender = data.player.gender || 'male';
            Player.portrait = Player.gender === 'female' ? PORTRAITS.PLAYER_FEMALE : PORTRAITS.PLAYER_MALE;
        }

        // Restore NPCs
        NPC.init();
        if (data.npcs) {
            NPC.nextId = data.npcNextId || 1;
            for (const nd of data.npcs) {
                const gender = nd.gender || 'male';
                let portrait;
                if (nd.name === 'Dr. Kimura' || nd.name === 'Dr. Russell') {
                    portrait = PORTRAITS.DR_RUSSELL;
                } else {
                    portrait = gender === 'female' ? PORTRAITS.COLONIST_FEMALE : PORTRAITS.COLONIST_MALE;
                }
                const faction = nd.faction || FACTION.NEUTRAL;
                const npc = {
                    id: nd.id,
                    name: nd.name,
                    gender,
                    suitColor: nd.suitColor,
                    x: nd.x,
                    y: nd.y,
                    direction: nd.direction || 'down',
                    walkFrame: 0,
                    walkTimer: 0,
                    state: 'idle',
                    idleTimer: NPC_IDLE_MIN + Math.random() * (NPC_IDLE_MAX - NPC_IDLE_MIN),
                    targetX: 0,
                    targetY: 0,
                    homeCol: nd.homeCol,
                    homeRow: nd.homeRow,
                    dialogueQueue: nd.dialogueQueue || [],
                    portrait,
                    activity: nd.activity || null,
                    idleLines: nd.idleLines || null,
                    workTimer: 0,
                    faction,
                    assignedBuildingId: nd.assignedBuildingId || null,
                    sabotageTimer: 0,
                };
                NPC.list.push(npc);
                if (npc.id >= NPC.nextId) NPC.nextId = npc.id + 1;
            }
        }
    },

    updateAutoSave(gameState, dt) {
        this.autoSaveTimer += dt;
        if (this.autoSaveTimer >= AUTO_SAVE_INTERVAL) {
            this.autoSaveTimer = 0;
            this.save(gameState);
        }
    },
};
