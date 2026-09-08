let scene, camera, renderer;
let pitchObject, yawObject;
let isLocked = false;

// Controls
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Flashlight & Audio
let flashlight, flashlightOn = true;
let audioCtx;

// Game State
let currentCar = 1;
const maxCars = 8;
let hasAnomaly = false;
let anomalyType = 0;
let trainGroup, anomalyGroup;

// 4D Time Variables
let clock = new THREE.Clock();
let distortionMeshList = [];

// UI
const carNumberEl = document.getElementById('car-number');
const anomalyDetectorEl = document.getElementById('anomaly-detector');
const instructions = document.getElementById('instructions');
const gameOverEl = document.getElementById('game-over');
const victoryEl = document.getElementById('victory');

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020204, 0.08);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

    pitchObject = new THREE.Object3D();
    pitchObject.add(camera);
    yawObject = new THREE.Object3D();
    yawObject.position.set(0, 1.6, 9);
    yawObject.rotation.y = Math.PI;
    yawObject.add(pitchObject);
    scene.add(yawObject);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    setupLighting();
    buildDetailed3DTrain();
    generateCarState();

    setupPointerLock();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    animate();
}

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Low train rumble
    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 100;

    const gain = audioCtx.createGain();
    gain.gain.value = 0.2;

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    whiteNoise.start();
}

function playClickSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x0d1117, 0.3);
    scene.add(ambientLight);

    flashlight = new THREE.SpotLight(0xfffaed, 4, 20, Math.PI / 5, 0.4, 1);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0.1);
    flashlight.target = camera;
    scene.add(camera);
}

function toggleFlashlight() {
    flashlightOn = !flashlightOn;
    flashlight.intensity = flashlightOn ? 4 : 0;
    playClickSound();
}

function buildDetailed3DTrain() {
    trainGroup = new THREE.Group();

    // Textures & Materials
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.2 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f2e3d, roughness: 0.7 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, metalness: 0.8 });
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x5a2a18, roughness: 0.8 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x050b14, roughness: 0.1, metalness: 0.9 });

    // Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 24), floorMat);
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    trainGroup.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 24), ceilingMat);
    ceiling.position.y = 3.1;
    trainGroup.add(ceiling);

    // Side Walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 24), wallMat);
    leftWall.position.set(-1.6, 1.55, 0);
    trainGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 24), wallMat);
    rightWall.position.set(1.6, 1.55, 0);
    trainGroup.add(rightWall);

    // Windows along corridor
    for (let z = -9; z <= 9; z += 3) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 1.2), windowMat);
        win.position.set(1.54, 1.8, z);
        win.rotation.y = -Math.PI / 2;
        trainGroup.add(win);
    }

    // 3D Sleeper Berths
    for (let z = -8; z <= 8; z += 4) {
        // Lower Berth
        const berthLower = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 2.2), cushionMat);
        berthLower.position.set(-1.0, 0.5, z);
        berthLower.castShadow = true;
        trainGroup.add(berthLower);

        // Upper Berth
        const berthUpper = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.2), cushionMat);
        berthUpper.position.set(-1.0, 2.0, z);
        berthUpper.castShadow = true;
        trainGroup.add(berthUpper);

        // Support Frames
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.5), frameMat);
        pole.position.set(-0.5, 1.25, z + 1.0);
        trainGroup.add(pole);
    }

    // Ceiling Lights
    for (let z = -8; z <= 8; z += 8) {
        const lightFixture = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), frameMat);
        lightFixture.position.set(0, 3.05, z);
        trainGroup.add(lightFixture);

        const pLight = new THREE.PointLight(0xffaa55, 0.8, 7);
        pLight.position.set(0, 2.9, z);
        pLight.castShadow = true;
        trainGroup.add(pLight);
    }

    scene.add(trainGroup);
}

function generateCarState() {
    if (anomalyGroup) {
        scene.remove(anomalyGroup);
        anomalyGroup = null;
    }

    yawObject.position.set(0, 1.6, 9);
    yawObject.rotation.y = Math.PI;

    hasAnomaly = currentCar !== 1 && Math.random() < 0.55;

    if (hasAnomaly) {
        anomalyType = Math.floor(Math.random() * 4); // 4D Anomalies
        spawn4DAnomaly();
        anomalyDetectorEl.innerText = "TEMPORAL SHIFT: ANOMALOUS DETECTED";
        anomalyDetectorEl.style.color = "#ff3333";
    } else {
        anomalyDetectorEl.innerText = "TEMPORAL SHIFT: STABLE";
        anomalyDetectorEl.style.color = "#00ffcc";
    }

    carNumberEl.innerText = "S-" + currentCar;
}

function spawn4DAnomaly() {
    anomalyGroup = new THREE.Group();

    if (anomalyType === 0) {
        // Shadow Entity blocking hallway
        const geo = new THREE.CylinderGeometry(0.35, 0.35, 1.8, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const shadowMan = new THREE.Mesh(geo, mat);
        shadowMan.position.set(0, 0.9, -4);
        anomalyGroup.add(shadowMan);

    } else if (anomalyType === 1) {
        // Red Time Distortion Zone
        const light = new THREE.PointLight(0xff0000, 5, 15);
        light.position.set(0, 2, 0);
        anomalyGroup.add(light);

    } else if (anomalyType === 2) {
        // Gravity Distortion (Inverted sleeper berths floating)
        const mat = new THREE.MeshStandardMaterial({ color: 0xff3333, wireframe: true });
        const invertedBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 2.5), mat);
        invertedBox.position.set(0, 2.2, -2);
        invertedBox.rotation.z = Math.PI / 3;
        anomalyGroup.add(invertedBox);

    } else if (anomalyType === 3) {
        // Temporal Mirroring (Flickering Phantom Light)
        const strobe = new THREE.SpotLight(0x00ffff, 8, 12, Math.PI / 4);
        strobe.position.set(0, 2.8, -6);
        anomalyGroup.add(strobe);
    }

    scene.add(anomalyGroup);
}

function checkPassage() {
    const zPos = yawObject.position.z;

    // Walking to end of carriage (-Z)
    if (zPos < -9.5) {
        if (hasAnomaly) {
            triggerGameOver();
        } else {
            currentCar++;
            if (currentCar > maxCars) triggerVictory();
            else generateCarState();
        }
    } 
    // Walking backward to entrance (+Z)
    else if (zPos > 10.0 && currentCar > 1) {
        if (hasAnomaly) {
            currentCar++;
            if (currentCar > maxCars) triggerVictory();
            else generateCarState();
        } else {
            currentCar = 1; // Reset loop if turned back when stable
            generateCarState();
        }
    }
}

function triggerGameOver() {
    document.exitPointerLock();
    gameOverEl.style.display = 'flex';
}

function triggerVictory() {
    document.exitPointerLock();
    victoryEl.style.display = 'flex';
}

function setupPointerLock() {
    instructions.addEventListener('click', () => {
        document.body.requestPointerLock();
        initAudio();
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            isLocked = true;
            instructions.style.display = 'none';
        } else {
            isLocked = false;
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isLocked) return;
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        yawObject.rotation.y -= movementX * 0.0022;
        pitchObject.rotation.x -= movementY * 0.0022;
        pitchObject.rotation.x = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, pitchObject.rotation.x));
    });
}

function onKeyDown(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveForward = true; break;
        case 'KeyS': case 'ArrowDown': moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': moveRight = true; break;
        case 'KeyF': toggleFlashlight(); break;
    }
}

function onKeyUp(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveForward = false; break;
        case 'KeyS': case 'ArrowDown': moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': moveRight = false; break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    const elapsedTime = clock.getElapsedTime();

    if (isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 22.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 22.0 * delta;

        yawObject.translateX(-velocity.x * delta);
        yawObject.translateZ(velocity.z * delta);

        // Constrain movement inside hallway
        yawObject.position.x = Math.max(-0.85, Math.min(0.85, yawObject.position.x));

        // 3D Head Bobbing Effect
        if (moveForward || moveBackward || moveLeft || moveRight) {
            pitchObject.position.y = Math.sin(elapsedTime * 8) * 0.04;
        }

        // 4D Anomaly Temporal Animation
        if (hasAnomaly && anomalyGroup) {
            if (anomalyType === 2) {
                anomalyGroup.rotation.y = elapsedTime * 0.5;
            } else if (anomalyType === 3) {
                anomalyGroup.children[0].intensity = Math.sin(elapsedTime * 15) * 5 + 4;
            }
        }

        checkPassage();
    }

    prevTime = time;
    renderer.render(scene, camera);
}

window.onload = init;
