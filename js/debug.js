// ============================================================
// Underhill — Debug Console Playthrough Tools
// Usage: open browser console and call Debug.scenario('name')
// ============================================================

const Debug = {
    // List all available scenarios
    help() {
        console.log(`
%cUnderhill Debug Scenarios%c
  Debug.scenario('early')      — Fresh colony, 3 buildings, low resources
  Debug.scenario('mid')        — 8 pop, tier 2 unlocked, 15% terraform
  Debug.scenario('late')       — 20+ pop, tier 3, 60% terraform, factions active
  Debug.scenario('win')        — 99% terraform, triggers win on next tick
  Debug.scenario('crisis')     — Resources nearly depleted, colonists dying
  Debug.scenario('night')      — Jump to deep night phase
  Debug.scenario('dawn')       — Jump to dawn phase
  Debug.scenario('dusk')       — Jump to dusk phase
  Debug.scenario('sabotage')   — Low red morale, sabotage imminent
  Debug.scenario('happy')      — High morale both factions
  Debug.scenario('full')       — Max colony, all buildings, 30 pop

%cQuick commands:%c
  Debug.terraform(percent)     — Set terraform to exact %
  Debug.morale(green, red)     — Set morale values (0-100)
  Debug.resources(pwr,h2o,o2,food,mat) — Set all resources
  Debug.time(solProgress)      — Set time of day (0.0-1.0)
  Debug.pop(count)             — Set population count
  Debug.spawn(n)               — Spawn n colonists with factions
  Debug.build(type, col, row)  — Place a building
  Debug.money()                — Max out all resources
  Debug.fast(seconds)          — Fast-forward game by N seconds
  Debug.mode(mode)             — Switch to 'chill' or 'conflict'
        `, 'font-weight:bold;font-size:14px;color:#27AE60', '',
           'font-weight:bold;font-size:12px;color:#D4A843', '');
    },

    // Get game state shortcut
    get s() { return Game.state; },

    // ==================== Quick Commands ====================

    terraform(percent) {
        const pts = (percent / 100) * TERRAFORM_GOAL;
        this.s.terraformPoints = pts;
        this.s.terraformPercent = percent;
        Grid.greeningDirty = true;
        if (percent >= 100) this.s.terraformWon = false; // reset so it triggers
        console.log(`Terraform set to ${percent}% (${pts} points)`);
    },

    morale(green, red) {
        this.s.greenMorale = Math.max(0, Math.min(100, green));
        this.s.redMorale = Math.max(0, Math.min(100, red));
        console.log(`Morale — Green: ${this.s.greenMorale}, Red: ${this.s.redMorale}`);
    },

    resources(pwr, h2o, o2, food, mat) {
        if (pwr !== undefined) this.s.resources[RESOURCE.POWER] = pwr;
        if (h2o !== undefined) this.s.resources[RESOURCE.WATER] = h2o;
        if (o2 !== undefined) this.s.resources[RESOURCE.OXYGEN] = o2;
        if (food !== undefined) this.s.resources[RESOURCE.FOOD] = food;
        if (mat !== undefined) this.s.resources[RESOURCE.MATERIALS] = mat;
        console.log('Resources set:', JSON.stringify(this.s.resources));
    },

    time(solProgress) {
        this.s.solTime = solProgress * SOL_DURATION;
        console.log(`Sol time set to ${(solProgress * 100).toFixed(0)}% (${this.s.solTime.toFixed(0)}s / ${SOL_DURATION}s)`);
    },

    pop(count) {
        // Ensure enough housing
        if (count > this.s.popCapacity) {
            console.warn(`Pop capacity is ${this.s.popCapacity}, spawning habitats...`);
            while (this.s.popCapacity < count) {
                this._placeAny(BUILDING.HABITAT);
            }
        }
        const current = this.s.resources[RESOURCE.POPULATION];
        this.s.resources[RESOURCE.POPULATION] = count;
        this.s.hadPopulation = true;
        // Spawn/remove NPCs to match
        while (NPC.list.length < count) {
            const npc = NPC.spawn(this.s);
            if (!npc) break;
            const faction = WorkSystem.assignFaction(this.s);
            npc.faction = faction;
            npc.suitColor = FACTION_COLORS[faction];
            npc.idleLines = WorkSystem.getIdleLines(faction);
        }
        console.log(`Population set to ${count} (was ${current})`);
    },

    spawn(n) {
        let spawned = 0;
        for (let i = 0; i < n; i++) {
            // Add pop capacity if needed
            if (this.s.resources[RESOURCE.POPULATION] >= this.s.popCapacity) {
                this._placeAny(BUILDING.HABITAT);
            }
            this.s.resources[RESOURCE.POPULATION]++;
            this.s.hadPopulation = true;
            const npc = NPC.spawn(this.s);
            if (npc) {
                const faction = WorkSystem.assignFaction(this.s);
                npc.faction = faction;
                npc.suitColor = FACTION_COLORS[faction];
                npc.idleLines = WorkSystem.getIdleLines(faction);
                spawned++;
            }
        }
        console.log(`Spawned ${spawned} colonists (total: ${NPC.list.length})`);
    },

    build(type, col, row) {
        if (col === undefined || row === undefined) {
            // Auto-place near HQ
            return this._placeAny(type);
        }
        const success = Buildings.place(this.s, type, col, row);
        console.log(success ? `Built ${type} at (${col}, ${row})` : `Failed to build ${type} at (${col}, ${row})`);
        return success;
    },

    money() {
        for (const key of Object.keys(this.s.maxStorage)) {
            this.s.maxStorage[key] = Math.max(this.s.maxStorage[key], 9999);
        }
        this.s.resources[RESOURCE.POWER] = 9999;
        this.s.resources[RESOURCE.WATER] = 9999;
        this.s.resources[RESOURCE.OXYGEN] = 9999;
        this.s.resources[RESOURCE.FOOD] = 9999;
        this.s.resources[RESOURCE.MATERIALS] = 9999;
        console.log('All resources maxed to 9999');
    },

    fast(seconds) {
        console.log(`Fast-forwarding ${seconds}s...`);
        const tickCount = Math.floor(seconds / RESOURCE_TICK);
        for (let i = 0; i < tickCount; i++) {
            Resources.tick(this.s);
            this.s.solTime += RESOURCE_TICK;
            this.s.time += RESOURCE_TICK;
            if (this.s.solTime >= SOL_DURATION) {
                this.s.solTime -= SOL_DURATION;
                this.s.sol++;
            }
        }
        const solProgress = (this.s.solTime % SOL_DURATION) / SOL_DURATION;
        this.s.isNighttime = solProgress > 0.80 || solProgress < 0.05;
        Grid.greeningDirty = true;
        Game.updatePeakPopulation();
        console.log(`Done. Now Sol ${this.s.sol}, terraform ${this.s.terraformPercent.toFixed(1)}%, time ${(solProgress * 100).toFixed(0)}%`);
    },

    mode(m) {
        this.s.colonyMode = m;
        console.log(`Colony mode set to: ${m}`);
    },

    // ==================== Scenarios ====================

    scenario(name) {
        const fn = this._scenarios[name];
        if (!fn) {
            console.error(`Unknown scenario: "${name}". Run Debug.help() for list.`);
            return;
        }
        console.log(`%cLoading scenario: ${name}%c`, 'color:#D4A843;font-weight:bold', '');
        fn.call(this);
        Grid.greeningDirty = true;
        console.log(`%cScenario "${name}" loaded.%c`, 'color:#27AE60;font-weight:bold', '');
    },

    _scenarios: {
        // Fresh colony — early game
        early() {
            this.mode('conflict');
            this.money();
            this.resources(30, 25, 20, 15, 200);
            this.s.maxStorage[RESOURCE.POWER] = 50;
            this.s.maxStorage[RESOURCE.WATER] = 50;
            this.s.maxStorage[RESOURCE.OXYGEN] = 50;
            this.s.maxStorage[RESOURCE.FOOD] = 50;
            this.s.maxStorage[RESOURCE.MATERIALS] = 200;
            this.terraform(3);
            this.time(0.4);
        },

        // Mid-game — tier 2 unlocked, factions emerging
        mid() {
            this.mode('conflict');
            this.money();
            this.s.peakPopulation = 10;
            this.s.unlockedTiers = [1, 2];
            this.terraform(15);
            this.pop(8);
            this.morale(55, 45);
            this.time(0.5);
            this.s.sol = 25;
        },

        // Late game — tier 3, serious terraforming
        late() {
            this.mode('conflict');
            this.money();
            this.s.peakPopulation = 25;
            this.s.unlockedTiers = [1, 2, 3];
            this.terraform(60);
            this.pop(20);
            this.morale(65, 40);
            this.s.sol = 80;
            this.time(0.3);
        },

        // About to win
        win() {
            this.mode('conflict');
            this.money();
            this.s.peakPopulation = 30;
            this.s.unlockedTiers = [1, 2, 3];
            this.terraform(99);
            this.s.terraformWon = false;
            this.pop(25);
            this.morale(80, 60);
            this.s.sol = 200;
            console.log('Terraform at 99% — next tick will trigger win!');
        },

        // Everything is on fire
        crisis() {
            this.mode('conflict');
            this.resources(2, 1, 1, 0, 50);
            this.s.maxStorage[RESOURCE.POWER] = 100;
            this.s.maxStorage[RESOURCE.WATER] = 100;
            this.s.maxStorage[RESOURCE.OXYGEN] = 100;
            this.s.maxStorage[RESOURCE.FOOD] = 100;
            this.pop(8);
            this.morale(20, 15);
            this.terraform(10);
            this.time(0.85); // night
            console.log('Resources critical! Colonists will start dying soon.');
        },

        // Deep night with stars
        night() {
            this.time(0.90);
            console.log('Deep night — stars should be visible.');
        },

        // Warm dawn
        dawn() {
            this.time(0.08);
            console.log('Dawn — warm orange tint fading.');
        },

        // Dusk
        dusk() {
            this.time(0.75);
            console.log('Dusk — warm orange fade into night.');
        },

        // Sabotage-prone state
        sabotage() {
            this.mode('conflict');
            this.money();
            this.pop(10);
            this.morale(70, 15); // Reds very unhappy
            this.terraform(20);
            // Make sure there are sabotage targets
            this._placeAny(BUILDING.GREENHOUSE);
            this._placeAny(BUILDING.GREENHOUSE);
            this._placeAny(BUILDING.O2_GENERATOR);
            console.log('Red morale at 15 — sabotage chance doubled. Watch your greenhouses!');
        },

        // Everyone is happy
        happy() {
            this.mode('conflict');
            this.money();
            this.pop(12);
            this.morale(85, 80);
            this.terraform(40);
            this.time(0.4);
            console.log('Both factions happy — bonus productivity, minimal sabotage.');
        },

        // Maxed out colony
        full() {
            this.mode('conflict');
            this.money();
            this.s.peakPopulation = 30;
            this.s.unlockedTiers = [1, 2, 3];
            this.terraform(85);
            this.pop(30);
            this.morale(70, 55);
            this.s.sol = 150;
            this.time(0.4);
            // Place tier 3 buildings
            this._placeAny(BUILDING.FUSION_REACTOR);
            this._placeAny(BUILDING.TERRAFORMING_TOWER);
            this._placeAny(BUILDING.BIODOME);
            this._placeAny(BUILDING.ADVANCED_DRILL);
            console.log('Full colony — 30 pop, tier 3, 85% terraform.');
        },
    },

    // ==================== Helpers ====================

    // Auto-place a building near HQ, finding a valid spot
    _placeAny(type) {
        const def = BUILDING_DEFS[type];
        const hq = this.s.buildings[0];
        if (!hq) { console.error('No HQ found'); return false; }

        // Spiral search from HQ
        for (let dist = 2; dist < 20; dist++) {
            for (let dr = -dist; dr <= dist; dr++) {
                for (let dc = -dist; dc <= dist; dc++) {
                    if (Math.abs(dr) !== dist && Math.abs(dc) !== dist) continue;
                    const col = hq.col + dc;
                    const row = hq.row + dr;
                    if (Grid.canPlace(col, row, def.width, def.height)) {
                        // Temporarily give materials
                        const hadMats = this.s.resources[RESOURCE.MATERIALS];
                        this.s.resources[RESOURCE.MATERIALS] = Math.max(hadMats, def.cost + 1);
                        const ok = Buildings.place(this.s, type, col, row);
                        if (ok) {
                            console.log(`  Auto-placed ${type} at (${col}, ${row})`);
                            return true;
                        }
                        this.s.resources[RESOURCE.MATERIALS] = hadMats;
                    }
                }
            }
        }
        console.warn(`Could not auto-place ${type}`);
        return false;
    },

    // Print current game state summary
    status() {
        const s = this.s;
        const solPct = ((s.solTime % SOL_DURATION) / SOL_DURATION * 100).toFixed(0);
        console.log(`
%cUnderhill Status%c
  Sol: ${s.sol} (${solPct}% through day)  |  Mode: ${s.colonyMode}
  Night: ${s.isNighttime}  |  Terraform: ${s.terraformPercent.toFixed(1)}%  |  Won: ${s.terraformWon || false}
  Pop: ${s.resources[RESOURCE.POPULATION]}/${s.popCapacity}  |  NPCs: ${NPC.list.length}  |  Buildings: ${s.buildings.length}
  PWR: ${Math.floor(s.resources[RESOURCE.POWER])}/${s.maxStorage[RESOURCE.POWER]}
  H2O: ${Math.floor(s.resources[RESOURCE.WATER])}/${s.maxStorage[RESOURCE.WATER]}
  O2:  ${Math.floor(s.resources[RESOURCE.OXYGEN])}/${s.maxStorage[RESOURCE.OXYGEN]}
  FOOD: ${Math.floor(s.resources[RESOURCE.FOOD])}/${s.maxStorage[RESOURCE.FOOD]}
  MAT: ${Math.floor(s.resources[RESOURCE.MATERIALS])}/${s.maxStorage[RESOURCE.MATERIALS]}
  Morale — Green: ${(s.greenMorale||50).toFixed(0)}  Red: ${(s.redMorale||50).toFixed(0)}
  Factions explained: ${s.factionsExplained || false}
        `, 'font-weight:bold;font-size:14px;color:#5B8FA8', '');
    },
};

// Auto-print help on load if in dev environment
if (window.location.hash === '#test' || new URLSearchParams(window.location.search).has('test')) {
    console.log('%c[Debug tools loaded] %cRun Debug.help() for commands', 'color:#27AE60;font-weight:bold', 'color:#D4A843');
}
