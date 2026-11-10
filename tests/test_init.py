"""Setup, config flow, panel and WebSocket API."""

import copy

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType

from custom_components.hometrack.const import DOMAIN, PANEL_URL_PATH, STORAGE_KEY
from custom_components.hometrack.plan import DEFAULT_PLAN

PLAN = {
    "version": 1,
    "floors": [{"id": "ground", "name": "Ground", "elevation": 0, "height": 2.5}],
    "rooms": [{"id": "r1", "name": "Kitchen", "floor_id": "ground", "area_id": None, "polygon": [[0, 0], [4, 0], [4, 3], [0, 3]]}],
    "receivers": [{"id": "x1", "name": "Proxy", "floor_id": "ground", "x": 0.2, "y": 0.2, "z": 0.4, "source": None}],
}


async def test_config_flow_creates_single_entry(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()

    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert again["type"] is FlowResultType.ABORT
    assert again["reason"] == "single_instance_allowed"


async def test_panel_registered_and_removed(hass, setup_entry):
    assert PANEL_URL_PATH in hass.data["frontend_panels"]
    assert await hass.config_entries.async_unload(setup_entry.entry_id)
    assert PANEL_URL_PATH not in hass.data["frontend_panels"]


async def test_get_returns_default_plan(hass, hass_ws_client, setup_entry):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "hometrack/plan/get"})
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["plan"] == DEFAULT_PLAN


async def test_save_persists_and_reloads(hass, hass_ws_client, hass_storage, setup_entry):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "hometrack/plan/save", "plan": PLAN})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert msg["result"]["plan"]["rooms"][0]["name"] == "Kitchen"
    assert hass_storage[STORAGE_KEY]["data"]["receivers"][0]["z"] == 0.4

    # A reload reads the plan back from storage.
    assert await hass.config_entries.async_reload(setup_entry.entry_id)
    await hass.async_block_till_done()
    await client.send_json_auto_id({"type": "hometrack/plan/get"})
    msg = await client.receive_json()
    assert msg["result"]["plan"]["rooms"][0]["polygon"][2] == [4.0, 3.0]


async def test_save_rejects_invalid_plan(hass, hass_ws_client, setup_entry):
    bad = copy.deepcopy(PLAN)
    bad["rooms"][0]["floor_id"] = "attic"
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "hometrack/plan/save", "plan": bad})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "invalid_plan"


async def test_save_requires_admin(hass, hass_ws_client, hass_read_only_access_token, setup_entry):
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json_auto_id({"type": "hometrack/plan/save", "plan": PLAN})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"


async def test_scanners_empty_without_bluetooth(hass, hass_ws_client, setup_entry):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "hometrack/scanners"})
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"] == {"scanners": []}
