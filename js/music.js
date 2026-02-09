// ============================================================
// Underhill — Chiptune Music System (GBC-style)
// ============================================================
console.log('Music module loaded');

const Music = {
    ctx: null,
    masterGain: null,
    muted: false,
    initialized: false,

    // Crossfade slots
    slotA: { gain: null, sources: [], playing: null },
    slotB: { gain: null, sources: [], playing: null },
    activeSlot: 'A',

    // Sequencer state
    currentTrack: null,
    targetTrack: null,
    noteIndex: { pulse1: 0, pulse2: 0, triangle: 0, noise: 0 },
    nextNoteTime: { pulse1: 0, pulse2: 0, triangle: 0, noise: 0 },
    schedulerTimer: null,

    // GBC waveforms
    pulseWave25: null,
    pulseWave50: null,
    triangleWave: null,
    noiseBuffer: null,

    // Crossfade state
    crossfading: false,
    crossfadeTime: 2.0,

    // Track definitions
    tracks: {},

    init() {
        if (this.ctx) {
            // Reset on newGame — stop everything
            this._stopSlot(this.slotA);
            this._stopSlot(this.slotB);
            if (this.schedulerTimer) {
                clearInterval(this.schedulerTimer);
                this.schedulerTimer = null;
            }
            this.currentTrack = null;
            this.targetTrack = null;
            this.crossfading = false;
            this.activeSlot = 'A';
            this.slotA.playing = null;
            this.slotB.playing = null;
            return;
        }

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Music: Web Audio API not available');
            return;
        }

        // Master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);

        // Load mute preference
        this.muted = localStorage.getItem('underhill_muted') === 'true';
        this.masterGain.gain.value = this.muted ? 0 : 0.5;

        // Crossfade slot gains
        this.slotA.gain = this.ctx.createGain();
        this.slotA.gain.connect(this.masterGain);
        this.slotA.gain.gain.value = 1;
        this.slotB.gain = this.ctx.createGain();
        this.slotB.gain.connect(this.masterGain);
        this.slotB.gain.gain.value = 0;

        // Create GBC waveforms
        this._createWaveforms();

        // Create noise buffer
        this._createNoiseBuffer();

        // Build track data
        this._buildTracks();

        this.initialized = true;
    },

    _createWaveforms() {
        // 25% duty pulse wave (GBC channel 1/2)
        const n = 32;
        const real25 = new Float32Array(n);
        const imag25 = new Float32Array(n);
        real25[0] = 0;
        imag25[0] = 0;
        for (let i = 1; i < n; i++) {
            // Fourier series for 25% duty cycle square wave
            imag25[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * 0.25);
        }
        this.pulseWave25 = this.ctx.createPeriodicWave(real25, imag25, { disableNormalization: false });

        // 50% duty pulse wave (standard square)
        const real50 = new Float32Array(n);
        const imag50 = new Float32Array(n);
        real50[0] = 0;
        imag50[0] = 0;
        for (let i = 1; i < n; i++) {
            imag50[i] = (i % 2 === 1) ? (4 / (i * Math.PI)) : 0;
        }
        this.pulseWave50 = this.ctx.createPeriodicWave(real50, imag50, { disableNormalization: false });

        // Triangle wave (GBC channel 3)
        const realTri = new Float32Array(n);
        const imagTri = new Float32Array(n);
        realTri[0] = 0;
        imagTri[0] = 0;
        for (let i = 1; i < n; i++) {
            if (i % 2 === 1) {
                imagTri[i] = (8 / (Math.PI * Math.PI * i * i)) * ((i % 4 === 1) ? 1 : -1);
            }
        }
        this.triangleWave = this.ctx.createPeriodicWave(realTri, imagTri, { disableNormalization: false });
    },

    _createNoiseBuffer() {
        // LFSR noise buffer mimicking GBC noise channel
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * 2; // 2 seconds of noise
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        // 15-bit LFSR (GBC-style)
        let lfsr = 0x7FFF;
        let sampleCounter = 0;
        const divider = Math.floor(sampleRate / 44100); // downsample for crunchiness
        let currentVal = 0;

        for (let i = 0; i < length; i++) {
            sampleCounter++;
            if (sampleCounter >= Math.max(1, divider)) {
                sampleCounter = 0;
                const bit = ((lfsr >> 1) ^ lfsr) & 1;
                lfsr = (lfsr >> 1) | (bit << 14);
                currentVal = (lfsr & 1) ? 1 : -1;
            }
            data[i] = currentVal;
        }
        this.noiseBuffer = buffer;
    },

    _midiToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    },

    // === Track Compositions ===

    _buildTracks() {
        // D minor scale: D(50/62/74) E(52/64/76) F(53/65/77) G(55/67/79) A(57/69/81) Bb(58/70/82) C(60/72/84)

        // --- DAY: "Red Horizon" 120 BPM ---
        this.tracks.day = {
            bpm: 120,
            loop: true,
            channels: {
                pulse1: [
                    // Hopeful melody in upper register — 8 bar loop
                    // Bar 1
                    { note: 74, dur: 0.5, vol: 0.25 },  // D5
                    { note: 77, dur: 0.5, vol: 0.25 },  // F5
                    { note: 81, dur: 0.5, vol: 0.28 },  // A5
                    { note: 79, dur: 0.5, vol: 0.25 },  // G5
                    // Bar 2
                    { note: 77, dur: 0.5, vol: 0.25 },  // F5
                    { note: 76, dur: 0.5, vol: 0.22 },  // E5
                    { note: 74, dur: 0.5, vol: 0.25 },  // D5
                    { note: 72, dur: 0.5, vol: 0.22 },  // C5
                    // Bar 3
                    { note: 70, dur: 0.75, vol: 0.25 }, // Bb4
                    { note: 72, dur: 0.25, vol: 0.22 }, // C5
                    { note: 74, dur: 0.5, vol: 0.28 },  // D5
                    { note: 77, dur: 0.5, vol: 0.25 },  // F5
                    // Bar 4
                    { note: 76, dur: 1, vol: 0.25 },    // E5
                    { note: 74, dur: 0.5, vol: 0.22 },  // D5
                    { note: 72, dur: 0.5, vol: 0.22 },  // C5
                    // Bar 5
                    { note: 74, dur: 0.5, vol: 0.25 },  // D5
                    { note: 69, dur: 0.5, vol: 0.22 },  // A4
                    { note: 70, dur: 0.5, vol: 0.25 },  // Bb4
                    { note: 72, dur: 0.5, vol: 0.22 },  // C5
                    // Bar 6
                    { note: 74, dur: 0.75, vol: 0.28 }, // D5
                    { note: 77, dur: 0.25, vol: 0.25 }, // F5
                    { note: 81, dur: 1, vol: 0.28 },    // A5
                    // Bar 7
                    { note: 79, dur: 0.5, vol: 0.25 },  // G5
                    { note: 77, dur: 0.5, vol: 0.25 },  // F5
                    { note: 74, dur: 0.5, vol: 0.25 },  // D5
                    { note: 72, dur: 0.5, vol: 0.22 },  // C5
                    // Bar 8
                    { note: 74, dur: 1.5, vol: 0.28 },  // D5 (held)
                    { note: 0, dur: 0.5 },               // rest
                ],
                pulse2: [
                    // Harmony — simple counter notes
                    // Bar 1-2
                    { note: 69, dur: 1, vol: 0.12 },    // A4
                    { note: 65, dur: 1, vol: 0.12 },    // F4
                    { note: 67, dur: 1, vol: 0.12 },    // G4
                    { note: 64, dur: 1, vol: 0.12 },    // E4
                    // Bar 3-4
                    { note: 62, dur: 1, vol: 0.12 },    // D4
                    { note: 65, dur: 1, vol: 0.12 },    // F4
                    { note: 64, dur: 1.5, vol: 0.12 },  // E4
                    { note: 62, dur: 0.5, vol: 0.12 },  // D4
                    // Bar 5-6
                    { note: 62, dur: 1, vol: 0.12 },    // D4
                    { note: 58, dur: 1, vol: 0.12 },    // Bb3
                    { note: 62, dur: 1, vol: 0.12 },    // D4
                    { note: 65, dur: 1, vol: 0.12 },    // F4
                    // Bar 7-8
                    { note: 67, dur: 1, vol: 0.12 },    // G4
                    { note: 65, dur: 1, vol: 0.12 },    // F4
                    { note: 62, dur: 1.5, vol: 0.14 },  // D4
                    { note: 0, dur: 0.5 },               // rest
                ],
                triangle: [
                    // Walking bass — D3-A2-Bb2-C3 pattern
                    // Bar 1
                    { note: 50, dur: 1, vol: 0.35 },    // D3
                    { note: 50, dur: 1, vol: 0.35 },    // D3
                    // Bar 2
                    { note: 45, dur: 1, vol: 0.35 },    // A2
                    { note: 45, dur: 1, vol: 0.35 },    // A2
                    // Bar 3
                    { note: 46, dur: 1, vol: 0.35 },    // Bb2
                    { note: 48, dur: 1, vol: 0.35 },    // C3
                    // Bar 4
                    { note: 45, dur: 1, vol: 0.35 },    // A2
                    { note: 48, dur: 1, vol: 0.35 },    // C3
                    // Bar 5
                    { note: 50, dur: 1, vol: 0.35 },    // D3
                    { note: 46, dur: 1, vol: 0.35 },    // Bb2
                    // Bar 6
                    { note: 50, dur: 1, vol: 0.35 },    // D3
                    { note: 53, dur: 1, vol: 0.35 },    // F3
                    // Bar 7
                    { note: 55, dur: 1, vol: 0.35 },    // G3
                    { note: 53, dur: 1, vol: 0.35 },    // F3
                    // Bar 8
                    { note: 50, dur: 1.5, vol: 0.38 },  // D3
                    { note: 0, dur: 0.5 },               // rest
                ],
                noise: [
                    // Light hi-hat on 8ths, kick feel on 1+3
                    { note: 1, dur: 0.25, vol: 0.06 },  // kick
                    { note: 1, dur: 0.25, vol: 0.03 },  // hat
                    { note: 1, dur: 0.25, vol: 0.05 },  // kick
                    { note: 1, dur: 0.25, vol: 0.03 },  // hat
                    { note: 1, dur: 0.25, vol: 0.06 },
                    { note: 1, dur: 0.25, vol: 0.03 },
                    { note: 1, dur: 0.25, vol: 0.05 },
                    { note: 1, dur: 0.25, vol: 0.03 },
                ],
            },
        };

        // --- NIGHT: "Phobos Rising" 80 BPM ---
        this.tracks.night = {
            bpm: 80,
            loop: true,
            channels: {
                pulse1: [
                    // Sparse, high, atmospheric — lots of rests
                    { note: 0, dur: 2 },                  // rest
                    { note: 81, dur: 2, vol: 0.12 },      // A5 (distant)
                    { note: 0, dur: 2 },
                    { note: 77, dur: 1, vol: 0.10 },      // F5
                    { note: 74, dur: 1, vol: 0.12 },      // D5
                    { note: 0, dur: 4 },                   // long rest
                    { note: 79, dur: 2, vol: 0.10 },      // G5
                    { note: 0, dur: 2 },
                    { note: 82, dur: 1, vol: 0.12 },      // Bb5
                    { note: 81, dur: 1, vol: 0.10 },      // A5
                    { note: 77, dur: 2, vol: 0.12 },      // F5
                    { note: 0, dur: 4 },
                    { note: 74, dur: 2, vol: 0.10 },      // D5
                    { note: 0, dur: 2 },
                    { note: 72, dur: 2, vol: 0.12 },      // C5
                    { note: 74, dur: 2, vol: 0.10 },      // D5
                    { note: 0, dur: 4 },
                ],
                pulse2: [
                    // Very sparse shimmer
                    { note: 0, dur: 4 },
                    { note: 86, dur: 1, vol: 0.06 },      // D6 (twinkle)
                    { note: 0, dur: 3 },
                    { note: 0, dur: 4 },
                    { note: 84, dur: 1, vol: 0.06 },      // C6
                    { note: 0, dur: 3 },
                    { note: 0, dur: 4 },
                    { note: 89, dur: 1, vol: 0.05 },      // F6
                    { note: 0, dur: 3 },
                    { note: 0, dur: 4 },
                    { note: 86, dur: 0.5, vol: 0.06 },    // D6
                    { note: 84, dur: 0.5, vol: 0.05 },    // C6
                    { note: 0, dur: 3 },
                ],
                triangle: [
                    // Slow droning bass — D2/F2 alternating
                    { note: 38, dur: 4, vol: 0.30 },      // D2
                    { note: 0, dur: 1 },
                    { note: 41, dur: 3, vol: 0.28 },      // F2
                    { note: 38, dur: 4, vol: 0.30 },      // D2
                    { note: 0, dur: 1 },
                    { note: 36, dur: 3, vol: 0.28 },      // C2
                    { note: 38, dur: 4, vol: 0.30 },      // D2
                    { note: 0, dur: 2 },
                    { note: 41, dur: 4, vol: 0.28 },      // F2
                    { note: 38, dur: 4, vol: 0.30 },      // D2
                    { note: 0, dur: 2 },
                ],
                noise: [
                    // Occasional soft ticks
                    { note: 0, dur: 3 },
                    { note: 1, dur: 0.125, vol: 0.02 },
                    { note: 0, dur: 0.875 },
                    { note: 0, dur: 4 },
                    { note: 1, dur: 0.125, vol: 0.015 },
                    { note: 0, dur: 3.875 },
                    { note: 0, dur: 3 },
                    { note: 1, dur: 0.125, vol: 0.02 },
                    { note: 0, dur: 0.875 },
                    { note: 0, dur: 4 },
                    { note: 1, dur: 0.125, vol: 0.015 },
                    { note: 0, dur: 1.875 },
                    { note: 1, dur: 0.125, vol: 0.02 },
                    { note: 0, dur: 1.875 },
                ],
            },
        };

        // --- STORM: "Dust Devil" 140 BPM ---
        this.tracks.storm = {
            bpm: 140,
            loop: true,
            channels: {
                pulse1: [
                    // Fast arpeggiated Dm chord in 16ths
                    // Bar 1 — D minor arp (D-F-A)
                    { note: 62, dur: 0.25, vol: 0.22 },
                    { note: 65, dur: 0.25, vol: 0.20 },
                    { note: 69, dur: 0.25, vol: 0.22 },
                    { note: 65, dur: 0.25, vol: 0.20 },
                    { note: 62, dur: 0.25, vol: 0.22 },
                    { note: 69, dur: 0.25, vol: 0.20 },
                    { note: 74, dur: 0.25, vol: 0.25 },
                    { note: 69, dur: 0.25, vol: 0.20 },
                    // Bar 2 — Bb major arp (Bb-D-F)
                    { note: 58, dur: 0.25, vol: 0.22 },
                    { note: 62, dur: 0.25, vol: 0.20 },
                    { note: 65, dur: 0.25, vol: 0.22 },
                    { note: 62, dur: 0.25, vol: 0.20 },
                    { note: 58, dur: 0.25, vol: 0.22 },
                    { note: 65, dur: 0.25, vol: 0.20 },
                    { note: 70, dur: 0.25, vol: 0.25 },
                    { note: 65, dur: 0.25, vol: 0.20 },
                    // Bar 3 — C major arp (C-E-G)
                    { note: 60, dur: 0.25, vol: 0.22 },
                    { note: 64, dur: 0.25, vol: 0.20 },
                    { note: 67, dur: 0.25, vol: 0.22 },
                    { note: 64, dur: 0.25, vol: 0.20 },
                    { note: 60, dur: 0.25, vol: 0.22 },
                    { note: 67, dur: 0.25, vol: 0.20 },
                    { note: 72, dur: 0.25, vol: 0.25 },
                    { note: 67, dur: 0.25, vol: 0.20 },
                    // Bar 4 — A minor arp (A-C-E) for tension
                    { note: 57, dur: 0.25, vol: 0.25 },
                    { note: 60, dur: 0.25, vol: 0.22 },
                    { note: 64, dur: 0.25, vol: 0.25 },
                    { note: 60, dur: 0.25, vol: 0.22 },
                    { note: 69, dur: 0.25, vol: 0.28 },
                    { note: 64, dur: 0.25, vol: 0.25 },
                    { note: 69, dur: 0.25, vol: 0.28 },
                    { note: 72, dur: 0.25, vol: 0.25 },
                ],
                pulse2: [
                    // Counter-melody, staccato
                    // Bar 1
                    { note: 74, dur: 0.25, vol: 0.15 },
                    { note: 0, dur: 0.25 },
                    { note: 77, dur: 0.25, vol: 0.15 },
                    { note: 0, dur: 0.25 },
                    { note: 74, dur: 0.5, vol: 0.15 },
                    { note: 72, dur: 0.5, vol: 0.15 },
                    // Bar 2
                    { note: 70, dur: 0.25, vol: 0.15 },
                    { note: 0, dur: 0.25 },
                    { note: 74, dur: 0.25, vol: 0.15 },
                    { note: 0, dur: 0.25 },
                    { note: 70, dur: 0.5, vol: 0.15 },
                    { note: 69, dur: 0.5, vol: 0.15 },
                    // Bar 3
                    { note: 72, dur: 0.25, vol: 0.15 },
                    { note: 0, dur: 0.25 },
                    { note: 76, dur: 0.25, vol: 0.15 },
                    { note: 0, dur: 0.25 },
                    { note: 72, dur: 0.5, vol: 0.15 },
                    { note: 67, dur: 0.5, vol: 0.15 },
                    // Bar 4
                    { note: 69, dur: 0.25, vol: 0.18 },
                    { note: 0, dur: 0.25 },
                    { note: 72, dur: 0.25, vol: 0.18 },
                    { note: 0, dur: 0.25 },
                    { note: 69, dur: 0.5, vol: 0.20 },
                    { note: 64, dur: 0.5, vol: 0.18 },
                ],
                triangle: [
                    // Driving bass, 8th notes
                    // Bar 1
                    { note: 50, dur: 0.5, vol: 0.40 },
                    { note: 50, dur: 0.5, vol: 0.35 },
                    { note: 50, dur: 0.5, vol: 0.40 },
                    { note: 45, dur: 0.5, vol: 0.35 },
                    // Bar 2
                    { note: 46, dur: 0.5, vol: 0.40 },
                    { note: 46, dur: 0.5, vol: 0.35 },
                    { note: 46, dur: 0.5, vol: 0.40 },
                    { note: 50, dur: 0.5, vol: 0.35 },
                    // Bar 3
                    { note: 48, dur: 0.5, vol: 0.40 },
                    { note: 48, dur: 0.5, vol: 0.35 },
                    { note: 48, dur: 0.5, vol: 0.40 },
                    { note: 43, dur: 0.5, vol: 0.35 },
                    // Bar 4
                    { note: 45, dur: 0.5, vol: 0.40 },
                    { note: 45, dur: 0.5, vol: 0.35 },
                    { note: 45, dur: 0.5, vol: 0.42 },
                    { note: 48, dur: 0.5, vol: 0.38 },
                ],
                noise: [
                    // Aggressive kick-snare pattern
                    // Bar (repeated 4x)
                    { note: 1, dur: 0.125, vol: 0.10 },  // kick
                    { note: 0, dur: 0.125 },
                    { note: 1, dur: 0.125, vol: 0.04 },   // hat
                    { note: 0, dur: 0.125 },
                    { note: 1, dur: 0.125, vol: 0.08 },   // snare
                    { note: 0, dur: 0.125 },
                    { note: 1, dur: 0.125, vol: 0.04 },   // hat
                    { note: 0, dur: 0.125 },
                ],
            },
        };

        // --- BUILD: "Blueprint" 100 BPM ---
        this.tracks.build = {
            bpm: 100,
            loop: true,
            channels: {
                pulse1: [
                    // Simple, cheerful melody — quarter and half notes
                    // Bar 1
                    { note: 74, dur: 1, vol: 0.20 },      // D5
                    { note: 72, dur: 0.5, vol: 0.18 },    // C5
                    { note: 70, dur: 0.5, vol: 0.18 },    // Bb4
                    // Bar 2
                    { note: 69, dur: 1, vol: 0.20 },      // A4
                    { note: 67, dur: 1, vol: 0.18 },      // G4
                    // Bar 3
                    { note: 65, dur: 0.5, vol: 0.20 },    // F4
                    { note: 67, dur: 0.5, vol: 0.18 },    // G4
                    { note: 69, dur: 1, vol: 0.22 },      // A4
                    // Bar 4
                    { note: 74, dur: 1.5, vol: 0.22 },    // D5
                    { note: 0, dur: 0.5 },                 // rest
                    // Bar 5
                    { note: 77, dur: 0.5, vol: 0.20 },    // F5
                    { note: 74, dur: 0.5, vol: 0.18 },    // D5
                    { note: 72, dur: 1, vol: 0.20 },      // C5
                    // Bar 6
                    { note: 70, dur: 1, vol: 0.18 },      // Bb4
                    { note: 69, dur: 1, vol: 0.20 },      // A4
                    // Bar 7
                    { note: 67, dur: 0.5, vol: 0.18 },    // G4
                    { note: 69, dur: 0.5, vol: 0.20 },    // A4
                    { note: 70, dur: 1, vol: 0.20 },      // Bb4
                    // Bar 8
                    { note: 62, dur: 1.5, vol: 0.22 },    // D4
                    { note: 0, dur: 0.5 },                 // rest
                ],
                pulse2: [
                    // Light harmony
                    { note: 0, dur: 2 },
                    { note: 65, dur: 2, vol: 0.08 },
                    { note: 0, dur: 2 },
                    { note: 62, dur: 2, vol: 0.08 },
                    { note: 0, dur: 2 },
                    { note: 65, dur: 2, vol: 0.08 },
                    { note: 0, dur: 2 },
                    { note: 58, dur: 2, vol: 0.08 },
                ],
                triangle: [
                    // Gentle root notes — half notes
                    { note: 50, dur: 2, vol: 0.30 },      // D3
                    { note: 45, dur: 2, vol: 0.28 },      // A2
                    { note: 41, dur: 2, vol: 0.28 },      // F2
                    { note: 50, dur: 2, vol: 0.30 },      // D3
                    { note: 53, dur: 2, vol: 0.28 },      // F3
                    { note: 46, dur: 2, vol: 0.28 },      // Bb2
                    { note: 43, dur: 2, vol: 0.28 },      // G2
                    { note: 50, dur: 2, vol: 0.30 },      // D3
                ],
                noise: [
                    // Very light — just a tick on beat 1
                    { note: 1, dur: 0.125, vol: 0.025 },
                    { note: 0, dur: 3.875 },
                ],
            },
        };
    },

    // === Sequencer ===

    _startTrack(key, slot) {
        const track = this.tracks[key];
        if (!track) return;

        this._stopSlot(slot);
        slot.playing = key;

        // Reset note indices for this slot
        const indices = { pulse1: 0, pulse2: 0, triangle: 0, noise: 0 };
        const times = {};
        const now = this.ctx.currentTime + 0.1;
        for (const ch of ['pulse1', 'pulse2', 'triangle', 'noise']) {
            times[ch] = now;
        }

        slot._seq = { indices, times, track: key };
        slot.sources = [];

        // Start scheduler for this slot
        this._scheduleSlot(slot);
    },

    _scheduleSlot(slot) {
        if (!slot.playing || !slot._seq) return;

        const track = this.tracks[slot._seq.track];
        if (!track) return;

        const lookahead = 0.2; // schedule 200ms ahead
        const now = this.ctx.currentTime;

        for (const ch of ['pulse1', 'pulse2', 'triangle', 'noise']) {
            const notes = track.channels[ch];
            if (!notes || notes.length === 0) continue;

            while (slot._seq.times[ch] < now + lookahead) {
                const idx = slot._seq.indices[ch] % notes.length;
                const noteData = notes[idx];
                const beatDur = 60 / track.bpm;
                const time = slot._seq.times[ch];
                const dur = noteData.dur * beatDur;

                if (noteData.note > 0 && noteData.vol > 0) {
                    if (ch === 'pulse1') {
                        this._createPulse(this._midiToFreq(noteData.note), this.pulseWave50, time, dur * 0.9, noteData.vol, slot);
                    } else if (ch === 'pulse2') {
                        this._createPulse(this._midiToFreq(noteData.note), this.pulseWave25, time, dur * 0.9, noteData.vol, slot);
                    } else if (ch === 'triangle') {
                        this._createTriangle(this._midiToFreq(noteData.note), time, dur * 0.95, noteData.vol, slot);
                    } else if (ch === 'noise') {
                        this._createNoise(time, dur * 0.8, noteData.vol, slot);
                    }
                }

                slot._seq.times[ch] += dur;
                slot._seq.indices[ch]++;

                // Loop
                if (track.loop && slot._seq.indices[ch] >= notes.length) {
                    slot._seq.indices[ch] = 0;
                }
            }
        }
    },

    _createPulse(freq, wave, time, dur, vol, slot) {
        if (!this.ctx || time + dur < this.ctx.currentTime) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.setPeriodicWave(wave);
        osc.frequency.value = freq;

        // GBC-style envelope: quick attack, sustain, quick release
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.005);
        gain.gain.setValueAtTime(vol, time + dur - 0.01);
        gain.gain.linearRampToValueAtTime(0, time + dur);

        osc.connect(gain);
        gain.connect(slot.gain);

        osc.start(time);
        osc.stop(time + dur + 0.01);

        // Track for cleanup
        slot.sources.push(osc);
        osc.onended = () => {
            const idx = slot.sources.indexOf(osc);
            if (idx >= 0) slot.sources.splice(idx, 1);
            try { gain.disconnect(); } catch (e) {}
        };
    },

    _createTriangle(freq, time, dur, vol, slot) {
        if (!this.ctx || time + dur < this.ctx.currentTime) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.setPeriodicWave(this.triangleWave);
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.008);
        gain.gain.setValueAtTime(vol, time + dur - 0.02);
        gain.gain.linearRampToValueAtTime(0, time + dur);

        osc.connect(gain);
        gain.connect(slot.gain);

        osc.start(time);
        osc.stop(time + dur + 0.01);

        slot.sources.push(osc);
        osc.onended = () => {
            const idx = slot.sources.indexOf(osc);
            if (idx >= 0) slot.sources.splice(idx, 1);
            try { gain.disconnect(); } catch (e) {}
        };
    },

    _createNoise(time, dur, vol, slot) {
        if (!this.ctx || time + dur < this.ctx.currentTime) return;

        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();

        src.buffer = this.noiseBuffer;
        // Random offset into the noise buffer for variety
        const offset = Math.random() * (this.noiseBuffer.duration - dur - 0.1);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.003);
        gain.gain.setValueAtTime(vol * 0.7, time + dur * 0.5);
        gain.gain.linearRampToValueAtTime(0, time + dur);

        src.connect(gain);
        gain.connect(slot.gain);

        src.start(time, Math.max(0, offset), dur + 0.01);

        slot.sources.push(src);
        src.onended = () => {
            const idx = slot.sources.indexOf(src);
            if (idx >= 0) slot.sources.splice(idx, 1);
            try { gain.disconnect(); } catch (e) {}
        };
    },

    _stopSlot(slot) {
        if (!slot) return;
        for (const src of slot.sources) {
            try { src.stop(); } catch (e) {}
            try { src.disconnect(); } catch (e) {}
        }
        slot.sources = [];
        slot.playing = null;
        slot._seq = null;
    },

    // === Crossfade ===

    _crossfade(newTrack) {
        if (this.crossfading) {
            // Force-finish current crossfade
            const oldSlot = this.activeSlot === 'A' ? this.slotA : this.slotB;
            const curSlot = this.activeSlot === 'A' ? this.slotB : this.slotA;
            oldSlot.gain.gain.cancelScheduledValues(this.ctx.currentTime);
            oldSlot.gain.gain.setValueAtTime(0, this.ctx.currentTime);
            this._stopSlot(oldSlot);
        }

        const now = this.ctx.currentTime;
        const fadeTime = this.crossfadeTime;

        let fromSlot, toSlot;
        if (this.activeSlot === 'A') {
            fromSlot = this.slotA;
            toSlot = this.slotB;
            this.activeSlot = 'B';
        } else {
            fromSlot = this.slotB;
            toSlot = this.slotA;
            this.activeSlot = 'A';
        }

        // Fade out current
        fromSlot.gain.gain.cancelScheduledValues(now);
        fromSlot.gain.gain.setValueAtTime(fromSlot.gain.gain.value, now);
        fromSlot.gain.gain.linearRampToValueAtTime(0, now + fadeTime);

        // Start new track on the other slot
        toSlot.gain.gain.cancelScheduledValues(now);
        toSlot.gain.gain.setValueAtTime(0, now);
        toSlot.gain.gain.linearRampToValueAtTime(1, now + fadeTime);

        this._startTrack(newTrack, toSlot);

        this.crossfading = true;
        this.currentTrack = newTrack;

        // Clean up old slot after fade completes
        setTimeout(() => {
            this._stopSlot(fromSlot);
            this.crossfading = false;
        }, (fadeTime + 0.5) * 1000);
    },

    // === State tracking ===

    update(gameState) {
        if (!this.ctx) return;

        // Don't try to play while context is suspended — wait for user gesture
        if (this.ctx.state === 'suspended') return;

        // Determine target track based on game state priority
        let target = 'day';
        if (gameState.dustStormActive) {
            target = 'storm';
        } else if (gameState.isNighttime) {
            target = 'night';
        }

        // Trigger crossfade when track changes
        if (target !== this.currentTrack) {
            if (!this.currentTrack) {
                // First play — no crossfade, just start
                this.currentTrack = target;
                const slot = this.activeSlot === 'A' ? this.slotA : this.slotB;
                slot.gain.gain.setValueAtTime(1, this.ctx.currentTime);
                this._startTrack(target, slot);
            } else {
                this._crossfade(target);
            }
        }

        // Run scheduler for active slots
        if (this.slotA.playing) this._scheduleSlot(this.slotA);
        if (this.slotB.playing) this._scheduleSlot(this.slotB);
    },

    // === Mute ===

    toggleMute() {
        if (!this.ctx) return;

        this.muted = !this.muted;
        localStorage.setItem('underhill_muted', this.muted);

        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0 : 0.5, now + 0.3);
    },

    // === SFX ===

    playSFX(name) {
        if (!this.ctx || this.muted) return;

        // Resume if suspended
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const sfx = this._sfxDefs[name];
        if (sfx) sfx.call(this);
    },

    _sfxDefs: {
        // --- Frequent ---

        build() {
            // Rising two-tone blip C5->E5
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.setPeriodicWave(this.pulseWave50);
            osc.frequency.setValueAtTime(this._midiToFreq(72), now);        // C5
            osc.frequency.setValueAtTime(this._midiToFreq(76), now + 0.05); // E5
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.11);
        },

        menu_open() {
            // Soft click — short noise burst
            const now = this.ctx.currentTime;
            const src = this.ctx.createBufferSource();
            const gain = this.ctx.createGain();
            src.buffer = this.noiseBuffer;
            gain.gain.setValueAtTime(0.10, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.05);
            src.connect(gain);
            gain.connect(this.masterGain);
            src.start(now, Math.random() * 1, 0.06);
        },

        // --- Occasional ---

        colonist_arrive() {
            // Cheerful ascending arpeggio D4->F4->A4
            const now = this.ctx.currentTime;
            const notes = [62, 65, 69]; // D4, F4, A4
            notes.forEach((note, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.setPeriodicWave(this.pulseWave50);
                osc.frequency.value = this._midiToFreq(note);
                const t = now + i * 0.08;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.20, t + 0.01);
                gain.gain.linearRampToValueAtTime(0, t + 0.12);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(t);
                osc.stop(t + 0.13);
            });
        },

        supply_drop() {
            // Bright descending chime A5->F5->D5
            const now = this.ctx.currentTime;
            const notes = [81, 77, 74]; // A5, F5, D5
            notes.forEach((note, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.setPeriodicWave(this.pulseWave25);
                osc.frequency.value = this._midiToFreq(note);
                const t = now + i * 0.09;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.20, t + 0.01);
                gain.gain.linearRampToValueAtTime(0, t + 0.12);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(t);
                osc.stop(t + 0.13);
            });
        },

        achievement() {
            // Triumphant fanfare D5->A5 with chord
            const now = this.ctx.currentTime;
            // Lead note sweep
            const osc1 = this.ctx.createOscillator();
            const g1 = this.ctx.createGain();
            osc1.setPeriodicWave(this.pulseWave50);
            osc1.frequency.setValueAtTime(this._midiToFreq(74), now);       // D5
            osc1.frequency.setValueAtTime(this._midiToFreq(77), now + 0.12);// F5
            osc1.frequency.setValueAtTime(this._midiToFreq(81), now + 0.25);// A5
            g1.gain.setValueAtTime(0, now);
            g1.gain.linearRampToValueAtTime(0.22, now + 0.01);
            g1.gain.setValueAtTime(0.22, now + 0.35);
            g1.gain.linearRampToValueAtTime(0, now + 0.5);
            osc1.connect(g1);
            g1.connect(this.masterGain);
            osc1.start(now);
            osc1.stop(now + 0.51);

            // Harmony chord at the end
            const chord = [74, 69]; // D5, A4
            chord.forEach(note => {
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.setPeriodicWave(this.pulseWave25);
                osc.frequency.value = this._midiToFreq(note);
                g.gain.setValueAtTime(0, now + 0.25);
                g.gain.linearRampToValueAtTime(0.15, now + 0.27);
                g.gain.linearRampToValueAtTime(0, now + 0.5);
                osc.connect(g);
                g.connect(this.masterGain);
                osc.start(now + 0.25);
                osc.stop(now + 0.51);
            });
        },

        tier_unlock() {
            // Ascending scale flourish D4->F4->A4->D5
            const now = this.ctx.currentTime;
            const notes = [62, 65, 69, 74]; // D4, F4, A4, D5
            notes.forEach((note, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.setPeriodicWave(this.pulseWave50);
                osc.frequency.value = this._midiToFreq(note);
                const t = now + i * 0.08;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
                gain.gain.setValueAtTime(0.18, t + 0.08);
                gain.gain.linearRampToValueAtTime(0, t + 0.15);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(t);
                osc.stop(t + 0.16);
            });
            // Final sustained D5 chord
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.setPeriodicWave(this.pulseWave50);
            osc.frequency.value = this._midiToFreq(74);
            const ct = now + 0.32;
            g.gain.setValueAtTime(0, ct);
            g.gain.linearRampToValueAtTime(0.20, ct + 0.01);
            g.gain.linearRampToValueAtTime(0, ct + 0.12);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(ct);
            osc.stop(ct + 0.13);
        },

        repair() {
            // Warm rising tone
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.setPeriodicWave(this.triangleWave);
            osc.frequency.setValueAtTime(this._midiToFreq(50), now);        // D3
            osc.frequency.linearRampToValueAtTime(this._midiToFreq(62), now + 0.15); // D4
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.20, now + 0.02);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.21);
        },

        // --- Rare/Urgent ---

        sabotage() {
            // Harsh descending buzz + noise burst
            const now = this.ctx.currentTime;
            // Buzz oscillator
            const osc = this.ctx.createOscillator();
            const g1 = this.ctx.createGain();
            osc.setPeriodicWave(this.pulseWave25);
            osc.frequency.setValueAtTime(this._midiToFreq(72), now);        // C5
            osc.frequency.linearRampToValueAtTime(this._midiToFreq(48), now + 0.3); // C3
            g1.gain.setValueAtTime(0.35, now);
            g1.gain.linearRampToValueAtTime(0, now + 0.4);
            osc.connect(g1);
            g1.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.41);

            // Noise burst
            const src = this.ctx.createBufferSource();
            const g2 = this.ctx.createGain();
            src.buffer = this.noiseBuffer;
            g2.gain.setValueAtTime(0.25, now + 0.05);
            g2.gain.linearRampToValueAtTime(0, now + 0.3);
            src.connect(g2);
            g2.connect(this.masterGain);
            src.start(now + 0.05, Math.random() * 1, 0.3);
        },

        meteor_warning() {
            // Pulsing alarm tone — 2 quick beeps
            const now = this.ctx.currentTime;
            for (let i = 0; i < 2; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.setPeriodicWave(this.pulseWave50);
                osc.frequency.value = this._midiToFreq(81); // A5
                const t = now + i * 0.22;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.35, t + 0.01);
                gain.gain.setValueAtTime(0.35, t + 0.1);
                gain.gain.linearRampToValueAtTime(0, t + 0.15);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(t);
                osc.stop(t + 0.16);
            }
        },

        meteor_hit() {
            // Low boom — noise burst + low oscillator
            const now = this.ctx.currentTime;
            // Low boom oscillator
            const osc = this.ctx.createOscillator();
            const g1 = this.ctx.createGain();
            osc.setPeriodicWave(this.triangleWave);
            osc.frequency.setValueAtTime(this._midiToFreq(36), now);        // C2
            osc.frequency.linearRampToValueAtTime(this._midiToFreq(24), now + 0.25); // C1
            g1.gain.setValueAtTime(0.35, now);
            g1.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.connect(g1);
            g1.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.31);

            // Noise burst
            const src = this.ctx.createBufferSource();
            const g2 = this.ctx.createGain();
            src.buffer = this.noiseBuffer;
            g2.gain.setValueAtTime(0.30, now);
            g2.gain.linearRampToValueAtTime(0, now + 0.25);
            src.connect(g2);
            g2.connect(this.masterGain);
            src.start(now, Math.random() * 1, 0.3);
        },

        dust_storm() {
            // Rising wind noise — filtered noise sweep
            const now = this.ctx.currentTime;
            const src = this.ctx.createBufferSource();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            src.buffer = this.noiseBuffer;
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(200, now);
            filter.frequency.linearRampToValueAtTime(2000, now + 0.4);
            filter.Q.value = 2;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.30, now + 0.2);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            src.start(now, Math.random() * 1, 0.55);
        },
    },
};
