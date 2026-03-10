import { AscendWorld } from './world.js';
import { CombatManager } from './enemies.js';
import { WalkDetector, CurlDetector, KeyboardFallback } from './detector.js';
import { SoundEngine } from './sound.js';
import { Auth } from './auth.js';

// ── PARTICLES ─────────────────────────────────────────────────────────────────
const Particles = {
    victory(x, y, boss = false) {
        const emojis = boss
            ? ['👑', '💥', '🌟', '⚡', '🏆', '💪', '🔥', '✨']
            : ['✨', '⭐', '💥', '🌟', '💪', '⚡'];
        const count = boss ? 28 : 18;
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'particle';
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            const angle = (i / count) * Math.PI * 2;
            const dist = 80 + Math.random() * (boss ? 240 : 160);
            el.style.cssText = `left:${x}px;top:${y}px;--tx:${Math.cos(angle) * dist}px;--ty:${Math.sin(angle) * dist}px;animation:particleBurst ${0.6 + Math.random() * 0.5}s ease-out forwards;animation-delay:${Math.random() * 0.15}s;`;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1400);
        }
    },
    heal(amount) {
        const el = document.createElement('div');
        el.style.cssText = `
      position:fixed;left:${40 + Math.random() * 8}px;bottom:130px;
      font-family:'Courier New',monospace;font-size:13px;font-weight:bold;
      color:#44ff88;text-shadow:0 0 8px rgba(68,255,136,0.8);
      pointer-events:none;z-index:70;
      --tx:${(Math.random() - 0.5) * 20}px;--ty:-50px;
      animation:particleBurst 1.2s ease-out forwards;
    `;
        el.textContent = '+' + amount + ' HP';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1300);
    },
    debris() {
        const el = document.createElement('div');
        el.className = 'particle';
        el.textContent = ['🍂', '🗞️', '💨'][Math.floor(Math.random() * 3)];
        el.style.fontSize = (10 + Math.random() * 10) + 'px';
        const startX = Math.random() * window.innerWidth;
        const tx = (Math.random() - 0.5) * 120, ty = 60 + Math.random() * 100;
        const tr = (Math.random() - 0.5) * 180;
        el.style.cssText += `left:${startX}px;top:-20px;--tx:${tx}px;--ty:${ty}px;--tr:${tr}deg;animation:leafFloat ${1.5 + Math.random() * 1.5}s ease-in forwards;`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3200);
    }
};

// ── LEADERBOARD RENDERER ──────────────────────────────────────────────────────
function renderLeaderboard(containerEl, highlightUser = null) {
    const board = Auth.getLeaderboard();
    const medals = ['🥇', '🥈', '🥉'];
    containerEl.innerHTML = '';

    if (!board.length) {
        containerEl.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);font-family:Courier New,monospace;font-size:11px;padding:10px 0;">No runs recorded yet — be the first!</div>';
        return;
    }

    board.forEach((run, i) => {
        const row = document.createElement('div');
        const isMe = run.username === highlightUser;
        row.className = 'lb-row' +
            (i === 0 ? ' lb-gold' : i === 1 ? ' lb-silver' : i === 2 ? ' lb-bronze' : '') +
            (isMe ? ' lb-me' : '');

        const mins = Math.floor((run.durationMs || 0) / 60000);
        const secs = Math.floor(((run.durationMs || 0) % 60000) / 1000);
        const dist = run.distanceM >= 1000
            ? (run.distanceM / 1000).toFixed(1) + 'km'
            : run.distanceM + 'm';

        row.innerHTML = `
      <span class="lb-rank">${medals[i] || (i + 1)}</span>
      <span class="lb-user">${isMe ? '► ' : ''}${run.username}</span>
      <span class="lb-kills">☠ ${run.kills}</span>
      <span class="lb-dist">${dist}</span>
    `;
        containerEl.appendChild(row);
    });
}

// ── AUTH SCREEN ───────────────────────────────────────────────────────────────
function initAuthScreen(onAuthenticated) {
    const screen = document.getElementById('auth-screen');
    const tabs = document.querySelectorAll('.auth-tab');
    const submitBtn = document.getElementById('auth-submit');
    const errorEl = document.getElementById('auth-error');
    const usernameEl = document.getElementById('auth-username');
    const passwordEl = document.getElementById('auth-password');
    const lbList = document.getElementById('auth-lb-list');
    let mode = 'login'; // 'login' | 'signup'

    // If already logged in — skip straight to game
    if (Auth.currentUser) {
        screen.classList.add('hidden');
        onAuthenticated(Auth.currentUser);
        return;
    }

    screen.classList.remove('hidden');
    renderLeaderboard(lbList, null);

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            mode = tab.dataset.tab;
            submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
            errorEl.textContent = '';
        });
    });

    const submit = () => {
        const user = usernameEl.value.trim();
        const pass = passwordEl.value;
        errorEl.textContent = '';

        const result = mode === 'login'
            ? Auth.login(user, pass)
            : Auth.signup(user, pass);

        if (!result.ok) {
            errorEl.textContent = result.err;
            // Shake the card
            const card = document.getElementById('auth-card');
            card.style.animation = 'none';
            card.offsetHeight; // reflow
            card.style.animation = 'authShake 0.3s ease';
            return;
        }

        screen.style.opacity = '0';
        screen.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            screen.classList.add('hidden');
            screen.style.opacity = '';
            onAuthenticated(Auth.currentUser);
        }, 500);
    };

    submitBtn.addEventListener('click', submit);
    passwordEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    usernameEl.addEventListener('keydown', e => { if (e.key === 'Enter') passwordEl.focus(); });
}

// ── SCOREBOARD ────────────────────────────────────────────────────────────────
function showScoreboard({ kills, distanceM, curls, durationMs }, onPlayAgain, onLogout) {
    const overlay = document.getElementById('scoreboard-overlay');
    const lbList = document.getElementById('sb-lb-list');
    const pbEl = document.getElementById('sb-personal-best');

    // Fill run stats
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    const dist = distanceM >= 1000
        ? (distanceM / 1000).toFixed(1) + 'km'
        : distanceM + 'm';

    document.getElementById('sb-kills').textContent = kills;
    document.getElementById('sb-dist').textContent = dist;
    document.getElementById('sb-curls').textContent = curls;
    document.getElementById('sb-time').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Save the run
    Auth.saveRun({ kills, distanceM, curls, durationMs });

    // Personal best badge
    const best = Auth.getMyBest();
    if (best && best.kills === kills && best.distanceM === Math.round(distanceM)) {
        pbEl.textContent = kills > 0 ? '🏆 New Personal Best!' : '';
    } else if (best) {
        const bd = best.distanceM >= 1000
            ? (best.distanceM / 1000).toFixed(1) + 'km' : best.distanceM + 'm';
        pbEl.textContent = `Your best: ☠ ${best.kills} kills · ${bd}`;
    } else {
        pbEl.textContent = '';
    }

    // Render leaderboard
    renderLeaderboard(lbList, Auth.currentUser);

    // Animate in
    overlay.classList.add('show');

    document.getElementById('sb-play-again').onclick = () => {
        overlay.classList.remove('show');
        onPlayAgain();
    };
    document.getElementById('sb-logout').onclick = () => {
        overlay.classList.remove('show');
        Auth.logout();
        onLogout();
    };
}

// ── LOAD TF + MOVENET ─────────────────────────────────────────────────────────
async function loadScripts() {
    const urls = [
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js',
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@3.21.0/dist/tf-backend-wasm.min.js',
        'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.0/dist/pose-detection.min.js',
    ];
    for (const src of urls) {
        await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = src; s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
        });
    }
    window.tf.wasm.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@3.21.0/dist/');
    await window.tf.setBackend('wasm');
    await window.tf.ready();
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
    // ── 1. AUTH GATE ───────────────────────────────────────────────────────────
    await new Promise(resolve => initAuthScreen(resolve));

    // HUD logout button — saves run and returns to auth
    document.getElementById('hud-logout-btn').addEventListener('click', () => {
        if (!gameStarted) {
            Auth.logout();
            window.location.reload();
            return;
        }
        if (!confirm('Save your run and sign out?')) return;
        const stats = endSession();
        Auth.saveRun(stats);
        Auth.logout();
        window.location.reload();
    });

    // Update top bar to show logged-in user
    const topBar = document.getElementById('top-bar');
    const userTag = document.createElement('div');
    userTag.id = 'user-tag';
    userTag.textContent = '👤 ' + Auth.currentUser;
    userTag.style.cssText = `
    font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;
    color:rgba(0,212,255,0.7);background:rgba(0,212,255,0.06);
    border:1px solid rgba(0,212,255,0.2);border-radius:4px;padding:3px 10px;
  `;
    topBar.appendChild(userTag);

    // ── 2. LOAD + INIT ─────────────────────────────────────────────────────────
    const setLoad = (pct, msg) => {
        document.getElementById('loading-bar').style.width = pct + '%';
        document.getElementById('loading-status').textContent = msg;
    };

    setLoad(10, 'Building city…');
    const world = new AscendWorld(document.getElementById('game-canvas'));
    setLoad(25, 'Loading TensorFlow…');
    await loadScripts();
    setLoad(55, 'Spawning enemies…');
    const combat = new CombatManager(world);
    const sound = new SoundEngine();
    combat.sound = sound;

    setLoad(70, 'Starting camera…');
    const walker = new WalkDetector();
    const curler = new CurlDetector();
    const keyboard = new KeyboardFallback();
    let camOk = false;
    try { camOk = await walker.init(); } catch (e) { camOk = false; }

    setLoad(90, 'Almost ready…');
    await new Promise(r => setTimeout(r, 400));
    setLoad(100, 'Go!');
    setTimeout(() => {
        const loading = document.getElementById('loading');
        loading.style.opacity = '0';
        setTimeout(() => loading.style.display = 'none', 800);
    }, 600);

    // ── 3. SESSION TRACKING ────────────────────────────────────────────────────
    let sessionStartTime = null;
    let sessionKills = 0;
    let sessionCurls = 0;
    let sessionDistStart = 0;

    const startSession = () => {
        sessionStartTime = Date.now();
        sessionKills = 0;
        sessionCurls = 0;
        sessionDistStart = world.distance;
    };

    const endSession = () => {
        const durationMs = sessionStartTime ? Date.now() - sessionStartTime : 0;
        const distanceM = Math.round((world.distance - sessionDistStart) * 8);
        return { kills: sessionKills, distanceM, curls: sessionCurls, durationMs };
    };

    // Track kills from combat
    const origStateChange = (state) => {
        walker._combatState = state;
        keyboard._combatState = state;
        walker._combatMgr = state === 'combat' ? combat : null;
        keyboard._combatMgr = state === 'combat' ? combat : null;
    };
    const prevKillCount = { v: 0 };

    // ── 4. TUTORIAL / START ────────────────────────────────────────────────────
    let gameStarted = false;
    const tutScreen = document.getElementById('tutorial-screen');

    window.startGame = () => {
        gameStarted = true;
        combat.resetSpawnTimer();
        startSession();
        tutScreen.style.opacity = '0';
        tutScreen.style.transition = 'opacity 0.6s';
        setTimeout(() => tutScreen.style.display = 'none', 600);
        sound.start();
    };
    document.getElementById('tutorial-start-btn').addEventListener('click', window.startGame);

    // ── 5. HUD REFS ───────────────────────────────────────────────────────────
    const speedFill = document.getElementById('speed-fill');
    const paceText = document.getElementById('pace-text');
    const distEl = document.getElementById('distance-display');
    const statusEl = document.getElementById('status');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const statusSub = document.getElementById('status-sub');
    const healHud = document.getElementById('heal-hud');
    const healHpFill = document.getElementById('heal-hp-fill');
    const curlCount = document.getElementById('curl-count');
    const killEl = document.getElementById('kill-counter');

    if (!document.getElementById('heal-prompt')) {
        const hp = document.createElement('div');
        hp.id = 'heal-prompt'; hp.textContent = '💪 CURL TO HEAL';
        document.body.appendChild(hp);
    }

    const MAX_HP = 100;
    let currentSpeed = 0;

    // ── 6. CURL HEALING ───────────────────────────────────────────────────────
    curler.onRep = (side, angle, total) => {
        if (combat.playerHP >= MAX_HP) return;
        combat.playerHP = Math.min(MAX_HP, combat.playerHP + 3);
        combat.updatePlayerHP();
        sessionCurls++;
        Particles.heal(3);
        sound.playHeal();
        curlCount.textContent = sessionCurls;
    };

    // ── 7. POSE + COMBAT WIRING ───────────────────────────────────────────────
    walker.onPoseUpdate = (kp) => {
        combat.updatePose(kp);
        const cs = curler.update(kp);
        walker._curlState = cs;
    };
    keyboard.onPoseUpdate = walker.onPoseUpdate;

    combat.onStateChange = (state) => {
        origStateChange(state);
        // Count kills
        if (combat.killCount > prevKillCount.v) {
            sessionKills += combat.killCount - prevKillCount.v;
            prevKillCount.v = combat.killCount;
            killEl.textContent = `☠ ${combat.killCount}`;
        }
        // Trigger scoreboard on defeat
        if (state === 'defeat') {
            setTimeout(() => triggerEndRun(), 3500);
        }
    };

    // ── 8. SPEED HANDLER ─────────────────────────────────────────────────────
    const handleSpeed = (intensity) => {
        currentSpeed = intensity;
        if (combat.state === 'running' || combat.state === 'spawned') {
            world.setSpeed(intensity);
        } else {
            world.setSpeed(0);
        }
        speedFill.style.width = `${intensity * 100}%`;
        if (intensity > 0.65) { paceText.textContent = 'RUNNING'; paceText.style.color = '#00d4ff'; }
        else if (intensity > 0.25) { paceText.textContent = 'JOGGING'; paceText.style.color = '#4cff80'; }
        else if (intensity > 0.05) { paceText.textContent = 'WALKING'; paceText.style.color = 'rgba(255,255,255,0.8)'; }
        else { paceText.textContent = ''; }

        if (intensity > 0.05) {
            statusEl.classList.add('hidden');
        } else {
            statusEl.classList.remove('hidden');
            statusText.textContent = camOk ? 'Walk in place to begin' : 'Press SPACE to begin';
            statusSub.textContent = 'your journey awaits';
            statusIcon.textContent = '🏃';
        }
    };

    walker.onSpeedUpdate = (i) => { if (!gameStarted) return; sound.start(); handleSpeed(i); };
    keyboard.onSpeedUpdate = (i) => { if (!gameStarted) return; sound.start(); handleSpeed(i); };

    const updateHealHud = () => {
        if (combat.playerHP < MAX_HP) { healHud.classList.add('visible'); }
        else { healHud.classList.remove('visible'); }
        healHpFill.style.width = (combat.playerHP / MAX_HP * 100) + '%';
    };

    // ── 9. END RUN ────────────────────────────────────────────────────────────
    const triggerEndRun = () => {
        if (!gameStarted) return;
        const stats = endSession();
        showScoreboard(stats,
            // Play again — reload the page cleanly
            () => window.location.reload(),
            // Logout — also reload so auth screen re-appears
            () => window.location.reload()
        );
    };

    // Expose quit button via keyboard (Q key)
    window.addEventListener('keydown', e => {
        if (e.key === 'q' || e.key === 'Q') triggerEndRun();
    });

    // ── 10. GAME LOOP ─────────────────────────────────────────────────────────
    setInterval(() => {
        if (!gameStarted) return;

        const m = Math.floor((world.distance - sessionDistStart) * 8);
        if (currentSpeed > 0.05 && combat.state === 'running') {
            distEl.textContent = m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
        }

        if (combat.state === 'running' && currentSpeed > 0.1 && Math.random() < 0.10) {
            Particles.debris();
        }

        updateHealHud();
        curlCount.textContent = sessionCurls;

        // Sync kill counter continuously
        if (combat.killCount !== prevKillCount.v) {
            sessionKills += combat.killCount - prevKillCount.v;
            prevKillCount.v = combat.killCount;
            killEl.textContent = `☠ ${combat.killCount}`;
        }

        combat.spawnTick(world.speed);
        if (combat.state === 'spawned') combat.tickEnemy(world.speed);
        if (combat.state === 'combat' || combat.state === 'encounter') world.setSpeed(0);
    }, 50);
}

main().catch(console.error);