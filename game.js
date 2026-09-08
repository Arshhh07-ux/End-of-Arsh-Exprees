let scene, camera, renderer;
let pitchObject, yawObject;
let isLocked = false;

// Player Controls
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Flashlight
let flashlight, flashlightOn = true;

// Audio System (Web Audio API Synth)
let audioCtx, ambientNoiseNode;

// Interactive Notes
let noteMesh = null, isNearNote = false, isReadingNote = false;
const noteTexts = [
    "Log 1: Coach S-2... The ambient noise feels heavier than before.",
    "Log 2: If the passenger ahead turns into shadows, do not walk forward.",
    "Log 3: Train timetable states Blara Junction was demolished in 1994...",
    "Log 4: The track loop goes on forever unless you turn away from anomalies."
];

// Game State Progression
let currentCar = 1;
const maxCars = 8;
let hasAnomaly = false;
let anomalyType = 0;
let anomalyObject = null;

// UI References
const carNumberEl = document.getElementById('car-number');
const instructions = document.getElementById('instructions');
const gameOverEl = document.getElementById('game-over');
const victoryEl = document.getElementById('victory');
const promptEl = document.getElementById('interaction-prompt');
const noteModal = document.getElementById('note-modal');
const noteTextEl = document.getElementById('note-text');

const gltfLoader = new THREE.GLTFLoader();

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.12);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

    pitchObject = new THREE.Object3D();
    pitchObject.add(camera);
    yawObject = new THREE.Object3D();
    yawObject.position.y = 1.6;
    yawObject.add(pitchObject);
    scene.add(yawObject);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    setupLighting();
    loadTrainCorridor();
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
    
    // Low frequency drone rumble for train noise
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
    filter.frequency.value = 120;

    const gain = audioCtx.createGain();
    gain.gain.value = 0.15;

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    whiteNoise.start();
}

function playAudioClick() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x0a0a1a, 0.2);
    scene.add(ambientLight);

    flashlight = new THREE.SpotLight(0xffeedd, 3.5, 18, Math.PI / 6, 0.5, 1);
    flashlight.castShadow = true;
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0.1);
    flashlight.target = camera;
    scene.add(camera);
}

function toggleFlashlight() {
    flashlightOn = !flashlightOn;
    flashlight.intensity = flashlightOn ? 3.5 : 0;
    playAudioClick();
}

function loadTrainCorridor() {
    gltfLoader.load(
        'train_corridor.glb', 
        function (gltf) {
            const trainModel = gltf.scene;
            trainModel.scale.set(1, 1, 1);
            trainModel.position.set(0, 0, 0);

            trainModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(trainModel);
        },
        undefined,
        function () {
            buildProceduralTrain();
        }
    );
}

function buildProceduralTrain() {
    const trainGroup = new THREE.Group();

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f3a4b, roughness: 0.8 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const berthMat = new THREE.MeshStandardMaterial({ color: 0x4a2c11 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 20), floorMat);
    floor.position.y = -0.05;
    trainGroup.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 20), ceilingMat);
    ceiling.position.y = 3;
    trainGroup.add(ceiling);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 20), wallMat);
    leftWall.position.set(-1.5, 1.5, 0);
    trainGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 20), wallMat);
    rightWall.position.set(1.5, 1.5, 0);
    trainGroup.add(rightWall);

    for (let z = -7; z <= 7; z += 3.5) {
        const berthLower = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 1.8), berthMat);
        berthLower.position.set(-1.0, 0.5, z);
        trainGroup.add(berthLower);

        const berthUpper = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 1.8), berthMat);
        berthUpper.position.set(-1.0, 1.8, z);
        trainGroup.add(berthUpper);
    }

    for (let z = -6; z <= 6; z += 6) {
        const lightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), lightMat);
        lightMesh.position.set(0, 2.95, z);
        trainGroup.add(lightMesh);

        const pointLight = new THREE.PointLight(0xffaa44, 0.6, 8);
        pointLight.position.set(0, 2.8, z);
        trainGroup.add(pointLight);
    }

    scene.add(trainGroup);
}

function spawnNote() {
    if (noteMesh) scene.remove(noteMesh);
    const paperGeo = new THREE.PlaneGeometry(0.3, 0.4);
    const paperMat = new THREE.MeshBasicMaterial({ color: 0xfff8dc, side: THREE.DoubleSide });
    noteMesh = new THREE.Mesh(paperGeo, paperMat);
    noteMesh.position.set(-0.6, 0.56, 0);
    noteMesh.rotation.x = -Math.PI / 2;
    scene.add(noteMesh);
}

function generateCarState() {
    if (anomalyObject) {
        scene.remove(anomalyObject);
        anomalyObject = null;
    }

    yawObject.position.set(0, 1.6, 9);
    yawObject.rotation.y = Math.PI;

    hasAnomaly = currentCar !== 1 && Math.random() < 0.5;

    if (hasAnomaly) {
        anomalyType = Math.floor(Math.random() * 4); // 4 Anomaly Types
        spawnAnomaly();
    }

    spawnNote();
    carNumberEl.innerText = "S-" + currentCar;
}

function spawnAnomaly() {
    anomalyObject = new THREE.Group();

    if (anomalyType === 0) {
        const geo = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const shadowMan = new THREE.Mesh(geo, mat);
        shadowMan.position.set(0, 0.9, -6);
        anomalyObject.add(shadowMan);
    } else if (anomalyType === 1) {
        const redLight = new THREE.PointLight(0xff0000, 3, 15);
        redLight.position.set(0, 2, 0);
        anomalyObject.add(redLight);
    } else if (anomalyType === 2) {
        const berthMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const floatingBerth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 1.8), berthMat);
        floatingBerth.position.set(0, 2.2, 0);
        floatingBerth.rotation.z = Math.PI / 4;
        anomalyObject.add(floatingBerth);
    } else if (anomalyType === 3) {
        // Anomaly 4: Flickering light intensity
        const strobeLight = new THREE.PointLight(0xffffff, 5, 10);
        strobeLight.position.set(0, 2, -3);
        anomalyObject.add(strobeLight);
    }

    scene.add(anomalyObject);
}

function checkNoteProximity() {
    if (!noteMesh) return;
    const dist = yawObject.position.distanceTo(noteMesh.position);
    if (dist < 1.8) {
        isNearNote = true;
        promptEl.style.display = 'block';
    } else {
        isNearNote = false;
        promptEl.style.display = 'none';
    }
}

function toggleReadNote() {
    if (!isNearNote && !isReadingNote) return;

    isReadingNote = !isReadingNote;
    if (isReadingNote) {
        noteTextEl.innerText = noteTexts[currentCar % noteTexts.length];
        noteModal.style.display = 'flex';
        promptEl.style.display = 'none';
    } else {
        noteModal.style.display = 'none';
    }
    playAudioClick();
}

function checkPassage() {
    const zPos = yawObject.position.z;

    if (zPos < -9) {
        if (hasAnomaly) {
            triggerGameOver();
        } else {
            currentCar++;
            if (currentCar > maxCars) triggerClimax();
            else generateCarState();
        }
    } else if (zPos > 9.5 && currentCar > 1) {
        if (hasAnomaly) {
            currentCar++;
            if (currentCar > maxCars) triggerClimax();
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

function triggerClimax() {
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
        if (!isLocked || isReadingNote) return;
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        yawObject.rotation.y -= movementX * 0.002;
        pitchObject.rotation.x -= movementY * 0.002;
        pitchObject.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, pitchObject.rotation.x));
    });
}

function onKeyDown(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveForward = true; break;
        case 'KeyS': case 'ArrowDown': moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': moveRight = true; break;
        case 'KeyF': toggleFlashlight(); break;
        case 'KeyE': toggleReadNote(); break;
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

    if (isLocked && !isReadingNote) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 25.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 25.0 * delta;

        yawObject.translateX(-velocity.x * delta);
        yawObject.translateZ(velocity.z * delta);

        yawObject.position.x = Math.max(-0.9, Math.min(0.9, yawObject.position.x));

        if (moveForward || moveBackward || moveLeft || moveRight) {
            pitchObject.position.y = Math.sin(time * 0.01) * 0.05;
        }

        checkNoteProximity();
        checkPassage();
    }

    prevTime = time;
    renderer.render(scene, camera);
}

window.onload = init;
                 
