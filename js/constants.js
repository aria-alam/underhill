// ============================================================
// Underhill — Game Constants
// ============================================================

const TILE_SIZE = 32; // pixels per grid tile (scaled up from 8x8 sprites)
const SPRITE_SIZE = 8; // base sprite resolution
const GRID_COLS = 128;
const GRID_ROWS = 96;

// Color palette (Mars Gameboy)
const COLORS = {
    SAND:       '#C4956A',
    DARK_ROCK:  '#8B5E3C',
    RUST:       '#A0522D',
    GREEN:      '#6B8E5A',
    METAL:      '#7B8794',
    POWER:      '#D4A843',
    WATER:      '#5B8FA8',
    DANGER:     '#C0392B',
    UI_DARK:    '#2C1810',
    UI_LIGHT:   '#F5E6D3',
    ICE:        '#A8C8D8',
    SAND_LIGHT: '#D4A878',
    SAND_DARK:  '#A07850',
    ROCK_LIGHT: '#9B6E4C',
    HABITAT:    '#6B8E5A',
    GLASS:      '#88B8A0',
    DOME:       '#D4D8DC',
    ORANGE:     '#D48043',
    BLACK:      '#1A0E08',
    WHITE:      '#F5E6D3',
    TRANSPARENT: null,
};

// Sprite color indices → actual colors
const PALETTE = [
    null,              // 0 = transparent
    COLORS.SAND,       // 1
    COLORS.DARK_ROCK,  // 2
    COLORS.RUST,       // 3
    COLORS.GREEN,      // 4
    COLORS.METAL,      // 5
    COLORS.POWER,      // 6
    COLORS.WATER,      // 7
    COLORS.DANGER,     // 8
    COLORS.UI_DARK,    // 9
    COLORS.UI_LIGHT,   // 10
    COLORS.ICE,        // 11
    COLORS.SAND_LIGHT, // 12
    COLORS.SAND_DARK,  // 13
    COLORS.ROCK_LIGHT, // 14
    COLORS.HABITAT,    // 15
    COLORS.GLASS,      // 16
    COLORS.DOME,       // 17
    COLORS.ORANGE,     // 18
    COLORS.BLACK,      // 19
    COLORS.WHITE,      // 20
];

// Resource types
const RESOURCE = {
    POWER:      'power',
    WATER:      'water',
    OXYGEN:     'oxygen',
    FOOD:       'food',
    MATERIALS:  'materials',
    POPULATION: 'population',
};

// Starting resources
const STARTING_RESOURCES = {
    [RESOURCE.POWER]:      0,
    [RESOURCE.WATER]:      0,
    [RESOURCE.OXYGEN]:     0,
    [RESOURCE.FOOD]:       0,
    [RESOURCE.MATERIALS]:  100,
    [RESOURCE.POPULATION]: 0,
};

const STARTING_MAX_STORAGE = {
    [RESOURCE.POWER]:      50,
    [RESOURCE.WATER]:      50,
    [RESOURCE.OXYGEN]:     50,
    [RESOURCE.FOOD]:       50,
    [RESOURCE.MATERIALS]:  200,
    [RESOURCE.POPULATION]: 0, // determined by habitats
};

const STORAGE_BONUS = 50; // per Storage Depot

// Building types
const BUILDING = {
    HABITAT:         'habitat',
    SOLAR_PANEL:     'solar_panel',
    WATER_EXTRACTOR: 'water_extractor',
    O2_GENERATOR:    'o2_generator',
    GREENHOUSE:      'greenhouse',
    STORAGE_DEPOT:   'storage_depot',
    LANDING_PAD:     'landing_pad',
    COMMAND_CENTER:  'command_center',
    MINING_DRILL:    'mining_drill',
    // Tier 2 — Colony Expansion (peakPop >= 8)
    SOLAR_FARM:          'solar_farm',
    HYDROPONICS_LAB:     'hydroponics_lab',
    MEDICAL_BAY:         'medical_bay',
    RESEARCH_LAB:        'research_lab',
    // Tier 3 — Advanced Colony (peakPop >= 20)
    FUSION_REACTOR:      'fusion_reactor',
    TERRAFORMING_TOWER:  'terraforming_tower',
    BIODOME:             'biodome',
    ADVANCED_DRILL:      'advanced_drill',
};

// Building definitions
const BUILDING_DEFS = {
    [BUILDING.HABITAT]: {
        name: 'Habitat',
        cost: 30,
        width: 2,
        height: 2,
        produces: {},
        consumes: {},
        popCapacity: 4,
        description: '+4 pop (pressurized, radiation-shielded)',
    },
    [BUILDING.SOLAR_PANEL]: {
        name: 'Solar Panel',
        cost: 10,
        width: 1,
        height: 1,
        produces: { [RESOURCE.POWER]: 5 },
        consumes: {},
        description: '+5 power/s (Mars gets 43% of Earth\'s sunlight)',
    },
    [BUILDING.WATER_EXTRACTOR]: {
        name: 'Water Extractor',
        cost: 20,
        width: 1,
        height: 1,
        produces: { [RESOURCE.WATER]: 3 },
        consumes: { [RESOURCE.POWER]: 2 },
        description: '+3 water/s, -2 pwr (pulls from subsurface ice)',
    },
    [BUILDING.O2_GENERATOR]: {
        name: 'O2 Generator',
        cost: 20,
        width: 1,
        height: 1,
        produces: { [RESOURCE.OXYGEN]: 3 },
        consumes: { [RESOURCE.POWER]: 2 },
        description: '+3 O2/s, -2 pwr (splits CO2, like NASA\'s MOXIE)',
    },
    [BUILDING.GREENHOUSE]: {
        name: 'Greenhouse',
        cost: 25,
        width: 2,
        height: 1,
        produces: { [RESOURCE.FOOD]: 2 },
        consumes: { [RESOURCE.POWER]: 1, [RESOURCE.WATER]: 1 },
        description: '+2 food/s, -1 pwr/water (UV-filtered growing)',
    },
    [BUILDING.STORAGE_DEPOT]: {
        name: 'Storage Depot',
        cost: 15,
        width: 1,
        height: 1,
        produces: {},
        consumes: {},
        storageBonus: STORAGE_BONUS,
        description: '+50 max storage (sealed regolith containers)',
    },
    [BUILDING.LANDING_PAD]: {
        name: 'Landing Pad',
        cost: 40,
        width: 2,
        height: 2,
        produces: {},
        consumes: {},
        description: 'Enables colonist arrivals from Earth orbit',
    },
    [BUILDING.COMMAND_CENTER]: {
        name: 'Command Center',
        cost: 0,
        width: 2,
        height: 2,
        produces: {},
        consumes: {},
        indestructible: true,
        description: 'Colony HQ — Eat, Rest, Heal',
    },
    [BUILDING.MINING_DRILL]: {
        name: 'Mining Drill',
        cost: 15,
        width: 1,
        height: 1,
        produces: { [RESOURCE.MATERIALS]: 2 },
        consumes: { [RESOURCE.POWER]: 2 },
        description: '+2 materials/s, -2 pwr (extracts iron oxide ore)',
    },
    // Tier 2 — Colony Expansion
    [BUILDING.SOLAR_FARM]: {
        name: 'Solar Farm',
        cost: 30,
        width: 2,
        height: 1,
        produces: { [RESOURCE.POWER]: 10 },
        consumes: {},
        description: '+10 pwr, 25% at night (large array with batteries)',
    },
    [BUILDING.HYDROPONICS_LAB]: {
        name: 'Hydroponics Lab',
        cost: 40,
        width: 2,
        height: 1,
        produces: { [RESOURCE.FOOD]: 4 },
        consumes: { [RESOURCE.POWER]: 2, [RESOURCE.WATER]: 1 },
        description: '+4 food/s, -2 pwr, -1 water (soilless growing)',
    },
    [BUILDING.MEDICAL_BAY]: {
        name: 'Medical Bay',
        cost: 25,
        width: 1,
        height: 1,
        produces: {},
        consumes: {},
        description: 'Doubles colonist survival time. Heals nearby player.',
    },
    [BUILDING.RESEARCH_LAB]: {
        name: 'Research Lab',
        cost: 40,
        width: 2,
        height: 1,
        produces: {},
        consumes: {},
        description: '+15% output to buildings within 3 tiles',
    },
    // Tier 3 — Advanced Colony
    [BUILDING.FUSION_REACTOR]: {
        name: 'Fusion Reactor',
        cost: 80,
        width: 2,
        height: 2,
        produces: { [RESOURCE.POWER]: 20 },
        consumes: {},
        description: '+20 pwr, works at night (deuterium fusion)',
    },
    [BUILDING.TERRAFORMING_TOWER]: {
        name: 'Terraforming Tower',
        cost: 70,
        width: 2,
        height: 2,
        produces: { [RESOURCE.OXYGEN]: 5, [RESOURCE.WATER]: 2 },
        consumes: { [RESOURCE.POWER]: 6 },
        description: '+5 O2, +2 water, -6 pwr (atmospheric processor)',
    },
    [BUILDING.BIODOME]: {
        name: 'Biodome',
        cost: 90,
        width: 2,
        height: 2,
        produces: { [RESOURCE.FOOD]: 5, [RESOURCE.OXYGEN]: 2 },
        consumes: { [RESOURCE.POWER]: 4, [RESOURCE.WATER]: 2 },
        popCapacity: 8,
        description: '+5 food, +2 O2, +8 pop, -4 pwr, -2 water',
    },
    [BUILDING.ADVANCED_DRILL]: {
        name: 'Advanced Drill',
        cost: 25,
        width: 1,
        height: 1,
        produces: { [RESOURCE.MATERIALS]: 4 },
        consumes: { [RESOURCE.POWER]: 3 },
        description: '+4 materials/s, -3 pwr (deep core extraction)',
    },
};

// Population consumption rates (per colonist per second)
const POP_CONSUMPTION = {
    [RESOURCE.FOOD]:   0.3,
    [RESOURCE.WATER]:  0.3,
    [RESOURCE.OXYGEN]: 0.3,
};

// Terrain types
const TERRAIN = {
    SAND:     'sand',
    ROCK:     'rock',
    DARK_ROCK:'dark_rock',
    ICE:      'ice',
    GRAVEL:   'gravel',
};

// Event types
const EVENT_TYPE = {
    DUST_STORM:    'dust_storm',
    MALFUNCTION:   'malfunction',
    METEOR_STRIKE: 'meteor_strike',
    SUPPLY_DROP:   'supply_drop',
    NEW_COLONISTS: 'new_colonists',
};

// Event config
const EVENT_CONFIG = {
    MIN_INTERVAL: 30,    // minimum seconds between events
    MAX_INTERVAL: 60,    // maximum seconds between events
    [EVENT_TYPE.DUST_STORM]: {
        name: 'Dust Storm!',
        duration: 30,
        solarReduction: 0.5,
        message: 'A dust storm reduces solar output by 50%!',
    },
    [EVENT_TYPE.MALFUNCTION]: {
        name: 'Equipment Malfunction!',
        duration: 20,
        message: 'A building has malfunctioned and gone offline!',
    },
    [EVENT_TYPE.METEOR_STRIKE]: {
        name: 'Meteor Strike!',
        warningTime: 5,
        message: 'Incoming meteor! A building will be destroyed!',
    },
    [EVENT_TYPE.SUPPLY_DROP]: {
        name: 'Supply Drop!',
        materialsBonus: 30,
        message: 'A supply ship dropped extra materials! +30 materials',
    },
    [EVENT_TYPE.NEW_COLONISTS]: {
        name: 'New Colonists!',
        count: 2,
        message: 'New colonists have arrived!',
    },
};

// Sol duration in real seconds (5 minutes per sol)
const SOL_DURATION = 300;

// Resource tick interval in seconds
const RESOURCE_TICK = 1;

// Milestones / achievements
const MILESTONES = [
    { id: 'survive_10',  name: 'Martian Settler',   desc: 'Survive 10 sols',          check: (g) => g.sol >= 10 },
    { id: 'survive_100', name: 'Martian Veteran',    desc: 'Survive 100 sols',         check: (g) => g.sol >= 100 },
    { id: 'pop_10',      name: 'Small Community',    desc: 'Reach 10 population',      check: (g) => g.resources[RESOURCE.POPULATION] >= 10 },
    { id: 'pop_20',      name: 'Thriving Colony',    desc: 'Reach 20 population',      check: (g) => g.resources[RESOURCE.POPULATION] >= 20 },
    { id: 'tier_2',      name: 'Colony Expansion',   desc: 'Unlock Tier 2 buildings',  check: (g) => (g.peakPopulation || 0) >= 8 },
    { id: 'tier_3',      name: 'Advanced Colony',    desc: 'Unlock Tier 3 buildings',  check: (g) => (g.peakPopulation || 0) >= 20 },
    { id: 'all_types',   name: 'Master Builder',     desc: 'Build all building types',  check: (g) => {
        const types = new Set(g.buildings.map(b => b.type));
        return Object.values(BUILDING).every(t => t === BUILDING.COMMAND_CENTER || types.has(t));
    }},
];

// Unlock tiers — buildings gated by peakPopulation
const UNLOCK_TIERS = {
    1: {
        pop: 0,
        buildings: [
            BUILDING.SOLAR_PANEL, BUILDING.WATER_EXTRACTOR, BUILDING.O2_GENERATOR,
            BUILDING.MINING_DRILL, BUILDING.HABITAT, BUILDING.GREENHOUSE,
            BUILDING.STORAGE_DEPOT, BUILDING.LANDING_PAD,
        ],
    },
    2: {
        pop: 8,
        buildings: [BUILDING.SOLAR_FARM, BUILDING.HYDROPONICS_LAB, BUILDING.MEDICAL_BAY, BUILDING.RESEARCH_LAB],
    },
    3: {
        pop: 20,
        buildings: [BUILDING.FUSION_REACTOR, BUILDING.TERRAFORMING_TOWER, BUILDING.BIODOME, BUILDING.ADVANCED_DRILL],
    },
};

// Research Lab bonus
const RESEARCH_LAB_BONUS = 0.15;
const RESEARCH_LAB_RANGE = 3;

// Medical Bay constants
const MEDICAL_BAY_DEATH_TIMER = 10;  // doubled from 5s
const MEDICAL_BAY_HEAL_RATE = 0.5;   // HP/s when player is nearby
const MEDICAL_BAY_RANGE = 3;         // tiles

// Adjacency bonus system
const ADJACENCY_RADIUS = 3; // tiles
const ADJACENCY_BONUSES = {
    [BUILDING.SOLAR_PANEL]: {
        nearType: BUILDING.SOLAR_PANEL,
        bonus: 0.25,
        label: 'Solar Farm',
        tip: 'Near other Solar Panels: +25%',
    },
    [BUILDING.WATER_EXTRACTOR]: {
        nearTerrain: TERRAIN.ICE,
        bonus: 0.30,
        label: 'Ice Deposit',
        tip: 'Near ice terrain: +30%',
    },
    [BUILDING.GREENHOUSE]: {
        nearType: BUILDING.WATER_EXTRACTOR,
        bonus: 0.30,
        label: 'Irrigation',
        tip: 'Near Water Extractors: +30%',
    },
    [BUILDING.O2_GENERATOR]: {
        nearType: BUILDING.GREENHOUSE,
        bonus: 0.25,
        label: 'Plant Cycle',
        tip: 'Near Greenhouses: +25%',
    },
    [BUILDING.MINING_DRILL]: {
        nearTerrain: TERRAIN.DARK_ROCK,
        bonus: 0.30,
        label: 'Rich Deposits',
        tip: 'Near dark rock: +30%',
    },
    [BUILDING.SOLAR_FARM]: {
        nearType: [BUILDING.SOLAR_PANEL, BUILDING.SOLAR_FARM],
        bonus: 0.25,
        label: 'Solar Network',
        tip: 'Near Solar Panels/Farms: +25%',
    },
    [BUILDING.HYDROPONICS_LAB]: {
        nearType: BUILDING.RESEARCH_LAB,
        bonus: 0.20,
        label: 'Research Boost',
        tip: 'Near Research Lab: +20%',
    },
    [BUILDING.TERRAFORMING_TOWER]: {
        nearType: [BUILDING.GREENHOUSE, BUILDING.HYDROPONICS_LAB],
        bonus: 0.20,
        label: 'Bio Synergy',
        tip: 'Near Greenhouses/Hydroponics: +20%',
    },
    [BUILDING.ADVANCED_DRILL]: {
        nearTerrain: TERRAIN.DARK_ROCK,
        bonus: 0.30,
        label: 'Rich Deposits',
        tip: 'Near dark rock: +30%',
    },
};

// Auto-save interval in seconds
const AUTO_SAVE_INTERVAL = 30;

// Player constants
const PLAYER_SPEED = 80;         // pixels per second
const PLAYER_HITBOX_INSET = 6;   // pixels inset from tile edges for collision
const NPC_SPEED = 40;            // pixels per second

// NPC behavior
const NPC_IDLE_MIN = 3;          // min idle seconds
const NPC_IDLE_MAX = 8;          // max idle seconds
const NPC_WANDER_RADIUS = 8;     // tiles from home

// Dialogue / Interaction
const DIALOGUE_TEXT_SPEED = 40;  // characters per second
const INTERACT_KEY = 'e';

// Player survival stats
const PLAYER_MAX_HP = 100;
const PLAYER_MAX_ENERGY = 100;
const PLAYER_MAX_HUNGER = 100;

// Stat drain rates (per second)
const ENERGY_DRAIN_IDLE = 0.1;     // ~16 min idle to deplete
const ENERGY_DRAIN_MOVING = 0.4;   // ~4 min continuous walking
const HUNGER_DRAIN = 0.05;         // ~33 min to deplete

// Damage rates (per second)
const NIGHT_COLD_DAMAGE = 0.5;     // cold is dangerous but not instant death
const STORM_DAMAGE = 1;
const STARVATION_DAMAGE = 0.5;

// HQ constants
const HQ_EAT_COST = 10;         // food units to eat
const HQ_HEAL_COST = 5;         // materials to heal
const HQ_SHELTER_RADIUS = 3;    // tiles from any building for shelter
const PASSOUT_STAT_VALUE = 25;   // stats set to this on pass out
const PASSOUT_TIME_PENALTY = 30; // seconds added to sol time on pass out

// Faction system
const FACTION = {
    NEUTRAL: 'neutral',
    GREEN:   'green',
    RED:     'red',
};

const FACTION_EMERGE_POP = 6;   // factions appear at this population
const FACTION_WEIGHTS = {       // weights for new arrivals at 6+ pop (conflict mode)
    [FACTION.GREEN]:   0.40,
    [FACTION.RED]:     0.25,
    [FACTION.NEUTRAL]: 0.35,
};
const FACTION_COLORS = {
    [FACTION.GREEN]:   '#27AE60',
    [FACTION.RED]:     '#C0392B',
    [FACTION.NEUTRAL]: '#D4A843',
};

// Work / staffing
const STAFFED_BONUS = 0.30;           // +30% production for staffed buildings
const FACTION_MATCH_BONUS = 0.15;     // additional +15% for faction-matched buildings
const STAFFABLE_BUILDINGS = [
    BUILDING.SOLAR_PANEL,
    BUILDING.WATER_EXTRACTOR,
    BUILDING.O2_GENERATOR,
    BUILDING.GREENHOUSE,
    BUILDING.MINING_DRILL,
    BUILDING.SOLAR_FARM,
    BUILDING.HYDROPONICS_LAB,
    BUILDING.MEDICAL_BAY,
    BUILDING.RESEARCH_LAB,
    BUILDING.ADVANCED_DRILL,
    BUILDING.FUSION_REACTOR,
    BUILDING.TERRAFORMING_TOWER,
    BUILDING.BIODOME,
];
const GREEN_BUILDINGS = [BUILDING.GREENHOUSE, BUILDING.O2_GENERATOR, BUILDING.HYDROPONICS_LAB, BUILDING.TERRAFORMING_TOWER, BUILDING.BIODOME];
const RED_BUILDINGS   = [BUILDING.MINING_DRILL, BUILDING.WATER_EXTRACTOR, BUILDING.SOLAR_PANEL, BUILDING.SOLAR_FARM, BUILDING.ADVANCED_DRILL, BUILDING.FUSION_REACTOR];

// Sabotage (conflict mode only)
const SABOTAGE_CHANCE_PER_TICK = 0.003; // ~0.3% per second for idle Red NPCs
const SABOTAGE_DURATION = 15;            // seconds offline
const SABOTAGE_TARGETS = [BUILDING.GREENHOUSE, BUILDING.O2_GENERATOR];

// Terraforming
const TERRAFORM_GOAL = 50000;        // total points to reach 100%
const TERRAFORM_RATE = {              // points per tick per building
    [BUILDING.GREENHOUSE]: 1,
    [BUILDING.O2_GENERATOR]: 1,
    [BUILDING.HYDROPONICS_LAB]: 2,
    [BUILDING.TERRAFORMING_TOWER]: 5,
    [BUILDING.BIODOME]: 3,
};
const TERRAFORM_WIN_PERCENT = 100;    // win at this %

// Greening thresholds (terraforming % at which vegetation tier appears)
const GREEN_TIER_1 = 10;   // lichen
const GREEN_TIER_2 = 30;   // shrubs
const GREEN_TIER_3 = 60;   // grass patches
const GREEN_TIER_4 = 85;   // small trees
const GREEN_RADIUS = 6;    // tiles around green buildings

// Faction morale
const MORALE_MAX = 100;
const MORALE_START = 50;
const MORALE_DRIFT_RATE = 0.5;    // per tick, morale drifts toward 50
const MORALE_BUILDING_BOOST = 2;  // per aligned building per tick
const MORALE_BUILDING_PENALTY = 1;// per opposed building per tick
const MORALE_SABOTAGE_THRESHOLD = 30; // Red morale below this -> higher sabotage
const MORALE_PRODUCTIVITY_THRESHOLD = 70; // morale above this -> bonus productivity

// Resource alert thresholds
const RESOURCE_ALERT_PERCENT = 15;     // below 15% triggers warning
const RESOURCE_CRITICAL_PERCENT = 5;   // below 5% triggers critical alert
