# HomeTrack

A Home Assistant integration for tracking a Bluetooth device (for example a smart watch or phone) across a 3D model of your home.

> **Status: early development.** This version contains the house-plan editor. Tracking comes next.

## What it does so far

HomeTrack adds a **HomeTrack** panel to the Home Assistant sidebar (admins only) where you build a model of your home:

- **Floors** with their storey height and elevation relative to a **reference floor** you choose (0 m). Floors below it, such as cellars, have a negative elevation. Choosing another reference floor only changes the numbers.
- **Rooms** drawn on a metre grid: click out the corners, or drag a rectangle. Corners snap to the grid and to the corners of neighbouring rooms and the floor below, so walls line up. Coordinates are measured from the 0, 0 marker, with x to the right and y downwards.
- Each room's **corner 1** is its reference point. Type its x/y to move the room, or type a **wall length** to stretch the room along that wall.
- **Bluetooth receivers** (ESPHome Bluetooth proxies) placed where they really are, including their height above the floor.
- Rooms and floors can be linked to Home Assistant **areas** and **floors**. Linked items take their name from Home Assistant, so a rename there can't get out of sync with the plan. When picking an area, those on the linked Home Assistant floor are listed first.
- Receivers can be linked to the Bluetooth proxies Home Assistant has found.
- A live **3D preview** of the whole house next to the 2D editor.
- **North direction** for the house (degrees clockwise from "up" on the plan), set by typing or by dragging the compass. It is stored in the plan for future uses such as heating, blinds or sun-position automations.

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

### Marketplace (Home Assistant 2026.11 and newer)

1. Go to **Settings → Marketplace**, select **Add from link** and enter `torstenknoefel/HomeTrack`. Adding a link needs a GitHub connection; the dialog asks you to connect if you haven't yet.
2. Install **HomeTrack**, then restart Home Assistant from the repair under **Settings → System → Repairs**.
3. Go to **Settings → Devices & services → Add integration → HomeTrack**.

Updates appear under **Settings → Updates**. After an update, restart from the repair and reload the browser page.

On Home Assistant 2026.10 and older, use HACS instead: add `https://github.com/torstenknoefel/HomeTrack` as a custom repository of type **Integration** and follow the same steps.

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
