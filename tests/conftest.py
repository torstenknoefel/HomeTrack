"""Shared fixtures."""

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.hometrack.const import DOMAIN


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Let Home Assistant load integrations from custom_components/."""
    yield


@pytest.fixture
async def setup_entry(hass):
    """A loaded HomeTrack config entry."""
    entry = MockConfigEntry(domain=DOMAIN, title="HomeTrack", data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry
