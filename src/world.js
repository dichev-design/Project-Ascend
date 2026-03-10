import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── URBAN ASCEND WORLD ─────────────────────────────────────────────────────
// Post-apocalyptic sunny day. Buildings are procedural geometry so they
// ALWAYS fill the sky correctly. GLB props (dumpsters, trucks, lights, etc.)
// decorate the sidewalks in front. This guarantees immersion regardless of
// GLB scale issues.
export class AscendWorld {
    constructor(canvas) {
        this.canvas = canvas;
        this.speed = 0;
        this.targetSpeed = 0;
        this.distance = 0;
        this.time = 0;
        this.chunks = [];
        this.chunkLength = 50;
        this.numChunks = 8;
        this._models = {};
        this._loader = new GLTFLoader();
        this._ready = false;

        this.initRenderer();
        this.initScene();
        this.initLights();
        this.initGround();   // ground is pure geometry — show immediately
        this.buildWorld();   // procedural buildings — show immediately
        this._ready = true;
        this.loadProps();    // GLB props load asynchronously and slot in after
        this.animate();
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0xd4b87a); // warm hazy sky fallback
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initScene() {
        this.scene = new THREE.Scene();
        // Dusty amber haze — post-apocalyptic atmosphere
        this.scene.fog = new THREE.Fog(0xd4a85a, 60, 180);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
        this.camera.position.set(0, 2.4, 0);
        this._buildSky();
    }

    _buildSky() {
        // Sky hemisphere — bleached blue top, warm amber horizon
        const skyGeo = new THREE.SphereGeometry(250, 24, 12);
        skyGeo.scale(-1, 1, 1);
        const skyC = document.createElement('canvas');
        skyC.width = 2; skyC.height = 256;
        const ctx = skyC.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#7eb8d4'); // pale blue zenith
        grad.addColorStop(0.4, '#c8d8e4'); // bleached white mid
        grad.addColorStop(0.72, '#e8c47a'); // warm orange horizon
        grad.addColorStop(1, '#c8944a'); // amber ground glow
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 2, 256);
        this.scene.add(new THREE.Mesh(skyGeo,
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(skyC), side: THREE.BackSide })));

        // Sun disc
        const sun = new THREE.Mesh(new THREE.CircleGeometry(8, 32),
            new THREE.MeshBasicMaterial({ color: 0xfffce8 }));
        sun.position.set(55, 110, -240);
        this.scene.add(sun);
        const halo = new THREE.Mesh(new THREE.CircleGeometry(16, 32),
            new THREE.MeshBasicMaterial({ color: 0xfff8cc, transparent: true, opacity: 0.14 }));
        halo.position.set(55, 110, -239); this.scene.add(halo);

        // Distant city silhouette fills the horizon behind vanishing point
        const silMat = new THREE.MeshBasicMaterial({ color: 0x5a6875, transparent: true, opacity: 0.6 });
        [22, 36, 18, 44, 28, 40, 20, 32, 46, 24, 34, 30, 16, 38, 26].forEach((h, i) => {
            const w = 12 + Math.random() * 16;
            const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), silMat);
            b.position.set(-120 + i * 18 + Math.random() * 5, h / 2 + 0.5, -200);
            this.scene.add(b);
        });

        // Floating dust specks
        const dCount = 200;
        const dGeo = new THREE.BufferGeometry();
        const dPos = new Float32Array(dCount * 3);
        for (let i = 0; i < dCount; i++) {
            dPos[i * 3] = (Math.random() - 0.5) * 40;
            dPos[i * 3 + 1] = Math.random() * 10 + 0.5;
            dPos[i * 3 + 2] = -Math.random() * 60;
        }
        dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
        this._dustGeo = dGeo; this._dustPos = dPos;
        this.scene.add(new THREE.Points(dGeo,
            new THREE.PointsMaterial({ color: 0xd4a860, size: 0.1, transparent: true, opacity: 0.5 })));
    }

    initLights() {
        // Bright sunny ambient
        this.scene.add(new THREE.AmbientLight(0xffe8c0, 2.2));
        // Strong directional sun
        const sun = new THREE.DirectionalLight(0xfff5c8, 2.8);
        sun.position.set(55, 80, -40);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = sun.shadow.camera.bottom = -100;
        sun.shadow.camera.right = sun.shadow.camera.top = 100;
        sun.shadow.camera.far = 300;
        this.scene.add(sun);
        // Sky hemisphere bounce
        this.scene.add(new THREE.HemisphereLight(0xb8d4ff, 0xc89040, 0.9));
        // Soft fill so nothing is pitch black
        this.scene.add(new THREE.PointLight(0xffecd0, 0.5, 50));
    }

    // ── GROUND ────────────────────────────────────────────────────────────────
    initGround() {
        const len = this.chunkLength * this.numChunks * 2;

        // Wide dirt/rubble ground that extends to horizon
        const dirtTex = this._makeDirtTex();
        const dirt = new THREE.Mesh(
            new THREE.PlaneGeometry(300, len).rotateX(-Math.PI / 2),
            new THREE.MeshLambertMaterial({ map: dirtTex })
        );
        dirt.position.set(0, -0.02, -len / 2);
        dirt.receiveShadow = true;
        this.scene.add(dirt);

        // Sidewalk slabs
        const paveTex = this._makePaveTex();
        [-8, 8].forEach(x => {
            const pave = new THREE.Mesh(
                new THREE.PlaneGeometry(6, len).rotateX(-Math.PI / 2),
                new THREE.MeshLambertMaterial({ map: paveTex })
            );
            pave.position.set(x, 0.01, -len / 2);
            pave.receiveShadow = true;
            this.scene.add(pave);
        });

        // Road
        const roadTex = this._makeRoadTex();
        const road = new THREE.Mesh(
            new THREE.PlaneGeometry(11, len).rotateX(-Math.PI / 2),
            new THREE.MeshLambertMaterial({ map: roadTex })
        );
        road.position.set(0, 0.02, -len / 2);
        road.receiveShadow = true;
        this.scene.add(road);
        this._roadMesh = road;

        // Kerb strips
        [-5.5, 5.5].forEach(x => {
            const kerb = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 0.12, len),
                new THREE.MeshLambertMaterial({ color: 0xc8baa0 })
            );
            kerb.position.set(x, 0.06, -len / 2);
            this.scene.add(kerb);
        });
    }

    _makeDirtTex() {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#8a7050'; ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * 256, y = Math.random() * 256;
            ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '60,40,20' : '120,100,70'},${0.08 + Math.random() * 0.12})`;
            ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2);
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 60); return t;
    }

    _makePaveTex() {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#a09880'; ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
        for (let i = 0; i <= 256; i += 64) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
        }
        for (let i = 0; i < 30; i++) {
            ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`; ctx.lineWidth = Math.random();
            ctx.beginPath(); ctx.moveTo(Math.random() * 256, Math.random() * 256);
            ctx.lineTo(Math.random() * 256, Math.random() * 256); ctx.stroke();
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 50); return t;
    }

    _makeRoadTex() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 512;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#383028'; ctx.fillRect(0, 0, 256, 512);
        // Surface noise
        for (let i = 0; i < 600; i++) {
            ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},220,160,${Math.random() * 0.035})`;
            ctx.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 3, 1);
        }
        // Cracks
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        for (let i = 0; i < 18; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * 256, Math.random() * 512);
            ctx.lineTo(Math.random() * 256, Math.random() * 512);
            ctx.stroke();
        }
        // Centre dashes
        ctx.fillStyle = '#c8b030';
        [50, 140, 230, 320, 410, 490].forEach(y => ctx.fillRect(122, y, 12, 48));
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 60); return t;
    }

    // ── BUILDING TEXTURE FACTORY ──────────────────────────────────────────────
    _makeBuildingTex(palette) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 512;
        const ctx = c.getContext('2d');
        // Base wall colour
        ctx.fillStyle = palette.wall; ctx.fillRect(0, 0, 256, 512);
        // Window grid
        const winW = 28, winH = 36, cols = 6, rows = 10;
        const gapX = (256 - cols * winW) / (cols + 1);
        const gapY = (512 - rows * winH) / (rows + 1);
        for (let r = 0; r < rows; r++) {
            for (let col = 0; col < cols; col++) {
                const x = gapX + col * (winW + gapX);
                const y = gapY + r * (winH + gapY);
                const broken = Math.random() > 0.7;
                if (broken) {
                    ctx.fillStyle = '#1a1210'; ctx.fillRect(x, y, winW, winH);
                    // Jagged crack
                    ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + winW * 0.6, y + winH * 0.4);
                    ctx.lineTo(x + winW, y + winH); ctx.stroke();
                } else {
                    // Boarded or dirty glass
                    ctx.fillStyle = Math.random() > 0.5 ? palette.glass : '#5a4830';
                    ctx.fillRect(x, y, winW, winH);
                    // Frame
                    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, winW, winH);
                }
            }
        }
        // Grime streaks down face
        for (let i = 0; i < 20; i++) {
            const sx = Math.random() * 256;
            ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
            ctx.fillRect(sx, 0, 1 + Math.random() * 2, 200 + Math.random() * 300);
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 1);
        return t;
    }

    // Building colour palettes — worn, sun-bleached, post-apocalyptic
    _randomPalette() {
        const palettes = [
            { wall: '#b8a888', glass: '#3a4c3a' }, // sandy concrete
            { wall: '#9a8870', glass: '#2a3828' }, // dirty beige
            { wall: '#c0a878', glass: '#4a3c20' }, // warm ochre
            { wall: '#888890', glass: '#303840' }, // grey concrete
            { wall: '#a88870', glass: '#2a2820' }, // brown brick
            { wall: '#b09878', glass: '#3a4030' }, // light tan
        ];
        return palettes[Math.floor(Math.random() * palettes.length)];
    }

    // ── WORLD BUILD ───────────────────────────────────────────────────────────
    buildWorld() {
        for (let i = 0; i < this.numChunks; i++) {
            const g = new THREE.Group();
            g.position.z = -i * this.chunkLength;
            this._fillChunk(g);
            this.scene.add(g);
            this.chunks.push(g);
        }
    }

    // Core chunk builder: solid procedural buildings guaranteed to fill sky,
    // props added when GLBs are available
    _fillChunk(group) {
        const z = this.chunkLength;

        // ── LEFT & RIGHT BUILDING FACADES ──────────────────────────────────────
        // Each facade: one tall continuous box per segment (4m wide, 14–28m tall)
        // placed at x = ±13 so they're fully off the road but visible and looming
        [-1, 1].forEach(side => {
            const xBase = side * 14;
            let dz = 0;
            while (dz < z) {
                const segW = 6 + Math.random() * 10; // building width 6–16m
                const segH = 14 + Math.random() * 18; // height 14–32m
                const pal = this._randomPalette();
                const tex = this._makeBuildingTex(pal);

                // Main building block
                const mat = new THREE.MeshLambertMaterial({ map: tex, color: pal.wall });
                const geo = new THREE.BoxGeometry(segW, segH, 1.5);
                const bld = new THREE.Mesh(geo, mat);
                bld.castShadow = true;
                bld.receiveShadow = true;
                bld.position.set(xBase, segH / 2, -(dz + segW / 2));
                group.add(bld);

                // Sometimes add a setback rooftop structure
                if (Math.random() > 0.5) {
                    const rW = segW * (0.4 + Math.random() * 0.4);
                    const rH = 3 + Math.random() * 8;
                    const rGeo = new THREE.BoxGeometry(rW, rH, 1.4);
                    const rMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(pal.wall).multiplyScalar(0.8) });
                    const roof = new THREE.Mesh(rGeo, rMat);
                    roof.castShadow = true;
                    roof.position.set(xBase + (Math.random() - 0.5) * 2, segH + rH / 2, -(dz + segW / 2));
                    group.add(roof);
                }

                // Ground-level shop/storefront strip — different texture/colour
                const shopH = 3.5;
                const shopGeo = new THREE.BoxGeometry(segW, shopH, 1.6);
                const shopMat = new THREE.MeshLambertMaterial({
                    color: new THREE.Color(pal.wall).lerp(new THREE.Color(0x604020), 0.4)
                });
                const shop = new THREE.Mesh(shopGeo, shopMat);
                shop.castShadow = shop.receiveShadow = true;
                shop.position.set(xBase, shopH / 2, -(dz + segW / 2));
                group.add(shop);

                dz += segW;
            }
        });

        // ── STREETLIGHTS ────────────────────────────────────────────────────────
        for (let dz = 8; dz < z; dz += 18) {
            const side = dz % 36 < 18 ? -1 : 1;
            group.add(this._makeLampPost(side * 9, 0, -dz));
        }

        // ── PROPS PLACEHOLDER (GLBs fill in via loadProps) ─────────────────────
        group.userData.needsProps = true;

        // ── RUBBLE / STREET DEBRIS ──────────────────────────────────────────────
        for (let i = 0; i < 6; i++) {
            const side = Math.random() > 0.5 ? -1 : 1;
            const rb = this._makeRubble();
            rb.position.set(side * (9 + Math.random() * 4), 0, -(Math.random() * z));
            group.add(rb);
        }

        // ── DISTANT BACKGROUND BUILDINGS (no texture needed) ───────────────────
        [-1, 1].forEach(side => {
            for (let dz2 = 0; dz2 < z; dz2 += 20) {
                const h = 20 + Math.random() * 30;
                const bgb = new THREE.Mesh(
                    new THREE.BoxGeometry(18, h, 2),
                    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x8a8878).lerp(new THREE.Color(0xd4c090), 0.2) })
                );
                bgb.position.set(side * 28, h / 2, -(dz2 + 10));
                group.add(bgb);
            }
        });
    }

    // Procedural lamp post (always works — no GLB needed)
    _makeLampPost(x, y, z) {
        const g = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: 0x888070 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), mat);
        pole.position.y = 3.5;
        g.add(pole);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 4), mat);
        arm.rotation.z = Math.PI / 2; arm.position.set(0.9, 6.8, 0);
        g.add(arm);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5),
            new THREE.MeshLambertMaterial({ color: 0x443020 }));
        head.position.set(1.8, 6.8, 0);
        g.add(head);
        g.position.set(x, y, z); g.castShadow = true;
        return g;
    }

    _makeRubble() {
        const g = new THREE.Group();
        const cols = [0x9a8870, 0x7a6850, 0xb09878, 0x888070, 0xc0a888];
        for (let i = 0; i < 3 + Math.floor(Math.random() * 5); i++) {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.2 + Math.random() * 0.9, 0.15 + Math.random() * 0.5, 0.2 + Math.random() * 0.9),
                new THREE.MeshLambertMaterial({ color: cols[Math.floor(Math.random() * cols.length)] })
            );
            mesh.position.set((Math.random() - 0.5) * 1.4, 0.12, (Math.random() - 0.5) * 1.4);
            mesh.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
            mesh.castShadow = mesh.receiveShadow = true;
            g.add(mesh);
        }
        return g;
    }

    // ── ASYNC GLB PROP LOADER ─────────────────────────────────────────────────
    // Loads after world is already visible — adds detail without blocking
    async loadProps() {
        const toLoad = [
            ['bench', '/urban/detail-bench.glb'],
            ['dumpster', '/urban/detail-dumpster-closed.glb'],
            ['tree', '/urban/tree-park-large.glb'],
            ['truck', '/urban/truck-green.glb'],
            ['light', '/urban/detail-light-single.glb'],
        ];
        await Promise.all(toLoad.map(([key, url]) =>
            new Promise(res => {
                this._loader.load(url, gltf => {
                    const scene = gltf.scene;
                    scene.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } });
                    this._models[key] = scene;
                    res();
                }, undefined, () => res());
            })
        ));
        console.log('✅ Props loaded:', Object.keys(this._models).join(', '));
        // Inject props into all existing chunks
        this.chunks.forEach(chunk => this._addPropsToChunk(chunk));
    }

    _cloneProp(key, wornAmount = 0.3) {
        const src = this._models[key];
        if (!src) return null;
        const obj = src.clone(true);
        obj.traverse(child => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            child.material = mats.map(m => {
                const nm = m.clone();
                if (nm.color) nm.color.lerp(new THREE.Color(0xd4c090), wornAmount);
                return nm;
            });
            if (child.material.length === 1) child.material = child.material[0];
        });
        return obj;
    }

    _addPropsToChunk(group) {
        const z = this.chunkLength;
        // Benches
        for (let i = 0; i < 2; i++) {
            const b = this._cloneProp('bench');
            if (b) {
                const side = i % 2 === 0 ? -1 : 1;
                b.position.set(side * 8, 0, -(4 + Math.random() * (z - 8)));
                b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                group.add(b);
            }
        }
        // Dumpsters
        for (let i = 0; i < (Math.random() > 0.4 ? 2 : 1); i++) {
            const d = this._cloneProp('dumpster');
            if (d) {
                const side = Math.random() > 0.5 ? -1 : 1;
                d.position.set(side * 10, 0, -(Math.random() * z));
                d.rotation.y = Math.random() * Math.PI;
                group.add(d);
            }
        }
        // Dead/sparse trees
        for (let i = 0; i < 3; i++) {
            const t = this._cloneProp('tree', 0.45);
            if (t) {
                const side = Math.random() > 0.5 ? -1 : 1;
                t.position.set(side * (8.5 + Math.random() * 2), 0, -(Math.random() * z));
                t.scale.setScalar(0.5 + Math.random() * 0.6);
                group.add(t);
            }
        }
        // Abandoned truck
        if (Math.random() > 0.45) {
            const tr = this._cloneProp('truck', 0.35);
            if (tr) {
                const side = Math.random() > 0.5 ? -1 : 1;
                tr.position.set(side * 8.5, 0, -(6 + Math.random() * (z - 12)));
                tr.rotation.y = side > 0 ? -Math.PI / 2 + (Math.random() - 0.5) * 0.4
                    : Math.PI / 2 + (Math.random() - 0.5) * 0.4;
                group.add(tr);
            }
        }
    }

    _recycleChunk(chunk) {
        const frontZ = Math.min(...this.chunks.map(c => c.position.z));
        chunk.position.z = frontZ - this.chunkLength;
        while (chunk.children.length) chunk.remove(chunk.children[0]);
        this._fillChunk(chunk);
        // Add props immediately if already loaded
        if (Object.keys(this._models).length > 0) this._addPropsToChunk(chunk);
    }

    setSpeed(n) { this.targetSpeed = n * 0.38; }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.time += 0.016;
        this.speed += (this.targetSpeed - this.speed) * 0.07;
        this.distance += this.speed;

        this.chunks.forEach(chunk => {
            chunk.position.z += this.speed;
            if (chunk.position.z > this.chunkLength * 0.6) this._recycleChunk(chunk);
        });

        // Road texture scroll
        if (this._roadMesh?.material?.map) {
            this._roadMesh.material.map.offset.y -= this.speed * 0.04;
            this._roadMesh.material.map.needsUpdate = true;
        }

        // Drift dust
        if (this._dustPos) {
            for (let i = 0; i < this._dustPos.length; i += 3) {
                this._dustPos[i + 2] += this.speed * 0.5 + 0.004;
                if (this._dustPos[i + 2] > 6) this._dustPos[i + 2] = -55;
                this._dustPos[i] += (Math.random() - 0.5) * 0.008;
                this._dustPos[i + 1] += (Math.random() - 0.5) * 0.003;
                if (this._dustPos[i + 1] < 0.3) this._dustPos[i + 1] = 0.3;
                if (this._dustPos[i + 1] > 10) this._dustPos[i + 1] = 0.5;
            }
            this._dustGeo.attributes.position.needsUpdate = true;
        }

        // Camera bob
        if (this.speed > 0.01) {
            const f = 4 * (this.speed / 0.38);
            this.camera.position.y = 2.4 + Math.sin(this.time * f) * 0.04 * (this.speed / 0.38);
            this.camera.rotation.z = Math.sin(this.time * f * 0.5) * 0.005 * (this.speed / 0.38);
        } else {
            this.camera.position.y += (2.4 - this.camera.position.y) * 0.06;
            this.camera.rotation.z *= 0.88;
        }

        this.renderer.render(this.scene, this.camera);
    }
}