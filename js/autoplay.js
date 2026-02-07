// ============================================================
// Underhill — Autoplay Bot + Bug Watchdog
// Usage: Autoplay.start()  /  Autoplay.stop()  /  Autoplay.report()
// ============================================================

const Autoplay = {
    active: false,
    interval: null,
    tickCount: 0,
    startTime: 0,
    decisionTimer: 0,
    moveTimer: 0,

    // Bug tracking
    bugs: [],
    warnings: [],
    snapshots: [],
    lastResources: null,
    stuckCounter: 0,
    deathCount: 0,
    lastPop: 0,
    fpsHistory: [],
    lastFrameTime: 0,
    errorCount: 0,
    originalOnError: null,

    // Stats
    stats: {
        buildingsPlaced: 0,
        colonistsSpawned: 0,
        resourcesCrashed: 0,
        sabotageEvents: 0,
        solsPlayed: 0,
        decisionssMade: 0,
    },

    start(options = {}) {
        if (this.active) {
            console.log('%c[Autoplay] Already running. Use Autoplay.stop() first.', 'color:#C0392B');
            return;
        }

        const speed = options.speed || 1;       // 1 = normal, 2 = 2x, etc.
        const maxSols = options.maxSols || 50;   // stop after N sols
        const silent = options.silent || false;

        this.active = true;
        this.tickCount = 0;
        this.startTime = Date.now();
        this.decisionTimer = 0;
        this.moveTimer = 0;
        this.bugs = [];
        this.warnings = [];
        this.snapshots = [];
        this.stuckCounter = 0;
        this.deathCount = 0;
        this.lastPop = Game.state.resources[RESOURCE.POPULATION];
        this.fpsHistory = [];
        this.lastFrameTime = performance.now();
        this.errorCount = 0;
        this.lastResources = null;
        this.stats = {
            buildingsPlaced: 0,
            colonistsSpawned: 0,
            resourcesCrashed: 0,
            sabotageEvents: 0,
            solsPlayed: 0,
            startSol: Game.state.sol,
            decisionsMade: 0,
        };

        // Force through fresh game setup if needed
        this._skipSetup(options.mode || 'conflict');
        this._verbose = options.verbose !== false; // default: verbose on

        // Hook into global errors
        this.originalOnError = window.onerror;
        window.onerror = (msg, src, line, col, err) => {
            this.errorCount++;
            this._bug('JS_ERROR', `${msg} at ${src}:${line}:${col}`, err);
            if (this.originalOnError) return this.originalOnError(msg, src, line, col, err);
            return false;
        };

        // Main autoplay loop — runs every 500ms (decisions), watchdog every tick
        const tickMs = Math.max(100, 500 / speed);
        this.interval = setInterval(() => {
            if (!this.active) return;
            if (Game.state.gameOver) {
                this._bug('GAME_OVER', `Game ended: ${Game.state.gameOverReason}`);
                this.stop();
                return;
            }
            if (Game.state.paused) {
                Game.state.paused = false;
            }
            // Handle dialogues — advance through them naturally
            if (Dialogue.active) {
                this._handleDialogue();
            } else {
                this._dialogueTicks = 0;
            }

            this.tickCount++;
            this._watchdog();
            this._makeDecision();
            this._movePlayer();

            // Periodic status log (every 20 ticks / ~10s)
            if (this._verbose && this.tickCount % 20 === 0) {
                const solPct = ((Game.state.solTime % SOL_DURATION) / SOL_DURATION * 100).toFixed(0);
                console.log(`%c[Autoplay] Tick ${this.tickCount}%c — Sol ${Game.state.sol} (${solPct}%), ${Game.state.buildings.length} buildings, mat: ${Math.floor(Game.state.resources[RESOURCE.MATERIALS])}, pwr: ${Game.state.resources[RESOURCE.POWER].toFixed(1)}, pop: ${Game.state.resources[RESOURCE.POPULATION]}`,
                    'color:#5B8FA8', 'color:#7B8794');
            }

            // Check sol limit
            const solsPlayed = Game.state.sol - this.stats.startSol;
            this.stats.solsPlayed = solsPlayed;
            if (solsPlayed >= maxSols) {
                if (!silent) console.log(`%c[Autoplay] Reached ${maxSols} sol limit. Stopping.`, 'color:#D4A843');
                this.stop();
            }
        }, tickMs);

        // FPS monitor — every frame
        this._fpsMonitor = () => {
            if (!this.active) return;
            const now = performance.now();
            const dt = now - this.lastFrameTime;
            this.lastFrameTime = now;
            if (dt > 0) {
                const fps = 1000 / dt;
                this.fpsHistory.push(fps);
                if (this.fpsHistory.length > 300) this.fpsHistory.shift();
                if (fps < 15 && this.fpsHistory.length > 10) {
                    this._warn('LOW_FPS', `FPS dropped to ${fps.toFixed(0)}`);
                }
            }
            requestAnimationFrame(this._fpsMonitor);
        };
        requestAnimationFrame(this._fpsMonitor);

        console.log(`%c[Autoplay] Started%c — speed: ${speed}x, max: ${maxSols} sols`, 'color:#27AE60;font-weight:bold', '');
        console.log('  Autoplay.stop()   — stop and print report');
        console.log('  Autoplay.report() — print report without stopping');
        console.log('  Autoplay.bugs     — raw bug array');
    },

    stop() {
        if (!this.active) return;
        this.active = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        // Restore error handler
        if (this.originalOnError !== null) {
            window.onerror = this.originalOnError;
            this.originalOnError = null;
        }
        this.report();
        console.log('%c[Autoplay] Stopped.', 'color:#C0392B;font-weight:bold');
    },

    // ==================== Setup & Dialogue Handling ====================

    _skipSetup(mode) {
        // ---- 1. Kill ALL dialogue state aggressively ----
        // Null out every callback before calling close() so chains don't fire
        Dialogue.onClose = null;
        Dialogue.nameCallback = null;
        Dialogue.choices = null;
        Dialogue.isNameEntry = false;
        Dialogue.isBuildMenu = false;
        Dialogue.active = false; // force inactive without firing close() callbacks

        // ---- 2. Unpause ----
        Game.state.paused = false;

        // ---- 3. Set player identity if not set ----
        if (!Player.name || Player.name === 'Commander') {
            Player.name = 'Autoplay Bot';
            Player.gender = 'female';
            Player.portrait = PORTRAITS.PLAYER_FEMALE;
        }

        // ---- 4. Set colony mode ----
        Game.state.colonyMode = mode;

        // ---- 5. Clear ALL NPC dialogue queues (not just Kimura) ----
        for (const npc of NPC.list) {
            npc.dialogueQueue = [];
            if (npc.state === 'talking') npc.state = 'idle';
        }

        // Update Dr. Kimura's faction for the mode
        const kimura = NPC.list.find(n => n.name === 'Dr. Kimura');
        if (kimura) {
            if (mode === 'conflict') {
                kimura.faction = FACTION.GREEN;
                kimura.suitColor = FACTION_COLORS[FACTION.GREEN];
            } else {
                kimura.faction = FACTION.NEUTRAL;
                kimura.suitColor = FACTION_COLORS[FACTION.NEUTRAL];
            }
        }

        // ---- 6. Skip initial night so solar panels work immediately ----
        if (Game.state.sol <= 1 && Game.state.solTime < SOL_DURATION * 0.15) {
            Game.state.solTime = SOL_DURATION * 0.15; // jump to morning
            Game.state.isNighttime = false;
            console.log('%c[Autoplay] Skipped initial night → starting at dawn', 'color:#D4A843');
        }

        console.log(`%c[Autoplay] Setup complete — mode: ${mode}, player: ${Player.name}, buildings: ${Game.state.buildings.length}, mat: ${Game.state.resources[RESOURCE.MATERIALS]}`, 'color:#6B8E5A');
    },

    _handleDialogue() {
        // Track how long a dialogue has been open — force-kill if stuck
        this._dialogueTicks = (this._dialogueTicks || 0) + 1;
        if (this._dialogueTicks > 10) {
            // Dialogue stuck for 5+ seconds — force kill it
            if (this._verbose) console.log('%c[Autoplay] Force-closing stuck dialogue', 'color:#C0392B');
            Dialogue.onClose = null;
            Dialogue.nameCallback = null;
            Dialogue.active = false;
            Dialogue.isNameEntry = false;
            Dialogue.isBuildMenu = false;
            Dialogue.choices = null;
            this._dialogueTicks = 0;
            return;
        }

        // Name entry — type a name and submit
        if (Dialogue.isNameEntry) {
            Dialogue.nameText = 'Autoplay Bot';
            Dialogue.handleNameKey('enter');
            return;
        }

        // Choice dialogue — pick first non-cancel option
        if (Dialogue.choices && Dialogue.choices.length > 0) {
            // For colony mode, prefer conflict
            const conflictChoice = Dialogue.choices.findIndex(c =>
                c.label && c.label.toLowerCase().includes('conflict')
            );
            if (conflictChoice >= 0) {
                Dialogue.choiceIndex = conflictChoice;
            } else {
                // Pick first option (skip Cancel if it's last)
                Dialogue.choiceIndex = 0;
            }
            Dialogue.advance();
            return;
        }

        // Build menu — close it
        if (Dialogue.isBuildMenu) {
            Dialogue.close();
            return;
        }

        // Regular dialogue — advance through text
        if (Dialogue.lines && Dialogue.charIndex < (Dialogue.lines[Dialogue.lineIndex] || '').length) {
            // Skip typewriter — show full line
            Dialogue.charIndex = 9999;
        } else {
            // Advance to next line or close
            Dialogue.advance();
        }
    },

    // ==================== Watchdog ====================

    _watchdog() {
        const s = Game.state;

        // Check for NaN / negative / out-of-bounds resources
        for (const key of [RESOURCE.POWER, RESOURCE.WATER, RESOURCE.OXYGEN, RESOURCE.FOOD, RESOURCE.MATERIALS]) {
            const val = s.resources[key];
            if (isNaN(val)) this._bug('NAN_RESOURCE', `${key} is NaN`);
            if (val < -0.01) this._bug('NEGATIVE_RESOURCE', `${key} = ${val.toFixed(2)}`);
            if (val > s.maxStorage[key] + 1) this._warn('OVER_STORAGE', `${key} = ${val.toFixed(0)} > max ${s.maxStorage[key]}`);
        }

        // Population checks
        const pop = s.resources[RESOURCE.POPULATION];
        if (isNaN(pop)) this._bug('NAN_POP', 'Population is NaN');
        if (pop < 0) this._bug('NEGATIVE_POP', `Population = ${pop}`);
        if (pop > s.popCapacity + 1) this._warn('POP_OVER_CAP', `Pop ${pop} > capacity ${s.popCapacity}`);

        // Detect unexpected deaths
        if (pop < this.lastPop) {
            const died = this.lastPop - pop;
            this.deathCount += died;
            this._warn('COLONIST_DEATH', `${died} colonist(s) died (pop: ${this.lastPop} -> ${pop})`);
        }
        this.lastPop = pop;

        // Terraform checks
        if (isNaN(s.terraformPercent)) this._bug('NAN_TERRAFORM', 'terraformPercent is NaN');
        if (s.terraformPercent < 0) this._bug('NEGATIVE_TERRAFORM', `terraformPercent = ${s.terraformPercent}`);
        if (s.terraformPercent > 100.01) this._bug('TERRAFORM_OVERFLOW', `terraformPercent = ${s.terraformPercent}`);

        // Morale checks
        if (s.colonyMode === 'conflict') {
            if (isNaN(s.greenMorale)) this._bug('NAN_MORALE', 'greenMorale is NaN');
            if (isNaN(s.redMorale)) this._bug('NAN_MORALE', 'redMorale is NaN');
            if (s.greenMorale < -0.01 || s.greenMorale > 100.01) this._bug('MORALE_OOB', `greenMorale = ${s.greenMorale}`);
            if (s.redMorale < -0.01 || s.redMorale > 100.01) this._bug('MORALE_OOB', `redMorale = ${s.redMorale}`);
        }

        // Building state checks
        for (const b of s.buildings) {
            if (b.active && b.offline) this._warn('BUILDING_STATE', `Building ${b.id} (${b.type}) is both active and offline`);
            if (b.assignedNpcId !== null) {
                const npc = NPC.list.find(n => n.id === b.assignedNpcId);
                if (!npc) this._warn('ORPHAN_ASSIGNMENT', `Building ${b.id} assigned to NPC ${b.assignedNpcId} which doesn't exist`);
            }
        }

        // NPC state checks
        for (const npc of NPC.list) {
            if (isNaN(npc.x) || isNaN(npc.y)) this._bug('NAN_NPC_POS', `NPC ${npc.name} position is NaN`);
            if (npc.assignedBuildingId !== null) {
                const b = s.buildings.find(b => b.id === npc.assignedBuildingId);
                if (!b) this._warn('ORPHAN_NPC_ASSIGNMENT', `NPC ${npc.name} assigned to building ${npc.assignedBuildingId} which doesn't exist`);
            }
        }

        // Stuck detection — if no resource change in 30 ticks
        // Check ALL resources including materials and building count
        const resSnapshot = JSON.stringify([
            Math.floor(s.resources[RESOURCE.POWER]),
            Math.floor(s.resources[RESOURCE.WATER]),
            Math.floor(s.resources[RESOURCE.FOOD]),
            Math.floor(s.resources[RESOURCE.MATERIALS]),
            s.buildings.length,
        ]);
        if (resSnapshot === this.lastResources) {
            this.stuckCounter++;
            if (this.stuckCounter >= 30) {
                this._warn('STUCK', `No resource change for ${this.stuckCounter} ticks (Sol ${s.sol}, paused: ${s.paused}, dialogue: ${Dialogue.active}, buildings: ${s.buildings.length})`);
                this.stuckCounter = 0;
            }
        } else {
            this.stuckCounter = 0;
        }
        this.lastResources = resSnapshot;

        // Sabotage tracking
        for (const b of s.buildings) {
            if (b.sabotaged && !b._autoplaySabotageTracked) {
                b._autoplaySabotageTracked = true;
                this.stats.sabotageEvents++;
                this._warn('SABOTAGE', `${BUILDING_DEFS[b.type].name} (id:${b.id}) was sabotaged`);
            }
            if (!b.sabotaged) b._autoplaySabotageTracked = false;
        }
    },

    // ==================== AI Decision Making ====================

    _makeDecision() {
        const s = Game.state;
        this.stats.decisionsMade++;

        try {
            // Priority-based building AI
            const mat = s.resources[RESOURCE.MATERIALS];
            const pwr = s.resources[RESOURCE.POWER];
            const water = s.resources[RESOURCE.WATER];
            const o2 = s.resources[RESOURCE.OXYGEN];
            const food = s.resources[RESOURCE.FOOD];
            const pop = s.resources[RESOURCE.POPULATION];
            const net = s.netRates || {};

            // Don't build if low on materials
            if (mat < 15) {
                if (this._verbose && this.tickCount % 20 === 0) {
                    console.log(`%c[Autoplay] Waiting — materials low (${Math.floor(mat)})`, 'color:#8B6E5C');
                }
                return;
            }

            // Don't spam builds — limit to 1 building every 3 ticks (1.5s)
            if (this.tickCount - (this._lastBuildTick || 0) < 3) return;

            let toBuild = null;
            let reason = '';

            // Count existing building types (avoid spamming the same thing)
            const buildingCounts = {};
            for (const b of s.buildings) {
                buildingCounts[b.type] = (buildingCounts[b.type] || 0) + 1;
            }

            // Critical: no power production (but cap solar panels at 6 until other needs met)
            if ((net[RESOURCE.POWER] || 0) <= 0 && mat >= 10 && (buildingCounts[BUILDING.SOLAR_PANEL] || 0) < 6) {
                toBuild = BUILDING.SOLAR_PANEL;
                reason = `net power: ${(net[RESOURCE.POWER] || 0).toFixed(1)}`;
            }
            // Critical: no water
            else if ((net[RESOURCE.WATER] || 0) <= 0 && pwr > 5 && mat >= 20) {
                toBuild = BUILDING.WATER_EXTRACTOR;
                reason = 'no water production';
            }
            // Critical: no oxygen
            else if ((net[RESOURCE.OXYGEN] || 0) <= 0 && pwr > 5 && mat >= 20) {
                toBuild = BUILDING.O2_GENERATOR;
                reason = 'no O2 production';
            }
            // Critical: no food
            else if ((net[RESOURCE.FOOD] || 0) <= 0 && pwr > 3 && water > 3 && mat >= 25) {
                toBuild = BUILDING.GREENHOUSE;
                reason = 'no food production';
            }
            // Need housing for growth
            else if (pop >= s.popCapacity && s.popCapacity < 20 && mat >= 30) {
                toBuild = BUILDING.HABITAT;
                reason = `pop ${pop} >= cap ${s.popCapacity}`;
            }
            // Need a landing pad
            else if (!Buildings.hasLandingPad(s) && mat >= 40) {
                toBuild = BUILDING.LANDING_PAD;
                reason = 'no landing pad';
            }
            // More power for growth
            else if ((net[RESOURCE.POWER] || 0) < 5 && mat >= 10) {
                toBuild = BUILDING.SOLAR_PANEL;
                reason = `net power low: ${(net[RESOURCE.POWER] || 0).toFixed(1)}`;
            }
            // Mining when materials getting low
            else if (mat < 80 && pwr > 10 && mat >= 15) {
                toBuild = BUILDING.MINING_DRILL;
                reason = `materials low: ${Math.floor(mat)}`;
            }
            // Storage when things are full
            else if (mat > 150 && s.maxStorage[RESOURCE.POWER] < 200) {
                toBuild = BUILDING.STORAGE_DEPOT;
                reason = 'need more storage';
            }
            // Tier 2+ buildings when available and affordable
            else if (s.unlockedTiers && s.unlockedTiers.includes(2) && mat >= 40) {
                const options = [];
                if ((net[RESOURCE.FOOD] || 0) < 3) options.push(BUILDING.HYDROPONICS_LAB);
                if ((net[RESOURCE.POWER] || 0) < 10) options.push(BUILDING.SOLAR_FARM);
                if (!Buildings.hasMedicalBay(s)) options.push(BUILDING.MEDICAL_BAY);
                if (options.length > 0) {
                    toBuild = options[Math.floor(Math.random() * options.length)];
                    reason = 'tier 2 expansion';
                }
            }
            // Tier 3 — terraform-focused
            else if (s.unlockedTiers && s.unlockedTiers.includes(3) && mat >= 70) {
                const t3 = [];
                if (pwr > 20) t3.push(BUILDING.TERRAFORMING_TOWER);
                if (pwr > 15 && water > 10) t3.push(BUILDING.BIODOME);
                if ((net[RESOURCE.POWER] || 0) < 15) t3.push(BUILDING.FUSION_REACTOR);
                if (mat < 100) t3.push(BUILDING.ADVANCED_DRILL);
                if (t3.length > 0) {
                    toBuild = t3[Math.floor(Math.random() * t3.length)];
                    reason = 'tier 3 expansion';
                }
            }

            if (toBuild) {
                const placed = this._autoPlace(toBuild);
                if (placed) {
                    this.stats.buildingsPlaced++;
                    this._lastBuildTick = this.tickCount;
                    if (this._verbose) {
                        console.log(`%c[Autoplay] Built ${toBuild}%c (${reason}) — total: ${s.buildings.length}, mat: ${Math.floor(s.resources[RESOURCE.MATERIALS])}`,
                            'color:#27AE60;font-weight:bold', 'color:#6B8E5A');
                    }
                } else if (this._verbose) {
                    console.log(`%c[Autoplay] Failed to place ${toBuild}%c (${reason})`, 'color:#C0392B', 'color:#8B6E5C');
                }
            }

            // Assign idle NPCs to unoccupied buildings
            for (const npc of NPC.list) {
                if (npc.assignedBuildingId !== null) continue;
                const available = WorkSystem.getStaffableBuildings(npc, s);
                if (available.length > 0) {
                    // Prefer faction-matched buildings
                    const matched = available.filter(b => {
                        if (npc.faction === FACTION.GREEN && GREEN_BUILDINGS.includes(b.type)) return true;
                        if (npc.faction === FACTION.RED && RED_BUILDINGS.includes(b.type)) return true;
                        return false;
                    });
                    const pick = matched.length > 0 ? matched[0] : available[0];
                    WorkSystem.assign(npc, pick);
                }
            }
        } catch (e) {
            this._bug('DECISION_ERROR', `Exception in _makeDecision: ${e.message}`, e);
        }
    },

    _autoPlace(type) {
        try {
            const s = Game.state;
            const def = BUILDING_DEFS[type];
            if (!def) { if (this._verbose) console.log('[Autoplay] No def for', type); return false; }
            if (s.resources[RESOURCE.MATERIALS] < def.cost) {
                if (this._verbose) console.log(`[Autoplay] Can't afford ${type}: need ${def.cost}, have ${Math.floor(s.resources[RESOURCE.MATERIALS])}`);
                return false;
            }

            // Find HQ center
            const hq = s.buildings[0];
            if (!hq) { if (this._verbose) console.log('[Autoplay] No HQ found'); return false; }
            const cx = hq.col + 1;
            const cy = hq.row + 1;

            // Spiral search
            for (let dist = 2; dist < 25; dist++) {
                for (let dr = -dist; dr <= dist; dr++) {
                    for (let dc = -dist; dc <= dist; dc++) {
                        if (Math.abs(dr) !== dist && Math.abs(dc) !== dist) continue;
                        const col = cx + dc;
                        const row = cy + dr;
                        if (Grid.canPlace(col, row, def.width, def.height)) {
                            const ok = Buildings.place(s, type, col, row);
                            if (!ok && this._verbose) {
                                console.log(`[Autoplay] Buildings.place returned false for ${type} at (${col}, ${row})`);
                            }
                            return ok;
                        }
                    }
                }
            }
            if (this._verbose) console.log(`[Autoplay] No valid tile found for ${type} within dist 25`);
            return false;
        } catch (e) {
            this._bug('PLACE_ERROR', `Exception in _autoPlace(${type}): ${e.message}`, e);
            return false;
        }
    },

    // ==================== Player Movement ====================

    _movePlayer() {
        this.moveTimer++;
        if (this.moveTimer < 4) return; // move every ~2 seconds
        this.moveTimer = 0;

        // Wander near buildings randomly
        const s = Game.state;
        if (s.buildings.length === 0) return;

        const target = s.buildings[Math.floor(Math.random() * s.buildings.length)];
        const def = BUILDING_DEFS[target.type];
        const dest = Grid.findWalkableNear(
            target.col + Math.floor(def.width / 2),
            target.row + def.height,
            3
        );
        if (dest) {
            Player.moveTarget = { x: dest.col * TILE_SIZE, y: dest.row * TILE_SIZE };
        }
    },

    // ==================== Bug/Warning Logging ====================

    _bug(code, message, extra) {
        const entry = {
            type: 'BUG',
            code,
            message,
            sol: Game.state.sol,
            time: Game.state.time.toFixed(1),
            tick: this.tickCount,
            timestamp: new Date().toISOString(),
        };
        // Deduplicate — don't log the same code more than once per 10 ticks
        const recent = this.bugs.filter(b => b.code === code && this.tickCount - b.tick < 10);
        if (recent.length > 0) return;

        this.bugs.push(entry);
        console.log(`%c[BUG] ${code}%c: ${message} (Sol ${entry.sol}, tick ${entry.tick})`,
            'color:#C0392B;font-weight:bold', 'color:#C0392B');
        if (extra) console.error(extra);

        // Take state snapshot on bugs
        this._snapshot(code);
    },

    _warn(code, message) {
        const entry = {
            type: 'WARN',
            code,
            message,
            sol: Game.state.sol,
            time: Game.state.time.toFixed(1),
            tick: this.tickCount,
        };
        // Deduplicate warnings — same code within 20 ticks
        const recent = this.warnings.filter(w => w.code === code && this.tickCount - w.tick < 20);
        if (recent.length > 0) return;

        this.warnings.push(entry);
        console.log(`%c[WARN] ${code}%c: ${message} (Sol ${entry.sol})`,
            'color:#D4A843;font-weight:bold', 'color:#D4A843');
    },

    _snapshot(label) {
        const s = Game.state;
        this.snapshots.push({
            label,
            tick: this.tickCount,
            sol: s.sol,
            resources: { ...s.resources },
            maxStorage: { ...s.maxStorage },
            terraformPercent: s.terraformPercent,
            greenMorale: s.greenMorale,
            redMorale: s.redMorale,
            buildings: s.buildings.length,
            pop: s.resources[RESOURCE.POPULATION],
            npcs: NPC.list.length,
        });
    },

    // ==================== Report ====================

    report() {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
        const avgFps = this.fpsHistory.length > 0
            ? (this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length).toFixed(0)
            : '?';
        const minFps = this.fpsHistory.length > 0
            ? Math.floor(Math.min(...this.fpsHistory))
            : '?';

        console.log(`
%c========== AUTOPLAY REPORT ==========%c

  Duration: ${elapsed}s real time
  Ticks: ${this.tickCount}
  Sols played: ${this.stats.solsPlayed} (Sol ${this.stats.startSol} -> ${Game.state.sol})

%cPerformance:%c
  Avg FPS: ${avgFps}  |  Min FPS: ${minFps}
  JS Errors: ${this.errorCount}

%cGame Stats:%c
  Buildings placed: ${this.stats.buildingsPlaced}
  Decisions made: ${this.stats.decisionsMade}
  Colonist deaths: ${this.deathCount}
  Sabotage events: ${this.stats.sabotageEvents}
  Terraform: ${Game.state.terraformPercent.toFixed(1)}%
  Final pop: ${Game.state.resources[RESOURCE.POPULATION]}

%cBugs Found: ${this.bugs.length}%c${this.bugs.length === 0 ? '  (none!)' : ''}
${this.bugs.map(b => `  [${b.code}] ${b.message} (Sol ${b.sol}, tick ${b.tick})`).join('\n')}

%cWarnings: ${this.warnings.length}%c
${this.warnings.slice(0, 20).map(w => `  [${w.code}] ${w.message} (Sol ${w.sol})`).join('\n')}${this.warnings.length > 20 ? `\n  ... and ${this.warnings.length - 20} more` : ''}

%c======================================%c
        `,
            'color:#5B8FA8;font-weight:bold;font-size:14px', '',
            'color:#D4A843;font-weight:bold', '',
            'color:#6B8E5A;font-weight:bold', '',
            this.bugs.length > 0 ? 'color:#C0392B;font-weight:bold' : 'color:#27AE60;font-weight:bold', '',
            'color:#D4A843;font-weight:bold', '',
            'color:#5B8FA8;font-weight:bold;font-size:14px', ''
        );

        if (this.snapshots.length > 0) {
            console.log('%cState snapshots (at time of bugs):', 'color:#7B8794');
            console.table(this.snapshots);
        }
    },
};
