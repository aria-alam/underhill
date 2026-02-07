// ============================================================
// Underhill — Grid & Terrain Generation
// ============================================================

const Grid = {
    tiles: [],      // 2D array [row][col] of terrain type
    occupied: [],   // 2D array [row][col] of building id or null

    init() {
        this.tiles = [];
        this.occupied = [];
        for (let r = 0; r < GRID_ROWS; r++) {
            this.tiles[r] = [];
            this.occupied[r] = [];
            for (let c = 0; c < GRID_COLS; c++) {
                this.tiles[r][c] = this.generateTerrain(r, c);
                this.occupied[r][c] = null;
            }
        }
    },

    // Terrain generation with crater features for larger world
    generateTerrain(row, col) {
        const hash = this.hash(row, col);

        // Edges tend to be rockier
        const edgeDist = Math.min(row, col, GRID_ROWS - 1 - row, GRID_COLS - 1 - col);
        const edgeFactor = edgeDist / Math.min(GRID_ROWS, GRID_COLS) * 2;

        // Crater zones: use chunk-based secondary hash (8x8 chunks)
        const chunkR = Math.floor(row / 8);
        const chunkC = Math.floor(col / 8);
        const chunkHash = this.hash(chunkR * 137, chunkC * 251);

        // ~12% of chunks are crater zones
        if (chunkHash < 0.12) {
            // Inside a crater: more dark rock and rock
            if (hash < 0.25) return TERRAIN.DARK_ROCK;
            if (hash < 0.50) return TERRAIN.ROCK;
            if (hash < 0.62) return TERRAIN.GRAVEL;
            return TERRAIN.SAND;
        }

        // Gravel appears near crater borders and rocky areas
        if (chunkHash < 0.18 && hash < 0.35) return TERRAIN.GRAVEL;

        if (hash < 0.05 && edgeFactor < 0.4) return TERRAIN.DARK_ROCK;
        if (hash < 0.12) return TERRAIN.ROCK;
        if (hash < 0.17) return TERRAIN.GRAVEL;
        if (hash > 0.92 && edgeFactor > 0.3) return TERRAIN.ICE;
        return TERRAIN.SAND;
    },

    // Simple hash function for terrain generation
    hash(row, col) {
        let h = (row * 7919 + col * 104729 + 12345) & 0xFFFFFF;
        h = ((h >> 8) ^ h) * 0x5bd1e995;
        h = ((h >> 13) ^ h) * 0x5bd1e995;
        h = (h >> 15) ^ h;
        return (h & 0xFFFF) / 0xFFFF;
    },

    // Check if a building can be placed at grid position
    canPlace(col, row, width, height) {
        // Bounds check
        if (col < 0 || row < 0 || col + width > GRID_COLS || row + height > GRID_ROWS) {
            return false;
        }
        // Check all tiles are unoccupied and not dark rock
        for (let r = row; r < row + height; r++) {
            for (let c = col; c < col + width; c++) {
                if (this.occupied[r][c] !== null) return false;
                if (this.tiles[r][c] === TERRAIN.DARK_ROCK) return false;
            }
        }
        return true;
    },

    // Mark tiles as occupied by a building
    placeBuilding(col, row, width, height, buildingId) {
        for (let r = row; r < row + height; r++) {
            for (let c = col; c < col + width; c++) {
                this.occupied[r][c] = buildingId;
            }
        }
    },

    // Remove a building from the grid
    removeBuilding(col, row, width, height) {
        for (let r = row; r < row + height; r++) {
            for (let c = col; c < col + width; c++) {
                this.occupied[r][c] = null;
            }
        }
    },

    // Get terrain sprite for a tile (sand uses position-based variant for variety)
    getTerrainSprite(row, col) {
        switch (this.tiles[row][col]) {
            case TERRAIN.ROCK:      return SPRITES.ROCK;
            case TERRAIN.DARK_ROCK: return SPRITES.DARK_ROCK;
            case TERRAIN.ICE:       return SPRITES.ICE;
            case TERRAIN.GRAVEL:    return SPRITES.GRAVEL;
            default: {
                // Pick sand variant based on position for natural variety
                const variant = ((row * 7 + col * 13) & 3);
                return SPRITES.SAND_VARIANTS[variant];
            }
        }
    },

    // Convert pixel coordinates to grid coordinates
    pixelToGrid(px, py, offsetX, offsetY) {
        const col = Math.floor((px - offsetX) / TILE_SIZE);
        const row = Math.floor((py - offsetY) / TILE_SIZE);
        return { col, row };
    },

    // Convert grid coordinates to pixel coordinates
    gridToPixel(col, row, offsetX, offsetY) {
        return {
            x: col * TILE_SIZE + offsetX,
            y: row * TILE_SIZE + offsetY,
        };
    },

    // Check if a tile is walkable (in bounds, not dark rock, not occupied)
    isWalkable(col, row) {
        if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return false;
        if (this.tiles[row][col] === TERRAIN.DARK_ROCK) return false;
        if (this.occupied[row][col] !== null) return false;
        return true;
    },

    // Spiral search for a walkable tile near (col, row) within radius
    findWalkableNear(col, row, radius) {
        for (let dist = 0; dist <= radius; dist++) {
            for (let dy = -dist; dy <= dist; dy++) {
                for (let dx = -dist; dx <= dist; dx++) {
                    if (Math.abs(dx) !== dist && Math.abs(dy) !== dist) continue;
                    const c = col + dx;
                    const r = row + dy;
                    if (this.isWalkable(c, r)) return { col: c, row: r };
                }
            }
        }
        return null;
    },
};
