// =================================================================
// 粒子交互系统 - 完整版 (回忆录 + 烟花文字祝福)
// 修改版：行星开场 + 爆炸转场
// =================================================================

// --- 1. 全局配置 ---
const NUM_PARTICLES = 8000; // 增加粒子数量以获得更好的视觉效果
const LERP_SPEED = 0.08;

// --- 照片配置 ---
const MAIN_PHOTO_STAY_TIME = 3000; 
const MEMORY_SPAWN_INTERVAL = 400; 
const MEMORY_FLIGHT_SPEED = 8; 

// 回忆照片列表
const PHOTO_LIST = [];
for (let i = 1; i <= 30; i++) {
    PHOTO_LIST.push(`${i}.jpg`);
}

// --- 祝福文案配置 ---
const TEXT_PHRASES = [
    "祝菜菜新年快乐",
    "新的一年里",
    "希望你更加快乐、美丽",
    "在香港也要天天开心",
    "好好吃饭",
    "等你回来"
];
const TEXT_DISPLAY_DURATION = 3500; // 每句文案展示时间 (毫秒)

// 颜色配置
const COLORS = {
    SPHERE: new THREE.Color(0x00ffff),
    HEART:  new THREE.Color(0xff69b4),
    NUM_1:  new THREE.Color(0x00ff00),
    NUM_2:  new THREE.Color(0xffff00),
    NUM_3:  new THREE.Color(0xff0000),
    STAR:   new THREE.Color(0xffffff),
    TEXT:   new THREE.Color(0xffd700), // 金色文字
    // <-- 新增：行星和星环的颜色 -->
    PLANET: new THREE.Color(0x4a90e2), // 行星蓝色
    RING:   new THREE.Color(0xf5a623)  // 星环金色
};

// 核心变量
let scene, camera, renderer, particles, geometry, material;
let videoElement;
let fireworkVideo; 
let appState = 'INITIAL';
let targetPositions = [];
let targetColor = COLORS.SPHERE; 
let useVertexColors = true; // 控制是否使用顶点颜色的标志

// 照片系统变量
let mainPhotoMesh;
let memoryGroup = new THREE.Group();
let textureLoader = new THREE.TextureLoader();
let loadedTextures = {};

// 动画控制变量
let sequenceStartTime = 0;
let isSequenceActive = false; 
let memoryIndex = 0;
let lastSpawnTime = 0;

// <-- 新增：爆炸效果变量 -->
let isExploding = false;
let explosionStartTime = 0;
const EXPLOSION_DURATION = 1500; // 爆炸持续时间 (毫秒)
let particleVelocities = new Float32Array(NUM_PARTICLES * 3);

// 烟花与文字变量
let isFireworksActive = false;
let textSequenceIndex = 0;
let lastTextChangeTime = 0;
let fireworksSystem; 

// 手势变量
let fistHoldCount = 0;
const FIST_TRIGGER_THRESHOLD = 40;
const debugDiv = document.getElementById('mobile-debug');

// --- 2. 形状生成算法 ---

// <-- 新增：生成行星、星环和星空的函数 -->
function generatePlanetAndStars() {
    const pos = [];
    const colors = [];
    
    const planetRadius = 30;
    const ringInnerRadius = 45;
    const ringOuterRadius = 70;
    const ringTilt = -0.4; // 弧度
    const starfieldRadius = 400;

    const numPlanet = Math.floor(NUM_PARTICLES * 0.4);
    const numRing = Math.floor(NUM_PARTICLES * 0.3);
    const numStars = NUM_PARTICLES - numPlanet - numRing;

    // 1. 生成行星 (球体)
    for(let i=0; i<numPlanet; i++){
        const radius = planetRadius * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        pos.push(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi)
        );
        colors.push(COLORS.PLANET.r, COLORS.PLANET.g, COLORS.PLANET.b);
    }

    // 2. 生成星环
    for(let i=0; i<numRing; i++){
        const radius = ringInnerRadius + Math.random() * (ringOuterRadius - ringInnerRadius);
        const theta = Math.random() * 2 * Math.PI;
        const x = radius * Math.cos(theta);
        const y = 0;
        const z = radius * Math.sin(theta);
        
        // 应用倾斜
        const tiltedY = y * Math.cos(ringTilt) - z * Math.sin(ringTilt);
        const tiltedZ = y * Math.sin(ringTilt) + z * Math.cos(ringTilt);

        pos.push(x, tiltedY, tiltedZ);
        colors.push(COLORS.RING.r, COLORS.RING.g, COLORS.RING.b);
    }

    // 3. 生成背景星空
    for(let i=0; i<numStars; i++){
        const radius = starfieldRadius * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        pos.push(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi)
        );
        const starColor = new THREE.Color(0xffffff).lerp(COLORS.RING, Math.random() * 0.3);
        colors.push(starColor.r, starColor.g, starColor.b);
    }

    return {
        positions: new Float32Array(pos),
        colors: new Float32Array(colors)
    };
}


function generateSphere(r) {
    const pos = [];
    for(let i=0; i<NUM_PARTICLES; i++){
        const radius = r * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        pos.push(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi)
        );
    }
    return new Float32Array(pos);
}

function generateHeart(scale) {
    const pos = [];
    for(let i=0; i<NUM_PARTICLES; i++){
        let t = Math.random() * 2 * Math.PI;
        let x = 16 * Math.pow(Math.sin(t), 3);
        let y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
        const r = Math.sqrt(Math.random());
        x *= r * scale;
        y *= r * scale;
        pos.push(x, y, (Math.random()-0.5) * 10);
    }
    return new Float32Array(pos);
}

function generateNumber(num, scale) {
    const pos = [];
    const points = [];
    const baseSize = 20;
    if (num === '1') {
        for(let y=-1; y<=1; y+=0.05) points.push([0, y]);
    } else if (num === '2') {
        for(let t=0; t<=Math.PI; t+=0.1) points.push([0.5*Math.cos(t), 0.5*Math.sin(t) + 0.5]);
        for(let t=0; t<=1; t+=0.05) points.push([0.5 - t, 0.5 - t * 1.5]);
        for(let x=-0.5; x<=0.5; x+=0.05) points.push([x, -1]);
    } else if (num === '3') {
        for(let t=-Math.PI/2; t<=Math.PI/2; t+=0.1) points.push([0.5*Math.cos(t), 0.5*Math.sin(t) + 0.5]);
        for(let t=-Math.PI/2; t<=Math.PI/2; t+=0.1) points.push([0.5*Math.cos(t), 0.5*Math.sin(t) - 0.5]);
    }
    for(let i=0; i<NUM_PARTICLES; i++) {
        const p = points[Math.floor(Math.random() * points.length)];
        const jitter = 0.15;
        pos.push(
            (p[0] + (Math.random()-0.5)*jitter) * scale * baseSize,
            (p[1] + (Math.random()-0.5)*jitter) * scale * baseSize,
            (Math.random()-0.5) * 5
        );
    }
    return new Float32Array(pos);
}

function generateStarField() {
    const pos = [];
    for(let i=0; i<NUM_PARTICLES; i++){
        pos.push(
            (Math.random() - 0.5) * 1000,
            (Math.random() - 0.5) * 800,
            (Math.random() - 0.5) * 1000
        );
    }
    return new Float32Array(pos);
}

function generateTextPositions(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1024; 
    canvas.height = 512;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 120px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const points = [];
    const step = 4; 
    for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
            const index = (y * canvas.width + x) * 4;
            if (data[index] > 128) {
                points.push({
                    x: (x - canvas.width / 2) * 0.3,
                    y: -(y - canvas.height / 2) * 0.3
                });
            }
        }
    }
    const pos = [];
    for(let i=0; i<NUM_PARTICLES; i++) {
        const p = points.length > 0 ? points[Math.floor(Math.random() * points.length)] : {x:0, y:0};
        pos.push(
            p.x + (Math.random()-0.5) * 1.5,
            p.y + (Math.random()-0.5) * 1.5,
            (Math.random()-0.5) * 5
        );
    }
    return new Float32Array(pos);
}

// --- 3. 烟花系统 ---

class FireworksSystem {
    constructor(scene) {
        this.scene = scene;
        this.fireworks = [];
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.PointsMaterial({
            size: 3,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.maxParticles = 3000;
        this.positions = new Float32Array(this.maxParticles * 3);
        this.colors = new Float32Array(this.maxParticles * 3);
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.mesh = new THREE.Points(this.geometry, this.material);
        this.mesh.visible = false;
        this.scene.add(this.mesh);
        this.particlesData = [];
        for(let i=0; i<this.maxParticles; i++) {
            this.particlesData.push({
                vx: 0, vy: 0, vz: 0,
                life: 0,
                active: false
            });
        }
    }
    start() { this.mesh.visible = true; }
    stop() {
        this.mesh.visible = false;
        for(let i=0; i<this.maxParticles; i++) {
            this.particlesData[i].active = false;
            this.positions[i*3+1] = -1000;
        }
    }
    launch() {
        const centerX = (Math.random() - 0.5) * 200;
        const centerY = (Math.random() - 0.5) * 100 + 20;
        const color = new THREE.Color().setHSL(Math.random(), 1, 0.6);
        let count = 0;
        for(let i=0; i<this.maxParticles; i++) {
            if(!this.particlesData[i].active) {
                this.particlesData[i].active = true;
                this.particlesData[i].life = 1.0;
                this.positions[i*3] = centerX;
                this.positions[i*3+1] = centerY;
                this.positions[i*3+2] = -100;
                const speed = 1 + Math.random() * 2;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                this.particlesData[i].vx = speed * Math.sin(phi) * Math.cos(theta);
                this.particlesData[i].vy = speed * Math.sin(phi) * Math.sin(theta);
                this.particlesData[i].vz = speed * Math.cos(phi);
                this.colors[i*3] = color.r;
                this.colors[i*3+1] = color.g;
                this.colors[i*3+2] = color.b;
                count++;
                if(count >= 100) break;
            }
        }
    }
    update() {
        if(!this.mesh.visible) return;
        if(Math.random() < 0.05) this.launch();
        for(let i=0; i<this.maxParticles; i++) {
            if(this.particlesData[i].active) {
                const p = this.particlesData[i];
                this.positions[i*3] += p.vx;
                this.positions[i*3+1] += p.vy;
                this.positions[i*3+2] += p.vz;
                p.vy -= 0.05;
                p.vx *= 0.96;
                p.vy *= 0.96;
                p.vz *= 0.96;
                p.life -= 0.015;
                if(p.life <= 0) {
                    p.active = false;
                    this.positions[i*3+1] = -1000;
                }
            }
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }
}

// --- 4. 状态与资源管理 ---

function initBackgroundVideo() {
    fireworkVideo = document.createElement('video');
    fireworkVideo.src = 'firework_texture.mp4'; 
    fireworkVideo.loop = true;
    fireworkVideo.muted = true; 
    fireworkVideo.playsInline = true;
    fireworkVideo.preload = 'auto';
    
    fireworkVideo.style.position = 'fixed';
    fireworkVideo.style.top = '50%';
    fireworkVideo.style.left = '50%';
    fireworkVideo.style.minWidth = '100%';
    fireworkVideo.style.minHeight = '100%';
    fireworkVideo.style.width = 'auto';
    fireworkVideo.style.height = 'auto';
    fireworkVideo.style.transform = 'translate(-50%, -50%)';
    fireworkVideo.style.zIndex = '-1'; 
    fireworkVideo.style.opacity = '0'; 
    fireworkVideo.style.transition = 'opacity 1.5s ease'; 
    
    document.body.appendChild(fireworkVideo);
}

// <-- 新增：触发爆炸效果的函数 -->
function triggerExplosion() {
    isExploding = true;
    explosionStartTime = Date.now();
    const currentPositions = geometry.attributes.position.array;
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const i3 = i * 3;
        const x = currentPositions[i3];
        const y = currentPositions[i3+1];
        const z = currentPositions[i3+2];
        
        // 计算从原点出发的方向向量并归一化
        const vec = new THREE.Vector3(x, y, z).normalize();
        
        // 设置一个随机的爆炸速度
        const speed = 5 + Math.random() * 10;
        
        particleVelocities[i3] = vec.x * speed;
        particleVelocities[i3+1] = vec.y * speed;
        particleVelocities[i3+2] = vec.z * speed;
    }
}


function switchState(newState) {
    if (appState === newState && newState !== 'PHOTO_SEQUENCE' && newState !== 'FIREWORKS_SEQUENCE') return;

    // <-- 新增：检查是否是从行星状态切换到照片序列，如果是则触发爆炸 -->
    if (appState === 'PLANET' && newState === 'PHOTO_SEQUENCE') {
        triggerExplosion();
    } else {
        isExploding = false; // 确保其他状态切换不会触发爆炸
    }

    if (newState === 'FIREWORKS_SEQUENCE') {
        if (fireworkVideo) {
            fireworkVideo.style.opacity = '1';
            fireworkVideo.play().catch(e => console.error("视频自动播放失败:", e));
        }
    } else {
        if (appState === 'FIREWORKS_SEQUENCE' && fireworkVideo) {
            fireworkVideo.style.opacity = '0';
            setTimeout(() => {
                if (appState !== 'FIREWORKS_SEQUENCE') {
                    fireworkVideo.pause();
                    fireworkVideo.currentTime = 0;
                }
            }, 1500); 
        }
    }

    appState = newState;
    if(debugDiv) debugDiv.innerText = `状态: ${newState}`;

    if (newState !== 'FIREWORKS_SEQUENCE' && fireworksSystem) {
        fireworksSystem.stop();
        isFireworksActive = false;
    }
    
    // 控制是否使用顶点颜色
    // 只有行星状态使用顶点颜色，其他状态使用统一颜色
    useVertexColors = (newState === 'PLANET');
    material.vertexColors = useVertexColors;
    material.needsUpdate = true;

    switch(newState) {
        case 'PLANET':
            const planetData = generatePlanetAndStars();
            targetPositions = planetData.positions;
            // 更新颜色属性
            geometry.setAttribute('color', new THREE.BufferAttribute(planetData.colors, 3));
            geometry.attributes.color.needsUpdate = true;
            resetPhotoSequence();
            break;
        case 'SPHERE':
            targetPositions = generateSphere(35);
            targetColor = COLORS.SPHERE;
            resetPhotoSequence();
            break;
        case 'HEART':
            targetPositions = generateHeart(3.5);
            targetColor = COLORS.HEART;
            resetPhotoSequence();
            break;
        case 'NUMBER_1':
            targetPositions = generateNumber('1', 4.0);
            targetColor = COLORS.NUM_1;
            resetPhotoSequence();
            break;
        case 'NUMBER_2':
            targetPositions = generateNumber('2', 4.0);
            targetColor = COLORS.NUM_2;
            resetPhotoSequence();
            break;
        case 'NUMBER_3':
            targetPositions = generateNumber('3', 4.0);
            targetColor = COLORS.NUM_3;
            resetPhotoSequence();
            break;
        case 'PHOTO_SEQUENCE':
            startPhotoSequence();
            break;
        case 'FIREWORKS_SEQUENCE':
            startFireworksSequence();
            break;
    }
}

function preloadTextures() {
    PHOTO_LIST.forEach(filename => {
        textureLoader.load(filename, (tex) => {
            loadedTextures[filename] = tex;
        }, undefined, (err) => console.log(`跳过: ${filename}`));
    });
}

function startPhotoSequence() {
    isSequenceActive = true;
    sequenceStartTime = Date.now();
    targetPositions = generateStarField();
    targetColor = COLORS.STAR;
    if(mainPhotoMesh) {
        mainPhotoMesh.visible = true;
        mainPhotoMesh.position.z = -800;
        mainPhotoMesh.material.opacity = 0;
    }
    memoryIndex = 0;
    lastSpawnTime = 0;
    while(memoryGroup.children.length > 0){ 
        memoryGroup.remove(memoryGroup.children[0]); 
    }
}

function resetPhotoSequence() {
    isSequenceActive = false;
    if(mainPhotoMesh) mainPhotoMesh.visible = false;
    memoryGroup.children.forEach(mesh => mesh.visible = false);
}

function startFireworksSequence() {
    isFireworksActive = true;
    textSequenceIndex = 0;
    lastTextChangeTime = Date.now();
    fireworksSystem.start();
    targetPositions = generateTextPositions(TEXT_PHRASES[0]);
    targetColor = COLORS.TEXT;
    resetPhotoSequence();
}

// --- 5. Three.js 核心 ---

function initThree() {
    const container = document.getElementById('container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 1, 2000);
    camera.position.z = 150; // 调整相机距离以更好地展示行星

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    initBackgroundVideo();

    geometry = new THREE.BufferGeometry();
    // <-- 修改：使用新的行星函数进行初始化 -->
    const initialData = generatePlanetAndStars();
    const initialPos = initialData.positions;
    const initialColors = initialData.colors;

    geometry.setAttribute('position', new THREE.BufferAttribute(initialPos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(initialColors, 3));

    material = new THREE.PointsMaterial({
        size: 1.2,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        vertexColors: true // <-- 关键：启用顶点颜色
    });
    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    fireworksSystem = new FireworksSystem(scene);

    textureLoader.load('my_photo.jpg', (texture) => {
        const aspect = texture.image.width / texture.image.height;
        const displayHeight = 130; 
        const pGeo = new THREE.PlaneGeometry(displayHeight * aspect, displayHeight);
        const pMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0 });
        mainPhotoMesh = new THREE.Mesh(pGeo, pMat);
        mainPhotoMesh.visible = false;
        scene.add(mainPhotoMesh);
    });

    scene.add(memoryGroup);
    preloadTextures();

    targetPositions = initialPos;
    appState = 'PLANET'; // <-- 设置初始状态为行星

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}

function spawnMemoryPhoto(filename) {
    const tex = loadedTextures[filename];
    if (!tex) return; 
    const aspect = tex.image.width / tex.image.height;
    const height = 100; 
    const width = height * aspect;
    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    const randomX = (Math.random() - 0.5) * 100; 
    const randomY = (Math.random() - 0.5) * 60;
    mesh.position.set(randomX, randomY, -1000); 
    mesh.userData = { speed: MEMORY_FLIGHT_SPEED + Math.random() * 2 }; 
    memoryGroup.add(mesh);
}

function update() {
    const positions = geometry.attributes.position.array;

    // <-- 修改：动画更新逻辑，加入爆炸效果处理 -->
    if (isExploding) {
        const elapsed = Date.now() - explosionStartTime;
        if (elapsed < EXPLOSION_DURATION) {
            for (let i = 0; i < NUM_PARTICLES; i++) {
                const i3 = i * 3;
                positions[i3] += particleVelocities[i3];
                positions[i3+1] += particleVelocities[i3+1];
                positions[i3+2] += particleVelocities[i3+2];
                
                // 速度衰减
                particleVelocities[i3] *= 0.96;
                particleVelocities[i3+1] *= 0.96;
                particleVelocities[i3+2] *= 0.96;
            }
        } else {
            isExploding = false; // 爆炸结束，恢复正常插值动画
        }
        geometry.attributes.position.needsUpdate = true;
    } else if (targetPositions.length > 0) {
        for(let i=0; i<NUM_PARTICLES; i++) {
            const i3 = i*3;
            positions[i3]   += (targetPositions[i3] - positions[i3]) * LERP_SPEED;
            positions[i3+1] += (targetPositions[i3+1] - positions[i3+1]) * LERP_SPEED;
            positions[i3+2] += (targetPositions[i3+2] - positions[i3+2]) * LERP_SPEED;
        }
        geometry.attributes.position.needsUpdate = true;
    }
    
    // 颜色过渡逻辑
    if (!useVertexColors) {
        material.color.lerp(targetColor, 0.05);
    }

    if (appState === 'FIREWORKS_SEQUENCE' || appState === 'NUMBER_1' || appState === 'NUMBER_2' || appState === 'NUMBER_3') {
        particles.rotation.y += (0 - particles.rotation.y) * 0.05;
    } else {
        particles.rotation.y += 0.002;
    }
    if (isFireworksActive && fireworksSystem) {
        fireworksSystem.update();
        if (Date.now() - lastTextChangeTime > TEXT_DISPLAY_DURATION) {
            textSequenceIndex++;
            if (textSequenceIndex < TEXT_PHRASES.length) {
                targetPositions = generateTextPositions(TEXT_PHRASES[textSequenceIndex]);
                lastTextChangeTime = Date.now();
            } else {
                switchState('HEART');
            }
        }
    }
    if (isSequenceActive) {
        const now = Date.now();
        const elapsed = now - sequenceStartTime;
        if (elapsed < 2000) {
            const progress = elapsed / 2000;
            const easeOut = 1 - Math.pow(1 - progress, 3);
            if(mainPhotoMesh) {
                mainPhotoMesh.position.z = -800 + (800 * easeOut); 
                mainPhotoMesh.material.opacity = progress;
            }
        } 
        else if (elapsed < 2000 + MAIN_PHOTO_STAY_TIME) {
            if(mainPhotoMesh) {
                mainPhotoMesh.position.z = 0;
                mainPhotoMesh.material.opacity = 1;
            }
        }
        else {
            if(mainPhotoMesh && mainPhotoMesh.material.opacity > 0) {
                mainPhotoMesh.material.opacity -= 0.02;
                mainPhotoMesh.position.z += 2; 
            }
            if (memoryIndex < PHOTO_LIST.length) {
                if (now - lastSpawnTime > MEMORY_SPAWN_INTERVAL) {
                    spawnMemoryPhoto(PHOTO_LIST[memoryIndex]);
                    memoryIndex++;
                    lastSpawnTime = now;
                }
            } else if (memoryGroup.children.length === 0) {
                switchState('HEART');
            }
            for (let i = memoryGroup.children.length - 1; i >= 0; i--) {
                const mesh = memoryGroup.children[i];
                mesh.position.z += mesh.userData.speed;
                if (mesh.position.z < -200) {
                    mesh.material.opacity = Math.min(mesh.material.opacity + 0.02, 1);
                } else if (mesh.position.z > 150) {
                    mesh.material.opacity -= 0.05;
                }
                if (mesh.position.z > 300) {
                    memoryGroup.remove(mesh);
                }
            }
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

// --- 6. 手势识别 ---

function getGesture(landmarks) {
    const thumbOpen = landmarks[4].x < landmarks[3].x;
    const indexOpen = landmarks[8].y < landmarks[6].y;
    const middleOpen = landmarks[12].y < landmarks[10].y;
    const ringOpen = landmarks[16].y < landmarks[14].y;
    const pinkyOpen = landmarks[20].y < landmarks[18].y;
    if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'FIST';
    if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'ONE';
    if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) return 'TWO';
    if (indexOpen && middleOpen && ringOpen && !pinkyOpen) return 'THREE';
    if (indexOpen && middleOpen && thumbOpen && !ringOpen && !pinkyOpen) return 'THREE'; 
    if (indexOpen && middleOpen && ringOpen && pinkyOpen) return 'OPEN';
    return 'UNKNOWN';
}

function onResults(results) {
    if (appState === 'PHOTO_SEQUENCE' || appState === 'FIREWORKS_SEQUENCE') return;
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        if(debugDiv) debugDiv.innerText = "未检测到手部";
        fistHoldCount = 0;
        return;
    }
    if (results.multiHandLandmarks.length === 2) {
        const hand1 = getGesture(results.multiHandLandmarks[0]);
        const hand2 = getGesture(results.multiHandLandmarks[1]);
        if(debugDiv) debugDiv.innerText = `双手: ${hand1} + ${hand2}`;
        if (hand1 === 'OPEN' && hand2 === 'OPEN') {
            switchState('FIREWORKS_SEQUENCE');
            return;
        }
    }
    const landmarks = results.multiHandLandmarks[0];
    const gesture = getGesture(landmarks);
    if(debugDiv && results.multiHandLandmarks.length === 1) debugDiv.innerText = `单手: ${gesture}\n握拳: ${fistHoldCount}`;
    if (gesture === 'FIST') {
        fistHoldCount++;
        if (fistHoldCount < 5) {
            // <-- 修改：握拳手势现在切换回行星状态 -->
            if (appState !== 'PLANET') switchState('PLANET');
        } else if (fistHoldCount > FIST_TRIGGER_THRESHOLD) {
            switchState('PHOTO_SEQUENCE');
            fistHoldCount = 0;
        }
    } else {
        fistHoldCount = 0;
        switch (gesture) {
            case 'OPEN':  switchState('HEART'); break;
            case 'ONE':   switchState('NUMBER_1'); break;
            case 'TWO':   switchState('NUMBER_2'); break;
            case 'THREE': switchState('NUMBER_3'); break;
        }
    }
}

// --- 7. 启动 ---

initThree();

videoElement = document.getElementById('webcam-video');
const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@medipe/hands/${file}` });

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
});
hands.onResults(onResults);

const cameraUtil = new Camera(videoElement, {
    onFrame: async () => {
        if(videoElement.readyState >= 2) await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480,
    facingMode: 'user'
});
cameraUtil.start();