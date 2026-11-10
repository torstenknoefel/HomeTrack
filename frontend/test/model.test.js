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
