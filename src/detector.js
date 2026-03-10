// ── WALK DETECTOR ─────────────────────────────────────────────────────────────
// Hip-relative knee raise detection with MoveNet SINGLEPOSE_LIGHTNING
export class WalkDetector {
    constructor() {
        this.detector = null;
        this.video = document.getElementById('webcam');
        this.overlayCanvas = document.getElementById('webcam-canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.onSpeedUpdate = null;
        this.onPoseUpdate = null;
        this._combatState = 'running';
        this._combatMgr = null;

        this.leftState = 'down';
        this.rightState = 'down';
        this.leftLastStep = 0;
        this.rightLastStep = 0;
        this.STEP_COOLDOWN_MS = 400; // 400ms minimum between steps
        this.stepTimestamps = [];
        this.STEP_WINDOW_MS = 2000;
        this.MIN_STEPS = 2;
        this.RAISE_THRESHOLD_RATIO = 0.18; // 18% of leg length — requires a real deliberate step
        this.smoothSpeed = 0;
        this._curlState = null;
        this._detectInterval = 50;
    }

    async init() {
        try {
            const isMob = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: isMob ? 256 : 320,
                    height: isMob ? 192 : 240,
                    facingMode: 'user',
                    frameRate: { ideal: isMob ? 15 : 30 }
                }
            });
            this.video.srcObject = stream;
            await new Promise(r => this.video.onloadedmetadata = r);
            console.log('✅ Camera OK');
        } catch (e) {
            console.error('❌ Camera failed:', e);
            return false;
        }
        try {
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
            // poseDetection is loaded as a global via CDN script tags
            this.detector = await window.poseDetection.createDetector(
                window.poseDetection.SupportedModels.MoveNet,
                {
                    modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                    enableSmoothing: true,
                    minPoseScore: 0.25,
                }
            );
            this._detectInterval = isMobile ? 80 : 50;
            console.log('✅ MoveNet ready');
            this.overlayCanvas.width = this.video.videoWidth;
            this.overlayCanvas.height = this.video.videoHeight;
            this.detect();
        } catch (e) {
            console.error('❌ MoveNet failed:', e);
        }
        return true;
    }

    async detect() {
        if (!this.detector) return;
        try {
            const poses = await this.detector.estimatePoses(this.video);
            if (poses.length > 0) {
                this.processPose(poses[0]);
                this.drawSkeleton(poses[0], this._combatState, this._combatMgr);
            }
        } catch (e) { }
        setTimeout(() => this.detect(), this._detectInterval);
    }

    processPose(pose) {
        const kp = {};
        pose.keypoints.forEach(k => { kp[k.name] = k; });
        if (this.onPoseUpdate) this.onPoseUpdate(kp);

        const lk = kp['left_knee'], rk = kp['right_knee'];
        const lh = kp['left_hip'], rh = kp['right_hip'];
        const la = kp['left_ankle'], ra = kp['right_ankle'];

        if (!lk || !rk || !lh || !rh) return;
        if (lk.score < 0.3 || rk.score < 0.3 || lh.score < 0.3 || rh.score < 0.3) return;

        const now = Date.now();
        const frameH = this.video.videoHeight || 240;

        const leftLeg = (la && la.score > 0.3) ? Math.abs(lh.y - la.y) : frameH * 0.4;
        const rightLeg = (ra && ra.score > 0.3) ? Math.abs(rh.y - ra.y) : frameH * 0.4;

        const leftRaised = (lh.y - lk.y) / leftLeg > this.RAISE_THRESHOLD_RATIO;
        const rightRaised = (rh.y - rk.y) / rightLeg > this.RAISE_THRESHOLD_RATIO;

        if (leftRaised && this.leftState === 'down' && now - this.leftLastStep > this.STEP_COOLDOWN_MS) {
            this.leftState = 'up';
        } else if (!leftRaised && this.leftState === 'up') {
            this.leftState = 'down';
            this.leftLastStep = now;
            this._registerStep(now);
        }

        if (rightRaised && this.rightState === 'down' && now - this.rightLastStep > this.STEP_COOLDOWN_MS) {
            this.rightState = 'up';
        } else if (!rightRaised && this.rightState === 'up') {
            this.rightState = 'down';
            this.rightLastStep = now;
            this._registerStep(now);
        }

        // Actively decay speed on every pose frame if not enough recent steps
        this._decayIfIdle(now);
    }

    _registerStep(now) {
        this.stepTimestamps.push(now);
        this.stepTimestamps = this.stepTimestamps.filter(t => now - t < this.STEP_WINDOW_MS);
        const stepsInWindow = this.stepTimestamps.length;
        if (stepsInWindow < this.MIN_STEPS) { this._emitSpeed(0); return; }
        const intensity = Math.min(stepsInWindow / 10, 1.0);
        this._emitSpeed(intensity);
        setTimeout(() => {
            const fresh = this.stepTimestamps.filter(t => now - t < this.STEP_WINDOW_MS);
            if (fresh.length < this.MIN_STEPS) this._emitSpeed(0);
        }, this.STEP_WINDOW_MS + 100);
    }

    _emitSpeed(v) {
        // If emitting zero, decay quickly. If emitting signal, blend toward it.
        if (v <= 0) {
            this.smoothSpeed = this.smoothSpeed * 0.5; // fast decay to zero
        } else {
            this.smoothSpeed = this.smoothSpeed * 0.6 + v * 0.4;
        }
        // Snap to zero to avoid floating near-zero values triggering walking
        if (this.smoothSpeed < 0.03) this.smoothSpeed = 0;
        if (this.onSpeedUpdate) this.onSpeedUpdate(this.smoothSpeed);
    }

    // Called on every pose frame to decay speed if no recent steps
    _decayIfIdle(now) {
        const recentSteps = this.stepTimestamps.filter(t => now - t < this.STEP_WINDOW_MS);
        if (recentSteps.length < this.MIN_STEPS && this.smoothSpeed > 0) {
            this._emitSpeed(0);
        }
    }

    drawSkeleton(pose, combatState, combatMgr) {
        const ctx = this.overlayCtx;
        const vw = this.video.videoWidth, vh = this.video.videoHeight;
        const cw = this.overlayCanvas.width, ch = this.overlayCanvas.height;
        const sx = cw / (vw || cw), sy = ch / (vh || ch);
        ctx.clearRect(0, 0, cw, ch);

        const kp = {};
        pose.keypoints.forEach(k => { kp[k.name] = k; });

        const inCombat = combatState === 'combat';
        const lArmUp = combatMgr?.leftArmState === 'up';
        const rArmUp = combatMgr?.rightArmState === 'up';

        // Bone connections
        const bones = [
            ['left_shoulder', 'right_shoulder'],
            ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
            ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
            ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
            ['left_hip', 'right_hip'],
            ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
            ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
        ];
        ctx.lineWidth = 1.5;
        bones.forEach(([a, b]) => {
            const ka = kp[a], kb = kp[b];
            if (!ka || !kb || ka.score < 0.3 || kb.score < 0.3) return;
            ctx.strokeStyle = inCombat ? 'rgba(255,140,60,0.6)' : 'rgba(0,212,255,0.5)';
            ctx.beginPath();
            ctx.moveTo(ka.x * sx, ka.y * sy);
            ctx.lineTo(kb.x * sx, kb.y * sy);
            ctx.stroke();
        });

        // Keypoints
        pose.keypoints.forEach(k => {
            if (k.score < 0.3) return;
            const isLWrist = k.name === 'left_wrist' && lArmUp;
            const isRWrist = k.name === 'right_wrist' && rArmUp;
            const isWrist = k.name === 'left_wrist' || k.name === 'right_wrist';
            const isElbow = k.name === 'left_elbow' || k.name === 'right_elbow';
            const isKnee = k.name === 'left_knee' || k.name === 'right_knee';

            let col = 'rgba(255,255,255,0.4)', r = 2;
            if (inCombat && (isLWrist || isRWrist)) { col = 'rgba(255,220,0,1)'; r = 6; }
            else if (inCombat && isWrist) { col = 'rgba(0,212,255,1)'; r = 5; }
            else if (inCombat && isElbow) { col = 'rgba(255,140,60,0.9)'; r = 3; }
            else if (!inCombat && isKnee) { col = 'rgba(0,212,255,1)'; r = 4; }

            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(k.x * sx, k.y * sy, r, 0, Math.PI * 2); ctx.fill();
            if (inCombat && isWrist) {
                ctx.strokeStyle = (isLWrist || isRWrist) ? 'rgba(255,220,0,0.5)' : 'rgba(0,212,255,0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(k.x * sx, k.y * sy, r + 4, 0, Math.PI * 2); ctx.stroke();
            }
        });

        // Threshold lines
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        if (inCombat && combatMgr) {
            const ls = kp['left_shoulder'], rs = kp['right_shoulder'];
            const lh = kp['left_hip'], rh = kp['right_hip'];
            const ratio = combatMgr.ARM_RAISE_RATIO;
            if (ls && ls.score > 0.3) {
                const torso = (lh && lh.score > 0.3) ? Math.abs(ls.y - lh.y) : 80;
                const tY = (ls.y - torso * ratio) * sy;
                ctx.strokeStyle = lArmUp ? 'rgba(255,220,0,0.9)' : 'rgba(0,212,255,0.6)';
                ctx.beginPath(); ctx.moveTo((ls.x - 14) * sx, tY); ctx.lineTo((ls.x + 14) * sx, tY); ctx.stroke();
            }
            if (rs && rs.score > 0.3) {
                const torso = (rh && rh.score > 0.3) ? Math.abs(rs.y - rh.y) : 80;
                const tY = (rs.y - torso * ratio) * sy;
                ctx.strokeStyle = rArmUp ? 'rgba(255,220,0,0.9)' : 'rgba(0,212,255,0.6)';
                ctx.beginPath(); ctx.moveTo((rs.x - 14) * sx, tY); ctx.lineTo((rs.x + 14) * sx, tY); ctx.stroke();
            }
        } else {
            const lhp = kp['left_hip'], rhp = kp['right_hip'];
            const lk = kp['left_knee'], rk = kp['right_knee'];
            const la = kp['left_ankle'], ra = kp['right_ankle'];
            const frameH = this.video.videoHeight || 240;
            ctx.strokeStyle = 'rgba(255,200,0,0.7)';
            if (lhp && lhp.score > 0.3 && lk && lk.score > 0.3) {
                const legLen = (la && la.score > 0.3) ? Math.abs(lhp.y - la.y) : frameH * 0.4;
                const tY = (lhp.y - legLen * this.RAISE_THRESHOLD_RATIO) * sy;
                ctx.beginPath(); ctx.moveTo((lk.x - 12) * sx, tY); ctx.lineTo((lk.x + 12) * sx, tY); ctx.stroke();
            }
            if (rhp && rhp.score > 0.3 && rk && rk.score > 0.3) {
                const legLen = (ra && ra.score > 0.3) ? Math.abs(rhp.y - ra.y) : frameH * 0.4;
                const tY = (rhp.y - legLen * this.RAISE_THRESHOLD_RATIO) * sy;
                ctx.beginPath(); ctx.moveTo((rk.x - 12) * sx, tY); ctx.lineTo((rk.x + 12) * sx, tY); ctx.stroke();
            }
        }

        // Curl arc overlay
        if (this._curlState) {
            const { leftAngle, rightAngle } = this._curlState;
            const drawCurlArc = (angle, shoulderKP, wristKP) => {
                if (angle === null || !shoulderKP || !wristKP) return;
                const cx = shoulderKP.x * sx, cy = shoulderKP.y * sy;
                const pct = Math.max(0, Math.min(1, 1 - (angle - 35) / (160 - 35)));
                const arcEnd = -Math.PI / 2 + pct * Math.PI;
                ctx.strokeStyle = `rgba(76,255,128,${0.4 + pct * 0.5})`;
                ctx.lineWidth = 2; ctx.setLineDash([]);
                ctx.beginPath(); ctx.arc(cx, cy, 14, -Math.PI / 2, arcEnd, false); ctx.stroke();
            };
            drawCurlArc(leftAngle, kp['left_shoulder'], kp['left_wrist']);
            drawCurlArc(rightAngle, kp['right_shoulder'], kp['right_wrist']);
        }
        ctx.setLineDash([]);
    }
}

// ── CURL DETECTOR ─────────────────────────────────────────────────────────────
// Three-point elbow flexion angle: shoulder → elbow → wrist
// Straight arm ≈ 160°, full curl ≈ 35°
// MUTUAL EXCLUSION: if either wrist is in overhead-press zone (above shoulder),
// curl detection is fully suppressed — prevents accidental heals during combat.
export class CurlDetector {
    constructor() {
        this.CURL_THRESHOLD = 80;   // degrees — arm considered curled
        this.EXTEND_THRESHOLD = 140;  // degrees — arm considered extended
        this.COOLDOWN_MS = 400;
        this.MIN_SCORE = 0.35;
        this.OVERHEAD_RATIO = 0.05; // wrist this far above shoulder = press zone

        this.leftState = 'extended';
        this.rightState = 'extended';
        this.leftLastRep = 0;
        this.rightLastRep = 0;
        this.totalReps = 0;
        this.onRep = null; // callback(side, angle, total)
    }

    _angle(A, B, C) {
        const ax = A.x - B.x, ay = A.y - B.y;
        const cx = C.x - B.x, cy = C.y - B.y;
        const dot = ax * cx + ay * cy;
        const magA = Math.sqrt(ax * ax + ay * ay);
        const magC = Math.sqrt(cx * cx + cy * cy);
        if (magA < 0.001 || magC < 0.001) return 180;
        return Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC)))) * (180 / Math.PI);
    }

    update(kp) {
        const now = Date.now();
        const ls = kp['left_shoulder'], rs = kp['right_shoulder'];
        const le = kp['left_elbow'], re = kp['right_elbow'];
        const lw = kp['left_wrist'], rw = kp['right_wrist'];
        const lh = kp['left_hip'], rh = kp['right_hip'];

        // ── MUTUAL EXCLUSION — suppress curl when in overhead press territory ──
        // "Above shoulder" means wrist.y < shoulder.y (y=0 is top of frame)
        if (ls && rs && lw && rw && ls.score > 0.3 && rs.score > 0.3) {
            const leftTorso = (lh && lh.score > 0.3) ? Math.abs(ls.y - lh.y) : 80;
            const rightTorso = (rh && rh.score > 0.3) ? Math.abs(rs.y - rh.y) : 80;
            const lOverhead = lw.score > 0.3 && (ls.y - lw.y) / leftTorso > this.OVERHEAD_RATIO;
            const rOverhead = rw.score > 0.3 && (rs.y - rw.y) / rightTorso > this.OVERHEAD_RATIO;
            if (lOverhead || rOverhead) {
                // In press territory — reset states, no counting
                this.leftState = 'extended';
                this.rightState = 'extended';
                return { leftAngle: null, rightAngle: null, leftState: this.leftState, rightState: this.rightState };
            }
        }

        let leftAngle = null, rightAngle = null;

        // LEFT arm
        if (ls && le && lw && ls.score > this.MIN_SCORE && le.score > this.MIN_SCORE && lw.score > this.MIN_SCORE) {
            leftAngle = this._angle(ls, le, lw);
            if (leftAngle < this.CURL_THRESHOLD) {
                this.leftState = 'curled';
            } else if (leftAngle > this.EXTEND_THRESHOLD && this.leftState === 'curled') {
                if (now - this.leftLastRep > this.COOLDOWN_MS) {
                    this.leftLastRep = now;
                    this.totalReps++;
                    if (this.onRep) this.onRep('left', leftAngle, this.totalReps);
                }
                this.leftState = 'extended';
            }
        }

        // RIGHT arm
        if (rs && re && rw && rs.score > this.MIN_SCORE && re.score > this.MIN_SCORE && rw.score > this.MIN_SCORE) {
            rightAngle = this._angle(rs, re, rw);
            if (rightAngle < this.CURL_THRESHOLD) {
                this.rightState = 'curled';
            } else if (rightAngle > this.EXTEND_THRESHOLD && this.rightState === 'curled') {
                if (now - this.rightLastRep > this.COOLDOWN_MS) {
                    this.rightLastRep = now;
                    this.totalReps++;
                    if (this.onRep) this.onRep('right', rightAngle, this.totalReps);
                }
                this.rightState = 'extended';
            }
        }

        return { leftAngle, rightAngle, leftState: this.leftState, rightState: this.rightState };
    }
}

// ── KEYBOARD FALLBACK ─────────────────────────────────────────────────────────
export class KeyboardFallback {
    constructor() {
        this.onSpeedUpdate = null;
        this.onPoseUpdate = null;
        this._combatState = 'running';
        this._combatMgr = null;
        window.addEventListener('keydown', e => {
            if ([' ', 'w', 'ArrowUp'].includes(e.key) && this.onSpeedUpdate) this.onSpeedUpdate(0.6);
        });
        window.addEventListener('keyup', e => {
            if ([' ', 'w', 'ArrowUp'].includes(e.key) && this.onSpeedUpdate) this.onSpeedUpdate(0);
        });
    }
    async init() { return true; }
}