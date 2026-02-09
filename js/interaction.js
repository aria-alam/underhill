// ============================================================
// Underhill — Interaction Dispatcher
// ============================================================

const Interaction = {

    // Called when player presses E
    execute(gameState) {
        // If dialogue is active, advance it
        if (Dialogue.active) {
            Dialogue.advance();
            return;
        }

        const facing = Player.getFacingTile();
        if (!facing) return;
        const { col, row } = facing;

        // Check for NPC at exact tile first
        if (typeof NPC !== 'undefined') {
            const npc = NPC.findAtTile(col, row);
            if (npc) {
                this.talkToNPC(npc, gameState);
                return;
            }
        }

        // Check for building at facing tile
        if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
            const buildingId = Grid.occupied[row] && Grid.occupied[row][col];
            if (buildingId) {
                this.inspectBuilding(buildingId, gameState);
                return;
            }
        }

        // Empty walkable tile — open build menu
        if (Grid.isWalkable(col, row)) {
            Dialogue.openBuildMenu(gameState, col, row);
            return;
        }

        // Fallback: forgiving NPC search (2-tile range) for nearby NPCs
        if (typeof NPC !== 'undefined') {
            const npc = NPC.findAtTile(col, row, true);
            if (npc) {
                this.talkToNPC(npc, gameState);
                return;
            }
        }
    },

    talkToNPC(npc, gameState) {
        // Set NPC to talking state, face the player
        npc.state = 'talking';
        // Face toward player
        const dx = Player.x - npc.x;
        const dy = Player.y - npc.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            npc.direction = dx > 0 ? 'right' : 'left';
        } else {
            npc.direction = dy > 0 ? 'down' : 'up';
        }

        // Check for queued dialogue
        if (npc.dialogueQueue.length > 0) {
            const entry = npc.dialogueQueue.shift();
            Dialogue.open(
                npc.name,
                npc.portrait,
                entry.lines,
                entry.choices || null,
                npc.id,
                null,
                npc.suitColor
            );
        } else {
            // Get an idle line
            const lines = npc.idleLines || WorkSystem.getIdleLines(npc.faction);
            const line = lines[Math.floor(Math.random() * lines.length)];

            // Build work assignment choices
            const choices = [];
            const staffable = gameState ? WorkSystem.getStaffableBuildings(npc, gameState) : [];

            if (staffable.length > 0) {
                choices.push({
                    label: 'Assign to building',
                    action: () => {
                        WorkSystem.openAssignMenu(npc, staffable, gameState);
                    },
                });
            }

            if (npc.assignedBuildingId !== null) {
                const assignedBuilding = gameState ? gameState.buildings.find(b => b.id === npc.assignedBuildingId) : null;
                const bName = assignedBuilding ? BUILDING_DEFS[assignedBuilding.type].name : 'building';
                choices.push({
                    label: `Unassign from ${bName}`,
                    action: () => {
                        WorkSystem.unassign(npc, gameState);
                        UI.addNotification(`${npc.name} unassigned`, 'info');
                    },
                });
            }

            choices.push({
                label: 'Just talking',
                action: () => {},
            });

            Dialogue.open(
                npc.name,
                npc.portrait,
                [line],
                choices,
                npc.id,
                null,
                npc.suitColor
            );
        }
    },

    inspectBuilding(buildingId, gameState) {
        const building = gameState.buildings.find(b => b.id === buildingId);
        if (!building) return;

        // Special case: Command Center opens HQ menu
        if (building.type === BUILDING.COMMAND_CENTER) {
            this.openHQMenu(gameState);
            return;
        }

        const def = BUILDING_DEFS[building.type];
        const lines = [`${def.name}`];

        // Status
        if (building.sabotaged) {
            lines.push('Status: SABOTAGED - auto-repairing...');
        } else if (building.malfunctioning) {
            lines.push('Status: MALFUNCTION - repairs in progress');
        } else if (building.offline) {
            lines.push('Status: OFFLINE');
        } else if (!building.active) {
            lines.push('Status: NO POWER');
        } else {
            lines.push('Status: Operational');
        }

        // Production/consumption info
        lines.push(def.description);

        // Staffing info
        if (STAFFABLE_BUILDINGS.includes(building.type)) {
            if (building.assignedNpcId) {
                const worker = NPC.list.find(n => n.id === building.assignedNpcId);
                if (worker) {
                    const staffBonus = WorkSystem.getStaffBonus(building, gameState);
                    const factionLabel = gameState.colonyMode === 'conflict' ? ` (${worker.faction})` : '';
                    lines.push(`Staffed: ${worker.name}${factionLabel} — +${Math.round(staffBonus * 100)}% output`);
                }
            } else {
                lines.push('Unstaffed — assign a colonist for +30% output');
            }
        }

        // Adjacency bonus info
        const adjBonus = Buildings.getAdjacencyBonus(building, gameState);
        const rule = ADJACENCY_BONUSES[building.type];
        if (rule) {
            if (adjBonus > 0) {
                lines.push(`${rule.label} bonus active: +${Math.round(rule.bonus * 100)}% output!`);
            } else {
                lines.push(`Tip: ${rule.tip}`);
            }
        }

        // Research Lab bonus info
        const researchBonus = Buildings.getResearchLabBonus(building, gameState);
        if (researchBonus > 0) {
            lines.push(`Research Lab bonus: +${Math.round(researchBonus * 100)}% output`);
        }

        const choices = [];
        choices.push({ label: 'Close', action: () => {} });

        // Demolish option (not for HQ) — listed after Close so default is safe
        if (!def.indestructible) {
            const refund = Math.floor(def.cost * 0.5);
            choices.push({
                label: `Demolish (recover ${refund} MAT)`,
                action: () => {
                    Buildings.remove(gameState, building.id);
                    gameState.resources[RESOURCE.MATERIALS] += refund;
                    UI.addNotification(`${def.name} demolished.`, 'info');
                }
            });
        }

        Dialogue.open('SYSTEM', null, lines, choices, null, null, null);
    },

    openHQMenu(gameState) {
        const foodAvail = Math.floor(gameState.resources[RESOURCE.FOOD]);
        const matAvail = Math.floor(gameState.resources[RESOURCE.MATERIALS]);
        const isNight = gameState.isNighttime;

        const choices = [
            {
                label: `Eat Rations (${HQ_EAT_COST} food)${foodAvail >= HQ_EAT_COST ? '' : ' [NO FOOD]'}`,
                action: () => {
                    if (gameState.resources[RESOURCE.FOOD] >= HQ_EAT_COST) {
                        gameState.resources[RESOURCE.FOOD] -= HQ_EAT_COST;
                        Player.hunger = PLAYER_MAX_HUNGER;
                        UI.addNotification('Ate rations. Hunger restored!', 'success');
                    } else {
                        UI.addNotification('Not enough food!', 'danger');
                    }
                }
            },
            {
                label: 'Rest (restore energy)',
                action: () => {
                    Player.energy = PLAYER_MAX_ENERGY;
                    UI.addNotification('Rested. Energy restored!', 'success');
                }
            },
            {
                label: `Sleep Until Dawn${isNight ? '' : ' [DAYTIME]'}`,
                action: () => {
                    if (!gameState.isNighttime) {
                        UI.addNotification('It\'s still daytime!', 'info');
                        return;
                    }
                    // Advance solTime to morning (10% of sol = end of night)
                    const morningTime = 0.1 * SOL_DURATION;
                    const solProgress = (gameState.solTime % SOL_DURATION) / SOL_DURATION;
                    if (solProgress > 0.75) {
                        // Late night: advance past midnight to morning
                        gameState.solTime = gameState.solTime - (gameState.solTime % SOL_DURATION) + SOL_DURATION + morningTime;
                    } else {
                        // Early morning (0-10%): advance to 10%
                        gameState.solTime = gameState.solTime - (gameState.solTime % SOL_DURATION) + morningTime;
                    }
                    // Sleeping restores energy, but drains some hunger
                    Player.energy = PLAYER_MAX_ENERGY;
                    Player.hunger = Math.max(0, Player.hunger - 20);
                    UI.addNotification('Slept through the night. Energy restored!', 'success');
                }
            },
            {
                label: `Med Bay (${HQ_HEAL_COST} materials)${matAvail >= HQ_HEAL_COST ? '' : ' [NO MAT]'}`,
                action: () => {
                    if (gameState.resources[RESOURCE.MATERIALS] >= HQ_HEAL_COST) {
                        gameState.resources[RESOURCE.MATERIALS] -= HQ_HEAL_COST;
                        Player.hp = PLAYER_MAX_HP;
                        UI.addNotification('Healed. HP restored!', 'success');
                    } else {
                        UI.addNotification('Not enough materials!', 'danger');
                    }
                }
            },
            {
                label: 'Mission Brief',
                action: () => {
                    Dialogue.open(
                        'MISSION CONTROL',
                        null,
                        [
                            'Year 2157. Earth\'s resources are dwindling. Humanity\'s last hope lies among the stars.',
                            'Your mission: build a self-sustaining colony. Construct solar panels for power, water extractors, O2 generators, and greenhouses.',
                            'Be warned: Mars is unforgiving. Nights are freezing — stay near shelters. Dust storms will batter your equipment.',
                            'Monitor your HP, Energy, and Hunger. Visit the Command Center to eat, rest, and heal.',
                            'Move with WASD/arrows. Press E to interact, build, and talk. Good luck, Commander.',
                        ],
                        null, null, null, null
                    );
                }
            },
            {
                label: 'Mars Database',
                action: () => { this.openMarsDatabase(); }
            },
            {
                label: 'About This Project',
                action: () => { this.openAbout(); }
            },
        ];

        Dialogue.open(
            'COMMAND CENTER',
            SPRITES.COMMAND_CENTER_TL,
            [`Welcome to HQ, ${Player.name}. What do you need?`],
            choices,
            null,
            null,
            null
        );
    },

    openMarsDatabase() {
        Dialogue.open(
            'MARS DATABASE',
            null,
            [
                'THE RED PLANET — Mars orbits 225 million km from the Sun. A day (sol) lasts 24h 37m. Surface gravity is 38% of Earth\'s.',
                'ATMOSPHERE — 95% carbon dioxide, 2.7% nitrogen, 0.13% oxygen. Surface pressure is less than 1% of Earth\'s. Unbreathable without life support.',
                'TEMPERATURE — Ranges from -140C at the poles in winter to 20C at the equator in summer. Average: -60C. Nights are deadly without shelter.',
                'WATER — Vast reserves of water ice exist at the poles and underground. The south pole alone holds enough ice to cover Mars in 11 meters of water.',
                'SOLAR ENERGY — Mars receives 43% of the sunlight Earth gets. Dust storms can reduce this further. The InSight lander ran on two solar arrays.',
                'REGOLITH — Martian soil is rich in iron oxide (rust), giving Mars its red color. It contains perchlorates toxic to humans but also useful minerals.',
                'MOXIE — NASA\'s Mars Oxygen experiment on Perseverance successfully produced breathable oxygen from CO2 in 2021. The tech behind our O2 generators.',
                'GROWING FOOD — Experiments show potatoes, lettuce, and radishes can grow in Mars-like soil once perchlorates are removed. Greenhouses need UV filtering.',
            ],
            null, null, null, null
        );
    },

    openAbout() {
        const overlay = document.getElementById('about-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            Game.state.paused = true;

            const closeBtn = document.getElementById('about-close');
            const closeHandler = () => {
                overlay.style.display = 'none';
                Game.state.paused = false;
                closeBtn.removeEventListener('click', closeHandler);
            };
            closeBtn.addEventListener('click', closeHandler);
        }
    },

    // Check if there's something interactable at the facing tile
    canInteract(gameState) {
        if (Dialogue.active) return true;

        const facing = Player.getFacingTile();
        if (!facing) return false;
        const { col, row } = facing;

        // NPC check (forgiving range for hint display)
        if (typeof NPC !== 'undefined') {
            const npc = NPC.findAtTile(col, row, true);
            if (npc) return true;
        }

        // Building check
        if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
            if (Grid.occupied[row] && Grid.occupied[row][col]) return true;
        }

        // Empty walkable tile = can build
        if (Grid.isWalkable(col, row)) return true;

        return false;
    },
};
