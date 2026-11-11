---

## Changelog

## v1.5.1

### Added

- Added modern dashboard-style user interface
- Added dynamic forecast bars for Today and Tomorrow
- Added provider badge in module header
- Added compact live data cards for PV power and battery status

### Changed

- Reworked module layout from table view to dashboard view
- Replaced "Expected Yield" display with "Forecast" (daily forecast)
- Delta calculation now compares actual production against today's forecast
- Simplified Open-Meteo integration
- Removed dependency on forecast timeline data for delta calculations

### Improved

- Better readability from a distance
- Improved visual hierarchy
- Improved support for Open-Meteo forecasts

---

### v1.5.0

#### Added

- Added Open-Meteo forecast provider
- Added automatic fallback support between Open-Meteo, Solcast and Forecast.Solar
- Added Open-Meteo provider indicator in module header
- Added Open-Meteo cache support
- Added local Python virtual environment support (`.venv`)
- Added Open-Meteo installation instructions to README

#### Improved

- Improved provider failover logic
- Improved forecast source detection and display
- Improved documentation and configuration examples

---

### v1.4.0

#### Added

- Fronius GEN24 integration
- Daily production calculation based on inverter lifetime counter
- Battery state of charge (SOC)
- Live PV power display
- Delta comparison between actual and expected yield

#### Added Persistence

- Persistent daily baseline storage (`store.json`)
- Persistent provider cache files
- Persistent API limit protection

---

### v1.3.0

#### Added

- Solcast provider support
- Automatic fallback between Solcast and Forecast.Solar
- Provider source display in module header

---

### v1.2.0

#### Added

- Active hours support
- Smart cache handling
- Automatic retry after provider failures

---

### v1.1.0

#### Added

- Forecast.Solar integration
- Peak production display
- Today and tomorrow forecast values

---

### v1.0.0

#### Initial Release

- Forecast display for MagicMirror²
- Forecast.Solar support
- Multiple PV array support
