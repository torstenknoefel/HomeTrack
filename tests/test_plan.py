"""Plan validation."""

import copy

import pytest
import voluptuous as vol

from custom_components.hometrack.plan import DEFAULT_PLAN, validate_plan

ROOM = {"id": "r1", "name": "Kitchen", "floor_id": "ground", "polygon": [[0, 0], [3, 0], [3, 2]]}
RECEIVER = {"id": "x1", "name": "Proxy", "floor_id": "ground", "x": 1, "y": 1, "z": 0.4}


def plan_with(**parts):
    plan = copy.deepcopy(DEFAULT_PLAN)
    plan.update(parts)
    return plan


def test_default_plan_is_valid():
    assert validate_plan(copy.deepcopy(DEFAULT_PLAN)) == DEFAULT_PLAN


def test_optional_fields_get_defaults():
    plan = validate_plan(plan_with(rooms=[ROOM], receivers=[RECEIVER]))
    assert plan["rooms"][0]["area_id"] is None
    assert plan["receivers"][0]["source"] is None
    assert plan["receivers"][0]["z"] == 0.4


@pytest.mark.parametrize(
    "bad",
    [
        plan_with(floors=[]),
        plan_with(rooms=[{**ROOM, "polygon": [[0, 0], [1, 1]]}]),
        plan_with(rooms=[{**ROOM, "floor_id": "attic"}]),
        plan_with(receivers=[{**RECEIVER, "z": -1}]),
        plan_with(rooms=[ROOM, ROOM]),
        plan_with(version=2),
        plan_with(unexpected=True),
    ],
)
def test_invalid_plans_are_rejected(bad):
    with pytest.raises(vol.Invalid):
        validate_plan(bad)
