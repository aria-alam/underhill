// ============================================================
// Underhill — Resource System
// ============================================================

const Resources = {
    tickAccumulator: 0,

    init(gameState) {
        gameState.resources = { ...STARTING_RESOURCES };
        gameState.maxStorage = { ...STARTING_MAX_STORAGE };
        gameState.popCapacity = 0;
        gameState.production = {};
        gameState.consumption = {};
        gameState.netRates = {};
    },

    update(gameState, dt) {
        this.tickAccumulator += dt;
        if (this.tickAccumulator < RESOURCE_TICK) return;
        this.tickAccumulator -= RESOURCE_TICK;

        this.tick(gameState);
    },

    tick(gameState) {
        // Calculate production and consumption
        const production = {
            [RESOURCE.POWER]: 0,
            [RESOURCE.WATER]: 0,
            [RESOURCE.OXYGEN]: 0,
            [RESOURCE.FOOD]: 0,
            [RESOURCE.MATERIALS]: 0,
        };
        const consumption = {
            [RESOURCE.POWER]: 0,
            [RESOURCE.WATER]: 0,
            [RESOURCE.OXYGEN]: 0,
            [RESOURCE.FOOD]: 0,
            [RESOURCE.MATERIALS]: 0,
        };

        // Calculate total power production first (needed for activation check)
        for (const building of gameState.buildings) {
            if (building.offline || building.malfunctioning) continue;
            const def = BUILDING_DEFS[building.type];
            if (def.produces[RESOURCE.POWER]) {
                let amount = def.produces[RESOURCE.POWER];
                // Solar panels produce 0 at night; Solar Farms produce 25% at night
                if (building.type === BUILDING.SOLAR_PANEL && gameState.isNighttime) {
                    amount = 0;
                } else if (building.type === BUILDING.SOLAR_FARM && gameState.isNighttime) {
                    amount *= 0.25;
                }
                // Dust storm reduces solar output (affects solar panels and solar farms)
                if ((building.type === BUILDING.SOLAR_PANEL || building.type === BUILDING.SOLAR_FARM) && gameState.dustStormActive) {
                    amount *= EVENT_CONFIG[EVENT_TYPE.DUST_STORM].solarReduction;
                }
                // Adjacency bonus + staff bonus + research lab bonus
                if (amount > 0) {
                    const adjBonus = Buildings.getAdjacencyBonus(building, gameState);
                    const staffBonus = WorkSystem.getStaffBonus(building, gameState);
                    const researchBonus = Buildings.getResearchLabBonus(building, gameState);
                    amount *= (1 + adjBonus + staffBonus + researchBonus);
                }
                production[RESOURCE.POWER] += amount;
            }
        }

        // Deactivate buildings if not enough power (prioritize by order placed)
        let availablePower = production[RESOURCE.POWER];
        for (const building of gameState.buildings) {
            if (building.offline || building.malfunctioning) continue;
            const def = BUILDING_DEFS[building.type];
            const powerNeeded = def.consumes[RESOURCE.POWER] || 0;
            if (powerNeeded > 0) {
                if (availablePower >= powerNeeded) {
                    building.active = true;
                    availablePower -= powerNeeded;
                } else {
                    building.active = false;
                }
            } else {
                building.active = true;
            }
        }

        // Now calculate all production/consumption from active buildings only
        for (const building of gameState.buildings) {
            if (building.offline || building.malfunctioning || !building.active) continue;
            const def = BUILDING_DEFS[building.type];
            const adjBonus = Buildings.getAdjacencyBonus(building, gameState);
            const staffBonus = WorkSystem.getStaffBonus(building, gameState);

            const researchBonus = Buildings.getResearchLabBonus(building, gameState);
            for (const [res, baseAmount] of Object.entries(def.produces)) {
                if (res === RESOURCE.POWER) continue; // already counted
                production[res] += baseAmount * (1 + adjBonus + staffBonus + researchBonus);
            }
            for (const [res, amount] of Object.entries(def.consumes)) {
                if (res === RESOURCE.POWER) {
                    // Only count power consumption for active buildings
                    consumption[RESOURCE.POWER] += amount;
                } else {
                    consumption[res] += amount;
                }
            }
        }

        // Population consumption
        const pop = gameState.resources[RESOURCE.POPULATION];
        if (pop > 0) {
            consumption[RESOURCE.FOOD] += pop * POP_CONSUMPTION[RESOURCE.FOOD];
            consumption[RESOURCE.WATER] += pop * POP_CONSUMPTION[RESOURCE.WATER];
            consumption[RESOURCE.OXYGEN] += pop * POP_CONSUMPTION[RESOURCE.OXYGEN];
        }

        // Apply production and consumption
        for (const res of [RESOURCE.POWER, RESOURCE.WATER, RESOURCE.OXYGEN, RESOURCE.FOOD, RESOURCE.MATERIALS]) {
            const net = production[res] - consumption[res];
            gameState.resources[res] += net;

            // Clamp to [0, max]
            if (gameState.resources[res] < 0) gameState.resources[res] = 0;
            const max = gameState.maxStorage[res];
            if (gameState.resources[res] > max) gameState.resources[res] = max;
        }

        // Store rates for display
        gameState.production = production;
        gameState.consumption = consumption;
        gameState.netRates = {};
        for (const res of [RESOURCE.POWER, RESOURCE.WATER, RESOURCE.OXYGEN, RESOURCE.FOOD, RESOURCE.MATERIALS]) {
            gameState.netRates[res] = production[res] - consumption[res];
        }

        // Low resource alerts (once per transition below threshold)
        for (const res of [RESOURCE.POWER, RESOURCE.WATER, RESOURCE.OXYGEN, RESOURCE.FOOD]) {
            const max = gameState.maxStorage[res];
            if (max <= 0) continue;
            const pct = (gameState.resources[res] / max) * 100;
            const alertKey = `_alert_${res}`;
            if (pct < RESOURCE_CRITICAL_PERCENT && !gameState[alertKey]) {
                gameState[alertKey] = true;
                const label = {power:'POWER',water:'WATER',oxygen:'OXYGEN',food:'FOOD'}[res];
                UI.addNotification(`CRITICAL: ${label} nearly depleted!`, 'danger');
            } else if (pct >= RESOURCE_ALERT_PERCENT) {
                gameState[alertKey] = false; // reset when recovered
            }
        }

        // Terraforming tick
        Terraforming.update(gameState);

        // Morale tick
        WorkSystem.updateMorale(gameState);

        // Check for colonist deaths
        this.checkColonistSurvival(gameState);
    },

    checkColonistSurvival(gameState) {
        const pop = gameState.resources[RESOURCE.POPULATION];
        if (pop <= 0) return;

        // If any vital resource is at 0, colonists die
        const dying = (
            gameState.resources[RESOURCE.FOOD] <= 0 ||
            gameState.resources[RESOURCE.WATER] <= 0 ||
            gameState.resources[RESOURCE.OXYGEN] <= 0
        );

        if (dying) {
            gameState.dyingTimer = (gameState.dyingTimer || 0) + RESOURCE_TICK;
            // Death timer: 5s normally, 10s with Medical Bay active
            const deathInterval = Buildings.hasMedicalBay(gameState) ? MEDICAL_BAY_DEATH_TIMER : 5;
            if (gameState.dyingTimer >= deathInterval) {
                gameState.dyingTimer = 0;
                gameState.resources[RESOURCE.POPULATION] -= 1;
                let reason = '';
                if (gameState.resources[RESOURCE.OXYGEN] <= 0) reason = 'suffocation';
                else if (gameState.resources[RESOURCE.WATER] <= 0) reason = 'dehydration';
                else reason = 'starvation';

                // Remove an NPC entity
                const removed = NPC.removeRandom(gameState);
                const deathMsg = removed
                    ? `${removed.name} died from ${reason}...`
                    : `A colonist died from ${reason}!`;
                Events.notifyThroughNPC(gameState, [deathMsg], 'danger');

                if (gameState.resources[RESOURCE.POPULATION] <= 0 && gameState.hadPopulation) {
                    // Chill mode: colonists die but game doesn't end
                    if (gameState.colonyMode !== 'chill') {
                        gameState.gameOver = true;
                        gameState.gameOverReason = 'All colonists have perished.';
                    }
                }
            }
        } else {
            gameState.dyingTimer = 0;
        }
    },

    // Add colonists (from events or landing pad)
    addColonists(gameState, count) {
        const space = gameState.maxStorage[RESOURCE.POPULATION] - gameState.resources[RESOURCE.POPULATION];
        const actual = Math.min(count, space);
        if (actual > 0) {
            gameState.resources[RESOURCE.POPULATION] += actual;
            gameState.hadPopulation = true;
            return actual;
        }
        return 0;
    },
};

// ============================================================
// Terraforming System
// ============================================================

const Terraforming = {
    update(gameState) {
        let points = 0;
        for (const building of gameState.buildings) {
            if (building.offline || building.malfunctioning || !building.active) continue;
            const rate = TERRAFORM_RATE[building.type];
            if (rate) points += rate;
        }

        gameState.terraformPoints += points;
        gameState.terraformPercent = Math.min(100,
            (gameState.terraformPoints / TERRAFORM_GOAL) * 100);

        // Win condition check (both modes)
        if (gameState.terraformPercent >= TERRAFORM_WIN_PERCENT &&
            !gameState.terraformWon) {
            gameState.terraformWon = true;
            Events.notifyThroughNPC(gameState,
                ['TERRAFORMING COMPLETE! Mars is transforming!',
                 'Underhill has achieved the impossible. Humanity has a second home.'],
                'success');
        }
    },
};
