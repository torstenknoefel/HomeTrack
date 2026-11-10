// Shadow-DOM styles for the panel. Colours come from the Home Assistant theme.
export const STYLE = `
:host { display: block; height: 100vh; height: 100dvh; background: var(--primary-background-color, #fafafa);
  color: var(--primary-text-color, #212121); font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif); font-size: 14px;
  --accent: var(--primary-color, #03a9f4); --line: var(--divider-color, rgba(0,0,0,.12)); --card: var(--card-background-color, #fff);
  --muted: var(--secondary-text-color, #727272); }
.root { display: flex; flex-direction: column; height: 100%; }
button { font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: .45; cursor: default; }
button.primary { background: var(--accent); color: var(--text-primary-color, #fff); border-color: var(--accent); }
button.danger { color: var(--error-color, #db4437); }
.header { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 12px; box-sizing: border-box;
  background: var(--app-header-background-color, var(--accent)); color: var(--app-header-text-color, #fff); }
.header button { background: transparent; color: inherit; border-color: rgba(255,255,255,.4); }
.header button.primary { background: rgba(255,255,255,.2); }
.title { font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { font-size: 13px; opacity: .85; white-space: nowrap; }
.spacer { flex: 1; }
.bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--card); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { border-radius: 16px; }
.chip.on { background: var(--accent); color: var(--text-primary-color, #fff); border-color: var(--accent); }
.chip.add { border-style: dashed; }
.seg { display: inline-flex; }
.seg button { border-radius: 0; margin-left: -1px; }
.seg button:first-child { border-radius: 6px 0 0 6px; margin-left: 0; }
.seg button:last-child { border-radius: 0 6px 6px 0; }
.seg button.on { background: var(--accent); color: var(--text-primary-color, #fff); border-color: var(--accent); position: relative; }
.snap { display: flex; align-items: center; gap: 6px; color: var(--muted); }
select, input { font: inherit; color: var(--primary-text-color, #212121); background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 5px 6px; box-sizing: border-box; }
.body { flex: 1; display: grid; grid-template-columns: 1fr 1fr 300px; min-height: 0; }
.body.mode-2d { grid-template-columns: 1fr 300px; } .body.mode-2d .canvas3d { display: none; }
.body.mode-3d { grid-template-columns: 1fr 300px; } .body.mode-3d .canvas2d { display: none; }
.canvas2d, .canvas3d { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.canvas3d { border-left: 1px solid var(--line); background: var(--secondary-background-color, #f0f0f0); }
svg { width: 100%; height: 100%; display: block; touch-action: none; user-select: none; cursor: crosshair; background: var(--card); }
svg.panning { cursor: grabbing; }
.overlay { position: absolute; z-index: 1; display: flex; gap: 8px; align-items: center; pointer-events: none; }
.overlay > * { pointer-events: auto; }
.tl { top: 8px; left: 8px; } .tr { top: 8px; right: 8px; } .bl { bottom: 8px; left: 8px; font-size: 12px; color: var(--muted); } .br { bottom: 8px; right: 8px; }
.hint { max-width: 60%; font-size: 12px; color: var(--muted); background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
.check { display: flex; gap: 4px; align-items: center; font-size: 12px; background: var(--card); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line); }
aside { border-left: 1px solid var(--line); background: var(--card); padding: 12px 14px; overflow: auto; }
aside h3 { margin: 0 0 12px; font-size: 16px; } aside h4 { margin: 16px 0 6px; font-size: 13px; color: var(--muted); font-weight: 500; }
aside label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 12px; color: var(--muted); }
aside label input, aside label select { width: 100%; font-size: 14px; }
.row2, .row3 { display: grid; gap: 8px; } .row2 { grid-template-columns: 1fr 1fr; } .row3 { grid-template-columns: 1fr 1fr 1fr; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 6px 0 12px; font-size: 13px; } dt { color: var(--muted); } dd { margin: 0; }
.walls { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
aside label.wall { flex-direction: row; align-items: center; justify-content: space-between; margin: 0; color: var(--primary-text-color, #212121); font-size: 13px; }
.unit { display: flex; align-items: center; gap: 4px; color: var(--muted); }
aside label.wall input { width: 80px; }
.actions { display: flex; gap: 8px; justify-content: space-between; margin-top: 12px; }
.muted { color: var(--muted); font-size: 12px; } .center { text-align: center; margin-top: 40%; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; justify-content: space-between; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.list li:hover { background: var(--secondary-background-color, #f0f0f0); } .list li.empty { cursor: default; }
.help { margin-top: 16px; font-size: 12px; color: var(--muted); } .help p { line-height: 1.6; }
.g { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
.g5 { stroke: var(--muted); stroke-opacity: .25; stroke-width: 1; vector-effect: non-scaling-stroke; }
.axis { stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.axis.x { stroke: #e53935; stroke-opacity: .7; } .axis.y { stroke: #43a047; stroke-opacity: .7; }
.origin { fill: var(--card); stroke: var(--primary-text-color, #212121); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.origin-label { fill: var(--primary-text-color, #212121); font-weight: 500; paint-order: stroke; stroke: var(--card); stroke-width: 3px; vector-effect: non-scaling-stroke; pointer-events: none; }
.ruler { fill: var(--muted); text-anchor: middle; paint-order: stroke; stroke: var(--card); stroke-width: 3px; vector-effect: non-scaling-stroke; pointer-events: none; }
.ruler.left { text-anchor: start; dominant-baseline: middle; }
.corner-no { fill: #e65100; text-anchor: middle; dominant-baseline: middle; font-weight: 500; paint-order: stroke; stroke: var(--card); stroke-width: 3px; vector-effect: non-scaling-stroke; pointer-events: none; }
.corner-no.ref { font-weight: 700; }
.compass { display: flex; flex-direction: column; align-items: center; cursor: grab; user-select: none; touch-action: none; }
.compass svg { display: block; }
.dial { fill: var(--card); fill-opacity: .9; stroke: var(--line); stroke-width: 1.5; }
.needle-n { fill: #e53935; } .needle-s { fill: var(--muted); fill-opacity: .5; }
.dial-n { font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: middle; fill: var(--primary-text-color, #212121); paint-order: stroke; stroke: var(--card); stroke-width: 3px; }
.dial-deg { font-size: 11px; color: var(--muted); background: var(--card); border-radius: 4px; padding: 0 4px; margin-top: -2px; }
.ghost { fill: none; stroke: var(--muted); stroke-dasharray: 4 4; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.room { fill: var(--c); fill-opacity: .18; stroke: var(--c); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.room.sel { fill-opacity: .3; stroke: #ff9800; stroke-width: 3; }
.label { text-anchor: middle; dominant-baseline: middle; fill: var(--primary-text-color, #212121); font-weight: 500; pointer-events: none; }
.label.sub { fill: var(--muted); font-weight: 400; }
.dim { text-anchor: middle; dominant-baseline: middle; fill: #e65100; paint-order: stroke; stroke: var(--card); stroke-width: 3px; vector-effect: non-scaling-stroke; pointer-events: none; }
.handle { fill: #fff; stroke: #ff9800; stroke-width: 2; vector-effect: non-scaling-stroke; cursor: move; }
.handle.ref { fill: #ff9800; }
.rec { fill: #43a047; stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; }
.rec.sel { fill: #ff9800; }
.rec-label { text-anchor: middle; fill: #2e7d32; paint-order: stroke; stroke: var(--card); stroke-width: 3px; vector-effect: non-scaling-stroke; pointer-events: none; }
.draft { fill: none; stroke: var(--accent); stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
.draft.fill { fill: var(--accent); fill-opacity: .12; }
.first { fill: var(--card); stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; } .first.ok { fill: var(--accent); }
.corner { fill: var(--accent); }
.cross { stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
:host([narrow]) .body, :host([narrow]) .body.mode-2d, :host([narrow]) .body.mode-3d { grid-template-columns: 1fr; grid-template-rows: minmax(300px, 1fr) auto; }
:host([narrow]) .body:not(.mode-2d):not(.mode-3d) { grid-template-rows: minmax(260px, 1fr) minmax(220px, 1fr) auto; }
:host([narrow]) .canvas3d { border-left: 0; border-top: 1px solid var(--line); }
:host([narrow]) aside { border-left: 0; border-top: 1px solid var(--line); }
:host([narrow]) { overflow: auto; }
:host([narrow]) .root { height: auto; min-height: 100%; }
:host([narrow]) .title { font-size: 17px; }
:host([narrow]) .hint { display: none; }
`;
