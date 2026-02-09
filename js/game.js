// ============================================================
// Underhill — Main Game Loop & State
// ============================================================

const Game = {
    state: null,
    lastTimestamp: 0,
    started: false,

    createState() {
        return {
            resources: { ...STARTING_RESOURCES },
            maxStorage: { ...STARTING_MAX_STORAGE },
            buildings: [],
            paused: false,
            time: 0,
            sol: 1,
            solTime: 0,
            popCapacity: 0,
            production: {},
            consumption: {},
            netRates: {},
            dustStormActive: false,
            meteorWarning: null,
            gameOver: false,
            gameOverReason: '',
            hadPopulation: false,
            dyingTimer: 0,
            peakPopulation: 0,
            unlockedTiers: [1],  // track which tiers have been unlocked (for notifications)
            achievements: [],
            isNighttime: false,
            colonyMode: 'chill',
            terraformPoints: 0,
            terraformPercent: 0,
            terraformWon: false,
            greenMorale: MORALE_START,
            redMorale: MORALE_START,
            greeningTimer: 0,
            factionsExplained: false,
        };
    },

    isTestMode: false,

    init() {
        const canvas = document.getElementById('gameCanvas');
        this.state = this.createState();
        this.isTestMode = new URLSearchParams(window.location.search).has('test')
            || window.location.hash === '#test';

        // Initialize subsystems
        Grid.init();
        Renderer.init(canvas);
        UI.init();
        Events.init();
        if (typeof Music !== 'undefined') Music.init();
        Resources.init(this.state);
        NPC.init();

        // Input must be initialized after Player and Dialogue exist
        Input.init(canvas, this.state);

        // Test mode skips saved games and intro
        if (this.isTestMode) {
            Save.deleteSave();
            this._initTestMode();
        } else {
            const saveData = Save.load();
            if (saveData) {
                Save.applyLoad(this.state, saveData);
                UI.addNotification('Game loaded!', 'success');
            } else {
                // New game: place HQ and spawn player
                this._placeHQ(Math.floor(GRID_COLS / 2) - 1, Math.floor(GRID_ROWS / 2) - 1);
                const hq = this.state.buildings[0];
                const spawn = Grid.findWalkableNear(hq.col + 1, hq.row + 2, 5);
                if (spawn) {
                    Player.init(spawn.col, spawn.row);
                } else {
                    Player.init(Math.floor(GRID_COLS / 2), Math.floor(GRID_ROWS / 2) + 2);
                }
                // Spawn starting crew member
                this._spawnStartingCrew();
                // Show intro
                this._showIntro();
            }
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            Renderer.resize();
        });

        // Start loop
        this.started = true;
        this.lastTimestamp = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    },

    newGame() {
        console.log('[newGame] starting');
        try {
            try { Save.deleteSave(); } catch(e) { console.warn('deleteSave:', e); }
            this.state = this.createState();
            Grid.init();
            Resources.init(this.state);
            Events.init();
            UI.init();
            NPC.init();
            if (typeof Music !== 'undefined') {
                try { Music.init(); } catch(e) { console.warn('Music.init:', e); }
            }
            // Kill any active dialogue without firing its onClose callback
            // (prevents intro's callback from opening character creation in the new game)
            Dialogue.onClose = null;
            Dialogue.close();

            // Update input's reference to the new game state
            Input.init(document.getElementById('gameCanvas'), this.state);
            Renderer.dustStormAlpha = 0;

            if (this.isTestMode) {
                this._initTestMode();
                return;
            }

            // Place HQ at center
            this._placeHQ(Math.floor(GRID_COLS / 2) - 1, Math.floor(GRID_ROWS / 2) - 1);

            // Spawn player adjacent to HQ
            const hq = this.state.buildings[0];
            const spawn = Grid.findWalkableNear(hq.col + 1, hq.row + 2, 5);
            if (spawn) {
                Player.init(spawn.col, spawn.row);
            } else {
                Player.init(Math.floor(GRID_COLS / 2), Math.floor(GRID_ROWS / 2) + 2);
            }

            // Spawn starting crew member
            this._spawnStartingCrew();
        } catch(e) {
            console.error('[newGame] error during init:', e);
        }
        // Always show intro, even if something above failed
        console.log('[newGame] showIntro');
        this._showIntro();
    },

    _initTestMode() {
        const cx = Math.floor(GRID_COLS / 2);
        const cy = Math.floor(GRID_ROWS / 2);

        // Place HQ
        this._placeHQ(cx - 1, cy - 1);

        // Set conflict mode for testing
        this.state.colonyMode = 'conflict';
        // Unlock all tiers for testing
        this.state.peakPopulation = 30;
        this.state.unlockedTiers = [1, 2, 3];
        this.state.sol = 12;
        this.state.solTime = 100;
        this.state.terraformPoints = 15000;  // ~30% for testing
        this.state.terraformPercent = (15000 / TERRAFORM_GOAL) * 100;

        // Spawn player
        Player.init(cx, cy + 2);
        Player.name = 'Test Commander';
        Player.gender = 'female';
        Player.portrait = PORTRAITS.PLAYER_FEMALE;

        // Give generous resources and raise storage caps
        this.state.maxStorage[RESOURCE.POWER] = 500;
        this.state.maxStorage[RESOURCE.WATER] = 500;
        this.state.maxStorage[RESOURCE.OXYGEN] = 500;
        this.state.maxStorage[RESOURCE.FOOD] = 500;
        this.state.maxStorage[RESOURCE.MATERIALS] = 2000;
        this.state.resources[RESOURCE.POWER] = 200;
        this.state.resources[RESOURCE.WATER] = 200;
        this.state.resources[RESOURCE.OXYGEN] = 200;
        this.state.resources[RESOURCE.FOOD] = 200;
        this.state.resources[RESOURCE.MATERIALS] = 1000;

        // Pre-place a full colony: power, life support, housing, production, tier 2+3
        const builds = [
            // Power cluster (west)
            { type: BUILDING.SOLAR_PANEL, col: cx - 4, row: cy - 2 },
            { type: BUILDING.SOLAR_PANEL, col: cx - 4, row: cy - 1 },
            { type: BUILDING.SOLAR_PANEL, col: cx - 4, row: cy },
            { type: BUILDING.SOLAR_PANEL, col: cx - 4, row: cy + 1 },
            { type: BUILDING.SOLAR_FARM, col: cx - 4, row: cy + 2 },
            { type: BUILDING.FUSION_REACTOR, col: cx - 4, row: cy + 4 },
            // Life support (east)
            { type: BUILDING.WATER_EXTRACTOR, col: cx + 2, row: cy - 2 },
            { type: BUILDING.WATER_EXTRACTOR, col: cx + 3, row: cy - 2 },
            { type: BUILDING.O2_GENERATOR, col: cx + 2, row: cy - 1 },
            { type: BUILDING.O2_GENERATOR, col: cx + 3, row: cy - 1 },
            { type: BUILDING.GREENHOUSE, col: cx + 2, row: cy },
            { type: BUILDING.GREENHOUSE, col: cx + 2, row: cy + 1 },
            { type: BUILDING.HYDROPONICS_LAB, col: cx + 2, row: cy + 2 },
            // Housing (south)
            { type: BUILDING.HABITAT, col: cx - 1, row: cy + 3 },
            { type: BUILDING.HABITAT, col: cx + 1, row: cy + 3 },
            { type: BUILDING.BIODOME, col: cx - 1, row: cy + 5 },
            // Infrastructure (north)
            { type: BUILDING.LANDING_PAD, col: cx - 1, row: cy - 4 },
            { type: BUILDING.STORAGE_DEPOT, col: cx + 1, row: cy - 3 },
            { type: BUILDING.STORAGE_DEPOT, col: cx + 1, row: cy - 4 },
            { type: BUILDING.MEDICAL_BAY, col: cx + 2, row: cy - 3 },
            { type: BUILDING.RESEARCH_LAB, col: cx - 3, row: cy - 3 },
            // Mining (far west)
            { type: BUILDING.MINING_DRILL, col: cx - 5, row: cy - 1 },
            { type: BUILDING.MINING_DRILL, col: cx - 5, row: cy },
            { type: BUILDING.ADVANCED_DRILL, col: cx - 5, row: cy + 1 },
        ];
        for (const b of builds) {
            const def = BUILDING_DEFS[b.type];
            if (Grid.canPlace(b.col, b.row, def.width, def.height)) {
                const building = Buildings.create(b.type, b.col, b.row);
                Grid.placeBuilding(b.col, b.row, def.width, def.height, building.id);
                this.state.buildings.push(building);
            }
        }
        Buildings.recalculate(this.state);

        // Spawn Dr. Kimura
        this._spawnStartingCrew();

        // Spawn 10 additional colonists with mixed factions
        const factionOrder = [
            FACTION.GREEN, FACTION.RED, FACTION.NEUTRAL,
            FACTION.GREEN, FACTION.RED, FACTION.NEUTRAL,
            FACTION.RED, FACTION.GREEN, FACTION.NEUTRAL, FACTION.RED,
        ];
        for (let i = 0; i < 10; i++) {
            const npc = NPC.spawn(this.state);
            if (npc) {
                const faction = factionOrder[i];
                npc.faction = faction;
                npc.suitColor = FACTION_COLORS[faction];
                npc.idleLines = WorkSystem.getIdleLines(faction);
            }
        }

        UI.addNotification('TEST MODE — Full colony, conflict mode, 11 colonists', 'warning');
    },

    _placeHQ(col, row) {
        // Clear dark rock in HQ area + surrounding walkable zone
        for (let r = row - 2; r < row + 4; r++) {
            for (let c = col - 2; c < col + 4; c++) {
                if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
                    if (Grid.tiles[r][c] === TERRAIN.DARK_ROCK) {
                        Grid.tiles[r][c] = TERRAIN.SAND;
                    }
                }
            }
        }

        const building = Buildings.create(BUILDING.COMMAND_CENTER, col, row);
        Grid.placeBuilding(col, row, 2, 2, building.id);
        this.state.buildings.push(building);
        Buildings.recalculate(this.state);
    },

    _spawnStartingCrew() {
        // Spawn a fellow crew member near HQ so the player isn't alone
        const crew = NPC.spawn(this.state);
        if (crew) {
            crew.name = 'Dr. Kimura';
            crew.gender = 'male';
            crew.portrait = PORTRAITS.DR_RUSSELL; // reuse portrait asset
            crew.activity = 'rock_samples';

            // Set faction based on colony mode
            if (this.state.colonyMode === 'conflict') {
                crew.faction = FACTION.GREEN;
                crew.suitColor = FACTION_COLORS[FACTION.GREEN];
                crew.idleLines = [
                    "These rock samples are fascinating. The iron oxide content is off the charts — that's what gives Mars its red color.",
                    "Terraforming Mars is humanity's greatest challenge. We can seed the atmosphere with greenhouse gases to warm it up.",
                    "Imagine breathable air on Mars! If we thicken the atmosphere enough, we could walk outside without suits someday.",
                    "Cyanobacteria could survive on Mars. Release enough and they'd start producing oxygen naturally.",
                    "Every greenhouse we build is a step toward a living Mars. Plants transform CO2 into oxygen — nature's MOXIE.",
                    "The Greenhouse effect isn't always bad — here, it's our salvation. More CO2 traps heat, melts ice, releases water.",
                    "I've been analyzing the regolith. There's subsurface ice here — perfect for thickening the atmosphere.",
                    "Atmospheric seeding with perfluorocarbons could warm Mars 10 degrees in a century. We should start now.",
                    "Keep building those solar panels, Commander. Mars only gets about 43% of the sunlight Earth does.",
                    "Our O2 generators work like NASA's MOXIE experiment — splitting CO2 into breathable oxygen. The future of terraforming.",
                    "Place greenhouses next to water extractors — the irrigation boost gives you 30% more food.",
                    "O2 generators work better near greenhouses. The plants feed the oxygen cycle. About a 25% bonus.",
                    "Smart building placement makes all the difference out here. Check for bonuses when you inspect your structures.",
                ];
            } else {
                crew.faction = FACTION.NEUTRAL;
                crew.suitColor = FACTION_COLORS[FACTION.NEUTRAL];
                crew.idleLines = [
                    "These rock samples are fascinating. The iron oxide content is off the charts — that's what gives Mars its red color.",
                    "Keep building those solar panels, Commander. Mars only gets about 43% of the sunlight Earth does, so we need every watt.",
                    "I've been analyzing the regolith. There's subsurface ice here, just like Phoenix confirmed back in 2008.",
                    "The colony's shaping up well. Have you thought about building more storage depots?",
                    "Mars dust gets into everything. Perchlorates in the soil are toxic — another reason to keep our equipment sealed.",
                    "Found some interesting iron oxide formations while sampling. This area is rich in minerals for the mining drills.",
                    "Don't forget to eat and rest at HQ. At -60C average, Mars doesn't care how tough you think you are.",
                    "We should get a greenhouse up soon. Real food would do wonders. Studies show potatoes and lettuce grow in Martian soil.",
                    "Our O2 generators work like NASA's MOXIE experiment — splitting carbon dioxide into breathable oxygen. Clever engineering.",
                    "Mars's south pole has enough water ice to cover the entire planet in 11 meters of water. We just have to reach it.",
                    "Tip from my engineering days: cluster your solar panels together. They share wiring and you get about 25% more output.",
                    "Build water extractors near ice patches — they pull 30% more water. The ice sublimates right into the system.",
                    "Place greenhouses next to water extractors — the irrigation boost gives you 30% more food.",
                    "O2 generators work better near greenhouses. The plants feed the oxygen cycle. About a 25% bonus.",
                    "Smart building placement makes all the difference out here. Check for bonuses when you inspect your structures.",
                ];
            }

            crew.dialogueQueue.push({
                showBubble: true,
                lines: [
                    'Commander! Glad you made it in one piece.',
                    'I\'m Dr. Kimura, your chief engineer. I landed with the advance team and I\'ve been collecting rock samples around the site.',
                    'The geology here is promising — lots of iron oxide and possible subsurface ice. Should help us build.',
                    'First priority: solar panels for power. Face an empty tile and press E to open the build menu.',
                    'And get a Mining Drill up as soon as you can — we need a steady supply of materials to keep building. They only cost 15 MAT and produce +2 materials per second. Place them near dark rock for a 30% yield bonus.',
                    'For food, you\'ll need a greenhouse — but it requires power and water. So build solar panels and a water extractor first.',
                    'One more thing: where you place buildings matters. Cluster solar panels for bonus power. Put water extractors near ice. Greenhouses near water.',
                    'Once we have power, food, and housing, more colonists will arrive. Build a Landing Pad and Habitats to welcome them!',
                ],
            });
        }
    },

    _showIntro() {
        this.state.paused = true;
        Dialogue.open(
            'MISSION CONTROL',
            null,
            [
                'Year 2157. Earth\'s resources are dwindling. Humanity\'s last hope lies among the stars.',
                'You have been chosen to lead the first permanent settlement on Mars. Your Command Center has been deployed at the landing site.',
                'Your mission: build a self-sustaining colony. Construct solar panels for power, water extractors, O2 generators, and greenhouses to support life.',
                'Be warned: Mars is unforgiving. Nights are freezing — stay near shelters. You can sleep until dawn at the Command Center. Dust storms will batter your equipment. Keep your supplies stocked.',
                'Monitor your HP, Energy, and Hunger. Visit the Command Center to eat, rest, and heal. If your HP reaches zero, you\'ll pass out.',
                'Your first task: report to Dr. Kimura, your chief engineer. He landed with the advance team and is waiting near the Command Center.',
                'Move with WASD/arrows. Press E to interact, build, and talk.',
            ],
            null,
            null,
            () => { this._startCharacterCreation(); },
            null
        );
    },

    _startCharacterCreation() {
        Dialogue.open(
            'MISSION CONTROL',
            null,
            ['Before deployment, Commander — please confirm your personnel file.'],
            [
                {
                    label: 'Male',
                    action: () => {
                        Player.gender = 'male';
                        Player.portrait = PORTRAITS.PLAYER_MALE;
                        this._promptPlayerName();
                    }
                },
                {
                    label: 'Female',
                    action: () => {
                        Player.gender = 'female';
                        Player.portrait = PORTRAITS.PLAYER_FEMALE;
                        this._promptPlayerName();
                    }
                },
            ],
            null,
            null,
            null
        );
    },

    _promptPlayerName() {
        Dialogue.openNameEntry(
            'MISSION CONTROL',
            'Enter your name for the colony records:',
            (name) => {
                Player.name = name;
                this._promptColonyMode();
            }
        );
    },

    _promptColonyMode() {
        Dialogue.open(
            'MISSION CONTROL',
            null,
            ['One more thing, Commander. What kind of colony do you want to build?'],
            [
                {
                    label: 'Chill Mode — Cooperative, no factions',
                    action: () => {
                        this.state.colonyMode = 'chill';
                        // Update Dr. Kimura for chill mode (neutral)
                        const kimura = NPC.list.find(n => n.name === 'Dr. Kimura');
                        if (kimura) {
                            kimura.faction = FACTION.NEUTRAL;
                            kimura.suitColor = FACTION_COLORS[FACTION.NEUTRAL];
                        }
                        this.state.paused = false;
                        UI.addNotification(`Welcome to Mars, ${Player.name}. Chill mode — just vibes and building.`, 'success');
                    },
                },
                {
                    label: 'Conflict Mode — Factions, sabotage, politics',
                    action: () => {
                        this.state.colonyMode = 'conflict';
                        // Update Dr. Kimura for conflict mode (green)
                        const kimura = NPC.list.find(n => n.name === 'Dr. Kimura');
                        if (kimura) {
                            kimura.faction = FACTION.GREEN;
                            kimura.suitColor = FACTION_COLORS[FACTION.GREEN];
                            kimura.idleLines = [
                                "These rock samples are fascinating. The iron oxide content is off the charts — that's what gives Mars its red color.",
                                "Terraforming Mars is humanity's greatest challenge. We can seed the atmosphere with greenhouse gases to warm it up.",
                                "Imagine breathable air on Mars! If we thicken the atmosphere enough, we could walk outside without suits someday.",
                                "Cyanobacteria could survive on Mars. Release enough and they'd start producing oxygen naturally.",
                                "Every greenhouse we build is a step toward a living Mars. Plants transform CO2 into oxygen — nature's MOXIE.",
                                "The Greenhouse effect isn't always bad — here, it's our salvation. More CO2 traps heat, melts ice, releases water.",
                                "Atmospheric seeding with perfluorocarbons could warm Mars 10 degrees in a century. We should start now.",
                                "Our O2 generators work like NASA's MOXIE experiment — splitting CO2 into breathable oxygen. The future of terraforming.",
                            ];
                        }
                        this.state.paused = false;
                        UI.addNotification(`Welcome to Mars, ${Player.name}. Conflict mode — factions will emerge at 6 pop.`, 'success');
                    },
                },
            ],
            null,
            null,
            null
        );
    },

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;

        try {
            // Update input movement every frame
            Input.updateMovement();

            // Update
            if (!this.state.paused && !this.state.gameOver) {
                this.update(dt);
            }

            // Always update UI timers and dialogue
            UI.updateTimers(dt);
            Dialogue.update(dt);
            if (typeof Music !== 'undefined') Music.update(this.state);

            // Render
            Renderer.render(this.state);
            UI.render(Renderer.ctx, this.state, Renderer.width, Renderer.height);

            // Render dialogue on top of everything
            Dialogue.render(Renderer.ctx, Renderer.width, Renderer.height);
        } catch (e) {
            console.error('Game loop error:', e);
        }

        requestAnimationFrame((t) => this.loop(t));
    },

    update(dt) {
        this.state.time += dt;
        this.state.solTime += dt;

        // Update nighttime flag
        const solProgress = (this.state.solTime % SOL_DURATION) / SOL_DURATION;
        this.state.isNighttime = solProgress > 0.80 || solProgress < 0.05;

        // Check sol advancement
        if (this.state.solTime >= SOL_DURATION) {
            this.state.solTime -= SOL_DURATION;
            this.state.sol++;
            UI.addNotification(`Sol ${this.state.sol} begins.`, 'info');
        }

        // Player movement
        Player.update(dt);

        // Player survival stats
        Player.updateStats(dt, this.state);

        // NPC updates
        NPC.update(dt, this.state);

        // Resource ticks
        Resources.update(this.state, dt);

        // Events
        Events.update(this.state, dt);

        // Auto-save
        Save.updateAutoSave(this.state, dt);

        // Periodic greening cache rebuild (every ~10 seconds)
        this.state.greeningTimer = (this.state.greeningTimer || 0) + dt;
        if (this.state.greeningTimer >= 10) {
            this.state.greeningTimer = 0;
            Grid.greeningDirty = true;
        }

        // Track peakPopulation and unlock tiers
        this.updatePeakPopulation();

        // Check milestones
        this.checkMilestones();

        // Dust storm visual fade
        if (this.state.dustStormActive) {
            Renderer.dustStormAlpha = 0.6 + Math.sin(this.state.time * 3) * 0.3;
        }
    },

    updatePeakPopulation() {
        const pop = this.state.resources[RESOURCE.POPULATION];
        const prev = this.state.peakPopulation || 0;
        if (pop > prev) {
            this.state.peakPopulation = pop;
        }

        // Check for tier unlock notifications
        if (!this.state.unlockedTiers) this.state.unlockedTiers = [1];
        for (const [tierNum, tier] of Object.entries(UNLOCK_TIERS)) {
            const num = parseInt(tierNum);
            if (num <= 1) continue; // Tier 1 is always unlocked
            if (this.state.unlockedTiers.includes(num)) continue;
            if ((this.state.peakPopulation || 0) >= tier.pop) {
                this.state.unlockedTiers.push(num);
                const buildingNames = tier.buildings.map(t => BUILDING_DEFS[t].name).join(', ');
                UI.addNotification(`Colony milestone! Tier ${num} unlocked \u2014 check the build menu.`, 'success');
                if (typeof Music !== 'undefined') Music.playSFX('tier_unlock');
                // Queue Dr. Kimura dialogue about new tier buildings
                const kimura = NPC.list.find(n => n.name === 'Dr. Kimura');
                if (kimura) {
                    kimura.dialogueQueue.push({
                        showBubble: true,
                        lines: [
                            `Commander! Our colony just hit ${tier.pop} peak population \u2014 a major milestone!`,
                            `New building blueprints are now available: ${buildingNames}.`,
                            'Check the build menu next time you place a structure!',
                        ],
                    });
                }
            }
        }

        // Faction tutorial: Dr. Kimura explains Greens vs Reds when factions emerge
        if (this.state.colonyMode === 'conflict' &&
            this.state.resources[RESOURCE.POPULATION] >= FACTION_EMERGE_POP &&
            !this.state.factionsExplained) {
            this.state.factionsExplained = true;

            const kimura = NPC.list.find(n => n.name === 'Dr. Kimura');
            if (kimura) {
                kimura.dialogueQueue.push({
                    showBubble: true,
                    lines: [
                        'Commander, we need to talk. The colony has grown, and... opinions are forming.',
                        'Some colonists \u2014 the Greens \u2014 believe we should terraform Mars. Build greenhouses, O2 generators, biodomes. Make Mars livable.',
                        'Others \u2014 the Reds \u2014 think Mars should stay as it is. They prefer mining, drilling, pure infrastructure. They see beauty in the red dust.',
                        'You\'ll see colonists in green and red suits now. Their faction affects how they work.',
                        'Greens work better at terraforming buildings \u2014 greenhouses, O2 generators, hydroponics labs. Reds prefer mining drills, solar panels, extractors.',
                        'Watch the MORALE bars in your HUD. Build too many of one type and the other faction gets unhappy.',
                        'Unhappy Reds might sabotage your greenhouses and O2 generators. Keep them busy \u2014 assign them to buildings they like.',
                        'The key is balance, Commander. Or pick a side. Your call.',
                    ],
                });
            }
        }
    },

    checkMilestones() {
        for (const milestone of MILESTONES) {
            if (this.state.achievements.includes(milestone.id)) continue;
            if (milestone.check(this.state)) {
                this.state.achievements.push(milestone.id);
                UI.showAchievement(milestone);
            }
        }
    },
};

// Start when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
