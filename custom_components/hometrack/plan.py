"""House plan: data model, validation and storage.

Coordinates are metres. Each floor has an elevation (height of its floor
surface above the lowest reference) and a storey height. Room polygons and
receiver positions use (x, y) on the floor plane; a receiver's z is its height
above its own floor.
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
        vol.Required("floors"): vol.All([FLOOR_SCHEMA], vol.Length(min=1, max=20)),
        vol.Required("rooms"): vol.All([ROOM_SCHEMA], vol.Length(max=500)),
        vol.Required("receivers"): vol.All([RECEIVER_SCHEMA], vol.Length(max=200)),
    }
)

DEFAULT_PLAN: dict[str, Any] = {
    "version": PLAN_VERSION,
    "floors": [{"id": "ground", "name": "Ground floor", "elevation": 0.0, "height": 2.5}],
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
    return plan


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
