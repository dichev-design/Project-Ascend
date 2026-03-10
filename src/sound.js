// ── SOUND ENGINE (Web Audio API — no external files) ─────────────────────────
export class SoundEngine {
    constructor() {
        this.ctx = null;
        this.ambiGain = null;
        this.combatGain = null;
        this.masterGain = null;
        this.started = false;
    }

    start() {
        if (this.started) return;
        this.started = true;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain(); this.masterGain.gain.value = 0.7;
        this.masterGain.connect(this.ctx.destination);
        this.ambiGain = this.ctx.createGain(); this.ambiGain.gain.value = 1.0; this.ambiGain.connect(this.masterGain);
        this.combatGain = this.ctx.createGain(); this.combatGain.gain.value = 0.0; this.combatGain.connect(this.masterGain);
        this._buildAmbience();
        this._buildCombat();
    }

    _buildAmbience() {
        const ctx = this.ctx, out = this.ambiGain;
        // City wind
        const bufLen = ctx.sampleRate * 4;
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
        const wind = ctx.createBufferSource();
        wind.buffer = buf; wind.loop = true;
        const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 200; wf.Q.value = 0.2;
        const wg = ctx.createGain(); wg.gain.value = 0.03;
        wind.connect(wf); wf.connect(wg); wg.connect(out); wind.start();

        // Urban hum — low distant bass drone
        [60, 90].forEach((freq, i) => {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
            const g = ctx.createGain(); g.gain.value = 0.012 - i * 0.003;
            o.connect(g); g.connect(out); o.start();
        });

        // Occasional distant car horn blip
        const horn = () => {
            if (!this.started) return;
            if (Math.random() > 0.3) {
                const o = ctx.createOscillator(); const g = ctx.createGain();
                o.type = 'sawtooth'; o.frequency.value = 280 + Math.random() * 80;
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
                g.gain.setValueAtTime(0, ctx.currentTime);
                g.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                o.connect(f); f.connect(g); g.connect(out);
                o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.5);
            }
            setTimeout(horn, 6000 + Math.random() * 12000);
        };
        setTimeout(horn, 4000);
    }

    _buildCombat() {
        const ctx = this.ctx, out = this.combatGain;
        const bpm = 140, beat = 60 / bpm;
        const bassLoop = () => {
            if (!this.started) return;
            const now = ctx.currentTime;
            // Kick
            [0, beat, beat * 2, beat * 3].forEach(t => {
                const o = ctx.createOscillator(); const g = ctx.createGain();
                o.frequency.setValueAtTime(120, now + t); o.frequency.exponentialRampToValueAtTime(40, now + t + 0.12);
                g.gain.setValueAtTime(0.5, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.18);
                o.connect(g); g.connect(out); o.start(now + t); o.stop(now + t + 0.2);
            });
            // Snare
            [beat, beat * 3].forEach(t => {
                const bl = Math.floor(ctx.sampleRate * 0.15);
                const nb = ctx.createBuffer(1, bl, ctx.sampleRate);
                const d = nb.getChannelData(0);
                for (let i = 0; i < bl; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bl);
                const src = ctx.createBufferSource(); src.buffer = nb;
                const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000;
                const g = ctx.createGain(); g.gain.setValueAtTime(0.25, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
                src.connect(f); f.connect(g); g.connect(out); src.start(now + t);
            });
            // Synth stab
            const notes = [220, 220, 277, 330, 220, 196, 220, 246];
            notes.forEach((freq, i) => {
                const t = i * beat * 0.5;
                const o = ctx.createOscillator(); const g = ctx.createGain();
                o.type = 'sawtooth'; o.frequency.value = freq;
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
                g.gain.setValueAtTime(0.08, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + beat * 0.45);
                o.connect(f); f.connect(g); g.connect(out); o.start(now + t); o.stop(now + t + beat * 0.5);
            });
            setTimeout(bassLoop, beat * 4 * 1000);
        };
        this._combatLoopStart = bassLoop;
    }

    playHit(combo) {
        if (!this.ctx) return;
        const ctx = this.ctx, now = ctx.currentTime;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        const startFreq = 300 + combo * 80;
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(startFreq, now);
        o.frequency.exponentialRampToValueAtTime(startFreq * 2.5, now + 0.08);
        g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800;
        o.connect(f); f.connect(g); g.connect(this.masterGain); o.start(now); o.stop(now + 0.15);
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.frequency.setValueAtTime(160, now + 0.06); o2.frequency.exponentialRampToValueAtTime(50, now + 0.18);
        g2.gain.setValueAtTime(0.4, now + 0.06); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        o2.connect(g2); g2.connect(this.masterGain); o2.start(now + 0.06); o2.stop(now + 0.25);
    }

    playHeal() {
        if (!this.ctx) return;
        const ctx = this.ctx, out = this.masterGain;
        [392, 523.2, 659.2].forEach((freq, i) => {
            const t = ctx.currentTime + i * 0.08;
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
        });
    }

    playVictory() {
        if (!this.ctx) return;
        const ctx = this.ctx, out = this.masterGain;
        [261.6, 329.6, 392, 523.2, 659.2].forEach((freq, i) => {
            const t = ctx.currentTime + i * 0.12;
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type = 'triangle'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.55);
        });
    }

    playEncounter() {
        if (!this.ctx) return;
        const ctx = this.ctx, out = this.masterGain;
        [200, 250, 320, 200, 160].forEach((freq, i) => {
            const t = ctx.currentTime + i * 0.08;
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.12);
        });
    }

    playBossIntro() {
        if (!this.ctx) return;
        const ctx = this.ctx, out = this.masterGain;
        // Low ominous drone sweep
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(60, ctx.currentTime);
        o.frequency.linearRampToValueAtTime(40, ctx.currentTime + 2.5);
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.3);
        g.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 2.8);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
        o.connect(f); f.connect(g); g.connect(out);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 3);
        // Impact hit
        [0, 0.5, 1.2].forEach(delay => {
            const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
            o2.frequency.setValueAtTime(100, ctx.currentTime + delay);
            o2.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + delay + 0.3);
            g2.gain.setValueAtTime(0.5, ctx.currentTime + delay);
            g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
            o2.connect(g2); g2.connect(out); o2.start(ctx.currentTime + delay); o2.stop(ctx.currentTime + delay + 0.5);
        });
    }

    playAttackWarning() {
        if (!this.ctx) return;
        const ctx = this.ctx, out = this.masterGain;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 440;
        g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        o.connect(g); g.connect(out); o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.18);
    }

    toCombat() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.ambiGain.gain.linearRampToValueAtTime(0.1, t + 1.0);
        this.combatGain.gain.linearRampToValueAtTime(0.9, t + 1.0);
        if (this._combatLoopStart) { this._combatLoopStart(); this._combatLoopStart = null; }
    }

    toAmbience() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.ambiGain.gain.linearRampToValueAtTime(1.0, t + 1.5);
        this.combatGain.gain.linearRampToValueAtTime(0.0, t + 1.5);
    }
}