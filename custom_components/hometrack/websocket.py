"""WebSocket API used by the HomeTrack panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_plan_get)
    websocket_api.async_register_command(hass, ws_plan_save)
    websocket_api.async_register_command(hass, ws_scanners)


def _store(hass: HomeAssistant):
    return hass.data.get(DOMAIN, {}).get("store")


@websocket_api.websocket_command({vol.Required("type"): "hometrack/plan/get"})
@callback
def ws_plan_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    store = _store(hass)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "HomeTrack is not set up")
        return
    connection.send_result(msg["id"], {"plan": store.plan})


@websocket_api.websocket_command(
    {vol.Required("type"): "hometrack/plan/save", vol.Required("plan"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_plan_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    store = _store(hass)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "HomeTrack is not set up")
        return
    try:
        plan = await store.async_save(msg["plan"])
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid_plan", str(err))
        return
    connection.send_result(msg["id"], {"plan": plan})


@websocket_api.websocket_command({vol.Required("type"): "hometrack/scanners"})
@callback
def ws_scanners(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Bluetooth receivers Home Assistant knows about, to link plan receivers to."""
    result: list[dict[str, Any]] = []
    if "bluetooth" in hass.config.components:
        try:
            from homeassistant.components import bluetooth

            for scanner in bluetooth.async_current_scanners(hass):
                result.append({"source": scanner.source, "name": scanner.name})
        except (AttributeError, ImportError):
            pass
    connection.send_result(msg["id"], {"scanners": result})
