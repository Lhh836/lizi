// --- 全局配置 ---
const NUM_PARTICLES = 20000;
const INITIAL_SPREAD = 50;
const MAX_SPREAD = 150;
const MIN_SPREAD = 10;

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
    
    // 粒子运动和响应手势
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const i3 = i * 3;
        
        // 1. 基础运动 (轻微的随机漂浮)
        positions[i3] += (Math.random() - 0.5) * 0.05;
        positions[i3 + 1] += (Math.random() - 0.5) * 0.05;
        positions[i3 + 2] += (Math.random() - 0.5) * 0.05;

        // 2. 响应缩放/扩散 (将粒子推向或拉向中心)
        const x = positions[i3];
        const y = positions[i3 + 1];
        const z = positions[i3 + 2];
        const distance = Math.sqrt(x*x + y*y + z*z);
        
        // 归一化方向向量
        const nx = x / distance;
        const ny = y / distance;
        const nz = z / distance;
        
        // 目标距离 (由手势控制)
        const targetDistance = currentSpreadRadius * (Math.random() * 0.5 + 0.5); 
        
        // 缓动效果 (平滑过渡)
        const lerpFactor = 0.05;
        
        if (distance > targetDistance) {
            // 粒子太远，向内拉
            positions[i3] -= nx * lerpFactor * (distance - targetDistance);
            positions[i3 + 1] -= ny * lerpFactor * (distance - targetDistance);
            positions[i3 + 2] -= nz * lerpFactor * (distance - targetDistance);
        } else if (distance < targetDistance) {
            // 粒子太近，向外推
            positions[i3] += nx * lerpFactor * (targetDistance - distance);
            positions[i3 + 1] += ny * lerpFactor * (targetDistance - distance);
            positions[i3 + 2] += nz * lerpFactor * (targetDistance - distance);
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
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d'); // 获取 2D 绘图上下文

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

function onResults(results) {
    // 1. 绘制手部骨架 (调试可视化)
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 绘制视频帧
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handDetected = true;
        handLandmarks = results.multiHandLandmarks[0];
        
        // 绘制手部连接线
        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        // 绘制关键点
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2 });
        
        // 2. 计算指尖距离 (用于缩放/扩散)
        const thumbTip = handLandmarks[4];
        const pinkyTip = handLandmarks[20];
        
        const distanceX = thumbTip.x - pinkyTip.x;
        const distanceY = thumbTip.y - pinkyTip.y;
        const fingerDistance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        
        // 将距离映射到粒子扩散半径 (0.05 到 0.4 映射到 MIN_SPREAD 到 MAX_SPREAD)
        let mappedSpread = THREE.MathUtils.mapLinear(fingerDistance, 0.05, 0.4, MIN_SPREAD, MAX_SPREAD);
        
        // 3. 检测握拳/张开手掌
        const indexTipY = handLandmarks[8].y;
        const indexKnuckleY = handLandmarks[6].y;
        
        isClenched = (indexTipY > indexKnuckleY - 0.05); 
        
        if (isClenched) {
            // 握拳：粒子聚集到最小半径
            currentSpreadRadius = THREE.MathUtils.lerp(currentSpreadRadius, MIN_SPREAD, 0.1);
        } else {
            // 张开手掌：使用映射的指尖距离控制扩散
            currentSpreadRadius = THREE.MathUtils.lerp(currentSpreadRadius, mappedSpread, 0.1);
        }
        
        // 4. 调试输出 (检查控制变量是否变化)
        console.log(`--- Hand Detected ---`);
        console.log(`Finger Distance (Raw): ${fingerDistance.toFixed(3)}`);
        console.log(`Is Clenched: ${isClenched}`);
        console.log(`Current Spread Radius: ${currentSpreadRadius.toFixed(2)}`);
        
    } else {
        handDetected = false;
        // 如果手势丢失，粒子缓慢恢复到初始状态
        currentSpreadRadius = THREE.MathUtils.lerp(currentSpreadRadius, INITIAL_SPREAD, 0.02);
    }
    
    canvasCtx.restore();
}

// 启动摄像头
const cameraUtil = new Camera(videoElement, {
    onFrame: async () => {
        // 必须确保 videoElement 已经加载了数据
        if (videoElement.readyState >= 2) {
             await hands.send({ image: videoElement });
        }
    },
    width: 640,
    height: 480
});
cameraUtil.start();


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

// 等待页面加载完成后启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}