# MMM-PVForecast

PV forecast and Fronius integration module for MagicMirror².

MMM-PVForecast combines multiple forecast providers with live data from a Fronius GEN24 inverter and automatically handles provider outages, rate limits and cached fallback data.

---

## Features

### Forecast Providers

Supported forecast services:

- Solcast
- Forecast.Solar

Select the preferred provider using:

```js
provider: "solcast"
```

or

```js
provider: "forecastsolar"
```

---

### Automatic Provider Failover

If the primary forecast source becomes unavailable, the module automatically switches to the secondary provider.

Example:

```text
Solcast
↓
Forecast.Solar
↓
Cached Forecast Data
```

or

```text
Forecast.Solar
↓
Solcast
↓
Cached Forecast Data
```

The display continues to work even if one forecast provider reaches its API rate limit.

---

### Fronius GEN24 Integration

Supported values:

- Current PV power
- Battery state of charge (SOC)
- Daily production
- Expected yield
- Actual yield
- Delta comparison (Actual / Expected)

Daily production is calculated from the inverter lifetime energy counter:

```text
Current E_Total
-
E_Total at start of day
=
Today's production
```

Advantages:

- Survives MagicMirror restarts
- Survives PM2 restarts
- Survives Raspberry Pi reboots
- No integration errors
- No continuous power accumulation required

---

### Smart Caching

Forecast.Solar cache:

```text
data/forecast-cache.json
```

Solcast cache:

```text
data/solcast-cache.json
```

Caches are automatically refreshed and reused whenever possible.

---

### Persistent Rate-Limit Protection

Forecast.Solar:

```text
data/forecastsolar-block.json
```

Solcast:

```text
data/solcast-block.json
```

When a provider reaches its API limit, the block information is stored on disk and survives restarts.

---

### Active Hours

To reduce API usage, forecast updates can be limited to a configurable time window.

Example:

```js
activeHours: {
    start: "07:00",
    end: "21:00"
}
```

Outside this window:

- No forecast API requests are sent
- Cached data remains available
- Fronius live values continue to update

Disable the feature completely:

```js
activeHours: false
```

---

## Installation

```bash
cd ~/MagicMirror/modules

git clone https://github.com/ChrisF1976/MMM-PVForecast.git

cd MMM-PVForecast

npm install
```

---

## Configuration

Example configuration:

```js
{
    module: "MMM-PVForecast",
    position: "top_right",

    config: {

        provider: "solcast",

        latitude: 52.2689,
        longitude: 10.5268,

        updateInterval:
            170 * 60 * 1000,

        activeHours: {
            start: "07:00",
            end: "21:00"
        },

        showLiveData: true,

        arrays: [

            {
                name: "South Roof",

                peakPower: 8.8,

                tilt: 40,

                azimuth: 180
            }
        ],

        solcast: {

            apiKey:
                "YOUR_API_KEY",

            resourceId:
                "YOUR_RESOURCE_ID"
        },

        fronius: {

            enabled: true,

            host:
                "192.168.178.134"
        }
    }
}
```

---

## PV Arrays

Array orientation uses standard compass directions:

```text
0°   = North
90°  = East
180° = South
270° = West
```

Example:

```js
{
    peakPower: 8.8,
    tilt: 40,
    azimuth: 180
}
```

Forecast.Solar azimuth conversion is handled automatically.

Multiple roof sections can be configured and are combined into a single forecast.

---

## Display

The module displays:

```text
Today
Tomorrow
Peak
```

When Fronius support is enabled:

```text
Actual
Expected
Delta
PV Now
Battery
```

The currently active forecast source is displayed in the title:

```text
Solcast
```

or

```text
Forecast.Solar
```

When cached fallback data is being used:

```text
Solcast (stale)
```

or

```text
Forecast.Solar (stale)
```

---

### Optional Live Data Section

Live Fronius values can be hidden:

```js
showLiveData: false
```

This hides:

```text
PV Now
Battery
```

while keeping the following values visible:

```text
Today
Tomorrow
Peak
Actual
Expected
Delta
```

Default:

```js
showLiveData: true
```

---

## Configuration Options

| Option | Description | Default |
|----------|-------------|----------|
| provider | Preferred forecast provider | `"solcast"` |
| latitude | Installation latitude | required |
| longitude | Installation longitude | required |
| updateInterval | Forecast update interval | `170 * 60 * 1000` |
| activeHours | Restrict forecast API calls to specific hours | `07:00 - 21:00` |
| showLiveData | Show live Fronius values (PV power and battery SOC) | `true` |
| arrays | PV array definitions | required |
| solcast | Solcast configuration | optional |
| fronius | Fronius GEN24 configuration | optional |

---

## Data Directory

The module automatically creates:

```text
data/
├── forecast-cache.json
├── forecastsolar-block.json
├── solcast-cache.json
├── solcast-block.json
└── store.json
```

---

### store.json

Used by the Fronius integration to store the energy counter value at the beginning of the current day.

Example:

```json
{
    "date": "2026-11-05",
    "startEnergy": 31252375.66
}
```

---

## Dependencies

```json
{
    "dependencies": {
        "node-fetch": "^2.7.0"
    }
}
```

---

## License

MIT

---

## Author

Chris
