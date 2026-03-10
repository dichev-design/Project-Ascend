// ── AUTH + SCOREBOARD ─────────────────────────────────────────────────────────
// localStorage-based auth. Users are stored as:
//   ascend_users  → { [username]: { passwordHash, createdAt } }
//   ascend_scores → [ { username, kills, distanceM, curls, date, duration } ]
//   ascend_session→ username (current logged-in user)

const USERS_KEY = 'ascend_users';
const SCORES_KEY = 'ascend_scores';
const SESSION_KEY = 'ascend_session';
const MAX_SCORES = 100; // keep last 100 runs globally

// Simple hash — not cryptographic but fine for a local game leaderboard
function hashPassword(pw) {
    let h = 0x811c9dc5;
    for (let i = 0; i < pw.length; i++) {
        h ^= pw.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
}

function getUsers() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch { return {}; } }
function getScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]'); } catch { return []; } }
function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
function saveScores(s) { localStorage.setItem(SCORES_KEY, JSON.stringify(s)); }

export const Auth = {
    currentUser: localStorage.getItem(SESSION_KEY) || null,

    signup(username, password) {
        username = username.trim().toLowerCase();
        if (!username || username.length < 2) return { ok: false, err: 'Username must be at least 2 characters' };
        if (!/^[a-z0-9_]+$/.test(username)) return { ok: false, err: 'Only letters, numbers and underscores' };
        if (!password || password.length < 4) return { ok: false, err: 'Password must be at least 4 characters' };
        const users = getUsers();
        if (users[username]) return { ok: false, err: 'Username already taken' };
        users[username] = { passwordHash: hashPassword(password), createdAt: Date.now() };
        saveUsers(users);
        this.currentUser = username;
        localStorage.setItem(SESSION_KEY, username);
        return { ok: true };
    },

    login(username, password) {
        username = username.trim().toLowerCase();
        const users = getUsers();
        if (!users[username]) return { ok: false, err: 'Username not found' };
        if (users[username].passwordHash !== hashPassword(password)) return { ok: false, err: 'Wrong password' };
        this.currentUser = username;
        localStorage.setItem(SESSION_KEY, username);
        return { ok: true };
    },

    logout() {
        this.currentUser = null;
        localStorage.removeItem(SESSION_KEY);
    },

    saveRun({ kills, distanceM, curls, durationMs }) {
        if (!this.currentUser) return;
        const scores = getScores();
        scores.unshift({
            username: this.currentUser,
            kills,
            distanceM: Math.round(distanceM),
            curls,
            durationMs: Math.round(durationMs),
            date: Date.now(),
        });
        saveScores(scores.slice(0, MAX_SCORES));
    },

    // Returns top 10 scores sorted by kills then distance
    getLeaderboard() {
        const scores = getScores();
        return [...scores]
            .sort((a, b) => b.kills - a.kills || b.distanceM - a.distanceM)
            .slice(0, 10);
    },

    // Returns this user's personal best and all their runs
    getMyRuns() {
        if (!this.currentUser) return [];
        return getScores().filter(s => s.username === this.currentUser);
    },

    getMyBest() {
        const runs = this.getMyRuns();
        if (!runs.length) return null;
        return runs.reduce((best, r) =>
            r.kills > best.kills || (r.kills === best.kills && r.distanceM > best.distanceM) ? r : best
        );
    }
};