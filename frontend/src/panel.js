// HomeTrack house-plan editor: a Home Assistant sidebar panel.
// 2D editing happens in an SVG whose viewBox is in metres; the 3D view
// (view3d.js) is a live, read-only preview of the same plan.
import * as m from "./model.js";
import { Plan3D } from "./view3d.js";
import { STYLE } from "./styles.js";

const TOOLS = [
  { id: "select", label: "Select", key: "v" },
  { id: "room", label: "Draw room", key: "r" },
  { id: "rect", label: "Rectangle", key: "b" },
  { id: "receiver", label: "Receiver", key: "e" },
];
const VIEWS = [{ id: "2d", label: "2D" }, { id: "split", label: "2D + 3D" }, { id: "3d", label: "3D" }];
const SNAPS = [0, 0.05, 0.1, 0.25, 0.5];
const HINTS = {
  select: "Drag rooms, corners and receivers. Double-click an edge to add a corner, right-click a corner to remove it. Drag empty space to pan, scroll to zoom.",
  room: "Click to add corners. Click the first corner or press Enter to finish. Hold Shift for straight walls, Backspace removes the last corner, Esc cancels.",
  rect: "Drag to draw a rectangular room.",
  receiver: `Click to place a Bluetooth receiver (${m.DEFAULT_RECEIVER_Z} m above the floor by default).`,
};
const PALETTE = ["#4e79a7", "#f28e2b", "#59a14f", "#b07aa1", "#edc948", "#76b7b2", "#e15759", "#9c755f"];
const HIT_PX = 10;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString();
const isTyping = (e) => ["INPUT", "SELECT", "TEXTAREA"].includes(e.composedPath()[0]?.tagName);

class HomeTrackPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.plan = m.defaultPlan();
    this.savedJson = JSON.stringify(this.plan);
    this.floorId = "ground";
    this.tool = "select";
    this.sel = null; // { kind: "room" | "receiver", id }
    this.draft = []; // corners of a room being drawn
    this.rect = null; // { a, b } while dragging a rectangle
    this.cursor = null; // snapped cursor position (metres)
    this.view = { cx: 5, cy: 4, scale: 50 }; // scale = pixels per metre
    this.viewMode = "split";
    this.snapStep = 0.1;
    this.isolate = false;
    this.history = [];
    this.future = [];
    this.scanners = [];
    this.status = "";
    this.drag = null;
    this._space = false;
    this._onKey = this._onKey.bind(this);
    this._onKeyUp = (e) => { if (e.key === " ") this._space = false; };
  }

  set hass(hass) {
    this._hass = hass;
    if (this._menu) this._menu.hass = hass;
    if (!this._loadStarted) this._load();
  }
  get hass() { return this._hass; }
  set narrow(narrow) {
    this._narrow = narrow;
    this.toggleAttribute("narrow", !!narrow);
    if (this._menu) this._menu.narrow = narrow;
  }
  set panel(_p) {}

  connectedCallback() {
    if (!this._built) this._build();
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("keyup", this._onKeyUp);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("keyup", this._onKeyUp);
    this._p3d?.dispose();
    this._p3d = null;
  }

  // ── Loading and saving ─────────────────────────────────────────────

  async _load() {
    this._loadStarted = true;
    try {
      const { plan } = await this._hass.callWS({ type: "hometrack/plan/get" });
      this.plan = plan;
      this.savedJson = JSON.stringify(plan);
      this.floorId = m.sortedFloors(plan)[0].id;
    } catch (err) {
      this.status = `Could not load the plan: ${err.message || err.code || err}`;
    }
    try {
      this.scanners = (await this._hass.callWS({ type: "hometrack/scanners" })).scanners;
    } catch (_err) {
      this.scanners = [];
    }
    this._loaded = true;
    this._fit2d();
    this._p3dFitPending = true;
    this._renderAll();
  }

  async _save() {
    if (!this._dirty()) return;
    this.status = "Saving…";
    this._renderHeader();
    try {
      const { plan } = await this._hass.callWS({ type: "hometrack/plan/save", plan: this.plan });
      this.plan = plan;
      this.savedJson = JSON.stringify(plan);
      this.status = "Saved";
    } catch (err) {
      this.status = `Save failed: ${err.message || err.code || err}`;
    }
    this._renderAll();
  }

  _dirty() { return JSON.stringify(this.plan) !== this.savedJson; }

  // ── History ──────────────────────────────────────────────────────────────────────

  _mutate(fn) {
    const before = JSON.stringify(this.plan);
    fn();
    this._commit(before);
    this._renderAll();
  }

  _commit(before) {
    if (before === JSON.stringify(this.plan)) return;
    this.history.push(before);
    if (this.history.length > 200) this.history.shift();
    this.future = [];
    this.status = "";
  }

  _undo(redo = false) {
    const from = redo ? this.future : this.history;
    const to = redo ? this.history : this.future;
    if (!from.length) return;
    to.push(JSON.stringify(this.plan));
    this.plan = JSON.parse(from.pop());
    if (!this.plan.floors.some((f) => f.id === this.floorId)) this.floorId = m.sortedFloors(this.plan)[0].id;
    if (this.sel && !this._selected()) this.sel = null;
    this.draft = [];
    this._renderAll();
  }

  // ── Lookups ──────────────────────────────────────────────────────────────────────

  _floor() { return this.plan.floors.find((f) => f.id === this.floorId); }
  _selected() {
    if (!this.sel) return null;
    const list = this.sel.kind === "room" ? this.plan.rooms : this.plan.receivers;
    return list.find((x) => x.id === this.sel.id) || null;
  }
  _roomsHere() { return this.plan.rooms.filter((r) => r.floor_id === this.floorId); }
  _receiversHere() { return this.plan.receivers.filter((r) => r.floor_id === this.floorId); }
  _px(n) { return n / this.view.scale; }

  // ── Building the DOM ───────────────────────────────────────────────

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="root">
      <div class="header">
        <span id="menu"></span>
        <div class="title">HomeTrack · House plan</div>
        <div class="spacer"></div>
        <span id="status" class="status"></span>
        <button data-action="undo" title="Undo (Ctrl+Z)">Undo</button>
        <button data-action="redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button data-action="save" class="primary" title="Save (Ctrl+S)">Save</button>
      </div>
      <div class="bar">
        <div id="floors" class="chips"></div>
        <div id="tools" class="seg"></div>
        <label class="snap">Snap <select id="snap">${SNAPS.map((s) => `<option value="${s}">${s ? `${s * 100} cm` : "off"}</option>`).join("")}</select></label>
        <div class="spacer"></div>
        <div id="views" class="seg"></div>
      </div>
      <div class="body">
        <div class="canvas2d" id="c2d">
          <svg id="svg" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="overlay tl"><button data-action="fit2d">Fit</button></div>
          <div id="coords" class="overlay bl"></div>
          <div id="hint" class="overlay br hint"></div>
        </div>
        <div class="canvas3d" id="c3d">
          <div class="overlay tl">
            <button data-action="fit3d">Reset view</button>
            <label class="check"><input type="checkbox" id="isolate"> This floor only</label>
          </div>
        </div>
        <aside id="side"></aside>
      </div></div>`;

    const $ = (id) => this.shadowRoot.getElementById(id);
    this.$svg = $("svg");
    this.$side = $("side");

    if (customElements.get("ha-menu-button")) {
      this._menu = document.createElement("ha-menu-button");
      this._menu.hass = this._hass;
      this._menu.narrow = this._narrow;
      $("menu").appendChild(this._menu);
    }

    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("input", (e) => this._onField(e, false));
    this.shadowRoot.addEventListener("change", (e) => this._onField(e, true));
    $("snap").value = String(this.snapStep);
    $("snap").addEventListener("change", (e) => { this.snapStep = parseFloat(e.target.value); e.stopPropagation(); });
    $("isolate").addEventListener("change", (e) => { this.isolate = e.target.checked; e.stopPropagation(); this._schedule3d(); });

    const svg = this.$svg;
    svg.addEventListener("pointerdown", (e) => this._onDown(e));
    svg.addEventListener("pointermove", (e) => this._onMove(e));
    svg.addEventListener("pointerup", (e) => this._onUp(e));
    svg.addEventListener("pointerleave", () => { this.cursor = null; this._render2d(); });
    svg.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    svg.addEventListener("dblclick", (e) => this._onDblClick(e));
    svg.addEventListener("contextmenu", (e) => this._onContext(e));
    new ResizeObserver(() => this._render2d()).observe($("c2d"));

    this._renderAll();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _renderAll() {
    if (!this._built) return;
    this._renderHeader();
    this._renderBar();
    this._renderSide();
    this._render2d();
    this._ensure3d();
    this._schedule3d();
  }

  _renderHeader() {
    const r = this.shadowRoot;
    const dirty = this._dirty();
    r.querySelector('[data-action="save"]').disabled = !dirty;
    r.querySelector('[data-action="undo"]').disabled = !this.history.length;
    r.querySelector('[data-action="redo"]').disabled = !this.future.length;
    r.getElementById("status").textContent = this.status || (dirty ? "Unsaved changes" : "");
  }

  _renderBar() {
    const r = this.shadowRoot;
    r.getElementById("floors").innerHTML =
      m.sortedFloors(this.plan).map((f) =>
        `<button class="chip ${f.id === this.floorId ? "on" : ""}" data-action="floor" data-id="${esc(f.id)}">${esc(f.name || "Floor")}</button>`).join("") +
      `<button class="chip add" data-action="add-floor" title="Add a floor on top of the highest one">+ Floor above</button>` +
      `<button class="chip add" data-action="add-floor-below" title="Add a cellar or basement below the lowest floor">+ Floor below</button>`;
    r.getElementById("tools").innerHTML = TOOLS.map((t) =>
      `<button class="${t.id === this.tool ? "on" : ""}" data-action="tool" data-id="${t.id}" title="${t.label} (${t.key.toUpperCase()})">${t.label}</button>`).join("");
    r.getElementById("views").innerHTML = VIEWS.map((v) =>
      `<button class="${v.id === this.viewMode ? "on" : ""}" data-action="view" data-id="${v.id}">${v.label}</button>`).join("");
    r.querySelector(".body").className = `body mode-${this.viewMode}`;
    r.getElementById("hint").textContent = HINTS[this.tool];
  }

  _renderSide() {
    const item = this._selected();
    let html;
    if (item && this.sel.kind === "room") html = this._roomProps(item);
    else if (item && this.sel.kind === "receiver") html = this._receiverProps(item);
    else html = this._floorProps();
    // Keep keyboard focus on the same field across re-renders (e.g. tabbing between wall lengths).
    const focused = this.shadowRoot.activeElement?.dataset?.field;
    this.$side.innerHTML = html;
    if (focused) {
      const el = this.$side.querySelector(`[data-field="${focused}"]`);
      el?.focus();
      if (el?.select) el.select();
    }
  }

  _roomProps(room) {
    const areas = Object.values(this._hass?.areas || {}).sort((a, b) => a.name.localeCompare(b.name));
    return `<h3>Room</h3>
      <label>Name<input data-field="room.name" value="${esc(room.name)}"></label>
      <label>Home Assistant area
        <select data-field="room.area_id">
          <option value="">Not linked</option>
          ${areas.map((a) => `<option value="${esc(a.area_id)}" ${a.area_id === room.area_id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
        </select>
      </label>
      <h4>Position of corner 1</h4>
      <p class="muted">Corner 1 (the filled orange corner) is the room's reference point, measured from 0, 0. Changing it moves the whole room.</p>
      <div class="row2">
        <label>X (m)<input type="number" step="0.05" data-field="room.x" value="${room.polygon[0][0]}"></label>
        <label>Y (m)<input type="number" step="0.05" data-field="room.y" value="${room.polygon[0][1]}"></label>
      </div>
      <h4>Walls</h4>
      <p class="muted">Changing a length stretches the room along that wall; the far end moves.</p>
      <div class="walls">
        ${m.edgeLengths(room.polygon).map((len, i) => `<label class="wall"><span>Wall ${i + 1} <span class="muted">· corner ${i + 1} → ${(i + 1) % room.polygon.length + 1}</span></span>
          <span class="unit"><input type="number" step="0.05" min="0.1" data-field="wall.${i}" value="${fmt(len, 3)}"> m</span></label>`).join("")}
      </div>
      <dl>
        <dt>Floor area</dt><dd>${fmt(m.polygonArea(room.polygon), 1)} m²</dd>
        <dt>Perimeter</dt><dd>${fmt(m.perimeter(room.polygon), 1)} m</dd>
      </dl>
      <div class="actions">
        <button data-action="deselect">Done</button>
        <button class="danger" data-action="delete">Delete room</button>
      </div>`;
  }

  _receiverProps(rec) {
    const known = this.scanners.some((s) => s.source === rec.source);
    return `<h3>Receiver</h3>
      <label>Name<input data-field="rec.name" value="${esc(rec.name)}"></label>
      <label>Bluetooth proxy
        <select data-field="rec.source">
          <option value="">Not linked</option>
          ${this.scanners.map((s) => `<option value="${esc(s.source)}" ${s.source === rec.source ? "selected" : ""}>${esc(s.name)} (${esc(s.source)})</option>`).join("")}
          ${rec.source && !known ? `<option value="${esc(rec.source)}" selected>${esc(rec.source)} (not seen)</option>` : ""}
        </select>
      </label>
      ${this.scanners.length ? "" : `<p class="muted">No Bluetooth proxies found yet. You can link them once they're set up.</p>`}
      <div class="row3">
        <label>X (m)<input type="number" step="0.05" data-field="rec.x" value="${rec.x}"></label>
        <label>Y (m)<input type="number" step="0.05" data-field="rec.y" value="${rec.y}"></label>
        <label>Height (m)<input type="number" step="0.05" min="0" data-field="rec.z" value="${rec.z}"></label>
      </div>
      <p class="muted">Height is measured from this floor's surface to the board.</p>
      <div class="actions">
        <button data-action="deselect">Done</button>
        <button class="danger" data-action="delete">Delete receiver</button>
      </div>`;
  }

  _floorProps() {
    const f = this._floor();
    const rooms = this._roomsHere(), recs = this._receiversHere();
    const canDelete = this.plan.floors.length > 1;
    return `<h3>Floor</h3>
      <label>Name<input data-field="floor.name" value="${esc(f.name)}"></label>
      <div class="row2">
        <label>Elevation (m)<input type="number" step="0.05" data-field="floor.elevation" value="${f.elevation}"></label>
        <label>Storey height (m)<input type="number" step="0.05" min="1" data-field="floor.height" value="${f.height}"></label>
      </div>
      <p class="muted">Elevation is the height of this floor's surface above ground level (0 m). Cellars and basements have a negative elevation.</p>
      <h4>Rooms (${rooms.length})</h4>
      <ul class="list">${rooms.map((r) => `<li data-action="select" data-kind="room" data-id="${esc(r.id)}"><span>${esc(r.name || "Unnamed")}</span><span class="muted">${fmt(m.polygonArea(r.polygon), 1)} m²</span></li>`).join("") || `<li class="muted empty">None yet. Use Draw room or Rectangle.</li>`}</ul>
      <h4>Receivers (${recs.length})</h4>
      <ul class="list">${recs.map((r) => `<li data-action="select" data-kind="receiver" data-id="${esc(r.id)}"><span>${esc(r.name || "Unnamed")}</span><span class="muted">${fmt(r.z)} m high</span></li>`).join("") || `<li class="muted empty">None yet. Use the Receiver tool.</li>`}</ul>
      ${canDelete ? `<div class="actions"><button class="danger" data-action="delete-floor">${this._confirmFloor ? "Click again to delete floor and its contents" : "Delete floor"}</button></div>` : ""}
      <details class="help"><summary>Keyboard shortcuts</summary>
        <p>V select · R draw room · B rectangle · E receiver<br>Enter finish room · Esc cancel · Delete remove selection<br>Ctrl+Z undo · Ctrl+Shift+Z redo · Ctrl+S save<br>Space + drag or middle mouse pans; scroll zooms</p>
      </details>`;
  }

  _viewBox() {
    const el = this.$svg;
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    const vw = w / this.view.scale, vh = h / this.view.scale;
    return { x: this.view.cx - vw / 2, y: this.view.cy - vh / 2, w: vw, h: vh };
  }

  _render2d() {
    if (!this._built) return;
    const vb = this._viewBox();
    this.$svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const px = (n) => this._px(n);
    const out = [];

    // Grid: 1 m lines, 0.5 m when zoomed in, a stronger line every 5 m.
    const step = this.view.scale >= 60 ? 0.5 : this.view.scale >= 12 ? 1 : 5;
    const lines = [];
    for (let x = Math.ceil(vb.x / step) * step; x <= vb.x + vb.w; x += step) {
      const major = Math.abs(x / 5 - Math.round(x / 5)) < 1e-6;
      lines.push(`<line class="${major ? "g5" : "g"}" x1="${x}" y1="${vb.y}" x2="${x}" y2="${vb.y + vb.h}"/>`);
    }
    for (let y = Math.ceil(vb.y / step) * step; y <= vb.y + vb.h; y += step) {
      const major = Math.abs(y / 5 - Math.round(y / 5)) < 1e-6;
      lines.push(`<line class="${major ? "g5" : "g"}" x1="${vb.x}" y1="${y}" x2="${vb.x + vb.w}" y2="${y}"/>`);
    }
    out.push(`<g>${lines.join("")}</g>`);
    // Axes through the origin (x to the right, y downwards) and a 0, 0 marker.
    out.push(`<line class="axis x" x1="${vb.x}" y1="0" x2="${vb.x + vb.w}" y2="0"/><line class="axis y" x1="0" y1="${vb.y}" x2="0" y2="${vb.y + vb.h}"/>`);
    out.push(`<circle class="origin" cx="0" cy="0" r="${px(4)}"/>`);
    out.push(`<text class="origin-label" x="${px(6)}" y="${-px(6)}" font-size="${px(11)}">0, 0</text>`);

    // The floor below, as a dashed outline to line walls up against.
    const below = m.floorBelow(this.plan, this.floorId);
    if (below) {
      for (const r of this.plan.rooms.filter((x) => x.floor_id === below.id)) {
        out.push(`<polygon class="ghost" points="${r.polygon.map((p) => p.join(",")).join(" ")}"/>`);
      }
    }

    // Rooms on this floor.
    const selRoom = this.sel?.kind === "room" ? this._selected() : null;
    this.plan.rooms.forEach((r, i) => {
      if (r.floor_id !== this.floorId) return;
      const color = PALETTE[i % PALETTE.length];
      const on = selRoom && selRoom.id === r.id;
      out.push(`<polygon class="room ${on ? "sel" : ""}" style="--c:${color}" points="${r.polygon.map((p) => p.join(",")).join(" ")}"/>`);
    });
    for (const r of this._roomsHere()) {
      const [cx, cy] = m.centroid(r.polygon);
      out.push(`<text class="label" x="${cx}" y="${cy}" font-size="${px(13)}">${esc(r.name || "Unnamed")}</text>`);
      out.push(`<text class="label sub" x="${cx}" y="${cy + px(15)}" font-size="${px(11)}">${fmt(m.polygonArea(r.polygon), 1)} m²</text>`);
    }

    // Edge lengths and corner handles for the selected room.
    if (selRoom && selRoom.floor_id === this.floorId) {
      const poly = selRoom.polygon;
      poly.forEach((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const len = m.dist(a, b);
        if (len * this.view.scale < 40) return;
        out.push(`<text class="dim" x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2}" font-size="${px(11)}">${fmt(len)} m</text>`);
      });
      const [cx, cy] = m.centroid(poly);
      poly.forEach(([x, y], i) => {
        // Corner numbers sit just outside the room, away from its centre.
        const d = Math.hypot(x - cx, y - cy) || 1;
        const lx = x + ((x - cx) / d) * px(14), ly = y + ((y - cy) / d) * px(14);
        out.push(`<text class="corner-no ${i === 0 ? "ref" : ""}" x="${lx}" y="${ly}" font-size="${px(11)}">${i + 1}</text>`);
      });
      if (this.tool === "select") {
        poly.forEach(([x, y], i) => out.push(`<circle class="handle ${i === 0 ? "ref" : ""}" cx="${x}" cy="${y}" r="${px(i === 0 ? 6 : 5)}"/>`));
      }
    }

    // Receivers.
    for (const r of this._receiversHere()) {
      const on = this.sel?.kind === "receiver" && this.sel.id === r.id;
      out.push(`<circle class="rec ${on ? "sel" : ""}" cx="${r.x}" cy="${r.y}" r="${px(on ? 8 : 7)}"/>`);
      out.push(`<text class="rec-label" x="${r.x}" y="${r.y + px(20)}" font-size="${px(11)}">${esc(r.name)} · ${fmt(r.z)} m</text>`);
    }

    // Room being drawn.
    if (this.draft.length) {
      const pts = [...this.draft, ...(this.cursor ? [this.cursor] : [])];
      out.push(`<polyline class="draft" points="${pts.map((p) => p.join(",")).join(" ")}"/>`);
      const first = this.draft[0];
      const closable = this.draft.length >= 3;
      out.push(`<circle class="first ${closable ? "ok" : ""}" cx="${first[0]}" cy="${first[1]}" r="${px(6)}"/>`);
      for (const [x, y] of this.draft.slice(1)) out.push(`<circle class="corner" cx="${x}" cy="${y}" r="${px(3)}"/>`);
      if (this.cursor) {
        const last = this.draft[this.draft.length - 1];
        out.push(`<text class="dim live" x="${(last[0] + this.cursor[0]) / 2}" y="${(last[1] + this.cursor[1]) / 2 - px(8)}" font-size="${px(12)}">${fmt(m.dist(last, this.cursor))} m</text>`);
      }
    }
    if (this.rect) {
      const poly = m.rectangle(this.rect.a, this.rect.b);
      out.push(`<polygon class="draft fill" points="${poly.map((p) => p.join(",")).join(" ")}"/>`);
      const [w, h] = [Math.abs(this.rect.b[0] - this.rect.a[0]), Math.abs(this.rect.b[1] - this.rect.a[1])];
      out.push(`<text class="dim live" x="${(poly[0][0] + poly[1][0]) / 2}" y="${poly[0][1] - px(8)}" font-size="${px(12)}">${fmt(w)} × ${fmt(h)} m</text>`);
    }

    // Snapped cursor.
    if (this.cursor && this.tool !== "select") {
      const [x, y] = this.cursor, s = px(6);
      out.push(`<path class="cross" d="M${x - s},${y}H${x + s}M${x},${y - s}V${y + s}"/>`);
    }

    // Rulers: metre labels along the top and left edges.
    const every = [0.5, 1, 2, 5, 10, 20, 50, 100].find((s) => s * this.view.scale >= 45) || 100;
    const ruler = [];
    for (let x = Math.ceil(vb.x / every) * every; x <= vb.x + vb.w; x += every) {
      ruler.push(`<text class="ruler" x="${x}" y="${vb.y + px(12)}" font-size="${px(10)}">${fmt(x)}</text>`);
    }
    for (let y = Math.ceil(vb.y / every) * every; y <= vb.y + vb.h; y += every) {
      if (y - vb.y < px(24)) continue;
      ruler.push(`<text class="ruler left" x="${vb.x + px(4)}" y="${y}" font-size="${px(10)}">${fmt(y)}</text>`);
    }
    out.push(`<g>${ruler.join("")}</g>`);

    this.$svg.innerHTML = out.join("");
    const coords = this.shadowRoot.getElementById("coords");
    coords.textContent = this.cursor ? `x ${fmt(this.cursor[0])} m · y ${fmt(this.cursor[1])} m` : `${this._floor()?.name ?? ""}`;
  }

  _ensure3d() {
    if (this.viewMode === "2d" || this._p3d || this._p3dFailed) return;
    try {
      this._p3d = new Plan3D(this.shadowRoot.getElementById("c3d"));
    } catch (err) {
      this._p3dFailed = true;
      this.shadowRoot.getElementById("c3d").insertAdjacentHTML("beforeend", `<p class="muted center">3D preview unavailable: ${esc(err.message)}</p>`);
    }
  }

  _schedule3d() {
    if (!this._p3d || this._raf3d) return;
    this._raf3d = requestAnimationFrame(() => {
      this._raf3d = null;
      if (!this._p3d) return;
      if (this._p3dFitPending) { this._p3d.fit(this.plan); this._p3dFitPending = false; }
      this._p3d.update(this.plan, { activeFloorId: this.floorId, selection: this.sel, isolate: this.isolate });
    });
  }

  _fit2d() {
    const el = this.$svg;
    if (!el || !el.clientWidth) { requestAnimationFrame(() => this._built && this._fit2d()); return; }
    const b = m.planBounds(this.plan, this.floorId, 1.5);
    const fallback = b.empty ? m.planBounds(this.plan, null, 1.5) : b;
    this.view.cx = (fallback.minX + fallback.maxX) / 2;
    this.view.cy = (fallback.minY + fallback.maxY) / 2;
    this.view.scale = Math.max(5, Math.min(400, Math.min(el.clientWidth / (fallback.maxX - fallback.minX), el.clientHeight / (fallback.maxY - fallback.minY))));
    this._render2d();
  }

  // ── Pointer interaction ────────────────────────────────────────────

  _world(e) {
    const rect = this.$svg.getBoundingClientRect();
    const vb = this._viewBox();
    return [vb.x + (e.clientX - rect.left) / this.view.scale, vb.y + (e.clientY - rect.top) / this.view.scale];
  }

  /** Snap to a nearby corner (this floor and the one below), else to the grid. */
  _snap(p, skip = null) {
    const below = m.floorBelow(this.plan, this.floorId);
    const polys = this.plan.rooms
      .filter((r) => r.floor_id === this.floorId || (below && r.floor_id === below.id))
      .map((r) => (skip && r.id === skip.roomId ? r.polygon.filter((_, i) => i !== skip.index) : r.polygon));
    polys.push(this.draft);
    const v = m.nearestVertex(p, polys, this._px(HIT_PX));
    if (v) return v;
    return [m.snap(p[0], this.snapStep), m.snap(p[1], this.snapStep)];
  }

  _onDown(e) {
    const p = this._world(e);
    const pan = e.button === 1 || (e.button === 0 && this._space);
    if (pan) return this._startPan(e);
    if (e.button !== 0) return;
    this.$svg.setPointerCapture(e.pointerId);

    if (this.tool === "room") {
      let q = this._snap(p);
      if (e.shiftKey && this.draft.length) q = this._ortho(q);
      if (this.draft.length >= 3 && m.dist(q, this.draft[0]) <= this._px(HIT_PX)) return this._finishRoom();
      const last = this.draft[this.draft.length - 1];
      if (!last || m.dist(last, q) > 1e-6) this.draft.push(q);
      return this._render2d();
    }
    if (this.tool === "rect") {
      const a = this._snap(p);
      this.rect = { a, b: a };
      return this._render2d();
    }
    if (this.tool === "receiver") {
      const q = this._snap(p);
      return this._mutate(() => {
        const rec = { id: m.uid("rcv"), name: `Receiver ${this.plan.receivers.length + 1}`, floor_id: this.floorId, x: q[0], y: q[1], z: m.DEFAULT_RECEIVER_Z, source: null };
        this.plan.receivers.push(rec);
        this.sel = { kind: "receiver", id: rec.id };
        this.tool = "select";
      });
    }

    // Select tool: corner handle, receiver, room body, else pan.
    const hit = this._px(HIT_PX);
    const selRoom = this.sel?.kind === "room" ? this._selected() : null;
    if (selRoom && selRoom.floor_id === this.floorId) {
      const index = selRoom.polygon.findIndex((v) => m.dist(v, p) <= hit);
      if (index >= 0) {
        this.drag = { kind: "vertex", roomId: selRoom.id, index, before: JSON.stringify(this.plan) };
        return;
      }
    }
    const rec = this._receiversHere().find((r) => m.dist([r.x, r.y], p) <= hit);
    if (rec) {
      this.sel = { kind: "receiver", id: rec.id };
      this.drag = { kind: "receiver", id: rec.id, before: JSON.stringify(this.plan) };
      return this._renderAll();
    }
    const room = m.roomAt(this.plan, this.floorId, p);
    if (room) {
      this.sel = { kind: "room", id: room.id };
      this.drag = { kind: "room", id: room.id, start: this._gridSnap(p), orig: room.polygon.map((v) => [...v]), before: JSON.stringify(this.plan) };
      return this._renderAll();
    }
    if (this.sel) { this.sel = null; this._renderAll(); }
    this._startPan(e);
  }

  _gridSnap(p) { return [m.snap(p[0], this.snapStep), m.snap(p[1], this.snapStep)]; }

  _ortho(q) {
    return this.draft.length ? m.orthogonal(this.draft[this.draft.length - 1], q) : q;
  }

  _startPan(e) {
    this.$svg.setPointerCapture(e.pointerId);
    this.drag = { kind: "pan", x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy };
    this.$svg.classList.add("panning");
  }

  _onMove(e) {
    const p = this._world(e);
    const d = this.drag;
    if (d?.kind === "pan") {
      this.view.cx = d.cx - (e.clientX - d.x) / this.view.scale;
      this.view.cy = d.cy - (e.clientY - d.y) / this.view.scale;
      return this._render2d();
    }
    if (d?.kind === "vertex") {
      const room = this.plan.rooms.find((r) => r.id === d.roomId);
      room.polygon[d.index] = this._snap(p, { roomId: room.id, index: d.index });
      this._render2d(); this._schedule3d();
      return;
    }
    if (d?.kind === "receiver") {
      const rec = this.plan.receivers.find((r) => r.id === d.id);
      [rec.x, rec.y] = this._snap(p);
      this._render2d(); this._schedule3d();
      return;
    }
    if (d?.kind === "room") {
      const room = this.plan.rooms.find((r) => r.id === d.id);
      const now = this._gridSnap(p);
      const dx = now[0] - d.start[0], dy = now[1] - d.start[1];
      room.polygon = d.orig.map(([x, y]) => [m.round(x + dx), m.round(y + dy)]);
      this._render2d(); this._schedule3d();
      return;
    }
    if (this.tool === "select") { this.cursor = p; this._updateCoords(); return; }
    let q = this._snap(p);
    if (this.tool === "room" && e.shiftKey) q = this._ortho(q);
    this.cursor = q;
    if (this.rect) this.rect.b = q;
    this._render2d();
  }

  _updateCoords() {
    const c = this.shadowRoot.getElementById("coords");
    c.textContent = `x ${fmt(this.cursor[0])} m · y ${fmt(this.cursor[1])} m`;
  }

  _onUp(e) {
    const d = this.drag;
    this.drag = null;
    this.$svg.classList.remove("panning");
    if (this.$svg.hasPointerCapture(e.pointerId)) this.$svg.releasePointerCapture(e.pointerId);
    if (d && d.before) { this._commit(d.before); this._renderAll(); return; }
    if (this.rect) {
      const { a, b } = this.rect;
      this.rect = null;
      if (Math.abs(b[0] - a[0]) >= 0.2 && Math.abs(b[1] - a[1]) >= 0.2) this._addRoom(m.rectangle(a, b));
      else this._render2d();
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const p = this._world(e);
    const scale = Math.max(5, Math.min(400, this.view.scale * Math.exp(-e.deltaY * 0.0015)));
    this.view.cx = p[0] - ((p[0] - this.view.cx) * this.view.scale) / scale;
    this.view.cy = p[1] - ((p[1] - this.view.cy) * this.view.scale) / scale;
    this.view.scale = scale;
    this._render2d();
  }

  _onDblClick(e) {
    if (this.tool !== "select") return;
    const room = this.sel?.kind === "room" ? this._selected() : null;
    if (!room) return;
    const p = this._world(e);
    const edge = m.nearestEdge(p, room.polygon);
    if (edge.d > this._px(HIT_PX)) return;
    const q = this._gridSnap(edge.point);
    this._mutate(() => room.polygon.splice(edge.index + 1, 0, q));
  }

  _onContext(e) {
    const room = this.sel?.kind === "room" ? this._selected() : null;
    if (!room || this.tool !== "select") return;
    const p = this._world(e);
    const index = room.polygon.findIndex((v) => m.dist(v, p) <= this._px(HIT_PX));
    if (index < 0) return;
    e.preventDefault();
    if (room.polygon.length > 3) this._mutate(() => room.polygon.splice(index, 1));
  }

  _finishRoom() {
    const poly = this.draft;
    this.draft = [];
    if (poly.length >= 3 && m.polygonArea(poly) >= 0.04) this._addRoom(poly);
    else this._render2d();
  }

  _addRoom(polygon) {
    this._mutate(() => {
      const n = this.plan.rooms.length + 1;
      const room = { id: m.uid("room"), name: `Room ${n}`, floor_id: this.floorId, area_id: null, polygon };
      this.plan.rooms.push(room);
      this.sel = { kind: "room", id: room.id };
    });
  }

  _deleteSelection() {
    const item = this._selected();
    if (!item) return;
    this._mutate(() => {
      const key = this.sel.kind === "room" ? "rooms" : "receivers";
      this.plan[key] = this.plan[key].filter((x) => x.id !== item.id);
      this.sel = null;
    });
  }

  // ── Buttons, fields, keys ───────────────────────────────────────────

  _onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const { action, id, kind } = el.dataset;
    if (action !== "delete-floor") this._confirmFloor = false;
    switch (action) {
      case "save": return this._save();
      case "undo": return this._undo();
      case "redo": return this._undo(true);
      case "tool": return this._setTool(id);
      case "view":
        this.viewMode = id;
        this._renderAll();
        requestAnimationFrame(() => { this._render2d(); this._p3d?.resize(); });
        return;
      case "floor":
        this.floorId = id; this.sel = null; this.draft = [];
        this._renderAll();
        return;
      case "add-floor":
        return this._mutate(() => {
          const f = m.newFloorAbove(this.plan);
          this.plan.floors.push(f);
          this.floorId = f.id; this.sel = null;
        });
      case "add-floor-below":
        return this._mutate(() => {
          const f = m.newFloorBelow(this.plan);
          this.plan.floors.push(f);
          this.floorId = f.id; this.sel = null;
          this._p3dFitPending = true;
        });
      case "delete-floor":
        if (!this._confirmFloor) { this._confirmFloor = true; return this._renderSide(); }
        this._confirmFloor = false;
        return this._mutate(() => {
          this.plan = m.removeFloor(this.plan, this.floorId);
          this.floorId = m.sortedFloors(this.plan)[0].id;
          this.sel = null;
        });
      case "select":
        this.sel = { kind, id }; this.tool = "select";
        return this._renderAll();
      case "deselect":
        this.sel = null;
        return this._renderAll();
      case "delete": return this._deleteSelection();
      case "fit2d": return this._fit2d();
      case "fit3d": this._p3d?.fit(this.plan); this._p3d?.render(); return;
    }
  }

  _setTool(tool) {
    this.tool = tool;
    this.draft = [];
    this.rect = null;
    this._renderAll();
  }

  _onField(e, committed) {
    const field = e.target.dataset?.field;
    if (!field) return;
    if (this._editBefore == null) this._editBefore = JSON.stringify(this.plan);
    const [scope, key] = field.split(".");
    const target = scope === "floor" ? this._floor() : this._selected();
    if (!target) return;
    let value = e.target.value;
    if (scope === "wall" || (scope === "room" && (key === "x" || key === "y"))) {
      // Geometry edits: move the room by its reference corner, or set a wall length.
      const num = parseFloat(value);
      if (!Number.isFinite(num)) return;
      if (scope === "wall") {
        if (num < 0.1) return;
        target.polygon = m.setEdgeLength(target.polygon, Number(key), num);
      } else {
        const [x0, y0] = target.polygon[0];
        target.polygon = m.translatePolygon(target.polygon, key === "x" ? num - x0 : 0, key === "y" ? num - y0 : 0);
      }
      if (committed) {
        this._commit(this._editBefore);
        this._editBefore = null;
        // Re-render after focus has moved (Tab), so the newly focused field keeps focus.
        requestAnimationFrame(() => this._renderSide());
      }
      this._renderHeader(); this._render2d(); this._schedule3d();
      return;
    }
    if (["x", "y", "z", "elevation", "height"].includes(key)) {
      value = parseFloat(value);
      if (!Number.isFinite(value)) return;
      if (key === "z") value = Math.max(0, value);
      if (key === "height") value = Math.max(1, value);
    }
    if (key === "area_id" || key === "source") value = value || null;
    target[key] = value;
    if (scope === "room" && key === "area_id" && value && /^Room \d+$/.test(target.name)) {
      target.name = this._hass?.areas?.[value]?.name || target.name;
    }
    if (committed) {
      this._commit(this._editBefore);
      this._editBefore = null;
      this._renderHeader(); this._renderBar(); this._render2d(); this._schedule3d();
      if (e.target.tagName === "SELECT") this._renderSide();
    } else {
      this._renderHeader(); this._renderBar(); this._render2d(); this._schedule3d();
    }
  }

  _onKey(e) {
    if (!this.isConnected || !this.getClientRects().length) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); this._save(); return; }
    if (isTyping(e)) { if (e.key === "Escape" || e.key === "Enter") e.composedPath()[0].blur(); return; }
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === "z") { e.preventDefault(); this._undo(e.shiftKey); }
      else if (k === "y") { e.preventDefault(); this._undo(true); }
      return;
    }
    if (e.key === " ") { this._space = true; e.preventDefault(); return; }
    if (e.key === "Escape") {
      if (this.draft.length || this.rect) { this.draft = []; this.rect = null; this._render2d(); }
      else if (this.sel) { this.sel = null; this._renderAll(); }
      else if (this.tool !== "select") this._setTool("select");
      return;
    }
    if (e.key === "Enter" && this.tool === "room") { this._finishRoom(); return; }
    if (e.key === "Backspace" && this.draft.length) { this.draft.pop(); this._render2d(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { this._deleteSelection(); return; }
    const tool = TOOLS.find((t) => t.key === k);
    if (tool) this._setTool(tool.id);
  }
}

customElements.define("hometrack-panel", HomeTrackPanel);
