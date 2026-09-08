let scene, camera, renderer;
let pitchObject, yawObject;
let isLocked = false;

// Input & Movement
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Lights
let flashlight, flashlightOn = true;
const coachLights = [];

// Game Logic
let currentCar = 1;
const maxCars = 8;
let hasAnomaly = false;
let anomalyType = 0;
let anomalyGroup = null;

// Canvas & UI
const carNumberEl = document.getElementById('car-number');
const anomalyStatusEl = document.getElementById('anomaly-status');
const instructions = document.getElementById('instructions');
const gameOverEl = document.getElementById('game-over');
const victoryEl = document.getElementById('victory');

function init() {
    // 3D Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040609, 0.08);

    // 3D Perspective Camera Setup
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

    pitchObject = new THREE.Object3D();
    pitchObject.add(camera);

    yawObject = new THREE.Object3D();
    yawObject.position.set(0, 1.6, 10);
    yawObject.rotation.y = Math.PI;
    yawObject.add(pitchObject);
    scene.add(yawObject);

    // WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Build World
    setupLighting();
    buildDetailedCoach();
    generateCarState();

    // Controls
    setupPointerLock();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    animate();
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x0a0d14, 0.3);
    scene.add(ambientLight);

    flashlight = new THREE.SpotLight(0xfffaed, 6, 25, Math.PI / 5.5, 0.4, 1);
    flashlight.castShadow = true;
    camera.add(flashlight);
    flashlight.position.set(0.2, -0.2, 0);
    flashlight.target = camera;
    scene.add(camera);
}

function toggleFlashlight() {
    flashlightOn = !flashlightOn;
    flashlight.intensity = flashlightOn ? 6 : 0;
}

// Generates 3D structural details: floor tiles, walls, berths, windows, partitions
function buildDetailedCoach() {
    const coach = new THREE.Group();

    // Procedural Textures & Materials
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.3, metalness: 0.2 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: 0.6 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.8 });
    const berthMat = new THREE.MeshStandardMaterial({ color: 0x4a1810, roughness: 0.7 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x080808, metalness: 0.9, roughness: 0.2 });
    const windowMat = new THREE.MeshPhysicalMaterial({ color: 0x050a10, roughness: 0.1, transmission: 0.6, transparent: true });

    // Floor & Ceiling
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 26), floorMat);
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    coach.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 26), ceilingMat);
    ceiling.position.y = 3.1;
    coach.add(ceiling);

    // Walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 26), wallMat);
    leftWall.position.set(-1.8, 1.55, 0);
    coach.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 26), wallMat);
    rightWall.position.set(1.8, 1.55, 0);
    coach.add(rightWall);

    // Sleeper Cabins with Berths & Windows
    for (let z = -10; z <= 10; z += 4) {
        // Left Side Sleeper Berths (Lower, Middle, Upper)
        for (let y of [0.5, 1.4, 2.3]) {
            const berth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 2.2), berthMat);
            berth.position.set(-1.1, y, z);
            berth.castShadow = true;
            berth.receiveShadow = true;
            coach.add(berth);
        }

        // Support Steel Frames
        const framePillar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.8), frameMat);
        framePillar.position.set(-0.5, 1.4, z + 1.0);
        coach.add(framePillar);

        // Windows along the hallway
        const winLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 1.6), windowMat);
        winLeft.position.set(-1.76, 1.6, z);
        coach.add(winLeft);

        const winRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 1.6), windowMat);
        winRight.position.set(1.76, 1.6, z);
        coach.add(winRight);
    }

    // Overhead Yellow Lamps
    for (let z = -9; z <= 9; z += 6) {
        const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), frameMat);
        fixture.position.set(0, 3.05, z);
        coach.add(fixture);

        const pLight = new THREE.PointLight(0xffb042, 0.8, 7);
        pLight.position.set(0, 2.9, z);
        pLight.castShadow = true;
        coachLights.push(pLight);
        coach.add(pLight);
    }

    scene.add(coach);
}

function generateCarState() {
    if (anomalyGroup) {
        scene.remove(anomalyGroup);
        anomalyGroup = null;
    }

    // Reset Coach Point Light Properties
    coachLights.forEach(light => {
        light.color.setHex(0xffb042);
        light.intensity = 0.8;
    });

    yawObject.position.set(0, 1.6, 10);
    yawObject.rotation.y = Math.PI;

    hasAnomaly = currentCar !== 1 && Math.random() < 0.5;

    if (hasAnomaly) {
        anomalyType = Math.floor(Math.random() * 3);
        spawn3DAnomaly();
        anomalyStatusEl.innerText = "DETECTED";
        anomalyStatusEl.style.color = "#ff3333";
    } else {
        anomalyStatusEl.innerText = "STABLE";
        anomalyStatusEl.style.color = "#00ffcc";
    }

    carNumberEl.innerText = "S-" + currentCar;
}

function spawn3DAnomaly() {
    anomalyGroup = new THREE.Group();

    if (anomalyType === 0) {
        // Anomaly 1: Blood-Red Corridor Lighting
        coachLights.forEach(light => {
            light.color.setHex(0xff0000);
            light.intensity = 2.0;
        });
    } else if (anomalyType === 1) {
        // Anomaly 2: Monolithic Shadow Blocking Corridor
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const figure = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.0, 16), shadowMat);
        figure.position.set(0, 1.0, -3);
        anomalyGroup.add(figure);
    } else if (anomalyType === 2) {
        // Anomaly 3: Floating Wireframe Object
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
        const anomalyObj = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), mat);
        anomalyObj.position.set(0, 1.6, -2);
        anomalyGroup.add(anomalyObj);
    }

    scene.add(anomalyGroup);
}

function checkPassage() {
    const zPos = yawObject.position.z;

    if (zPos < -10.5) {
        if (hasAnomaly) {
            triggerGameOver();
        } else {
            currentCar++;
            if (currentCar > maxCars) triggerVictory();
            else generateCarState();
        }
    } else if (zPos > 11.0 && currentCar > 1) {
        if (hasAnomaly) {
            currentCar++;
            if (currentCar > maxCars) triggerVictory();
            else generateCarState();
        } else {
            currentCar = 1;
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
        yawObject.rotation.y -= (e.movementX || 0) * 0.0022;
        pitchObject.rotation.x -= (e.movementY || 0) * 0.0022;
        pitchObject.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchObject.rotation.x));
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

    if (isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 24.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 24.0 * delta;

        yawObject.translateX(-velocity.x * delta);
        yawObject.translateZ(velocity.z * delta);

        // Constrain player movement within hallway walls
        yawObject.position.x = Math.max(-0.7, Math.min(0.7, yawObject.position.x));

        // Subtle Camera Bobbing
        if (moveForward || moveBackward || moveLeft || moveRight) {
            pitchObject.position.y = Math.sin(time * 0.009) * 0.03;
        }

        checkPassage();
    }

    prevTime = time;
    renderer.render(scene, camera);
}

window.onload = init;
            
