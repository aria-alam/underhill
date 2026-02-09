// ============================================================
// Underhill — Random Events
// ============================================================

const Events = {
    nextEventTimer: 0,
    activeEvents: [],

    init() {
        this.nextEventTimer = this.randomInterval();
        this.activeEvents = [];
    },

    randomInterval() {
        return EVENT_CONFIG.MIN_INTERVAL + Math.random() * (EVENT_CONFIG.MAX_INTERVAL - EVENT_CONFIG.MIN_INTERVAL);
    },

    update(gameState, dt) {
        // Count down to next event
        this.nextEventTimer -= dt;
        if (this.nextEventTimer <= 0) {
            this.triggerRandomEvent(gameState);
            this.nextEventTimer = this.randomInterval();
        }

        // Update active events
        for (let i = this.activeEvents.length - 1; i >= 0; i--) {
            const evt = this.activeEvents[i];
            evt.timer -= dt;

            if (evt.timer <= 0) {
                this.endEvent(evt, gameState);
                this.activeEvents.splice(i, 1);
            }
        }

        // Update meteor warning
        if (gameState.meteorWarning) {
            gameState.meteorWarning.timeLeft -= dt;
            if (gameState.meteorWarning.timeLeft <= 0) {
                this.executeMeteorStrike(gameState);
                gameState.meteorWarning = null;
            }
        }
    },

    triggerRandomEvent(gameState) {
        if (gameState.buildings.length === 0) return;

        const eventTypes = [
            EVENT_TYPE.DUST_STORM,
            EVENT_TYPE.MALFUNCTION,
            EVENT_TYPE.SUPPLY_DROP,
        ];

        if (gameState.buildings.length > 1) {
            eventTypes.push(EVENT_TYPE.METEOR_STRIKE);
        }

        if (Buildings.hasLandingPad(gameState) && gameState.popCapacity > gameState.resources[RESOURCE.POPULATION]) {
            eventTypes.push(EVENT_TYPE.NEW_COLONISTS);
        }

        const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        this.triggerEvent(type, gameState);
    },

    triggerEvent(type, gameState) {
        const config = EVENT_CONFIG[type];

        switch (type) {
            case EVENT_TYPE.DUST_STORM:
                gameState.dustStormActive = true;
                Renderer.dustStormAlpha = 1;
                this.activeEvents.push({ type, timer: config.duration });
                this.notifyThroughNPC(gameState, [config.message], 'warning');
                if (typeof Music !== 'undefined') Music.playSFX('dust_storm');
                break;

            case EVENT_TYPE.MALFUNCTION: {
                const building = Buildings.getRandomActive(gameState);
                if (!building) return;
                building.malfunctioning = true;
                building.malfunctionTimer = config.duration;
                this.activeEvents.push({ type, timer: config.duration, buildingId: building.id });
                this.notifyThroughNPC(gameState,
                    [`${BUILDING_DEFS[building.type].name} has malfunctioned!`, 'It should be back online soon.'],
                    'warning'
                );
                break;
            }

            case EVENT_TYPE.METEOR_STRIKE: {
                const target = Buildings.getRandomActive(gameState);
                if (!target) return;
                gameState.meteorWarning = {
                    target,
                    timeLeft: config.warningTime,
                };
                this.notifyThroughNPC(gameState,
                    ['Incoming meteor detected!', 'A building is in danger!'],
                    'danger'
                );
                if (typeof Music !== 'undefined') Music.playSFX('meteor_warning');
                break;
            }

            case EVENT_TYPE.SUPPLY_DROP:
                gameState.resources[RESOURCE.MATERIALS] = Math.min(
                    gameState.resources[RESOURCE.MATERIALS] + config.materialsBonus,
                    gameState.maxStorage[RESOURCE.MATERIALS]
                );
                this.notifyThroughNPC(gameState,
                    ['A supply ship just dropped extra materials!', `+${config.materialsBonus} materials received.`],
                    'success'
                );
                if (typeof Music !== 'undefined') Music.playSFX('supply_drop');
                break;

            case EVENT_TYPE.NEW_COLONISTS: {
                const added = Resources.addColonists(gameState, config.count);
                if (added > 0) {
                    // Spawn NPC entities for each new colonist with faction assignment
                    for (let i = 0; i < added; i++) {
                        const newNpc = NPC.spawn(gameState);
                        if (newNpc) {
                            const faction = WorkSystem.assignFaction(gameState);
                            newNpc.faction = faction;
                            newNpc.suitColor = FACTION_COLORS[faction];
                            newNpc.idleLines = WorkSystem.getIdleLines(faction);
                        }
                    }
                    this.notifyThroughNPC(gameState,
                        [`${added} new colonists have arrived!`, 'Welcome to the colony!'],
                        'success'
                    );
                    if (typeof Music !== 'undefined') Music.playSFX('colonist_arrive');
                } else {
                    // Explain why colonists didn't arrive
                    if (!Buildings.hasLandingPad(gameState)) {
                        UI.addNotification('Colonists turned away — no Landing Pad.', 'warning');
                    } else if (gameState.popCapacity <= gameState.resources[RESOURCE.POPULATION]) {
                        UI.addNotification('Colonists turned away — no housing capacity. Build Habitats!', 'warning');
                    }
                }
                break;
            }
        }
    },

    executeMeteorStrike(gameState) {
        if (!gameState.meteorWarning) return;
        const target = gameState.meteorWarning.target;

        const exists = gameState.buildings.find(b => b.id === target.id);
        if (exists) {
            const name = BUILDING_DEFS[target.type].name;
            Buildings.remove(gameState, target.id);
            this.notifyThroughNPC(gameState, [`The meteor destroyed the ${name}!`], 'danger');
            if (typeof Music !== 'undefined') Music.playSFX('meteor_hit');
        }
    },

    endEvent(evt, gameState) {
        switch (evt.type) {
            case EVENT_TYPE.DUST_STORM:
                gameState.dustStormActive = false;
                Renderer.dustStormAlpha = 0;
                this.notifyThroughNPC(gameState, ['The dust storm has cleared.'], 'info');
                break;

            case EVENT_TYPE.MALFUNCTION: {
                const building = gameState.buildings.find(b => b.id === evt.buildingId);
                if (building) {
                    building.malfunctioning = false;
                    this.notifyThroughNPC(gameState,
                        [`${BUILDING_DEFS[building.type].name} has been repaired.`],
                        'success'
                    );
                    if (typeof Music !== 'undefined') Music.playSFX('repair');
                }
                break;
            }

            case 'sabotage': {
                const building = gameState.buildings.find(b => b.id === evt.buildingId);
                if (building) {
                    building.malfunctioning = false;
                    building.sabotaged = false;
                    building.sabotageTimer = 0;
                    this.notifyThroughNPC(gameState,
                        [`${BUILDING_DEFS[building.type].name} has been repaired after sabotage.`],
                        'success'
                    );
                    if (typeof Music !== 'undefined') Music.playSFX('repair');
                }
                break;
            }
        }
    },

    // Deliver event messages through NPCs when available, fall back to notifications
    notifyThroughNPC(gameState, lines, type) {
        // Always show a brief HUD notification for important events
        if (type === 'danger' || type === 'warning' || type === 'success') {
            UI.addNotification(lines[0], type);
        }

        // Queue dialogue on a random NPC
        if (NPC.list.length > 0) {
            const npc = NPC.list[Math.floor(Math.random() * NPC.list.length)];
            NPC.queueDialogue(npc.id, { lines, type });
        } else {
            // No NPCs exist yet, use notification
            UI.addNotification(lines[0], type || 'info');
        }
    },
};
