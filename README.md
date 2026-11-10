# HomeTrack

A Home Assistant integration for tracking a Bluetooth device (for example a smart watch or phone) across a 3D model of your home.

> **Status: early development.** This version contains the house-plan editor. Tracking comes next.

## What it does so far

HomeTrack adds a **HomeTrack** panel to the Home Assistant sidebar (admins only) where you build a model of your home:

- **Floors** with their elevation and storey height.
- **Rooms** drawn on a metre grid: click out the corners, or drag a rectangle. Corners snap to the grid and to the corners of neighbouring rooms and the floor below, so walls line up.
- **Bluetooth receivers** (ESPHome Bluetooth proxies) placed where they really are, including their height above the floor.
- Rooms can be linked to Home Assistant **areas**, and receivers to the Bluetooth proxies Home Assistant has found.
- A live **3D preview** of the whole house next to the 2D editor.

The plan is stored in Home Assistant (`.storage/hometrack.plan`).

### Editor shortcuts

| Key | Action |
|---|---|
| V / R / B / E | Select / Draw room / Rectangle / Receiver |
| Enter | Finish the room being drawn |
| Shift (while drawing) | Straight (horizontal/vertical) walls |
| Backspace | Remove the last corner while drawing |
| Delete | Delete the selected room or receiver |
| Esc | Cancel drawing / deselect |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+S | Save |
| Space + drag, middle mouse | Pan; scroll to zoom |

In Select mode, double-click a room edge to add a corner and right-click a corner to remove it.

## Installation

### HACS (custom repository)

1. In HACS, add `https://github.com/torstenknoefel/HomeTrack` as a custom repository of type **Integration**.
2. Install **HomeTrack** and restart Home Assistant.
3. Go to **Settings → Devices & services → Add integration → HomeTrack**.

### Manual

Download `hometrack.zip` from the latest release, unzip it into `config/custom_components/hometrack/`, restart, and add the integration.

## Development

The panel source is in `frontend/` (plain JavaScript + three.js, bundled with esbuild):

```bash
cd frontend
npm install
npm test          # geometry unit tests
npm run dev       # editor against a mock Home Assistant on http://localhost:8000
npm run build     # writes custom_components/hometrack/frontend/hometrack-panel.js
```

The built panel is not committed; the release workflow builds it and attaches `hometrack.zip` to each release.

Python tests:

```bash
pip install -r requirements_test.txt
pytest
```

Problems or ideas: https://github.com/torstenknoefel/HomeTrack/issues
