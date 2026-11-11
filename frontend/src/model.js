// Pure plan and geometry helpers (no DOM), unit-tested in test/model.test.js.
// Plan coordinates are metres; y grows "down" the screen in the 2D editor and
// maps to +z in the 3D view. Floor elevations are relative to the plan's
// reference floor, which is always at 0 m.

export const PLAN_VERSION = 1;
export const DEFAULT_RECEIVER_Z = 0.4;
export const DEFAULT_STOREY = 2.5;

export function defaultPlan() {
  return {
    version: PLAN_VERSION,
    north: 0,
    reference_floor_id: "ground",
    floors: [{ id: "ground", name: "Ground floor", elevation: 0, height: DEFAULT_STOREY, ha_floor_id: null }],
    rooms: [],
    receivers: [],
  };
}

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const round = (v, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;

export function snap(v, step) {
  return step > 0 ? round(Math.round(v / step) * step) : v;
}

/** Angle in degrees normalised to [0, 360). */
export function normalizeAngle(deg) {
  const a = round(((deg % 360) + 360) % 360, 2);
  return a === 360 ? 0 : a;
}

/**
 * Unit vector pointing north on the plan. `north` is degrees clockwise from
 * "up" on the plan (the -y direction), so 0 gives [0, -1] and 90 gives [1, 0].
 */
export function northVector(north) {
  const r = ((north || 0) * Math.PI) / 180;
  return [round(Math.sin(r), 9) + 0, round(-Math.cos(r), 9) + 0]; // "+ 0" turns -0 into 0
}

/** Compass bearing (0 = north, 90 = east) of a direction [dx, dy] on the plan. */
export function bearing(north, [dx, dy]) {
  const up = (Math.atan2(dx, -dy) * 180) / Math.PI; // clockwise from plan "up"
  return normalizeAngle(up - (north || 0));
}

/** The reference floor: the one named by reference_floor_id, else the floor at 0 m, else the lowest. */
export function referenceFloor(plan) {
  return plan.floors.find((f) => f.id === plan.reference_floor_id)
    || plan.floors.find((f) => f.elevation === 0)
    || sortedFloors(plan)[0];
}

/**
 * Make `floorId` the reference floor: every elevation shifts so that floor is
 * at 0 m. Nothing moves relative to anything else. Returns a new plan.
 */
export function setReferenceFloor(plan, floorId) {
  const ref = plan.floors.find((f) => f.id === floorId);
  if (!ref) return plan;
  const shift = ref.elevation;
  return {
    ...plan,
    reference_floor_id: floorId,
    floors: plan.floors.map((f) => ({ ...f, elevation: round(f.elevation - shift) })),
  };
}

/** Fill in defaults for older plans and make sure the reference floor is at 0 m. */
export function normalizePlan(plan) {
  const withDefaults = {
    ...plan,
    north: plan.north || 0,
    floors: plan.floors.map((f) => ({ ha_floor_id: null, ...f })),
  };
  return setReferenceFloor(withDefaults, referenceFloor(withDefaults).id);
}

/**
 * Display name of a room or floor: the Home Assistant area/floor name when it
 * is linked and still exists, otherwise the plan's own name.
 */
export function roomName(room, areas) {
  return (room.area_id && areas?.[room.area_id]?.name) || room.name || "Unnamed";
}

export function floorName(floor, haFloors) {
  return (floor.ha_floor_id && haFloors?.[floor.ha_floor_id]?.name) || floor.name || "Floor";
}

export function sortedFloors(plan) {
  return [...plan.floors].sort((a, b) => a.elevation - b.elevation);
}

/** The floor directly below `floorId`, or null. */
export function floorBelow(plan, floorId) {
  const floors = sortedFloors(plan);
  const i = floors.findIndex((f) => f.id === floorId);
  return i > 0 ? floors[i - 1] : null;
}

/** A new floor stacked on top of the highest one. */
export function newFloorAbove(plan) {
  const floors = sortedFloors(plan);
  const top = floors[floors.length - 1];
  const elevation = top ? round(top.elevation + top.height) : 0;
  return { id: uid("floor"), name: `Floor ${floors.length}`, elevation, height: DEFAULT_STOREY };
}

/** A new floor directly below the lowest one, for cellars and basements. */
export function newFloorBelow(plan) {
  const floors = sortedFloors(plan);
  const bottom = floors[0];
  const elevation = bottom ? round(bottom.elevation - DEFAULT_STOREY) : -DEFAULT_STOREY;
  const n = floors.filter((f) => f.elevation < 0).length;
  return { id: uid("floor"), name: n ? `Basement ${n + 1}` : "Basement", elevation, height: DEFAULT_STOREY };
}

export function translatePolygon(poly, dx, dy) {
  return poly.map(([x, y]) => [round(x + dx), round(y + dy)]);
}

/**
 * Set the length of wall i (corner i to corner i+1) by stretching the room
 * along that wall: every corner beyond the wall's midpoint moves by the
 * difference. Rectangles stay rectangles; the opposite wall follows.
 */
export function setEdgeLength(poly, i, length) {
  const a = poly[i], b = poly[(i + 1) % poly.length];
  const len = dist(a, b);
  if (!(length > 0) || len < 1e-9) return poly;
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const delta = length - len;
  return poly.map(([x, y]) => {
    const t = (x - a[0]) * ux + (y - a[1]) * uy;
    return t > len / 2 + 1e-9 ? [round(x + ux * delta), round(y + uy * delta)] : [x, y];
  });
}

/** Lengths of all walls; wall i runs from corner i to corner i+1. */
export function edgeLengths(poly) {
  return poly.map((a, i) => dist(a, poly[(i + 1) % poly.length]));
}

/** Shoelace area, always positive (m²). */
export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function perimeter(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length]);
  return s;
}

/** Area-weighted centroid; falls back to the vertex mean for degenerate shapes. */
export function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Closest point on segment ab to p: { d, t, point }. */
export function projectToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  const point = [a[0] + t * dx, a[1] + t * dy];
  return { d: dist(p, point), t, point };
}

/** Index of the polygon edge nearest to p (edge i runs from vertex i to i+1). */
export function nearestEdge(p, poly) {
  let best = { index: -1, d: Infinity, point: null };
  for (let i = 0; i < poly.length; i++) {
    const r = projectToSegment(p, poly[i], poly[(i + 1) % poly.length]);
    if (r.d < best.d) best = { index: i, d: r.d, point: r.point };
  }
  return best;
}

/** Nearest vertex among `polys` within maxDist, or null. */
export function nearestVertex(p, polys, maxDist) {
  let best = null, bestD = maxDist;
  for (const poly of polys) {
    for (const v of poly) {
      const d = dist(p, v);
      if (d <= bestD) { best = v; bestD = d; }
    }
  }
  return best ? [best[0], best[1]] : null;
}

/** Lock p to the horizontal or vertical line through `from`. */
export function orthogonal(from, p) {
  return Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]];
}

export function rectangle(a, b) {
  const [x1, x2] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y1, y2] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

/** Bounding box of everything in the plan (optionally one floor), with padding. */
export function planBounds(plan, floorId = null, pad = 1) {
  const pts = [];
  for (const r of plan.rooms) if (!floorId || r.floor_id === floorId) pts.push(...r.polygon);
  for (const r of plan.receivers) if (!floorId || r.floor_id === floorId) pts.push([r.x, r.y]);
  if (!pts.length) return { minX: -pad, minY: -pad, maxX: 10 + pad, maxY: 8 + pad, empty: true };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad, empty: false,
  };
}

/** Room on `floorId` containing p (smallest one if rooms overlap). */
export function roomAt(plan, floorId, p) {
  const hits = plan.rooms.filter((r) => r.floor_id === floorId && pointInPolygon(p, r.polygon));
  hits.sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon));
  return hits[0] || null;
}

/**
 * Remove a floor and everything on it. Refuses to remove the last floor.
 * If it was the reference floor, the floor closest to 0 m takes over.
 */
export function removeFloor(plan, floorId) {
  if (plan.floors.length <= 1) return plan;
  const next = {
    ...plan,
    floors: plan.floors.filter((f) => f.id !== floorId),
    rooms: plan.rooms.filter((r) => r.floor_id !== floorId),
    receivers: plan.receivers.filter((r) => r.floor_id !== floorId),
  };
  if (plan.reference_floor_id !== floorId) return next;
  const closest = [...next.floors].sort((a, b) => Math.abs(a.elevation) - Math.abs(b.elevation))[0];
  return setReferenceFloor(next, closest.id);
}
