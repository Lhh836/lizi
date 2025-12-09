// =================================================================
// 粒子交互系统 - 完整版 (回忆录 + 烟花文字祝福)
// =================================================================

// --- 1. 全局配置 ---
const NUM_PARTICLES = 6000;
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
    TEXT:   new THREE.Color(0xffd700) // 金色文字
};

// 核心变量
let scene, camera, renderer, particles, geometry, material;
let videoElement;
let appState = 'INITIAL';
let targetPositions = [];
let targetColor = COLORS.SPHERE;

let fireworksVideoElement; 

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

// 烟花与文字变量
let isFireworksActive = false;
let textSequenceIndex = 0;
let lastTextChangeTime = 0;
let fireworksSystem; // 烟花系统实例

// 手势变量
let fistHoldCount = 0;
const FIST_TRIGGER_THRESHOLD = 40;
const debugDiv = document.getElementById('mobile-debug');

// --- 2. 形状生成算法 (无变化) ---

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
// --- 修改/新增 ---: 使用全新的、基于视频纹理的真实烟花系统
class RealFireworksSystem {
    constructor(scene) {
        this.scene = scene;
        this.fireworks = []; // 存放所有烟花平面
        this.videoElement = document.getElementById('firework-texture-video');
        this.videoTexture = new THREE.VideoTexture(this.videoElement);
        
        this.geometry = new THREE.PlaneGeometry(80, 80); // 烟花的大小
        this.material = new THREE.MeshBasicMaterial({
            map: this.videoTexture,
            transparent: true,
            blending: THREE.AdditiveBlending, // 混合模式让烟花更亮
            depthWrite: false
        });
        
        this.pool = []; // 对象池，用于复用烟花平面
        this.isReady = false;
        this.isVisible = false;

        // 确保视频可以播放
        this.videoElement.addEventListener('canplay', () => {
            this.isReady = true;
        });
    }

    start() {
        if (!this.isReady) return;
        this.isVisible = true;
        this.videoElement.play();
    }

    stop() {
        this.isVisible = false;
        this.videoElement.pause();
        // 隐藏所有烟花
        this.fireworks.forEach(fw => {
            fw.visible = false;
        });
    }

    // 发射一个烟花
    launch() {
        let fireworkMesh;
        // 从对象池中取
        if (this.pool.length > 0) {
            fireworkMesh = this.pool.pop();
        } else { // 池中没有，则新建一个
            fireworkMesh = new THREE.Mesh(this.geometry, this.material);
            this.fireworks.push(fireworkMesh);
            this.scene.add(fireworkMesh);
        }
        
        fireworkMesh.visible = true;
        // 随机位置
        const x = (Math.random() - 0.5) * 250;
        const y = (Math.random() - 0.5) * 150;
        const z = -100 - Math.random() * 100; // 在文字后面
        fireworkMesh.position.set(x, y, z);
        fireworkMesh.scale.set(0.1, 0.1, 0.1); // 初始很小
        
        // 动画数据
        fireworkMesh.userData.life = 0;
        fireworkMesh.userData.duration = 1.5 + Math.random(); // 持续时间
    }

    update(deltaTime) {
        if (!this.isVisible) return;
        
        // 随机发射
        if (Math.random() < 0.04) {
            this.launch();
        }

        // 更新每个烟花的动画
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            const fw = this.fireworks[i];
            if (fw.visible) {
                fw.userData.life += deltaTime;
                const progress = fw.userData.life / fw.userData.duration;

                if (progress < 1) {
                    // 放大并淡出效果
                    const scale = Math.sin(progress * Math.PI); // 使用sin曲线模拟爆炸和消失
                    fw.scale.set(scale, scale, scale);
                    fw.material.opacity = scale;
                } else {
                    // 生命周期结束，隐藏并回收到对象池
                    fw.visible = false;
                    this.pool.push(fw);
                }
            }
        }
    }
}


// --- 4. 状态与资源管理 ---

function switchState(newState) {
    if (appState === newState && newState !== 'PHOTO_SEQUENCE' && newState !== 'FIREWORKS_SEQUENCE') return;

    if (appState === 'FIREWORKS_SEQUENCE' && newState !== 'FIREWORKS_SEQUENCE') {
        if (fireworksSystem) {
            fireworksSystem.stop();
        }
        if (fireworksVideoElement) {
            fireworksVideoElement.style.display = 'none';
            fireworksVideoElement.pause();
        }
        isFireworksActive = false;
    }

    appState = newState;
    if(debugDiv) debugDiv.innerText = `状态: ${newState}`;

    switch(newState) {
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
    
    if (fireworksVideoElement) {
        fireworksVideoElement.style.display = 'block';
        fireworksVideoElement.currentTime = 0;
        fireworksVideoElement.play();
    }
    
    targetPositions = generateTextPositions(TEXT_PHRASES[0]);
    targetColor = COLORS.TEXT;
    
    resetPhotoSequence();
}

// --- 5. Three.js 核心 ---

const clock = new THREE.Clock(); // --- 新增 --- 用于获取 update 的时间差

function initThree() {
    const container = document.getElementById('container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 1, 2000);
    camera.position.z = 120;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    geometry = new THREE.BufferGeometry();
    const initialPos = generateSphere(35);
    geometry.setAttribute('position', new THREE.BufferAttribute(initialPos, 3));
    material = new THREE.PointsMaterial({
        color: COLORS.SPHERE,
        size: 1.2,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // --- 修改/新增 ---: 初始化新的烟花系统
    fireworksSystem = new RealFireworksSystem(scene);

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
    const deltaTime = clock.getDelta(); // --- 新增 --- 获取帧间隔时间
    const positions = geometry.attributes.position.array;

    if (targetPositions.length > 0) {
        for(let i=0; i<NUM_PARTICLES; i++) {
            const i3 = i*3;
            positions[i3]   += (targetPositions[i3] - positions[i3]) * LERP_SPEED;
            positions[i3+1] += (targetPositions[i3+1] - positions[i3+1]) * LERP_SPEED;
            positions[i3+2] += (targetPositions[i3+2] - positions[i3+2]) * LERP_SPEED;
        }
        geometry.attributes.position.needsUpdate = true;
    }

    material.color.lerp(targetColor, 0.05);

    if (appState === 'FIREWORKS_SEQUENCE' || appState === 'NUMBER_1' || appState === 'NUMBER_2' || appState === 'NUMBER_3') {
        particles.rotation.y += (0 - particles.rotation.y) * 0.05;
    } else {
        particles.rotation.y += 0.002;
    }

    if (isFireworksActive && fireworksSystem) {
        // --- 修改/新增 ---: 更新烟花系统时传入deltaTime
        fireworksSystem.update(deltaTime);
        
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

// --- 6. 手势识别 (无变化) ---

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
            if (appState !== 'SPHERE') switchState('SPHERE');
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
fireworksVideoElement = document.getElementById('fireworks-video');


// =================================================================
// --- 8. 全新的启动流程 (手动控制摄像头，绕过 camera_utils) ---
// =================================================================

// 重新获取 video 元素，确保万无一失
videoElement = document.getElementById('webcam-video');
fireworksVideoElement = document.getElementById('fireworks-video');

// 初始化 MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@medipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
});

// 设置结果回调函数
hands.onResults(onResults);

// 定义一个函数来启动摄像头和处理流程
async function startCamera() {
    try {
        // 1. 使用浏览器原生 API 请求摄像头视频流
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user' // 优先使用前置摄像头
            }
        });

        // 2. 将视频流赋值给 video 元素
        videoElement.srcObject = stream;

        // 3. 添加一个监听器，确保在视频可以播放后才开始处理
        videoElement.addEventListener('loadeddata', () => {
            console.log("摄像头视频已加载，准备开始处理手势。");
            if(debugDiv) debugDiv.innerText = "摄像头已启动，请做出手势。";

            // 4. 开始播放视频 (虽然视频是隐藏的，但必须播放才能获取数据)
            videoElement.play();

            // 5. 启动一个循环，持续将视频帧发送给 MediaPipe
            sendToMediaPipe();
        });

    } catch (error) {
        console.error("启动摄像头失败:", error);
        if (debugDiv) {
            debugDiv.style.color = "#ffcc00";
            debugDiv.innerText = `错误: 摄像头启动失败。\n原因: ${error.name}\n请检查设备和浏览器权限。`;
        }
        // 可以在这里启用备用的键盘控制
        enableKeyboardControls();
    }
}

// 定义将视频帧发送给 MediaPipe 的函数
async function sendToMediaPipe() {
    // 检查 video 元素是否已准备好，避免在视频暂停或结束时报错
    if (videoElement.readyState >= 2) {
        await hands.send({ image: videoElement });
    }
    // 使用 requestAnimationFrame 实现高效循环
    requestAnimationFrame(sendToMediaPipe);
}

// 定义备用的键盘控制函数
function enableKeyboardControls() {
    if (debugDiv) {
        debugDiv.innerText += "\n\n已启用键盘控制:\n[1,2,3] 数字\n[h] 爱心\n[s] 球体\n[p] 照片\n[f] 烟花";
    }
    window.addEventListener('keydown', (event) => {
        switch(event.key) {
            case '1': switchState('NUMBER_1'); break;
            case '2': switchState('NUMBER_2'); break;
            case '3': switchState('NUMBER_3'); break;
            case 'h': switchState('HEART'); break;
            case 's': switchState('SPHERE'); break;
            case 'p': switchState('PHOTO_SEQUENCE'); break;
            case 'f': switchState('FIREWORKS_SEQUENCE'); break;
        }
    });
}

// --- 最终启动 ---
startCamera();
