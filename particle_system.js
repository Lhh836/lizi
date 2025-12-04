// --- 全局配置 ---
const NUM_PARTICLES = 6000;
const INITIAL_SPREAD = 50;
const MAX_SPREAD = 150;
const MIN_SPREAD = 10;
const PHOTO_DURATION = 5000; // 照片放映持续时间 (毫秒)

// --- 状态变量 (新增) ---
let appState = 'INITIAL'; // 'INITIAL', 'SPHERE', 'HEART', 'NUMBER_1', 'NUMBER_2', 'NUMBER_3', 'PHOTO_SEQUENCE'
let targetPositions = []; // 粒子将移动到的目标位置数组
let photoMesh = null; // 用于显示照片的 3D 平面
let photoTexture = null; // 照片纹理
let photoStartTime = 0;

// --- 目标形状生成函数 (新增) ---
// 确保这些函数在 initThreeJS 之前定义

function generateSpherePositions(count, radius) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = radius * Math.cbrt(Math.random()); // 均匀分布
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
        // 使用心形线参数方程 (简化版)
        const t = Math.random() * 2 * Math.PI;
        const x = scale * 16 * Math.pow(Math.sin(t), 3);
        const y = -scale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const z = (Math.random() - 0.5) * scale * 5; // 增加一些深度
        
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }
    return positions;
}

// 占位函数：生成数字形状 (实际实现需要复杂的字体或点阵算法，这里使用简化版)
function generateTextPositions(text, count, scale) {
    // 实际项目中，这里会使用 Three.js TextGeometry 或预计算的点阵数据
    console.warn(`Generating placeholder positions for text: ${text}`);
    
    // 简化：暂时返回一个分散的球体，直到我们实现真正的数字形状
    return generateSpherePositions(count, scale * 1.5); 
}

// --- 兼容性函数 ---
function mapLinear(x, x1, x2, y1, y2) {
    return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
}

function lerp(x, y, t) {
    return (1 - t) * x + t * y;
}

// --- 状态变量 ---
let scene, camera, renderer;
let particles, geometry, material;
let currentSpreadRadius = INITIAL_SPREAD;
let targetParticleColor = new THREE.Color(0x00ffff); // 默认青色
let handDetected = false;

// --- 手势识别参数 ---
let handLandmarks = null;
let isClenched = false; // 握拳状态

// ----------------------------------------------------------------
// A. 初始化 Three.js 场景
// ----------------------------------------------------------------

function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 100;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // 粒子系统设置
    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(NUM_PARTICLES * 3);
    
    // 初始化粒子位置
    for (let i = 0; i < NUM_PARTICLES * 3; i += 3) {
        // 初始随机分布
        positions[i] = (Math.random() - 0.5) * INITIAL_SPREAD;
        positions[i + 1] = (Math.random() - 0.5) * INITIAL_SPREAD;
        positions[i + 2] = (Math.random() - 0.5) * INITIAL_SPREAD;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // 预加载照片纹理 (假设照片名为 'my_photo.jpg' 且与 index.html 同级)
    const textureLoader = new THREE.TextureLoader();
    // 注意：您需要将照片文件 'my_photo.jpg' 放在项目文件夹中
    photoTexture = textureLoader.load('my_photo.jpg', 
        () => { console.log("照片纹理加载成功。"); },
        undefined,
        (err) => { console.error("照片纹理加载失败，请检查文件名和路径。", err); }
    );

    // 初始化照片显示平面 (隐藏状态)
    const photoGeometry = new THREE.PlaneGeometry(40, 30); // 假设照片比例
    const photoMaterial = new THREE.MeshBasicMaterial({ 
        map: photoTexture, 
        transparent: true, 
        opacity: 0 
    });
    photoMesh = new THREE.Mesh(photoGeometry, photoMaterial);
    photoMesh.position.z = -200; // 初始放在很远的地方
    scene.add(photoMesh);

    window.addEventListener('resize', onWindowResize);
    
    // 初始化目标位置为球形 (握拳的默认目标)
    targetPositions = generateSpherePositions(NUM_PARTICLES, MIN_SPREAD);

    material = new THREE.PointsMaterial({
        size: 0.5,
        color: targetParticleColor,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------------------------------------------
// B. 粒子系统更新逻辑
// ----------------------------------------------------------------

function updateParticles() {
    const positions = geometry.attributes.position.array;
    const lerpFactor = 0.05; // 缓动因子

    if (appState === 'PHOTO_SEQUENCE') {
        // 状态：星空环境
        // 粒子分散到极远，模拟星空
        const maxStarSpread = 500;
        for (let i = 0; i < NUM_PARTICLES; i++) {
            const i3 = i * 3;
            // 粒子缓慢向外漂移
            positions[i3] += (positions[i3] > 0 ? 1 : -1) * 0.1;
            positions[i3 + 1] += (positions[i3 + 1] > 0 ? 1 : -1) * 0.1;
            positions[i3 + 2] += (positions[i3 + 2] > 0 ? 1 : -1) * 0.1;
        }
        
        // 照片动画：从远处飘来 (Z轴靠近)
        const elapsedTime = Date.now() - photoStartTime;
        const progress = Math.min(1, elapsedTime / PHOTO_DURATION);
        
        // Z轴从 -200 移动到 0
        photoMesh.position.z = THREE.MathUtils.lerp(-200, 0, progress);
        photoMesh.material.opacity = progress; // 逐渐显示
        
        if (elapsedTime > PHOTO_DURATION) {
            // 照片放映结束，切换到爱心聚集状态
            changeState('HEART');
        }

    } else if (targetPositions.length > 0) {
        // 状态：粒子向目标形状移动 (SPHERE, HEART, NUMBER_X)
        for (let i = 0; i < NUM_PARTICLES; i++) {
            const i3 = i * 3;
            
            // 目标位置 (使用取模确保粒子数量和目标位置数量匹配)
            const targetX = targetPositions[i3 % targetPositions.length];
            const targetY = targetPositions[(i3 + 1) % targetPositions.length];
            const targetZ = targetPositions[(i3 + 2) % targetPositions.length];
            
            // 缓动到目标位置
            positions[i3] = THREE.MathUtils.lerp(positions[i3], targetX, lerpFactor);
            positions[i3 + 1] = THREE.MathUtils.lerp(positions[i3 + 1], targetY, lerpFactor);
            positions[i3 + 2] = THREE.MathUtils.lerp(positions[i3 + 2], targetZ, lerpFactor);
        }
        
        // 确保照片隐藏
        photoMesh.material.opacity = THREE.MathUtils.lerp(photoMesh.material.opacity, 0, 0.1);
        photoMesh.position.z = -200;

    } else {
        // 状态：初始或未知状态 (粒子缓慢漂移)
        for (let i = 0; i < NUM_PARTICLES * 3; i++) {
            positions[i] += (Math.random() - 0.5) * 0.05;
        }
    }
    
    geometry.attributes.position.needsUpdate = true;
    particles.rotation.y += 0.001; // 缓慢自转
    material.color.copy(targetParticleColor); // 实时更新颜色
}

// ----------------------------------------------------------------
// C. 手势识别与交互逻辑 (MediaPipe)
// ----------------------------------------------------------------

const videoElement = document.getElementById('webcam-video');
// 即使隐藏了，我们仍然需要获取 canvasCtx 来满足 MediaPipe 的 onResults 接口要求，
// 但我们不再执行实际的绘图操作。
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d'); 

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
});

// 引入 MediaPipe Hand Gesture Utility (简化手势判断)
// 这是一个简化的手势判断逻辑，实际项目中可能需要更复杂的模型
function getGesture(landmarks) {
    // 检查指尖是否伸直 (Y轴坐标)
    const isThumbOpen = landmarks[4].x < landmarks[3].x; // 拇指向外
    const isIndexOpen = landmarks[8].y < landmarks[6].y;
    const isMiddleOpen = landmarks[12].y < landmarks[10].y;
    const isRingOpen = landmarks[16].y < landmarks[14].y;
    const isPinkyOpen = landmarks[20].y < landmarks[18].y;
    
    // 握拳 (所有指尖都低于或靠近关节)
    if (!isIndexOpen && !isMiddleOpen && !isRingOpen && !isPinkyOpen) {
        return 'CLENCHED_FIST';
    }
    
    // 张开手掌 (所有指尖都伸直)
    if (isIndexOpen && isMiddleOpen && isRingOpen && isPinkyOpen) {
        return 'OPEN_PALM';
    }
    
    // 数字 1 (食指伸直)
    if (isIndexOpen && !isMiddleOpen && !isRingOpen && !isPinkyOpen) {
        return 'NUMBER_1';
    }
    
    // 数字 2 (食指和中指伸直)
    if (isIndexOpen && isMiddleOpen && !isRingOpen && !isPinkyOpen) {
        return 'NUMBER_2';
    }
    
    // 数字 3 (食指、中指、无名指伸直 - 简化，通常是拇指、食指、中指)
    if (isIndexOpen && isMiddleOpen && isRingOpen && !isPinkyOpen) {
        return 'NUMBER_3';
    }
    
    return 'UNKNOWN';
}

let fistCount = 0; // 记录握拳次数，用于触发照片序列
const debugDiv = document.getElementById('mobile-debug');

function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handDetected = true;
        handLandmarks = results.multiHandLandmarks[0];
        
        const currentGesture = getGesture(handLandmarks);
        // --- 更新手机屏幕上的调试文字 ---
        debugDiv.innerHTML = `
            状态: ${appState}<br>
            手势: ${currentGesture}<br>
            握拳计数: ${fistCount}
        `;
        
        // 状态机控制
        switch (currentGesture) {
            case 'CLENCHED_FIST':
                if (appState !== 'PHOTO_SEQUENCE') {
                    fistCount++;
                    if (fistCount === 2) {
                        changeState('PHOTO_SEQUENCE');
                        fistCount = 0; // 重置计数器
                    } else if (fistCount === 1) {
                        changeState('SPHERE');
                    }
                }
                break;
                
            case 'OPEN_PALM':
                // 只有在非照片序列时才响应张开手掌
                if (appState !== 'PHOTO_SEQUENCE') {
                    changeState('HEART');
                    fistCount = 0;
                }
                break;
                
            case 'NUMBER_1':
                changeState('NUMBER_1');
                fistCount = 0;
                break;
                
            case 'NUMBER_2':
                changeState('NUMBER_2');
                fistCount = 0;
                break;
                
            case 'NUMBER_3':
                changeState('NUMBER_3');
                fistCount = 0;
                break;
                
            default:
                // 如果手势不明确，保持当前状态
                break;
        }
        
    } else {
        handDetected = false;
        debugDiv.innerHTML = `未检测到手部<br>请将手移入画面`;
        // 如果手势丢失，粒子缓慢恢复到初始状态 (可选：可以保持当前形状)
        // currentSpreadRadius = THREE.MathUtils.lerp(currentSpreadRadius, INITIAL_SPREAD, 0.02);
    }
}

//状态切换函数
function changeState(newState) {
    if (appState === newState) return;
    
    appState = newState;
    console.log(`--- App State Changed to: ${newState} ---`);
    
    // 重置目标位置
    targetPositions = []; 
    
    switch (newState) {
        case 'SPHERE':
            // 握拳：粒子呈现球形
            targetPositions = generateSpherePositions(NUM_PARTICLES, 20);
            break;
            
        case 'HEART':
            // 张开手掌或照片结束：爱心形状
            targetPositions = generateHeartPositions(NUM_PARTICLES, 1.5);
            targetParticleColor.set(0xff69b4); // 粉色
            break;
            
        case 'NUMBER_1':
            targetPositions = generateTextPositions('1', NUM_PARTICLES, 30);
            targetParticleColor.set(0x00ff00);
            break;
            
        case 'NUMBER_2':
            targetPositions = generateTextPositions('2', NUM_PARTICLES, 30);
            targetParticleColor.set(0xffff00);
            break;
            
        case 'NUMBER_3':
            targetPositions = generateTextPositions('3', NUM_PARTICLES, 30);
            targetParticleColor.set(0xff0000);
            break;
            
        case 'PHOTO_SEQUENCE':
            // 握拳第二次：开始照片放映
            photoStartTime = Date.now();
            targetPositions = []; // 粒子进入星空漂移模式
            targetParticleColor.set(0xaaaaee); // 星空色
            break;
            
        default:
            // 默认分散
            targetPositions = [];
            targetParticleColor.set(0x00ffff);
            break;
    }
}

// 启动摄像头
const cameraUtil = new Camera(videoElement, {
    onFrame: async () => {
        if (videoElement.readyState >= 2) {
             await hands.send({ image: videoElement });
        }
    },
    width: 640,
    height: 480,
    facingMode: 'user'
});

// 启动逻辑
cameraUtil.start()
    .then(() => {
        document.getElementById('mobile-debug').innerText = "摄像头启动成功，正在加载模型...";
    })
    .catch(err => {
        document.getElementById('mobile-debug').innerText = "错误: " + err.message;
    });
// 关键修改：使用 try...catch 捕获启动错误
try {
    cameraUtil.start();
    console.log("摄像头启动尝试成功。");
} catch (error) {
    console.error("摄像头启动失败，请检查设备是否连接或被占用。", error);
    // 可以在这里添加一个 UI 提示，告知用户摄像头未找到
}


// ----------------------------------------------------------------
// D. UI 颜色选择器
// ----------------------------------------------------------------

function setupGUI() {
    const gui = new dat.GUI();
    const params = {
        particleColor: `#${targetParticleColor.getHexString()}`,
        spread: INITIAL_SPREAD,
        numParticles: NUM_PARTICLES
    };

    gui.addColor(params, 'particleColor').onChange(value => {
        targetParticleColor.set(value);
    });
    
    // 显示当前的扩散半径 (只读)
    gui.add(params, 'spread', MIN_SPREAD, MAX_SPREAD).listen();
    
    // 实时更新GUI中的扩散值
    setInterval(() => {
        // 确保GUI显示最新的扩散值
        params.spread = currentSpreadRadius; 
    }, 100);
}


// ----------------------------------------------------------------
// E. 动画循环
// ----------------------------------------------------------------

function animate() {
    requestAnimationFrame(animate);
    
    updateParticles();
    renderer.render(scene, camera);
}

// 启动程序
function startApp() {
    try {
        initThreeJS();
        setupGUI();
        animate();
        startCamera(); // 启动摄像头
    } catch (error) {
        console.error('应用程序启动失败:', error);
        // 显示错误信息给用户
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            background: rgba(255,0,0,0.8);
            padding: 20px;
            border-radius: 10px;
            z-index: 10000;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <h3>应用程序启动失败</h3>
            <p>${error.message}</p>
            <p>请检查浏览器控制台获取详细信息</p>
        `;
        document.body.appendChild(errorDiv);
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    updateParticles();
    renderer.render(scene, camera);
}

// 启动程序 (确保没有额外的包装函数，直接调用)
initThreeJS();
setupGUI();
animate();