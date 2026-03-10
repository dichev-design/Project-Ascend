import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TextureLoader } from 'three';

// ── ENEMY DEFINITIONS ─────────────────────────────────────────────────────────
const NORMAL_ENEMY = {
    name: 'ZOMBIE',
    skin: '/enemies/Skins/zombieA.png',
    hp: 180,
    attackInterval: 2000,
    attackDamage: 15,
    scale: 1.0,
    isBoss: false,
    emoji: '🧟',
    color: '#ff6644',
};

const BOSS_ENEMY = {
    name: 'SURVIVOR BOSS',
    skin: '/enemies/Skins/survivorMaleB.png',
    hp: 540,
    attackInterval: 1400,
    attackDamage: 25,
    scale: 1.5,
    isBoss: true,
    emoji: '💀',
    color: '#ff0044',
};

// ── IMPACT SPARKS SYSTEM ──────────────────────────────────────────────────────
// Draws flashy pixel star bursts on a canvas overlay on each hit
class ImpactSparks {
    constructor() {
        this.canvas = document.getElementById('impact-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.sparks = [];
        this._resize();
        window.addEventListener('resize', () => this._resize());
        this._loop();
    }

    _resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // Burst of pixel stars at screen position x,y
    // combo level controls size and count
    burst(x, y, combo = 1) {
        const count = 6 + combo * 2;
        const colors = ['#ffee44', '#ffffff', '#ff8800', '#ffcc00', '#ff4400', '#44ffff'];
        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = (40 + Math.random() * 80) * (0.8 + combo * 0.15);
            const size = 3 + Math.random() * (3 + combo);
            this.sparks.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0,
                decay: 0.06 + Math.random() * 0.06,
                isstar: Math.random() > 0.4,
            });
        }
        // Big central flash ring
        this.sparks.push({ x, y, vx: 0, vy: 0, size: 20 + combo * 8, color: 'rgba(255,220,100,0.6)', life: 1.0, decay: 0.18, ring: true });
    }

    _drawStar(ctx, x, y, size) {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = i % 2 === 0 ? size : size * 0.4;
            const px = x + Math.cos(angle) * r;
            const py = y + Math.sin(angle) * r;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }

    _loop() {
        requestAnimationFrame(() => this._loop());
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.sparks = this.sparks.filter(s => s.life > 0);
        this.sparks.forEach(s => {
            ctx.globalAlpha = s.life;
            ctx.fillStyle = s.color;
            if (s.ring) {
                ctx.strokeStyle = s.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = s.life * 0.7;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size * (1.5 - s.life), 0, Math.PI * 2);
                ctx.stroke();
            } else if (s.isstar) {
                this._drawStar(ctx, s.x + s.vx * (1 - s.life), s.y + s.vy * (1 - s.life), s.size * s.life);
            } else {
                const px = s.x + s.vx * (1 - s.life);
                const py = s.y + s.vy * (1 - s.life);
                ctx.fillRect(px - s.size / 2, py - s.size / 2, s.size, s.size);
            }
            s.life -= s.decay;
        });
        ctx.globalAlpha = 1;
    }
}

// ── COMBAT MANAGER ────────────────────────────────────────────────────────────
export class CombatManager {
    constructor(world) {
        this.world = world;
        this.state = 'running'; // 'running' | 'spawned' | 'encounter' | 'combat' | 'victory' | 'defeat'

        this.activeEnemy3D = null;
        this.currentEnemy = null;
        this.enemyHP = 0;
        this.enemyMaxHP = 0;
        this.enemyMixer = null;  // THREE.AnimationMixer for enemy GLB
        this._clock = new THREE.Clock();

        this.playerHP = 100;
        this.playerMaxHP = 100;
        this.killCount = 0;

        // ── SPAWN TIMING — real clock, only ticks while moving ──
        // Fires randomly between 30–90 seconds of actual run time
        this._spawnTimer = this._nextSpawnTime();
        this._runningTime = 0;  // accumulated seconds while speed > 0.1
        this._lastTickTime = Date.now();

        // ── ARM RAISE DETECTION ──
        this.leftArmState = 'down';
        this.rightArmState = 'down';
        this.leftArmLastStrike = 0;
        this.rightArmLastStrike = 0;
        this.ARM_COOLDOWN_MS = 500;
        this.ARM_RAISE_RATIO = 0.15;

        // Combo
        this.combo = 0;
        this.lastStrikeTime = 0;
        this.COMBO_WINDOW = 1500;

        // Enemy attack loop
        this._atkRunning = false;
        this._atkTimer = null;

        this.onStateChange = null;
        this.sound = null;
        this.sparks = new ImpactSparks();

        // GLB loader
        this._loader = new GLTFLoader();
        this._texLoader = new TextureLoader();
        this._charModel = null;  // loaded once, cloned per spawn
        this._idleAnim = null;  // idle AnimationClip
        this._loadCharacter();

        // UI refs
        this.overlayEl = document.getElementById('combat-overlay');
        this.enemyNameEl = document.getElementById('enemy-name');
        this.enemySpriteEl = document.getElementById('enemy-sprite');
        this.enemyHPFill = document.getElementById('enemy-health-fill');
        this.playerHPFill = document.getElementById('player-health-fill');
        this.playerHPText = document.getElementById('player-health-text');
        this.comboEl = document.getElementById('combo-display');
        this.flashEl = document.getElementById('punch-flash');
        this.alertEl = document.getElementById('encounter-alert');
        this.victoryEl = document.getElementById('victory-banner');
        this.defeatEl = document.getElementById('defeat-banner');
        this.instrEl = document.getElementById('combat-instruction');
        this.bossIntroEl = document.getElementById('boss-intro');
        this.healPromptEl = document.getElementById('heal-prompt');
        this.lastKP = null;
    }

    _nextSpawnTime(first = false) {
        if (first) return 15 + Math.random() * 15; // first enemy 15-30s
        return 25 + Math.random() * 35; // subsequent 25-60s
    }

    // Reset timer fresh when game actually starts
    resetSpawnTimer() {
        this._spawnTimer = this._nextSpawnTime(true);
        this._runningTime = 0;
        this._lastTickTime = Date.now();
    }

    async _loadCharacter() {
        try {
            const [modelGltf, idleGltf] = await Promise.all([
                new Promise((res, rej) => this._loader.load('/enemies/characterMedium.glb', res, undefined, rej)),
                new Promise((res, rej) => this._loader.load('/enemies/idle.glb', res, undefined, rej)),
            ]);
            this._charModel = modelGltf.scene;
            this._idleAnim = idleGltf.animations[0] || null;
            console.log('✅ Character GLB loaded');
        } catch (e) {
            console.warn('⚠ Character GLB load failed — using emoji fallback', e);
        }
    }

    _spawnEnemyModel(def) {
        // Remove old 3D model if any
        if (this.activeEnemy3D) {
            this.world.scene.remove(this.activeEnemy3D);
            this.activeEnemy3D = null;
            this.enemyMixer = null;
        }

        // Always show emoji so the encounter works even without GLB
        this.enemySpriteEl.textContent = def.emoji;

        if (!this._charModel) return; // no GLB loaded — emoji-only, still works

        const model = this._charModel.clone(true);
        model.scale.setScalar(def.scale);
        // Place enemy ahead in world space — will move with chunks
        model.position.set(0, 0, -20);
        model.rotation.y = Math.PI;

        // Apply skin texture
        this._texLoader.load(def.skin, (tex) => {
            model.traverse(child => {
                if (child.isMesh) {
                    child.material = new THREE.MeshLambertMaterial({ map: tex });
                    if (def.isBoss) child.material.color.setHex(0xff8866);
                    child.castShadow = true;
                }
            });
        }, undefined, () => {
            model.traverse(child => {
                if (child.isMesh) child.material = new THREE.MeshLambertMaterial({
                    color: def.isBoss ? 0xff4422 : 0x88cc88
                });
            });
        });

        if (this._idleAnim) {
            this.enemyMixer = new THREE.AnimationMixer(model);
            this.enemyMixer.clipAction(this._idleAnim).play();
        }

        this.world.scene.add(model);
        this.activeEnemy3D = model;
    }

    // ── SPAWN TICK — called from main game loop every 50ms ────────────────────
    spawnTick(worldSpeed) {
        if (this.state !== 'running') return;

        // Accumulate running time only while moving
        const now = Date.now();
        const dt = (now - this._lastTickTime) / 1000;
        this._lastTickTime = now;

        if (worldSpeed > 0.05) this._runningTime += dt;

        if (this._runningTime >= this._spawnTimer) {
            this._runningTime = 0;
            this._spawnTimer = this._nextSpawnTime(false);
            this._doSpawn();
        }
    }

    _doSpawn() {
        const isBoss = this.killCount > 0 && this.killCount % 10 === 0;
        const def = isBoss ? BOSS_ENEMY : NORMAL_ENEMY;
        this.currentEnemy = def;

        this.state = 'spawned';
        this._spawnEnemyModel(def);

        // Move enemy towards player
        this._approachTicks = 0;
        if (this.onStateChange) this.onStateChange('spawned');
    }

    tickEnemy(worldSpeed) {
        if (this.state !== 'spawned') return;

        // Animate GLB mixer if available
        if (this.enemyMixer) this.enemyMixer.update(this._clock.getDelta());

        // Track approach using a simple counter — counts up every tick (50ms).
        // At ~4 ticks/s running, ~120 ticks = ~6s approach time feels right.
        this._approachTicks = (this._approachTicks || 0) + 1;

        // Move 3D model if we have one — keep it at a fixed world position while
        // the world scrolls past. Enemy appears to "walk toward" the player.
        if (this.activeEnemy3D) {
            // Enemy stays at z=-14 in camera space by moving forward with world
            this.activeEnemy3D.position.z += worldSpeed + 0.04;
            if (this.activeEnemy3D.position.z > -2) {
                this.activeEnemy3D.position.z = -2;
            }
        }

        // Trigger encounter after ~5 seconds of approach (100 ticks at 50ms)
        // OR when 3D model reaches the player
        const modelClose = this.activeEnemy3D && this.activeEnemy3D.position.z >= -4;
        if (this._approachTicks >= 100 || modelClose) {
            this._approachTicks = 0;
            this._triggerEncounter();
        }
    }

    _triggerEncounter() {
        this.state = 'encounter';
        const def = this.currentEnemy;

        if (def.isBoss) {
            this._showBossIntro().then(() => this.beginCombat());
        } else {
            // Show encounter alert
            this.alertEl.classList.add('show');
            if (this.sound) this.sound.playEncounter();
            document.getElementById('god-ray').classList.add('show');
            setTimeout(() => {
                this.alertEl.classList.remove('show');
                document.getElementById('god-ray').classList.remove('show');
                this.beginCombat();
            }, 1800);
        }
    }

    _showBossIntro() {
        return new Promise(resolve => {
            this.bossIntroEl.classList.add('show');
            if (this.sound) this.sound.playBossIntro();
            setTimeout(() => {
                this.bossIntroEl.classList.remove('show');
                resolve();
            }, 3000);
        });
    }


    // ── ENEMY CARD DISPLAY ────────────────────────────────────────────────────
    // Renders the GLB character into the combat card using a mini Three.js scene.
    // Falls back to a styled emoji if the GLB hasn't loaded.
    _showEnemyInCard(def) {
        const sprite = this.enemySpriteEl;

        // If no GLB — show large styled emoji
        if (!this._charModel) {
            sprite.innerHTML = '';
            sprite.style.cssText = '';
            sprite.className = def.isBoss ? 'boss' : '';
            sprite.textContent = def.emoji;
            return;
        }

        // Replace the emoji element with a canvas
        sprite.textContent = '';
        sprite.className = '';
        sprite.style.cssText = 'width:160px;height:200px;display:block;margin:0 auto;';

        // Reuse existing mini canvas or create new one
        let miniCanvas = document.getElementById('enemy-mini-canvas');
        if (!miniCanvas) {
            miniCanvas = document.createElement('canvas');
            miniCanvas.id = 'enemy-mini-canvas';
            miniCanvas.width = 160;
            miniCanvas.height = 200;
            miniCanvas.style.cssText = 'width:160px;height:200px;display:block;';
        }
        sprite.appendChild(miniCanvas);

        // Stop previous mini renderer if running
        if (this._miniRenderer) {
            this._miniRenderer.dispose();
            this._miniRenderer = null;
        }
        if (this._miniAnimId) {
            cancelAnimationFrame(this._miniAnimId);
            this._miniAnimId = null;
        }

        // Build mini Three.js scene
        const renderer = new THREE.WebGLRenderer({ canvas: miniCanvas, antialias: true, alpha: true });
        renderer.setSize(160, 200);
        renderer.setClearColor(0x000000, 0);
        this._miniRenderer = renderer;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, 160 / 200, 0.1, 50);
        camera.position.set(0, 0.9, 2.8);
        camera.lookAt(0, 0.7, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const dLight = new THREE.DirectionalLight(def.isBoss ? 0xff4422 : 0xffffff, 2.0);
        dLight.position.set(2, 4, 3);
        scene.add(dLight);

        const model = this._charModel.clone(true);
        model.scale.setScalar(def.scale * 2.4);
        model.position.set(0, 0, 0);
        model.rotation.y = Math.PI; // face camera

        // Apply skin
        this._texLoader.load(def.skin, (tex) => {
            model.traverse(child => {
                if (child.isMesh) {
                    child.material = new THREE.MeshLambertMaterial({ map: tex });
                    if (def.isBoss) child.material.color.setHex(0xff8866);
                }
            });
        }, undefined, () => {
            model.traverse(child => {
                if (child.isMesh) child.material = new THREE.MeshLambertMaterial({
                    color: def.isBoss ? 0xff4422 : 0x88cc88
                });
            });
        });
        scene.add(model);

        // Idle animation
        let mixer = null;
        if (this._idleAnim) {
            mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(this._idleAnim).play();
        }

        // Boss: add red point light that pulses
        let bossLight = null;
        if (def.isBoss) {
            bossLight = new THREE.PointLight(0xff0044, 2.0, 8);
            bossLight.position.set(0, 1, 2);
            scene.add(bossLight);
        }

        const clock = new THREE.Clock();
        let hitAnim = 0;
        this._miniHit = () => { hitAnim = 0.4; };

        const loop = () => {
            this._miniAnimId = requestAnimationFrame(loop);
            if (!this.overlayEl.classList.contains('active')) return;
            const dt = clock.getDelta();
            if (mixer) mixer.update(dt);
            // Gentle idle float
            model.position.y = Math.sin(clock.elapsedTime * 1.5) * 0.04;
            // Hit flash
            if (hitAnim > 0) {
                hitAnim -= dt * 3;
                model.traverse(c => { if (c.isMesh) c.material.emissive?.setScalar(hitAnim); });
            }
            // Boss pulse
            if (bossLight) bossLight.intensity = 2 + Math.sin(clock.elapsedTime * 4) * 0.8;
            renderer.render(scene, camera);
        };
        loop();
    }

    beginCombat() {
        this.state = 'combat';
        const def = this.currentEnemy;

        this.enemyHP = def.hp;
        this.enemyMaxHP = def.hp;

        // Update UI
        this.enemyNameEl.textContent = def.name;
        this.enemyHPFill.style.width = '100%';
        this.updatePlayerHP();
        this.instrEl.textContent = '💪 RAISE your arms to attack!';
        this.instrEl.style.color = 'rgba(255,255,255,0.7)';

        // Show character in combat card
        this._showEnemyInCard(def);

        this.overlayEl.classList.add('active');
        if (this.sound) this.sound.toCombat();
        if (this.onStateChange) this.onStateChange('combat');

        // Remove 3D model from world — we render it in the card instead
        if (this.activeEnemy3D) {
            this.world.scene.remove(this.activeEnemy3D);
            this.activeEnemy3D = null;
        }

        // Start enemy attacks
        this.startEnemyAttacks(def.attackInterval, def.attackDamage);

        // Boss phase 2 — speed up attacks at 50% HP
        if (def.isBoss) {
            this._bossPhase2 = false;
        }
    }

    // ── ARM RAISE DETECTION ───────────────────────────────────────────────────
    updatePose(kp) {
        this.lastKP = kp;
        if (this.state === 'combat') this._detectArmRaise(kp);
    }

    _detectArmRaise(kp) {
        const now = Date.now();
        const ls = kp['left_shoulder'], rs = kp['right_shoulder'];
        const lw = kp['left_wrist'], rw = kp['right_wrist'];
        const lh = kp['left_hip'], rh = kp['right_hip'];

        if (!ls || !rs || ls.score < 0.3 || rs.score < 0.3) return;

        const leftTorso = (lh && lh.score > 0.3) ? Math.abs(ls.y - lh.y) : 80;
        const rightTorso = (rh && rh.score > 0.3) ? Math.abs(rs.y - rh.y) : 80;

        let leftRaised = false, rightRaised = false;
        if (lw && lw.score > 0.3) leftRaised = (ls.y - lw.y) / leftTorso > this.ARM_RAISE_RATIO;
        if (rw && rw.score > 0.3) rightRaised = (rs.y - rw.y) / rightTorso > this.ARM_RAISE_RATIO;

        // LEFT arm
        if (leftRaised && this.leftArmState === 'down') {
            this.leftArmState = 'up';
            this._updateArmInstruction();
        } else if (!leftRaised && this.leftArmState === 'up') {
            this.leftArmState = 'down';
            if (now - this.leftArmLastStrike > this.ARM_COOLDOWN_MS) {
                this.leftArmLastStrike = now;
                this._registerStrike('left', now);
            }
        }

        // RIGHT arm
        if (rightRaised && this.rightArmState === 'down') {
            this.rightArmState = 'up';
            this._updateArmInstruction();
        } else if (!rightRaised && this.rightArmState === 'up') {
            this.rightArmState = 'down';
            if (now - this.rightArmLastStrike > this.ARM_COOLDOWN_MS) {
                this.rightArmLastStrike = now;
                this._registerStrike('right', now);
            }
        }
    }

    _updateArmInstruction() {
        const lUp = this.leftArmState === 'up';
        const rUp = this.rightArmState === 'up';
        if (lUp || rUp) {
            this.instrEl.textContent = '✊ Now bring it DOWN to strike!';
            this.instrEl.style.color = '#ffdd44';
        } else {
            this.instrEl.textContent = '💪 RAISE your arms to attack!';
            this.instrEl.style.color = 'rgba(255,255,255,0.7)';
        }
    }

    _registerStrike(side, now) {
        if (now - this.lastStrikeTime < this.COMBO_WINDOW) {
            this.combo = Math.min(this.combo + 1, 8);
        } else {
            this.combo = 1;
        }
        this.lastStrikeTime = now;

        const dmg = 5 + Math.floor(this.combo * 1.5);
        this.enemyHP = Math.max(0, this.enemyHP - dmg);
        this.updateEnemyHP();

        if (this.sound) this.sound.playHit(this.combo);

        // Flash
        this.flashEl.classList.add('flash');
        setTimeout(() => this.flashEl.classList.remove('flash'), 80);
        if (this._miniHit) this._miniHit(); // flash the 3D model white

        // Enemy sprite shake
        this.enemySpriteEl.classList.remove('hit');
        void this.enemySpriteEl.offsetWidth;
        this.enemySpriteEl.classList.add('hit');

        // Impact SPARKS — burst at enemy card centre
        const card = document.getElementById('enemy-card');
        if (card) {
            const r = card.getBoundingClientRect();
            this.sparks.burst(r.left + r.width / 2, r.top + r.height * 0.4, this.combo);
        }

        // Combo UI
        if (this.combo >= 2) {
            const msgs = ['', '', 'DOUBLE HIT!', 'TRIPLE STRIKE!', 'ON FIRE! 🔥', 'UNSTOPPABLE! ⚡', 'BEAST MODE! 💪', 'WARRIOR! ⚔️', 'LEGENDARY! 🏆'];
            this.comboEl.textContent = msgs[Math.min(this.combo, msgs.length - 1)];
            this.comboEl.classList.add('show');
            clearTimeout(this._comboTimer);
            this._comboTimer = setTimeout(() => this.comboEl.classList.remove('show'), 1500);
        }

        // Boss phase 2 — speed up at 50% HP
        if (this.currentEnemy?.isBoss && !this._bossPhase2 && this.enemyHP <= this.enemyMaxHP * 0.5) {
            this._bossPhase2 = true;
            this.stopEnemyAttacks();
            this.startEnemyAttacks(1000, this.currentEnemy.attackDamage);
            this.instrEl.textContent = '🔥 BOSS ENRAGED — FIGHT HARDER!';
            this.instrEl.style.color = '#ff4400';
            // Screen shake
            document.body.style.animation = 'none';
            setTimeout(() => this._screenShake(), 50);
        }

        if (this.enemyHP <= 0) setTimeout(() => this._triggerVictory(), 400);
    }

    _screenShake() {
        const el = document.getElementById('game-canvas');
        el.style.transform = 'translate(-4px,-4px)';
        setTimeout(() => el.style.transform = 'translate(4px,2px)', 60);
        setTimeout(() => el.style.transform = 'translate(-2px,4px)', 120);
        setTimeout(() => el.style.transform = '', 180);
    }

    updateEnemyHP() {
        const pct = (this.enemyHP / this.enemyMaxHP) * 100;
        this.enemyHPFill.style.width = pct + '%';
        if (pct <= 25) this.enemyHPFill.style.background = 'repeating-linear-gradient(90deg,#ff0000 0px,#cc0000 4px,#ff1111 4px,#dd0000 8px)';
    }

    updatePlayerHP() {
        const pct = (this.playerHP / this.playerMaxHP) * 100;
        this.playerHPFill.style.width = pct + '%';
        this.playerHPText.textContent = Math.round(this.playerHP) + ' / ' + this.playerMaxHP;
        if (pct <= 30) this.playerHPFill.style.background = 'repeating-linear-gradient(90deg,#cc1100 0px,#aa0800 4px,#dd2211 4px,#bb1100 8px)';
        else if (pct <= 60) this.playerHPFill.style.background = 'repeating-linear-gradient(90deg,#dd6600 0px,#bb4400 4px,#ee7711 4px,#cc5500 8px)';
        else this.playerHPFill.style.background = 'repeating-linear-gradient(90deg,#22dd66 0px,#11bb44 4px,#33ee77 4px,#22cc55 8px)';

        // Heal prompt during boss if HP is low
        if (this.currentEnemy?.isBoss && this.state === 'combat' && pct <= 40) {
            this.healPromptEl?.classList.add('show');
        } else {
            this.healPromptEl?.classList.remove('show');
        }
    }

    // ── ENEMY ATTACK LOOP ─────────────────────────────────────────────────────
    startEnemyAttacks(interval, damage) {
        this.stopEnemyAttacks();
        this._atkRunning = true;
        this._atkDamage = damage;
        const schedule = () => {
            if (!this._atkRunning) return;
            this._atkTimer = setTimeout(() => {
                if (!this._atkRunning || this.state !== 'combat') return;
                this._enemyAttackTick();
                schedule();
            }, interval);
        };
        schedule();
    }

    stopEnemyAttacks() {
        this._atkRunning = false;
        if (this._atkTimer) { clearTimeout(this._atkTimer); this._atkTimer = null; }
    }

    _enemyAttackTick() {
        if (this.state !== 'combat') return;

        // Warning phase
        this.enemySpriteEl.style.filter = 'drop-shadow(0 0 32px rgba(255,0,0,1)) brightness(1.8)';
        this.instrEl.textContent = '⚡ INCOMING — keep striking!';
        this.instrEl.style.color = '#ff4444';
        if (this.sound?.playAttackWarning) this.sound.playAttackWarning();

        setTimeout(() => {
            if (this.state !== 'combat') return;
            this.enemySpriteEl.style.filter = '';

            this.playerHP = Math.max(0, this.playerHP - this._atkDamage);
            this.updatePlayerHP();

            // Red flash
            this.flashEl.style.background = 'rgba(200,0,0,0.3)';
            this.flashEl.classList.add('flash');
            setTimeout(() => { this.flashEl.classList.remove('flash'); this.flashEl.style.background = ''; }, 200);

            // Damage number
            this._spawnDmgNumber(-this._atkDamage, '#ff4444');

            this._updateArmInstruction();

            if (this.playerHP <= 0) this._triggerDefeat();
        }, 500);
    }

    _spawnDmgNumber(amount, color) {
        const el = document.createElement('div');
        const x = window.innerWidth * 0.5 + (Math.random() - 0.5) * 60;
        const y = window.innerHeight * 0.55;
        el.style.cssText = `
      position:fixed;left:${x}px;top:${y}px;
      font-family:'Courier New',monospace;font-size:20px;font-weight:900;
      color:${color};text-shadow:0 0 8px ${color};
      pointer-events:none;z-index:70;
      --tx:${(Math.random() - 0.5) * 40}px;--ty:-60px;
      animation:particleBurst 1.0s ease-out forwards;
    `;
        el.textContent = (amount > 0 ? '+' : '') + amount + ' HP';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1100);
    }

    // ── VICTORY ───────────────────────────────────────────────────────────────
    _triggerVictory() {
        this.stopEnemyAttacks();
        this.state = 'victory';
        const isBoss = this.currentEnemy?.isBoss;
        this.killCount++;

        if (this.activeEnemy3D) {
            this.world.scene.remove(this.activeEnemy3D);
            this.activeEnemy3D = null;
        }

        const vBanner = this.victoryEl;
        vBanner.className = isBoss ? 'show boss-win' : 'show';
        document.getElementById('victory-title').textContent = isBoss ? '👑 BOSS DEFEATED!' : 'Victory!';
        document.getElementById('victory-sub').textContent = isBoss ? 'Legend. Keep running!' : 'Keep running, hero…';

        // Kill counter update
        document.getElementById('kill-counter').textContent = `☠ ${this.killCount}`;

        if (this.sound) this.sound.playVictory();
        // Sparks burst
        this.sparks.burst(window.innerWidth / 2, window.innerHeight / 2, isBoss ? 8 : 4);

        this.overlayEl.classList.remove('active');
        this.healPromptEl?.classList.remove('show');
        if (this._miniRenderer) { this._miniRenderer.dispose(); this._miniRenderer = null; }
        if (this._miniAnimId) { cancelAnimationFrame(this._miniAnimId); this._miniAnimId = null; }

        setTimeout(() => {
            vBanner.className = '';
            this.state = 'running';
            this._spawnTimer = this._nextSpawnTime(false);
            this._runningTime = 0;
            this._lastTickTime = Date.now();
            if (this.sound) this.sound.toAmbience();
            if (this.onStateChange) this.onStateChange('running');
        }, 2500);
    }

    // ── DEFEAT ────────────────────────────────────────────────────────────────
    _triggerDefeat() {
        this.stopEnemyAttacks();
        this.state = 'defeat';
        this.playerHP = 1;

        this.defeatEl.classList.add('show');
        this.overlayEl.classList.remove('active');
        this.healPromptEl?.classList.remove('show');

        if (this.onStateChange) this.onStateChange('defeat');

        setTimeout(() => {
            this.defeatEl.classList.remove('show');
            // Return to running — player must curl to recover
            this.state = 'running';
            this._spawnTimer = this._nextSpawnTime(false);
            this._runningTime = 0;
            this._lastTickTime = Date.now();
            if (this.sound) this.sound.toAmbience();
            if (this.onStateChange) this.onStateChange('running');
            if (this.activeEnemy3D) { this.world.scene.remove(this.activeEnemy3D); this.activeEnemy3D = null; }
        }, 3000);
    }
}