import test from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/model.js";

const square = [[0, 0], [4, 0], [4, 3], [0, 3]];

test("area, perimeter and centroid of a rectangle", () => {
  assert.equal(m.polygonArea(square), 12);
  assert.equal(m.perimeter(square), 14);
  assert.deepEqual(m.centroid(square), [2, 1.5]);
});

test("area is positive for either winding", () => {
  assert.equal(m.polygonArea([...square].reverse()), 12);
});

test("point in polygon", () => {
  assert.equal(m.pointInPolygon([1, 1], square), true);
  assert.equal(m.pointInPolygon([5, 1], square), false);
  const lShape = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]];
  assert.equal(m.pointInPolygon([2, 2], lShape), false);
  assert.equal(m.pointInPolygon([0.5, 2], lShape), true);
});

test("snap rounds to the step without float noise", () => {
  assert.equal(m.snap(1.234, 0.1), 1.2);
  assert.equal(m.snap(0.3, 0.1), 0.3);
  assert.equal(m.snap(2.6, 0.25), 2.5);
  assert.equal(m.snap(1.234, 0), 1.234);
});

test("orthogonal locks to the dominant axis", () => {
  assert.deepEqual(m.orthogonal([0, 0], [3, 0.4]), [3, 0]);
  assert.deepEqual(m.orthogonal([0, 0], [0.2, -2]), [0, -2]);
});

test("nearest vertex and edge", () => {
  assert.deepEqual(m.nearestVertex([3.9, 0.1], [square], 0.3), [4, 0]);
  assert.equal(m.nearestVertex([2, 2], [square], 0.3), null);
  const e = m.nearestEdge([2, -0.2], square);
  assert.equal(e.index, 0);
  assert.deepEqual(e.point, [2, 0]);
});

test("rectangle normalises corners", () => {
  assert.deepEqual(m.rectangle([4, 3], [0, 0]), square);
});

test("new floors stack on top", () => {
  const plan = m.defaultPlan();
  const f = m.newFloorAbove(plan);
  assert.equal(f.elevation, 2.5);
  plan.floors.push(f);
  assert.equal(m.floorBelow(plan, f.id).id, "ground");
  assert.equal(m.floorBelow(plan, "ground"), null);
});

test("removeFloor drops its rooms and receivers but keeps the last floor", () => {
  const plan = m.defaultPlan();
  const up = m.newFloorAbove(plan);
  plan.floors.push(up);
  plan.rooms.push({ id: "r1", name: "Bed", floor_id: up.id, area_id: null, polygon: square });
  plan.receivers.push({ id: "x1", name: "P", floor_id: up.id, x: 1, y: 1, z: 0.4, source: null });
  const after = m.removeFloor(plan, up.id);
  assert.equal(after.floors.length, 1);
  assert.equal(after.rooms.length, 0);
  assert.equal(after.receivers.length, 0);
  assert.equal(m.removeFloor(after, "ground"), after);
});

test("roomAt prefers the smallest containing room", () => {
  const plan = m.defaultPlan();
  plan.rooms.push({ id: "big", name: "", floor_id: "ground", polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] });
  plan.rooms.push({ id: "small", name: "", floor_id: "ground", polygon: square });
  assert.equal(m.roomAt(plan, "ground", [1, 1]).id, "small");
  assert.equal(m.roomAt(plan, "ground", [8, 8]).id, "big");
  assert.equal(m.roomAt(plan, "ground", [20, 8]), null);
});

test("floors can be added below for cellars", () => {
  const plan = m.defaultPlan();
  const f = m.newFloorBelow(plan);
  assert.equal(f.elevation, -2.5);
  assert.equal(f.name, "Basement");
  plan.floors.push(f);
  assert.equal(m.sortedFloors(plan)[0].id, f.id);
  assert.equal(m.newFloorBelow(plan).elevation, -5);
  assert.equal(m.newFloorBelow(plan).name, "Basement 2");
});

test("translatePolygon moves every corner", () => {
  assert.deepEqual(m.translatePolygon(square, 1, -0.5), [[1, -0.5], [5, -0.5], [5, 2.5], [1, 2.5]]);
});

test("setEdgeLength stretches a rectangle and keeps it rectangular", () => {
  const wider = m.setEdgeLength(square, 0, 5);
  assert.deepEqual(wider, [[0, 0], [5, 0], [5, 3], [0, 3]]);
  const taller = m.setEdgeLength(wider, 1, 3.5);
  assert.deepEqual(taller, [[0, 0], [5, 0], [5, 3.5], [0, 3.5]]);
  assert.deepEqual(m.edgeLengths(taller), [5, 3.5, 5, 3.5]);
  // Editing the wall that wraps around (corner 4 -> 1) works too.
  assert.deepEqual(m.edgeLengths(m.setEdgeLength(square, 3, 2)), [4, 2, 4, 2]);
});

test("setEdgeLength stretches an L-shape along the wall", () => {
  const l = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]];
  const out = m.setEdgeLength(l, 0, 6);
  assert.deepEqual(out, [[0, 0], [6, 0], [6, 1], [1, 1], [1, 3], [0, 3]]);
});

test("setEdgeLength ignores invalid lengths", () => {
  assert.equal(m.setEdgeLength(square, 0, 0), square);
  assert.equal(m.setEdgeLength(square, 0, NaN), square);
});

test("north direction helpers", () => {
  assert.deepEqual(m.northVector(0), [0, -1]);
  assert.deepEqual(m.northVector(90), [1, 0]);
  assert.deepEqual(m.northVector(180), [0, 1]);
  assert.equal(m.normalizeAngle(-90), 270);
  assert.equal(m.normalizeAngle(360), 0);
  assert.equal(m.normalizeAngle(725), 5);
  // With north pointing right (+x), a wall facing up the plan faces west.
  assert.equal(m.bearing(90, [0, -1]), 270);
  assert.equal(m.bearing(90, [1, 0]), 0);
  assert.equal(m.bearing(0, [0, 1]), 180);
  assert.equal(m.defaultPlan().north, 0);
});

test("setReferenceFloor shifts elevations so the chosen floor is at 0 m", () => {
  const plan = {
    ...m.defaultPlan(),
    floors: [
      { id: "lower", name: "Lower", elevation: 0, height: 2.5, ha_floor_id: null },
      { id: "entrance", name: "Entrance", elevation: 2.7, height: 2.5, ha_floor_id: null },
      { id: "upper", name: "Upper", elevation: 5.4, height: 2.4, ha_floor_id: null },
    ],
    reference_floor_id: "lower",
  };
  const out = m.setReferenceFloor(plan, "entrance");
  assert.equal(out.reference_floor_id, "entrance");
  assert.deepEqual(out.floors.map((f) => f.elevation), [-2.7, 0, 2.7]);
  assert.equal(plan.floors[0].elevation, 0); // original untouched
  assert.equal(m.setReferenceFloor(plan, "nope"), plan);
});

test("normalizePlan fills defaults and puts the reference floor at 0 m", () => {
  const old = { version: 1, floors: [{ id: "a", name: "A", elevation: 1, height: 2.5 }, { id: "b", name: "B", elevation: 3.5, height: 2.5 }], rooms: [], receivers: [] };
  const out = m.normalizePlan(old);
  assert.equal(out.north, 0);
  assert.equal(out.reference_floor_id, "a");
  assert.deepEqual(out.floors.map((f) => [f.elevation, f.ha_floor_id]), [[0, null], [2.5, null]]);
});

test("removing the reference floor hands over to the floor closest to 0 m", () => {
  const plan = m.setReferenceFloor({
    ...m.defaultPlan(),
    floors: [
      { id: "b", name: "B", elevation: -2.5, height: 2.5 },
      { id: "g", name: "G", elevation: 0, height: 2.5 },
      { id: "u", name: "U", elevation: 2.5, height: 2.5 },
    ],
  }, "g");
  const out = m.removeFloor(plan, "g");
  assert.ok(["b", "u"].includes(out.reference_floor_id));
  assert.equal(out.floors.find((f) => f.id === out.reference_floor_id).elevation, 0);
});

test("names come from Home Assistant when linked", () => {
  const areas = { kitchen: { area_id: "kitchen", name: "Küche" } };
  const haFloors = { eg: { floor_id: "eg", name: "Erdgeschoss" } };
  assert.equal(m.roomName({ name: "Room 1", area_id: "kitchen" }, areas), "Küche");
  assert.equal(m.roomName({ name: "Room 1", area_id: "gone" }, areas), "Room 1");
  assert.equal(m.roomName({ name: "", area_id: null }, areas), "Unnamed");
  assert.equal(m.floorName({ name: "Ground", ha_floor_id: "eg" }, haFloors), "Erdgeschoss");
  assert.equal(m.floorName({ name: "Ground", ha_floor_id: null }, haFloors), "Ground");
});
