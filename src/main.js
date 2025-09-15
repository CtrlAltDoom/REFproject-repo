import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060710);
scene.fog = new THREE.FogExp2(0x060710, 0.045);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 5, 10);
scene.add(camera);

const listener = new THREE.AudioListener();
camera.add(listener);

const overlay = document.getElementById('overlay');
const startPanel = document.getElementById('start-panel');
const endPanel = document.getElementById('end-panel');
const startButton = document.getElementById('start-button');
const replayButton = document.getElementById('replay-button');
const hud = document.getElementById('hud');
const shardCounter = document.getElementById('shard-counter');
const hintText = document.getElementById('hint-text');
const fadeLayer = document.getElementById('fade');
const summary = document.getElementById('summary');

const clock = new THREE.Clock();

const COLLIDER_Y_MIN = 0;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.55;
const TOTAL_SHARDS = 4;

let running = false;
let elapsedTime = 0;
let startTimestamp = 0;
let teleportState = 'idle';
let teleportTimer = 0;
let lastTeleportIndex = -1;
let shakeTimer = 0;
let shakeStrength = 0;
let dashTimer = 0;
let dashCooldown = 0;
let pointerLocked = false;
let ambientStarted = false;

const keyState = new Map();

const colliders = [];
const shardEntities = [];
const mirrors = [];
const particles = [];
const teleportDestinations = [];

let player;
let playerModel;
let pit; 
let exitDoor;
let exitCollider;
let shardsCollected = 0;
let hintCooldown = 0;

const tmpBox = new THREE.Box3();
const tmpBox2 = new THREE.Box3();
const tmpVec3 = new THREE.Vector3();

const baseColor = new THREE.Color('#28325a');
const accentColor = new THREE.Color('#ffae44');
const coolGlow = new THREE.Color('#69c4ff');

initLighting();
createPlayer();
createCastle();
createShards();
createMirrors();
createPit();
createExitDoor();

window.addEventListener('resize', onResize);
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});
canvas.addEventListener('click', () => {
  if (running && !pointerLocked) {
    canvas.requestPointerLock();
  }
});
canvas.addEventListener('mousemove', handleMouseMove);

startButton.addEventListener('click', () => {
  startGame();
});

replayButton.addEventListener('click', () => {
  startGame();
});

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function handleKeyDown(event) {
  keyState.set(event.code, true);
  if (event.code === 'Space') {
    attemptDash();
  }
}

function handleKeyUp(event) {
  keyState.set(event.code, false);
}

let yaw = 0;
let pitch = -0.25;

function handleMouseMove(event) {
  if (!pointerLocked) return;
  const sensitivity = 0.0025;
  yaw -= event.movementX * sensitivity;
  pitch -= event.movementY * sensitivity;
  pitch = Math.max(-0.75, Math.min(0.35, pitch));
}

function createPlayer() {
  player = new THREE.Group();
  player.position.set(0, PLAYER_HEIGHT * 0.5, 18);

  playerModel = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d4e4ff'),
    roughness: 0.4,
    metalness: 0.2,
  });

  const limbMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9fb8ff'),
    roughness: 0.3,
    metalness: 0.1,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.1, 12), bodyMaterial);
  body.position.y = 0.7;
  body.castShadow = true;
  playerModel.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), bodyMaterial);
  head.position.y = 1.35;
  head.castShadow = true;
  playerModel.add(head);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), limbMaterial);
  leftArm.position.set(-0.55, 0.75, 0);
  playerModel.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.55;
  playerModel.add(rightArm);

  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.2, 6, 12), limbMaterial);
  lower.position.y = 0.1;
  playerModel.add(lower);

  player.add(playerModel);
  scene.add(player);
}

function initLighting() {
  const ambient = new THREE.AmbientLight(0x1a2642, 0.75);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0x93a6ff, 0.9);
  keyLight.position.set(12, 20, 10);
  keyLight.castShadow = true;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const rim = new THREE.PointLight(0xff8e3c, 1.6, 40, 1.4);
  rim.position.set(-10, 8, -8);
  scene.add(rim);
}

function createCastle() {
  const floorMat = new THREE.MeshStandardMaterial({
    color: baseColor.clone().multiplyScalar(0.8),
    roughness: 0.6,
    metalness: 0.05,
  });

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 0.3, 48), floorMat);
  floor.receiveShadow = true;
  floor.rotation.x = Math.PI / 2;
  floor.position.y = -0.15;
  scene.add(floor);

  const roomConfigs = [
    { x: 0, z: 18, w: 12, d: 8, h: 6 },
    { x: 0, z: 0, w: 18, d: 16, h: 8 },
    { x: -16, z: 0, w: 10, d: 14, h: 7 },
    { x: 16, z: 0, w: 10, d: 14, h: 7 },
    { x: -14, z: -14, w: 10, d: 10, h: 7 },
    { x: 14, z: -14, w: 10, d: 10, h: 7 },
  ];

  roomConfigs.forEach((cfg) => createRoom(cfg));

  createArch({ x: 0, z: 10, width: 6, height: 4 });
  createArch({ x: 0, z: -8, width: 8, height: 5 });
  createArch({ x: -10, z: -8, width: 6, height: 4 });
  createArch({ x: 10, z: -8, width: 6, height: 4 });

  const pillarMaterial = new THREE.MeshStandardMaterial({
    color: baseColor.clone().multiplyScalar(1.1),
    roughness: 0.5,
    metalness: 0.2,
  });

  const pillarPositions = [
    [-8, 0, 8],
    [8, 0, 8],
    [-8, 0, -8],
    [8, 0, -8],
    [-16, 0, -10],
    [16, 0, -10],
    [-16, 0, 10],
    [16, 0, 10],
  ];

  pillarPositions.forEach(([x, y, z]) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 5.5, 12), pillarMaterial);
    pillar.position.set(x, 2.75, z);
    pillar.castShadow = true;
    scene.add(pillar);

    addCollider(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 2.75, z), new THREE.Vector3(1.6, 5.5, 1.6)));
  });
}

function createRoom({ x, z, w, d, h }) {
  const wallMat = new THREE.MeshStandardMaterial({
    color: baseColor.clone().multiplyScalar(1.2),
    roughness: 0.5,
    metalness: 0.15,
  });

  const wallThickness = 0.8;
  const halfW = w * 0.5;
  const halfD = d * 0.5;

  const walls = [
    { pos: [x, h * 0.5, z - halfD + wallThickness * 0.5], size: [w, h, wallThickness] },
    { pos: [x, h * 0.5, z + halfD - wallThickness * 0.5], size: [w, h, wallThickness] },
    { pos: [x - halfW + wallThickness * 0.5, h * 0.5, z], size: [wallThickness, h, d] },
    { pos: [x + halfW - wallThickness * 0.5, h * 0.5, z], size: [wallThickness, h, d] },
  ];

  walls.forEach((wall) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.size[0], wall.size[1], wall.size[2]), wallMat);
    mesh.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    addCollider(new THREE.Box3().setFromCenterAndSize(mesh.position.clone(), new THREE.Vector3().fromArray(wall.size)));
  });

  const trim = new THREE.Mesh(new THREE.TorusGeometry(Math.max(w, d) * 0.3, 0.2, 8, 48), new THREE.MeshStandardMaterial({
    color: coolGlow,
    emissive: coolGlow.clone().multiplyScalar(0.4),
    roughness: 0.6,
    metalness: 0.6,
  }));
  trim.rotation.x = Math.PI / 2;
  trim.position.set(x, 0.25, z);
  scene.add(trim);
}

function createArch({ x, z, width, height }) {
  const archMat = new THREE.MeshStandardMaterial({
    color: baseColor.clone().multiplyScalar(1.35),
    roughness: 0.45,
    metalness: 0.2,
  });

  const column = new THREE.BoxGeometry(0.6, height, 0.8);
  const lintel = new THREE.BoxGeometry(width, 0.7, 0.8);

  const left = new THREE.Mesh(column, archMat);
  const right = new THREE.Mesh(column, archMat);
  left.position.set(x - width * 0.5 + 0.3, height * 0.5, z);
  right.position.set(x + width * 0.5 - 0.3, height * 0.5, z);
  left.castShadow = right.castShadow = true;
  left.receiveShadow = right.receiveShadow = true;
  scene.add(left, right);

  const top = new THREE.Mesh(lintel, archMat);
  top.position.set(x, height + 0.35, z);
  top.castShadow = true;
  scene.add(top);

  addCollider(new THREE.Box3().setFromCenterAndSize(left.position.clone(), new THREE.Vector3(0.6, height, 0.8)));
  addCollider(new THREE.Box3().setFromCenterAndSize(right.position.clone(), new THREE.Vector3(0.6, height, 0.8)));
  addCollider(new THREE.Box3().setFromCenterAndSize(top.position.clone(), new THREE.Vector3(width, 0.7, 0.8)));
}

function addCollider(box) {
  colliders.push(box.clone());
}

function createShards() {
  const shardPositions = [
    new THREE.Vector3(-14, 1, -14),
    new THREE.Vector3(14, 1, -14),
    new THREE.Vector3(-14, 1, 6),
    new THREE.Vector3(14, 1, 6),
  ];

  const shardMaterial = new THREE.MeshStandardMaterial({
    color: coolGlow,
    emissive: coolGlow.clone().multiplyScalar(1.2),
    metalness: 0.6,
    roughness: 0.1,
    transparent: true,
    opacity: 0.9,
  });

  shardPositions.forEach((pos) => {
    const geom = new THREE.OctahedronGeometry(0.6, 0);
    const mesh = new THREE.Mesh(geom, shardMaterial.clone());
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.userData.pulse = Math.random() * Math.PI * 2;
    scene.add(mesh);

    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 16, 16),
      new THREE.MeshBasicMaterial({
        color: coolGlow,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
      })
    );
    aura.position.copy(pos);
    scene.add(aura);

    shardEntities.push({ mesh, aura, collected: false });
  });
}

function createMirrors() {
  const mirrorMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1a233e'),
    metalness: 1,
    roughness: 0.05,
    envMapIntensity: 1,
    emissive: new THREE.Color('#1d2f66').multiplyScalar(0.3),
  });

  const locations = [
    { position: new THREE.Vector3(-18.5, 2, -18.5), rotation: Math.PI / 2 },
    { position: new THREE.Vector3(18.5, 2, -18.5), rotation: Math.PI * 0.75 },
    { position: new THREE.Vector3(-18.5, 2, 10.5), rotation: Math.PI / 4 },
    { position: new THREE.Vector3(18.5, 2, 10.5), rotation: -Math.PI / 4 },
  ];

  locations.forEach((info) => {
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), mirrorMaterial);
    mirror.position.copy(info.position);
    mirror.rotation.y = info.rotation;
    mirror.castShadow = true;
    scene.add(mirror);

    const frame = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.6, 32), new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.6,
    }));
    frame.rotation.y = info.rotation;
    frame.position.copy(info.position.clone().add(new THREE.Vector3(0, 0.05, 0)));
    scene.add(frame);

    mirrors.push({ mesh: mirror, frame, audio: createMirrorAudio(info.position) });
  });
}

function createMirrorAudio(position) {
  const ctx = listener.context;
  const oscillator = ctx.createOscillator();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 220;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  const panner = ctx.createPanner();
  panner.distanceModel = 'inverse';
  panner.maxDistance = 60;
  panner.refDistance = 2;
  panner.rolloffFactor = 2.2;
  panner.positionX.value = position.x;
  panner.positionY.value = position.y;
  panner.positionZ.value = position.z;

  oscillator.connect(gain);
  gain.connect(panner);
  panner.connect(listener.getInput());
  oscillator.start();

  return { oscillator, gain, panner };
}

function createPit() {
  const geometry = new THREE.CylinderGeometry(2.2, 3.2, 0.5, 32, 1, true);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#05080f'),
    emissive: new THREE.Color('#1a4d7a'),
    emissiveIntensity: 1.6,
    roughness: 0.8,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  pit = new THREE.Mesh(geometry, material);
  pit.position.set(0, -0.1, -1);
  pit.rotation.x = Math.PI / 2;
  scene.add(pit);

  const swirl = new THREE.Mesh(new THREE.RingGeometry(0.8, 2, 48), new THREE.MeshBasicMaterial({
    color: new THREE.Color('#62c8ff'),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
  }));
  swirl.position.set(0, 0.01, -1);
  swirl.rotation.x = -Math.PI / 2;
  pit.add(swirl);
}

function createExitDoor() {
  const frameMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor.clone().multiplyScalar(0.4),
    metalness: 0.7,
    roughness: 0.2,
  });
  const portalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#18264c'),
    emissive: new THREE.Color('#4cc8ff'),
    emissiveIntensity: 2.5,
    transparent: true,
    opacity: 0.7,
  });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, 0.6), frameMat);
  frame.position.set(0, 2.1, -24);
  frame.visible = false;
  scene.add(frame);

  const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2), portalMat);
  portal.position.set(0, 2.1, -23.7);
  portal.visible = false;
  scene.add(portal);

  exitDoor = new THREE.Group();
  exitDoor.add(frame);
  exitDoor.add(portal);
  exitDoor.visible = false;
  scene.add(exitDoor);

  exitCollider = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 2, -23.8), new THREE.Vector3(2.4, 3.5, 1.2));
}

function createAmbientSoundscape() {
  if (ambientStarted) return;
  const ctx = listener.context;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.06;
  padGain.connect(listener.getInput());

  const oscA = ctx.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.value = 68;
  oscA.detune.value = -12;
  oscA.connect(padGain);

  const oscB = ctx.createOscillator();
  oscB.type = 'triangle';
  oscB.frequency.value = 112;
  oscB.detune.value = 7;
  oscB.connect(padGain);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain);
  lfoGain.connect(oscB.frequency);

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.05;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.02;
  noise.connect(noiseGain);
  noiseGain.connect(listener.getInput());

  oscA.start();
  oscB.start();
  lfo.start();
  noise.start();

  ambientStarted = true;
}

function attemptDash() {
  if (!running) return;
  if (dashCooldown > 0 || dashTimer > 0) return;
  dashTimer = 0.32;
  dashCooldown = 1.4;
  playTone({ frequency: 420, duration: 0.25, type: 'sawtooth', volume: 0.18, position: player.position });
}

function startGame() {
  overlay.style.display = 'none';
  hud.hidden = false;
  hintText.classList.remove('visible');
  document.body.style.cursor = 'none';
  canvas.requestPointerLock();

  listener.context.resume();
  createAmbientSoundscape();

  resetGame();
  running = true;
  startTimestamp = performance.now();
  clock.getDelta();
}

function resetGame() {
  shardsCollected = 0;
  shardEntities.forEach((shard) => {
    shard.collected = false;
    shard.mesh.visible = true;
    shard.aura.visible = true;
    shard.mesh.material.opacity = 0.9;
  });
  updateShardCounter();
  exitDoor.visible = false;
  exitDoor.children.forEach((child) => (child.visible = false));

  player.position.set(0, PLAYER_HEIGHT * 0.5, 18);
  yaw = Math.PI;
  pitch = -0.2;
  player.rotation.y = yaw;
  if (playerModel) {
    playerModel.userData.walkCycle = 0;
    playerModel.position.y = 0;
  }

  teleportState = 'idle';
  teleportTimer = 0;
  lastTeleportIndex = -1;
  shakeTimer = 0;
  shakeStrength = 0;
  dashTimer = 0;
  dashCooldown = 0;
  hintCooldown = 0;
  elapsedTime = 0;

  hintText.classList.remove('visible');
  hintText.textContent = '';

  particles.splice(0, particles.length);

  teleportDestinations.splice(0, teleportDestinations.length, new THREE.Vector3(-14, PLAYER_HEIGHT * 0.5, 4), new THREE.Vector3(14, PLAYER_HEIGHT * 0.5, 4), new THREE.Vector3(-6, PLAYER_HEIGHT * 0.5, -16), new THREE.Vector3(6, PLAYER_HEIGHT * 0.5, -16));

  mirrors.forEach((mirror) => {
    mirror.audio.gain.gain.setValueAtTime(0.0, listener.context.currentTime);
  });

  startPanel.hidden = false;
  endPanel.hidden = true;
}

function updateShardCounter() {
  shardCounter.textContent = `Shards: ${shardsCollected} / ${TOTAL_SHARDS}`;
}

function updateGame(dt) {
  elapsedTime = (performance.now() - startTimestamp) / 1000;
  handleMovement(dt);
  animatePlayer(dt);
  updateShards(dt);
  updateMirrors(dt);
  updateParticles(dt);
  updateTeleport(dt);
  updateCamera(dt);
  updateHint(dt);
}

const moveDirection = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const candidatePosition = new THREE.Vector3();

function handleMovement(dt) {
  const moveSpeed = dashTimer > 0 ? 9 : 4.2;
  if (dashTimer > 0) {
    dashTimer -= dt;
  }
  if (dashCooldown > 0) {
    dashCooldown -= dt;
  }

  moveDirection.set(0, 0, 0);
  const forwardPressed = keyState.get('KeyW') || keyState.get('ArrowUp');
  const backwardPressed = keyState.get('KeyS') || keyState.get('ArrowDown');
  const leftPressed = keyState.get('KeyA') || keyState.get('ArrowLeft');
  const rightPressed = keyState.get('KeyD') || keyState.get('ArrowRight');

  forward.set(0, 0, -1).applyAxisAngle(THREE.Object3D.DefaultUp, yaw);
  right.set(1, 0, 0).applyAxisAngle(THREE.Object3D.DefaultUp, yaw);

  if (forwardPressed) moveDirection.add(forward);
  if (backwardPressed) moveDirection.sub(forward);
  if (leftPressed) moveDirection.sub(right);
  if (rightPressed) moveDirection.add(right);

  if (moveDirection.lengthSq() > 0) {
    moveDirection.normalize();
  }

  const speed = moveSpeed * dt;
  const displacement = moveDirection.clone().multiplyScalar(speed);
  candidatePosition.copy(player.position).add(displacement);

  if (!collides(candidatePosition)) {
    player.position.copy(candidatePosition);
  }

  // keep player within play area radius
  const radius = Math.max(Math.abs(player.position.x), Math.abs(player.position.z));
  if (radius > 22) {
    player.position.x = THREE.MathUtils.clamp(player.position.x, -22, 22);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -22, 22);
  }

  player.position.y = PLAYER_HEIGHT * 0.5;

  player.rotation.y = THREE.MathUtils.lerpAngle(player.rotation.y, yaw, 0.08);
}

function collides(nextPosition) {
  tmpBox.min.set(nextPosition.x - PLAYER_RADIUS, COLLIDER_Y_MIN, nextPosition.z - PLAYER_RADIUS);
  tmpBox.max.set(nextPosition.x + PLAYER_RADIUS, COLLIDER_Y_MIN + PLAYER_HEIGHT, nextPosition.z + PLAYER_RADIUS);

  for (let i = 0; i < colliders.length; i++) {
    const collider = colliders[i];
    if (tmpBox.intersectsBox(collider)) {
      return true;
    }
  }

  if (teleportState === 'idle') {
    const pitCenter = pit.getWorldPosition(tmpVec3);
    const distance = Math.hypot(nextPosition.x - pitCenter.x, nextPosition.z - pitCenter.z);
    if (distance < 2.2) {
      beginTeleport();
    }
  }

  if (exitDoor.visible) {
    tmpBox2.copy(exitCollider);
    if (tmpBox.intersectsBox(tmpBox2)) {
      finishGame();
      return true;
    }
  }

  return false;
}

function animatePlayer(dt) {
  const moving = moveDirection.lengthSq() > 0.001;
  playerModel.userData.walkCycle = playerModel.userData.walkCycle || 0;
  if (moving) {
    playerModel.userData.walkCycle += dt * (dashTimer > 0 ? 12 : 6);
  } else {
    playerModel.userData.walkCycle += dt * 2;
  }
  const cycle = playerModel.userData.walkCycle;
  const bob = Math.sin(cycle) * (moving ? 0.08 : 0.03);
  playerModel.position.y = bob;

  const swing = Math.sin(cycle * 2) * (moving ? 0.3 : 0.08);
  playerModel.children.forEach((child, index) => {
    if (index === 1) return; // keep head stable
    child.rotation.z = swing * 0.1;
    child.rotation.x = swing * 0.2;
  });
}

function updateShards(dt) {
  shardEntities.forEach((shard) => {
    if (shard.collected) return;
    shard.mesh.rotation.y += dt * 0.7;
    shard.mesh.rotation.x += dt * 0.4;
    shard.userData = shard.userData || {};
    shard.mesh.userData.pulse += dt * 2;
    const scale = 1 + Math.sin(shard.mesh.userData.pulse) * 0.08;
    shard.mesh.scale.setScalar(scale);
    shard.aura.scale.setScalar(1 + Math.sin(shard.mesh.userData.pulse * 1.2) * 0.1);

    const distance = shard.mesh.position.distanceTo(player.position);
    if (distance < 1.4) {
      collectShard(shard);
    }
  });
}

function collectShard(shard) {
  shard.collected = true;
  shard.mesh.visible = false;
  shard.aura.visible = false;
  shardsCollected += 1;
  updateShardCounter();
  createPickupBurst(shard.mesh.position);
  playTone({ frequency: 620, duration: 0.4, type: 'triangle', volume: 0.22, position: shard.mesh.position });

  if (shardsCollected === TOTAL_SHARDS) {
    revealExit();
  }
}

function createPickupBurst(position) {
  const count = 36;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.4;
    const y = Math.random() * 0.6;
    positions[i * 3 + 0] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    velocities.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: coolGlow,
    size: 0.12,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);
  particles.push({ points, velocities, life: 0 });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.life += dt;
    const positions = particle.points.geometry.getAttribute('position');
    for (let j = 0; j < particle.velocities.length; j++) {
      const vel = particle.velocities[j];
      vel.y -= dt * 1.2;
      positions.array[j * 3 + 0] += vel.x * dt * 3;
      positions.array[j * 3 + 1] += vel.y * dt * 3;
      positions.array[j * 3 + 2] += vel.z * dt * 3;
    }
    positions.needsUpdate = true;
    particle.points.material.opacity = THREE.MathUtils.lerp(particle.points.material.opacity, 0, dt * 1.5);

    if (particle.life > 1.2) {
      scene.remove(particle.points);
      particle.points.geometry.dispose();
      particle.points.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function revealExit() {
  exitDoor.visible = true;
  exitDoor.children.forEach((child) => (child.visible = true));
  playTone({ frequency: 340, duration: 0.6, type: 'sine', volume: 0.25 });
  hintText.textContent = 'Portal door awakens in the northern hall.';
  hintText.classList.add('visible');
  hintCooldown = 6;
}

function updateMirrors(dt) {
  const remaining = TOTAL_SHARDS - shardsCollected;
  const ctx = listener.context;
  const now = ctx.currentTime;

  mirrors.forEach((mirror) => {
    const { oscillator, gain } = mirror.audio;
    if (remaining <= 0) {
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      return;
    }

    let nearest = Infinity;
    shardEntities.forEach((shard) => {
      if (shard.collected) return;
      const dist = mirror.mesh.position.distanceTo(shard.mesh.position);
      if (dist < nearest) {
        nearest = dist;
      }
    });

    oscillator.frequency.setTargetAtTime(180 + (30 - Math.min(nearest, 30)) * 6, now, 0.3);
    const intensity = THREE.MathUtils.mapLinear(Math.min(nearest, 20), 0, 20, 0.28, 0.05);
    gain.gain.linearRampToValueAtTime(intensity, now + 0.1);

    mirror.frame.rotation.z += dt * 0.8;
  });
}

function updateHint(dt) {
  if (hintCooldown > 0) {
    hintCooldown -= dt;
    if (hintCooldown <= 0) {
      hintText.classList.remove('visible');
    }
    return;
  }

  let activeHint = null;

  mirrors.forEach((mirror) => {
    const distance = mirror.mesh.position.distanceTo(player.position);
    if (distance < 5 && shardsCollected < TOTAL_SHARDS) {
      const nearest = getNearestShardDirection();
      activeHint = `Mirror hums toward the ${nearest}.`;
    }
  });

  if (!activeHint) {
    hintText.classList.remove('visible');
    return;
  }

  hintText.textContent = activeHint;
  hintText.classList.add('visible');
}

function getNearestShardDirection() {
  let nearestShard = null;
  let nearestDistance = Infinity;
  shardEntities.forEach((shard) => {
    if (shard.collected) return;
    const dist = shard.mesh.position.distanceTo(player.position);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestShard = shard.mesh.position;
    }
  });

  if (!nearestShard) return 'silence';

  const direction = nearestShard.clone().sub(player.position);
  const angle = Math.atan2(direction.x, direction.z);
  const cardinal = Math.round((angle / (Math.PI / 4) + 8)) % 8;
  const directions = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
  return directions[cardinal];
}

function beginTeleport() {
  teleportState = 'fadingOut';
  teleportTimer = 0;
  fadeLayer.classList.add('active');
  playTone({ frequency: 160, duration: 0.8, type: 'sine', volume: 0.3, position: player.position });
  shakeTimer = 0.7;
  shakeStrength = 0.08;
}

function updateTeleport(dt) {
  if (teleportState === 'idle') return;
  teleportTimer += dt;

  if (teleportState === 'fadingOut' && teleportTimer > 0.6) {
    teleportTimer = 0;
    teleportState = 'fadingIn';

    let targetIndex = Math.floor(Math.random() * teleportDestinations.length);
    if (targetIndex === lastTeleportIndex) {
      targetIndex = (targetIndex + 1) % teleportDestinations.length;
    }
    lastTeleportIndex = targetIndex;
    const target = teleportDestinations[targetIndex];
    player.position.copy(target);
    tmpVec3.set(-target.x, 0, -target.z);
    yaw = Math.atan2(tmpVec3.x, -tmpVec3.z);
    playTone({ frequency: 380, duration: 0.5, type: 'triangle', volume: 0.22, position: target });
  } else if (teleportState === 'fadingIn' && teleportTimer > 0.6) {
    fadeLayer.classList.remove('active');
    teleportState = 'idle';
  }

  if (shakeTimer > 0) {
    shakeTimer -= dt;
    shakeStrength = THREE.MathUtils.lerp(shakeStrength, 0, dt * 2.5);
  }
}

const cameraOffset = new THREE.Vector3(0, 4.2, 7.5);
const cameraTarget = new THREE.Vector3();
const cameraShakeOffset = new THREE.Vector3();

function updateCamera(dt) {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  cameraTarget.copy(player.position);
  cameraTarget.y += 1.2;

  tmpVec3.copy(cameraOffset).applyQuaternion(rotation);
  const desiredPos = cameraTarget.clone().add(tmpVec3);

  camera.position.lerp(desiredPos, 0.08);
  camera.lookAt(cameraTarget);

  if (shakeTimer > 0) {
    cameraShakeOffset.set(
      (Math.random() - 0.5) * shakeStrength,
      (Math.random() - 0.5) * shakeStrength,
      (Math.random() - 0.5) * shakeStrength
    );
    camera.position.add(cameraShakeOffset);
  }
}

function updateTeleportVisual(dt) {
  if (!pit) return;
  pit.rotation.z += dt * 0.2;
}

function updateLoop() {
  requestAnimationFrame(updateLoop);
  const dt = clock.getDelta();
  if (running) {
    updateGame(dt);
  }
  updateTeleportVisual(dt);
  renderer.render(scene, camera);
}

updateLoop();

function playTone({ frequency, duration, type = 'sine', volume = 0.2, position = null }) {
  const ctx = listener.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.5), ctx.currentTime + duration);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  osc.connect(gain);

  if (position) {
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 50;
    panner.rolloffFactor = 1.8;
    panner.positionX.setValueAtTime(position.x, ctx.currentTime);
    panner.positionY.setValueAtTime(position.y, ctx.currentTime);
    panner.positionZ.setValueAtTime(position.z, ctx.currentTime);
    gain.connect(panner);
    panner.connect(listener.getInput());
  } else {
    gain.connect(listener.getInput());
  }

  osc.start();
  osc.stop(ctx.currentTime + duration + 0.1);
}

function finishGame() {
  running = false;
  document.exitPointerLock();
  document.body.style.cursor = 'auto';
  const time = elapsedTime.toFixed(1);
  summary.textContent = `You gathered every shard in ${time} seconds. The gates open once more.`;
  endPanel.hidden = false;
  startPanel.hidden = true;
  overlay.style.display = '';
  hud.hidden = true;
}
