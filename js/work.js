// ============================================================
// Underhill — Work Assignment + Faction System
// ============================================================

const WorkSystem = {

    // Assign an NPC to a building
    assign(npc, building) {
        // Unassign from previous building if any
        if (npc.assignedBuildingId !== null) {
            this.unassign(npc, null);
        }
        npc.assignedBuildingId = building.id;
        building.assignedNpcId = npc.id;
        // Walk to the building
        const def = BUILDING_DEFS[building.type];
        const targetCol = building.col + Math.floor(def.width / 2);
        const targetRow = building.row + def.height; // stand in front
        const dest = Grid.findWalkableNear(targetCol, targetRow, 3);
        if (dest) {
            npc.targetX = dest.col * TILE_SIZE;
            npc.targetY = dest.row * TILE_SIZE;
            npc.homeCol = dest.col;
            npc.homeRow = dest.row;
            npc.state = 'walking';
        }
    },

    // Unassign an NPC from their building
    unassign(npc, gameState) {
        if (npc.assignedBuildingId !== null) {
            if (gameState) {
                const building = gameState.buildings.find(b => b.id === npc.assignedBuildingId);
                if (building) {
                    building.assignedNpcId = null;
                }
            }
            npc.assignedBuildingId = null;
        }
    },

    // Unassign by building (when building is destroyed)
    unassignBuilding(building, npcList) {
        if (building.assignedNpcId !== null) {
            const npc = npcList.find(n => n.id === building.assignedNpcId);
            if (npc) {
                npc.assignedBuildingId = null;
            }
            building.assignedNpcId = null;
        }
    },

    // Clear building assignment when NPC dies
    clearNpcFromBuilding(npc, gameState) {
        if (npc.assignedBuildingId !== null) {
            const building = gameState.buildings.find(b => b.id === npc.assignedBuildingId);
            if (building) {
                building.assignedNpcId = null;
            }
        }
    },

    // Get staff bonus multiplier for a building (0, 0.30, or 0.45)
    getStaffBonus(building, gameState) {
        if (!building.assignedNpcId) return 0;
        const npc = NPC.list.find(n => n.id === building.assignedNpcId);
        if (!npc) return 0;

        let bonus = STAFFED_BONUS;

        // Faction match bonus (conflict mode only)
        if (gameState.colonyMode === 'conflict') {
            if (npc.faction === FACTION.GREEN && GREEN_BUILDINGS.includes(building.type)) {
                bonus += FACTION_MATCH_BONUS;
            } else if (npc.faction === FACTION.RED && RED_BUILDINGS.includes(building.type)) {
                bonus += FACTION_MATCH_BONUS;
            }
        }

        return bonus;
    },

    // List staffable buildings that are unoccupied
    getStaffableBuildings(npc, gameState) {
        return gameState.buildings.filter(b => {
            if (!STAFFABLE_BUILDINGS.includes(b.type)) return false;
            if (b.assignedNpcId !== null && b.assignedNpcId !== npc.id) return false;
            if (b.assignedNpcId === npc.id) return false; // already assigned here
            return true;
        });
    },

    // Open the building assignment menu as a dialogue choice list
    openAssignMenu(npc, buildings, gameState) {
        const choices = buildings.map(b => {
            const def = BUILDING_DEFS[b.type];
            const matchLabel = this.getFactionMatchLabel(npc, b, gameState);
            return {
                label: `${def.name} ${matchLabel}`,
                action: () => {
                    this.assign(npc, b);
                    UI.addNotification(`${npc.name} assigned to ${def.name}`, 'success');
                },
            };
        });

        choices.push({
            label: 'Cancel',
            action: () => {},
        });

        Dialogue.open(
            npc.name,
            npc.portrait,
            ['Which building should I work at?'],
            choices,
            npc.id,
            null,
            npc.suitColor
        );
    },

    // Assign a faction based on population and mode
    assignFaction(gameState) {
        if (gameState.colonyMode !== 'conflict') return FACTION.NEUTRAL;
        const pop = gameState.resources[RESOURCE.POPULATION];
        if (pop < FACTION_EMERGE_POP) return FACTION.NEUTRAL;

        // Weighted random
        const r = Math.random();
        if (r < FACTION_WEIGHTS[FACTION.GREEN]) return FACTION.GREEN;
        if (r < FACTION_WEIGHTS[FACTION.GREEN] + FACTION_WEIGHTS[FACTION.RED]) return FACTION.RED;
        return FACTION.NEUTRAL;
    },

    // Per-frame sabotage check for idle Red NPCs (conflict mode only)
    checkSabotage(npc, dt, gameState) {
        if (gameState.colonyMode !== 'conflict') return;
        if (npc.faction !== FACTION.RED) return;
        if (npc.assignedBuildingId !== null) return; // working Reds don't sabotage
        if (npc.state === 'talking') return;

        npc.sabotageTimer = (npc.sabotageTimer || 0) + dt;
        if (npc.sabotageTimer < 1) return; // check once per second
        npc.sabotageTimer -= 1;

        if (Math.random() > SABOTAGE_CHANCE_PER_TICK) return;

        // Find a sabotage target
        const targets = gameState.buildings.filter(b =>
            SABOTAGE_TARGETS.includes(b.type) &&
            !b.offline && !b.malfunctioning && !b.sabotaged
        );
        if (targets.length === 0) return;

        const target = targets[Math.floor(Math.random() * targets.length)];
        target.sabotaged = true;
        target.malfunctioning = true;
        target.sabotageTimer = SABOTAGE_DURATION;

        // Add event for auto-repair
        Events.activeEvents.push({
            type: 'sabotage',
            timer: SABOTAGE_DURATION,
            buildingId: target.id,
        });

        const defName = BUILDING_DEFS[target.type].name;
        UI.addNotification(`SABOTAGE! ${npc.name} took the ${defName} offline!`, 'danger');
        Events.notifyThroughNPC(gameState,
            [`SABOTAGE! ${npc.name} has taken the ${defName} offline!`, 'It will be back online in 15 seconds.'],
            'danger'
        );
    },

    // Get faction-appropriate greeting
    getGreeting(npc) {
        if (npc.faction === FACTION.GREEN) {
            return DIALOGUE_GREEN[Math.floor(Math.random() * DIALOGUE_GREEN.length)];
        }
        if (npc.faction === FACTION.RED) {
            return DIALOGUE_RED[Math.floor(Math.random() * DIALOGUE_RED.length)];
        }
        return DIALOGUE_NEUTRAL[Math.floor(Math.random() * DIALOGUE_NEUTRAL.length)];
    },

    // Get faction-specific idle lines for an NPC
    getIdleLines(faction) {
        if (faction === FACTION.GREEN) return DIALOGUE_GREEN;
        if (faction === FACTION.RED) return DIALOGUE_RED;
        return DIALOGUE_NEUTRAL;
    },

    // Label for building assignment menu
    getFactionMatchLabel(npc, building, gameState) {
        if (gameState.colonyMode !== 'conflict') return '';
        if (npc.faction === FACTION.GREEN && GREEN_BUILDINGS.includes(building.type)) return '[GOOD FIT]';
        if (npc.faction === FACTION.RED && RED_BUILDINGS.includes(building.type)) return '[GOOD FIT]';
        if (npc.faction === FACTION.GREEN && RED_BUILDINGS.includes(building.type)) return '[OPPOSED]';
        if (npc.faction === FACTION.RED && GREEN_BUILDINGS.includes(building.type)) return '[OPPOSED]';
        return '';
    },
};

// Faction dialogue pools
const DIALOGUE_GREEN = [
    "Terraforming Mars is humanity's greatest challenge. We can seed the atmosphere with greenhouse gases to warm it up.",
    "Imagine breathable air on Mars! If we thicken the atmosphere enough, we could walk outside without suits someday.",
    "Cyanobacteria could survive on Mars. Release enough of them and they'd start producing oxygen naturally.",
    "The Greenhouse effect isn't always bad — here, it's our salvation. More CO2 traps heat, melts ice, releases water.",
    "I've been studying areothermal vents. If we tap them, we could warm entire regions and create liquid water.",
    "Mars biology potential is real — extremophiles on Earth thrive in conditions similar to Martian subsurface.",
    "Every greenhouse we build is a step toward a living Mars. Plants transform CO2 into oxygen — nature's MOXIE.",
    "Atmospheric seeding with perfluorocarbons could warm Mars 10 degrees in a century. We should start now.",
    "The Greens believe Mars should bloom. A dead world given life — that's not destruction, it's creation.",
    "Plant cycles are key. Our greenhouses don't just feed us — they're prototypes for planetary-scale terraforming.",
];

const DIALOGUE_RED = [
    "Mars has its own beauty. Before we change it forever, shouldn't we understand what we're destroying?",
    "Areology — the study of Mars itself — matters. This landscape is 4 billion years old. We just got here.",
    "The Reds believe Mars has intrinsic value. It's not a blank canvas for human ambition.",
    "Terraforming would destroy unique geological formations we haven't even cataloged yet.",
    "There might be native Martian life deep underground. Terraforming could wipe it out before we find it.",
    "Colonialism didn't work on Earth. Why are we so eager to repeat it on another world?",
    "The beauty of Mars IS the red dust, the ancient craters, the silence. Why fill it with noise?",
    "We should be students of Mars, not its conquerors. Study the areology. Respect what's here.",
    "Every building we place changes Mars irreversibly. At least the mining drills work WITH the land.",
    "The original Mars has value. Not everything needs to be green to be alive.",
];

const DIALOGUE_NEUTRAL = [
    "I'm just focused on keeping everyone alive. Politics can wait until we're not rationing oxygen.",
    "Green, Red — doesn't matter to me. I'll work wherever I'm needed.",
    "Survival first, philosophy later. Have you checked the power levels?",
    "Colony's coming along. Whatever faction you support, we all need food and water.",
    "I try to stay out of the Green-Red debate. Both sides make good points.",
    "Another sol, another adventure. Let's keep the colony running smoothly.",
    "I'll work any job you need, Commander. Just tell me where to go.",
    "The dust gets everywhere regardless of your politics.",
    "Smart building placement keeps us all alive. That's my philosophy.",
    "We should stockpile more resources. Can't argue ideology on an empty stomach.",
];
