const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

class ForecastSolarProvider {

    constructor(cacheMs) {

        this.cacheFile = path.join(
            __dirname,
            "..",
            "data",
            "forecast-cache.json"
        );

        this.cacheLifetime =
            cacheMs;

        this.blockFile = path.join(
            __dirname,
            "..",
            "data",
            "forecastsolar-block.json"
        );
    }

    getBlockedUntil() {

        try {

            return JSON.parse(
                fs.readFileSync(this.blockFile, "utf8")
            ).blockedUntil || 0;
        }

        catch {

            return 0;
        }
    }

    setBlocked(response) {

        // Retry-Zeitpunkt aus Header lesen, sonst 1 Stunde warten
        let until = Date.now() + 60 * 60 * 1000;

        try {

            const retryAt =
                response.headers.get("x-ratelimit-retry-at");

            const retryAfter =
                response.headers.get("retry-after");

            if (retryAt && !isNaN(Date.parse(retryAt))) {

                until = Date.parse(retryAt) + 60 * 1000;
            }
            else if (retryAfter && !isNaN(Number(retryAfter))) {

                until = Date.now() + Number(retryAfter) * 1000;
            }
        }

        catch {}

        try {

            fs.mkdirSync(
                path.dirname(this.blockFile),
                { recursive: true }
            );

            fs.writeFileSync(
                this.blockFile,
                JSON.stringify({ blockedUntil: until })
            );
        }

        catch {}

        console.warn(
            "[FORECAST.SOLAR] Rate limit - gesperrt bis",
            new Date(until).toString()
        );
    }

    getStale(maxAgeMs) {

        const cached = this.loadCache();

        if (
            cached &&
            (Date.now() - cached.timestamp) < maxAgeMs
        ) {

            return cached;
        }

        return null;
    }

    async getForecast(config) {

        const cached =
            this.loadCache();

        if (
            cached &&
            (
                Date.now()
                -
                cached.timestamp
            ) < this.cacheLifetime
        ) {

            return cached.data;
        }

        if (
            Date.now() < this.getBlockedUntil()
        ) {

            const err =
                new Error(
                    "Forecast.Solar gesperrt (Rate Limit)"
                );

            err.code = "RATE_LIMIT";

            throw err;
        }

        const data =
            await this.fetchForecast(
                config
            );

        this.saveCache(
            data
        );

        return data;
    }

    async fetchForecast(config) {

        let totalToday = 0;
        let totalTomorrow = 0;

        const combinedWatts = {};
        const combinedWh = {};

        for (const array of config.arrays) {

            // Config: Kompass-Azimut (180 = Süd, 90 = Ost, 270 = West, 0 = Nord).
            // Forecast.Solar: 0 = Süd, -90 = Ost, 90 = West, +-180 = Nord.
            const fsAzimuth =
                ((Number(array.azimuth) - 180 + 540) % 360) - 180;

            const url =
                `https://api.forecast.solar/estimate/` +
                `${config.latitude}/` +
                `${config.longitude}/` +
                `${array.tilt}/` +
                `${fsAzimuth}/` +
                `${array.peakPower}`;

            const response =
                await fetch(url);

            if (
                response.status === 429
            ) {

                this.setBlocked(response);

                const err =
                    new Error(
                        "Forecast.Solar Rate Limit"
                    );

                err.code = "RATE_LIMIT";

                throw err;
            }

            if (
                !response.ok
            ) {

                throw new Error(
                    `Forecast.Solar returned ${response.status}`
                );
            }

            const json =
                await response.json();

            const dayKeys =
                Object.keys(
                    json.result.watt_hours_day
                ).sort();

            totalToday +=
                json.result
                    .watt_hours_day[
                        dayKeys[0]
                    ] / 1000;

            totalTomorrow +=
                json.result
                    .watt_hours_day[
                        dayKeys[1]
                    ] / 1000;

            Object.entries(
                json.result.watts
            ).forEach(
                ([timestamp, power]) => {

                    combinedWatts[
                        timestamp
                    ] =
                        (
                            combinedWatts[
                                timestamp
                            ] || 0
                        )
                        +
                        power;
                }
            );

            Object.entries(
                json.result.watt_hours
            ).forEach(
                ([timestamp, energy]) => {

                    combinedWh[
                        timestamp
                    ] =
                        (
                            combinedWh[
                                timestamp
                            ] || 0
                        )
                        +
                        energy;
                }
            );
        }

        let peakPower = 0;
        let peakTime = "--:--";

        Object.entries(
            combinedWatts
        ).forEach(
            ([timestamp, power]) => {

                if (
                    power >
                    peakPower
                ) {

                    peakPower =
                        power;

                    peakTime =
                        timestamp
                            .split(" ")[1]
                            .substring(
                                0,
                                5
                            );
                }
            }
        );

        return {

            today:
                Number(
                    totalToday
                        .toFixed(1)
                ),

            tomorrow:
                Number(
                    totalTomorrow
                        .toFixed(1)
                ),

            peakPower:
                Number(
                    (
                        peakPower
                        / 1000
                    ).toFixed(1)
                ),

            peakTime,

            wattHours:
                combinedWh
        };
    }


    getExpectedYieldNow(forecast) {

        if (!forecast || !forecast.wattHours) {

            return 0;
        }

        const now = Date.now();

        const d = new Date(now);

        const p = n => String(n).padStart(2, "0");

        const todayKey =
            `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

        // wattHours ist kumuliert pro Tag: größter Wert bis jetzt (nur heute)
        let bestWh = 0;

        Object.entries(
            forecast.wattHours
        ).forEach(
            ([timestamp, energy]) => {

                if (!timestamp.startsWith(todayKey)) {

                    return;
                }

                const ts =
                    new Date(
                        timestamp.replace(" ", "T")
                    ).getTime();

                if (
                    ts <= now &&
                    energy > bestWh
                ) {

                    bestWh = energy;
                }
            }
        );

        return Number(
            (bestWh / 1000).toFixed(2)
        );
    }

    loadCache() {

        try {

            if (
                !fs.existsSync(
                    this.cacheFile
                )
            ) {

                return null;
            }

            const cache = JSON.parse(

                fs.readFileSync(
                    this.cacheFile,
                    "utf8"
                )
            );

            // Defekten/leeren Cache verwerfen
            if (
                !cache ||
                !cache.timestamp ||
                !cache.data ||
                !cache.data.wattHours
            ) {

                return null;
            }

            return cache;
        }

        catch {

            return null;
        }
    }

    saveCache(data) {

        const dir =
            path.dirname(
                this.cacheFile
            );

        if (
            !fs.existsSync(dir)
        ) {

            fs.mkdirSync(
                dir,
                {
                    recursive: true
                }
            );
        }

        fs.writeFileSync(

            this.cacheFile,

            JSON.stringify(
                {
                    timestamp:
                        Date.now(),

                    data
                },
                null,
                2
            )
        );
    }
}

module.exports =
    ForecastSolarProvider;