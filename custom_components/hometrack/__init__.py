"""HomeTrack: track a Bluetooth device across a 3D model of the house."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from . import websocket
from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_FILE,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STATIC_URL,
)
from .plan import PlanStore

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(DOMAIN, {})
    websocket.async_register(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = hass.data.setdefault(DOMAIN, {})
    store = PlanStore(hass)
    await store.async_load()
    data["store"] = store
    await _async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    hass.data.get(DOMAIN, {}).pop("store", None)
    return True


async def _async_register_panel(hass: HomeAssistant) -> None:
    data = hass.data[DOMAIN]
    if not (FRONTEND_DIR / PANEL_FILE).is_file():
        _LOGGER.warning(
            "HomeTrack panel file is missing (%s). Install a release build, "
            "or run 'npm run build' in frontend/ for a development checkout",
            FRONTEND_DIR / PANEL_FILE,
        )
    if not data.get("static_registered"):
        # Static paths cannot be unregistered, so register them only once.
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), cache_headers=False)]
        )
        data["static_registered"] = True
    integration = await async_get_integration(hass, DOMAIN)
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{STATIC_URL}/{PANEL_FILE}?v={integration.version}",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=True,
        config={},
    )
