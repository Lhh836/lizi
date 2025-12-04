// =================================================================
// 完整版 particle_system.js
// 包含：手势识别、数字形状、爱心形状、照片放映、手机端适配
// =================================================================

// --- 1. 全局配置与变量 ---
const NUM_PARTICLES = 6000; // 手机端优化粒子数
const INITIAL_SPREAD = 50;
const PHOTO_DURATION = 5000; // 照片放映时间

let scene, camera, renderer, particles, geometry, material;
let videoElement, canvasElement, canvasCtx;
let handDetected = false;
let handLandmarks = null;

// 状态管理
let appState = 'INITIAL'; // 'INITIAL', 'SPHERE', 'HEART', 'NUMBER_1', 'NUMBER_2', 'NUMBER_3', 'PHOTO_SEQUENCE'
let targetPositions = []; 
let photoMesh = null;
let photoTexture = null;
let photoStartTime = 0;
let fistCount = 0;

// 颜色控制
let targetParticleColor = new THREE.Color(0x00ffff); // 初始青色

// 调试元素引用
const debugDiv = document.getElementById('mobile-debug');

// --- 2. 形状生成函数 ---

function generateSpherePositions(count, radius) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = radius * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
}

function generateHeartPositions(count, scale) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const t = Math.random() * 2 * Math.PI;
        // 心形公式
        const x = scale * 16 * Math.pow(Math.sin(t), 3);
        const y = -scale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const z = (Math.random() - 0.5) * scale * 5;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }
    return positions;
}

// 简化的数字形状生成 (用不同位置的球体模拟)
function generateTextPositions(text, count, scale) {
    // 这里为了简化代码，用不同位置的球体代表数字位置
    // 实际项目中可以使用 TextGeometry 获取点
    const positions = new Float32Array(count * 3);
    let offsetX = 0;
    if (text === '1') offsetX = -20;
    if (text === '2') offsetX = 0;
    if (text === '3') offsetX = 20;

    for (let i = 0; i < count; i++) {
        const r = scale * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        
        // 生成一个偏离中心的球体来代表数字
        positions[i * 3] = (r * Math.sin(phi) * Math.cos(theta)) + offsetX;
        positions[i * 3 + 1] = (r * Math.sin(phi) * Math.sin(theta));
        positions[i * 3 + 2] = (r * Math.cos(phi));
    }
    return positions;
}

// --- 3. 状态切换逻辑 ---

function changeState(newState) {
    if (appState === newState) return;
    
    appState = newState;
    console.log(`状态切换为: ${newState}`);
    if(debugDiv) debugDiv.innerText = `状态切换: ${newState}`;
    
    targetPositions = []; 
    
    switch (newState) {
        case 'SPHERE':
            targetPositions = generateSpherePositions(NUM_PARTICLES, 20);
            targetParticleColor.set(0x00ffff); // 青色
            break;
        case 'HEART':
            targetPositions = generateHeartPositions(NUM_PARTICLES, 1.5);
            targetParticleColor.set(0xff69b4); // 粉色
            break;
        case 'NUMBER_1':
            targetPositions = generateTextPositions('1', NUM_PARTICLES, 15);
            targetParticleColor.set(0x00ff00); // 绿色
            break;
        case 'NUMBER_2':
            targetPositions = generateTextPositions('2', NUM_PARTICLES, 15);
            targetParticleColor.set(0xffff00); // 黄色
            break;
        case 'NUMBER_3':
            targetPositions = generateTextPositions('3', NUM_PARTICLES, 15);
            targetParticleColor.set(0xff0000); // 红色
            break;
        case 'PHOTO_SEQUENCE':
            photoStartTime = Date.now();
            targetPositions = []; // 此时粒子进入星空模式
            targetParticleColor.set(0xaaaaee);
            break;
        default:
            targetPositions = [];
    }
}

// --- 4. Three.js 初始化与动画 ---

function initThreeJS() {
    const container = document.getElementById('container');
    
    // 场景
    scene = new THREE.Scene();
    
    // 相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 100;

    // 渲染器
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // 粒子
    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(NUM_PARTICLES * 3);
    
    // 初始随机位置
    for (let i = 0; i < NUM_PARTICLES * 3; i++) {
        positions[i] = (Math.random() - 0.5) * INITIAL_SPREAD * 2;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    material = new THREE.PointsMaterial({
        color: targetParticleColor,
        size: 0.8,
        transparent: true,
        opacity: 0.8
    });
    
    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 加载照片
    const textureLoader = new THREE.TextureLoader();
    photoTexture = textureLoader.load('my_photo.jpg', 
        () => console.log("照片纹理加载成功。"),
        undefined,
        (err) => console.error("照片加载失败", err)
    );

    const photoGeo = new THREE.PlaneGeometry(40, 30);
    const photoMat = new THREE.MeshBasicMaterial({ map: photoTexture, transparent: true, opacity: 0 });
    photoMesh = new THREE.Mesh(photoGeo, photoMat);
    photoMesh.position.z = -200;
    scene.add(photoMesh);

    window.addEventListener('resize', onWindowResize);
    
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateParticles() {
    const positions = geometry.attributes.position.array;
    const lerpFactor = 0.05;

    if (appState === 'PHOTO_SEQUENCE') {
        // 星空漂移
        for (let i = 0; i < NUM_PARTICLES; i++) {
            const i3 = i * 3;
            positions[i3] += (positions[i3] > 0 ? 1 : -1) * 0.1;
            positions[i3 + 1] += (positions[i3 + 1] > 0 ? 1 : -1) * 0.1;
            positions[i3 + 2] += (positions[i3 + 2] > 0 ? 1 : -1) * 0.1;
        }
        
        // 照片动画
        const elapsedTime = Date.now() - photoStartTime;
        const progress = Math.min(1, elapsedTime / PHOTO_DURATION);
        
        photoMesh.position.z = THREE.MathUtils.lerp(-200, 0, progress);
        photoMesh.material.opacity = progress;
        
        if (elapsedTime > PHOTO_DURATION + 2000) { // 多展示2秒
            changeState('HEART');
        }

    } else if (targetPositions.length > 0) {
        // 移动到目标形状
        for (let i = 0; i < NUM_PARTICLES; i++) {
            const i3 = i * 3;
            const targetX = targetPositions[i3 % targetPositions.length];
            const targetY = targetPositions[(i3 + 1) % targetPositions.length];
            const targetZ = targetPositions[(i3 + 2) % targetPositions.length];
            
            positions[i3] = THREE.MathUtils.lerp(positions[i3], targetX, lerpFactor);
            positions[i3 + 1] = THREE.MathUtils.lerp(positions[i3 + 1], targetY, lerpFactor);
            positions[i3 + 2] = THREE.MathUtils.lerp(positions[i3 + 2], targetZ, lerpFactor);
        }
        
        // 隐藏照片
        if (photoMesh.material.opacity > 0) {
            photoMesh.material.opacity -= 0.05;
            photoMesh.position.z = -200;
        }
    } else {
        // 默认漂移
        for (let i = 0; i < NUM_PARTICLES * 3; i++) {
            positions[i] += (Math.random() - 0.5) * 0.05;
        }
    }
    
    geometry.attributes.position.needsUpdate = true;
    particles.rotation.y += 0.002;
    material.color.lerp(targetParticleColor, 0.05);
}

function animate() {
    requestAnimationFrame(animate);
    updateParticles();
    renderer.render(scene, camera);
}

// --- 5. MediaPipe 手势识别 ---

function getGesture(landmarks) {
    const isThumbOpen = landmarks[4].x < landmarks[3].x; 
    const isIndexOpen = landmarks[8].y < landmarks[6].y;
    const isMiddleOpen = landmarks[12].y < landmarks[10].y;
    const isRingOpen = landmarks[16].y < landmarks[14].y;
    const isPinkyOpen = landmarks[20].y < landmarks[18].y;
    
    if (!isIndexOpen && !isMiddleOpen && !isRingOpen && !isPinkyOpen) return 'CLENCHED_FIST';
    if (isIndexOpen && isMiddleOpen && isRingOpen && isPinkyOpen) return 'OPEN_PALM';
    if (isIndexOpen && !isMiddleOpen && !isRingOpen && !isPinkyOpen) return 'NUMBER_1';
    if (isIndexOpen && isMiddleOpen && !isRingOpen && !isPinkyOpen) return 'NUMBER_2';
    if (isIndexOpen && isMiddleOpen && isRingOpen && !isPinkyOpen) return 'NUMBER_3';
    
    return 'UNKNOWN';
}

function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handDetected = true;
        handLandmarks = results.multiHandLandmarks[0];
        
        const currentGesture = getGesture(handLandmarks);
        
        // 调试信息
        if(debugDiv) debugDiv.innerHTML = `状态: ${appState}\n手势: ${currentGesture}\n握拳数: ${fistCount}`;

        switch (currentGesture) {
            case 'CLENCHED_FIST':
                if (appState !== 'PHOTO_SEQUENCE') {
                    // 简单的防抖动逻辑：连续检测才算（实际可优化）
                    if (appState !== 'SPHERE') {
                        fistCount++;
                        if (fistCount > 50) { // 持续握拳一段时间触发照片
                            changeState('PHOTO_SEQUENCE');
                            fistCount = 0;
                        } else {
                            changeState('SPHERE');
                        }
                    }
                }
                break;
            case 'OPEN_PALM':
                if (appState !== 'PHOTO_SEQUENCE') {
                    changeState('HEART');
                    fistCount = 0;
                }
                break;
            case 'NUMBER_1': changeState('NUMBER_1'); fistCount=0; break;
            case 'NUMBER_2': changeState('NUMBER_2'); fistCount=0; break;
            case 'NUMBER_3': changeState('NUMBER_3'); fistCount=0; break;
        }
    } else {
        handDetected = false;
        if(debugDiv) debugDiv.innerHTML = `未检测到手部\n请将手移入画面`;
    }
}

// --- 6. 启动逻辑 ---

// 启动 Three.js
initThreeJS();

// 启动 MediaPipe
videoElement = document.getElementById('webcam-video');

if (typeof Hands === 'undefined') {
    console.error("MediaPipe Hands 库未加载，请检查网络或 CDN");
    if(debugDiv) debugDiv.innerText = "错误：无法加载 AI 库";
} else {
    const hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    // 启动摄像头
    if (typeof Camera === 'undefined') {
        console.error("MediaPipe Camera 库未加载");
    } else {
        const cameraUtil = new Camera(videoElement, {
            onFrame: async () => {
                if (videoElement.readyState >= 2) {
                    await hands.send({ image: videoElement });
                }
            },
            width: 640,
            height: 480,
            facingMode: 'user' // 尝试前置摄像头
        });

        cameraUtil.start()
            .then(() => {
                console.log("摄像头启动成功");
                if(debugDiv) debugDiv.innerText = "摄像头已启动\n正在加载模型...";
            })
            .catch(err => {
                console.error("摄像头启动失败", err);
                if(debugDiv) debugDiv.innerText = "错误: " + err.message;
                alert("无法启动摄像头，请确保已允许权限且设备未被占用。");
            });
    }
}