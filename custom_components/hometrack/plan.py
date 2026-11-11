"""House plan: data model, validation and storage.

Coordinates are metres. Each floor has an elevation (height of its floor
surface relative to the plan's reference floor, which is at 0 m; floors below
it are negative) and a storey height. Room polygons and
receiver positions use (x, y) on the floor plane; a receiver's z is its height
above its own floor. On the plan x points right and y points down (towards
the viewer). `north` is the compass direction of north in degrees, measured
clockwise from "up" on the plan (the -y direction): 0 means north is up,
90 means north points along +x.

Rooms and floors can be linked to Home Assistant's own areas (`area_id`) and
floors (`ha_floor_id`). When linked, Home Assistant is the source of truth
for the name; the plan's `name` is only a fallback for unlinked items.
"""

from __future__ import annotations

import copy
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import PLAN_VERSION, STORAGE_KEY, STORAGE_VERSION

_ID = vol.All(str, vol.Length(min=1, max=64))
_NAME = vol.All(str, vol.Length(max=100))
_COORD = vol.All(vol.Coerce(float), vol.Range(min=-1000, max=1000))
_POINT = vol.All([_COORD], vol.Length(min=2, max=2))

FLOOR_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("name"): _NAME,
        vol.Required("elevation"): vol.All(vol.Coerce(float), vol.Range(min=-50, max=200)),
        vol.Required("height"): vol.All(vol.Coerce(float), vol.Range(min=1, max=20)),
        vol.Optional("ha_floor_id", default=None): vol.Any(None, str),
    }
)

ROOM_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("name"): _NAME,
        vol.Required("floor_id"): _ID,
        vol.Optional("area_id", default=None): vol.Any(None, str),
        vol.Required("polygon"): vol.All([_POINT], vol.Length(min=3, max=200)),
    }
)

RECEIVER_SCHEMA = vol.Schema(
    {
        vol.Required("id"): _ID,
        vol.Required("name"): _NAME,
        vol.Required("floor_id"): _ID,
        vol.Required("x"): _COORD,
        vol.Required("y"): _COORD,
        vol.Required("z"): vol.All(vol.Coerce(float), vol.Range(min=0, max=20)),
        vol.Optional("source", default=None): vol.Any(None, str),
    }
)

PLAN_SCHEMA = vol.Schema(
    {
        vol.Required("version"): PLAN_VERSION,
        vol.Optional("reference_floor_id", default=None): vol.Any(None, _ID),
        vol.Optional("north", default=0.0): vol.All(
            vol.Coerce(float), vol.Range(min=0, max=360, max_included=False)
        ),
        vol.Required("floors"): vol.All([FLOOR_SCHEMA], vol.Length(min=1, max=20)),
        vol.Required("rooms"): vol.All([ROOM_SCHEMA], vol.Length(max=500)),
        vol.Required("receivers"): vol.All([RECEIVER_SCHEMA], vol.Length(max=200)),
    }
)

DEFAULT_PLAN: dict[str, Any] = {
    "version": PLAN_VERSION,
    "north": 0.0,
    "reference_floor_id": "ground",
    "floors": [
        {"id": "ground", "name": "Ground floor", "elevation": 0.0, "height": 2.5, "ha_floor_id": None}
    ],
    "rooms": [],
    "receivers": [],
}


def validate_plan(data: Any) -> dict[str, Any]:
    """Validate a plan and its references. Raises vol.Invalid."""
    plan = PLAN_SCHEMA(data)
    floor_ids = [f["id"] for f in plan["floors"]]
    for kind in ("floors", "rooms", "receivers"):
        ids = [item["id"] for item in plan[kind]]
        if len(ids) != len(set(ids)):
            raise vol.Invalid(f"duplicate id in {kind}")
    for kind in ("rooms", "receivers"):
        for item in plan[kind]:
            if item["floor_id"] not in floor_ids:
                raise vol.Invalid(f"{kind[:-1]} {item['id']} refers to unknown floor")
    if plan["reference_floor_id"] is None:
        plan["reference_floor_id"] = default_reference_floor(plan["floors"])
    elif plan["reference_floor_id"] not in floor_ids:
        raise vol.Invalid("reference_floor_id refers to unknown floor")
    return plan


def default_reference_floor(floors: list[dict[str, Any]]) -> str:
    """The floor at elevation 0 if there is one, otherwise the lowest floor."""
    at_zero = [f for f in floors if f["elevation"] == 0]
    if at_zero:
        return at_zero[0]["id"]
    return min(floors, key=lambda f: f["elevation"])["id"]


class PlanStore:
    """Persists the house plan in .storage/hometrack.plan."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._plan: dict[str, Any] = copy.deepcopy(DEFAULT_PLAN)

    @property
    def plan(self) -> dict[str, Any]:
        return self._plan

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data is None:
            return
        try:
            self._plan = validate_plan(data)
        except vol.Invalid:
            # Keep the file untouched so nothing is lost; start from default.
            self._plan = copy.deepcopy(DEFAULT_PLAN)

    async def async_save(self, data: Any) -> dict[str, Any]:
        plan = validate_plan(data)
        self._plan = plan
        await self._store.async_save(plan)
        return plan
