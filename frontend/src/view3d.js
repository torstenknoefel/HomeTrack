// Read-only 3D preview of the plan. Plan (x, y) maps to world (x, z);
// world y is height. Renders on demand rather than every frame.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { northVector, planBounds, sortedFloors } from "./model.js";

const COLORS = { room: 0x5c9ded, active: 0x03a9f4, selected: 0xff9800, receiver: 0x43a047, wall: 0x90a4ae };

export class Plan3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.render());

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(10, 20, 8);
    this.scene.add(sun);

    this.content = new THREE.Group();
    this.scene.add(this.content);
    this._fitted = false;

    this._resize = new ResizeObserver(() => this.resize());
    this._resize.observe(container);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The first real size arrives after the initial fit; refit once for it.
    if (!this._sized && this._fitPlan) this.fit(this._fitPlan);
    this._sized = true;
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Point the camera at the whole house, sized to the current viewport. */
  fit(plan) {
    this._fitPlan = plan;
    // Generous padding so the north arrow just outside the house stays in view.
    const b = planBounds(plan, null, 2.5);
    const floors = sortedFloors(plan);
    const top = floors.length ? floors[floors.length - 1] : { elevation: 0, height: 2.5 };
    const topY = top.elevation + top.height;
    // Include cellars: the lowest floor may sit below ground level (y = 0).
    const bottomY = Math.min(0, floors.length ? floors[0].elevation : 0);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minY + b.maxY) / 2, cy = (topY + bottomY) / 2;
    const radius = Math.max(2, 0.5 * Math.hypot(b.maxX - b.minX, b.maxY - b.minY, topY - bottomY));
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const distance = (radius / Math.sin(half)) / Math.min(1, this.camera.aspect) * 0.85;
    const dir = new THREE.Vector3(0.55, 0.6, 0.75).normalize();
    this.controls.target.set(cx, cy, cz);
    this.camera.position.set(cx + dir.x * distance, cy + dir.y * distance, cz + dir.z * distance);
    this.controls.update();
    this._fitted = true;
  }

  update(plan, { activeFloorId, selection, isolate = false }) {
    disposeGroup(this.content);
    const floors = new Map(plan.floors.map((f) => [f.id, f]));
    const b = planBounds(plan, null, 1);

    const grid = new THREE.GridHelper(Math.ceil(Math.max(b.maxX - b.minX, b.maxY - b.minY)) + 2, Math.ceil(Math.max(b.maxX - b.minX, b.maxY - b.minY)) + 2, 0x888888, 0xcccccc);
    grid.position.set((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.content.add(grid);
    this.content.add(northArrow(plan, b));

    for (const room of plan.rooms) {
      const floor = floors.get(room.floor_id);
      if (!floor || (isolate && floor.id !== activeFloorId)) continue;
      const active = floor.id === activeFloorId;
      const selected = selection?.kind === "room" && selection.id === room.id;
      this.content.add(roomMesh(room, floor, active, selected));
    }

    for (const r of plan.receivers) {
      const floor = floors.get(r.floor_id);
      if (!floor || (isolate && floor.id !== activeFloorId)) continue;
      const selected = selection?.kind === "receiver" && selection.id === r.id;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(selected ? 0.16 : 0.12, 20, 14),
        new THREE.MeshStandardMaterial({ color: selected ? COLORS.selected : COLORS.receiver }),
      );
      ball.position.set(r.x, floor.elevation + r.z, r.y);
      this.content.add(ball);
      // A thin stalk down to the floor makes the height readable.
      const stalk = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(r.x, floor.elevation, r.y),
          new THREE.Vector3(r.x, floor.elevation + r.z, r.y),
        ]),
        new THREE.LineBasicMaterial({ color: COLORS.receiver }),
      );
      this.content.add(stalk);
    }

    if (!this._fitted) this.fit(plan);
    this.render();
  }

  dispose() {
    this._resize.disconnect();
    disposeGroup(this.content);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function roomMesh(room, floor, active, selected) {
  const group = new THREE.Group();
  const color = selected ? COLORS.selected : active ? COLORS.active : COLORS.room;
  const y0 = floor.elevation, h = floor.height;

  // Floor slab.
  const shape = new THREE.Shape(room.polygon.map(([x, y]) => new THREE.Vector2(x, y)));
  const slab = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: active ? 0.45 : 0.2, side: THREE.DoubleSide, depthWrite: false }),
  );
  slab.rotation.x = Math.PI / 2; // plan y -> world z
  slab.position.y = y0 + 0.01;
  group.add(slab);

  // Walls: translucent quads plus crisp outlines.
  const n = room.polygon.length;
  const wallPos = [], linePos = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = room.polygon[i];
    const [bx, bz] = room.polygon[(i + 1) % n];
    wallPos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az);
    linePos.push(ax, y0, az, bx, y0, bz, ax, y0 + h, az, bx, y0 + h, bz, ax, y0, az, ax, y0 + h, az);
  }
  const wallGeom = new THREE.BufferGeometry();
  wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeom.computeVertexNormals();
  group.add(new THREE.Mesh(wallGeom, new THREE.MeshStandardMaterial({
    color: COLORS.wall, transparent: true, opacity: active ? 0.18 : 0.07, side: THREE.DoubleSide, depthWrite: false,
  })));
  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  group.add(new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: active || selected ? 0.9 : 0.35,
  })));
  return group;
}

/** A flat red arrow on the ground just outside the house, pointing north, with an "N". */
function northArrow(plan, b) {
  const [nx, nz] = northVector(plan.north);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minY + b.maxY) / 2;
  const reach = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + 0.3;
  const len = 1.6;
  const start = new THREE.Vector3(cx + nx * reach, 0.02, cz + nz * reach);
  const dir = new THREE.Vector3(nx, 0, nz);
  const group = new THREE.Group();
  const red = new THREE.MeshBasicMaterial({ color: 0xe53935 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len - 0.4, 8), red);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 16), red.clone());
  // Cylinder and cone point along +y; turn them to lie along `dir`.
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  shaft.quaternion.copy(q); head.quaternion.copy(q);
  shaft.position.copy(start).addScaledVector(dir, (len - 0.4) / 2);
  head.position.copy(start).addScaledVector(dir, len - 0.2);
  group.add(shaft, head);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e53935";
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 32, 34);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  label.scale.set(0.6, 0.6, 0.6);
  label.position.copy(start).addScaledVector(dir, len + 0.4).setY(0.35);
  group.add(label);
  return group;
}

function disposeGroup(group) {
  group.traverse((obj) => {
    obj.geometry?.dispose();
    if (obj.material) [].concat(obj.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
  });
  group.clear();
}
