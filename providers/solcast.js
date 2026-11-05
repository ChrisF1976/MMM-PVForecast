const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

class SolcastProvider {

    constructor(config) {

        this.apiKey =
            config.apiKey;

        this.resourceId =
            config.resourceId;

        this.cacheFile =
            path.join(
                __dirname,
                "..",
                "data",
                "solcast-cache.json"
            );

        this.cacheLifetime =
            config.cacheMs;

        this.blockFile =
            path.join(
                __dirname,
                "..",
                "data",
                "solcast-block.json"
            );
    }

    //
    // Rate-Limit-Sperre (überlebt Neustarts)
    //
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

    setBlocked() {

        // Solcast setzt das Tageskontingent um 00:00 UTC zurück
        const now = new Date();

        const until =
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1,
                0,
                5,
                0
            );

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
            "[SOLCAST] Rate limit - gesperrt bis",
            new Date(until).toString()
        );
    }

    //
    // Veraltete Daten nur als letzte Notlösung
    //
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

    async getForecast() {

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

            console.log(
                "[SOLCAST] Using cache"
            );

            return cached.data;
        }

        if (
            Date.now() < this.getBlockedUntil()
        ) {

            const err =
                new Error(
                    "Solcast gesperrt (Rate Limit)"
                );

            err.code = "RATE_LIMIT";

            throw err;
        }

        {

            const forecastResponse =
                await fetch(
                    `https://api.solcast.com.au/rooftop_sites/${this.resourceId}/forecasts?format=json&api_key=${this.apiKey}`
                );

            if (
                forecastResponse.status === 429
            ) {

                const err =
                    new Error(
                        "Solcast Rate Limit"
                    );

                err.code =
                    "RATE_LIMIT";

                this.setBlocked();

                throw err;
            }

            if (
                !forecastResponse.ok
            ) {

                throw new Error(
                    `Solcast Forecast returned ${forecastResponse.status}`
                );
            }

            const actualResponse =
                await fetch(
                    `https://api.solcast.com.au/rooftop_sites/${this.resourceId}/estimated_actuals?format=json&api_key=${this.apiKey}`
                );

            if (
                actualResponse.status === 429
            ) {

                const err =
                    new Error(
                        "Solcast Rate Limit"
                    );

                err.code =
                    "RATE_LIMIT";

                this.setBlocked();

                throw err;
            }

            if (
                !actualResponse.ok
            ) {

                throw new Error(
                    `Solcast Actuals returned ${actualResponse.status}`
                );
            }

            const forecastJson =
                await forecastResponse.json();

            const actualJson =
                await actualResponse.json();

            const data =
                this.parseData(
                    forecastJson,
                    actualJson
                );

            this.saveCache(
                data
            );

            return data;
        }
    }

    //
    // Lokales Datum (Zeitzone des Servers) als Schlüssel, z. B. "2026-11-03"
    //
    dayKey(ts) {

        const d = new Date(ts);

        const p = n => String(n).padStart(2, "0");

        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    //
    // Alle 30-Minuten-Perioden von heute und morgen in einer Reihe:
    // Solcast "forecasts" liefert nur die Zukunft, "estimated_actuals"
    // die Vergangenheit. Für die Vergangenheit gelten die geschätzten
    // Ist-Werte, sonst würde der Tageswert über den Tag hinweg schrumpfen.
    //
    parseData(
        forecastJson,
        actualJson
    ) {

        const raw = {};

        const add = entry => {

            const end =
                new Date(entry.period_end).getTime();

            if (isNaN(end)) {

                return;
            }

            // kW Durchschnitt über 30 min -> Wh
            raw[end] =
                Math.round(
                    entry.pv_estimate * 1000 * 0.5
                );
        };

        (forecastJson.forecasts || []).forEach(add);

        // überschreibt Überlappungen: Ist-Schätzung vor Prognose
        (actualJson.estimated_actuals || []).forEach(add);

        const todayKey = this.dayKey(Date.now());

        const tomorrowKey =
            this.dayKey(Date.now() + 86400000);

        const periods = {};

        let todayWh = 0;
        let tomorrowWh = 0;

        let peakPower = 0;
        let peakTime = "--:--";

        Object.entries(raw)
            .sort((x, y) => Number(x[0]) - Number(y[0]))
            .forEach(
            ([end, wh]) => {

                const ts = Number(end);

                // Periode gehört zu dem Tag, in dem sie beginnt
                const key =
                    this.dayKey(ts - 30 * 60 * 1000);

                if (
                    key !== todayKey &&
                    key !== tomorrowKey
                ) {

                    return;
                }

                periods[ts] = wh;

                if (key === todayKey) {

                    todayWh += wh;

                    // Spitzenleistung nur für heute
                    const powerW = wh * 2;

                    if (powerW > peakPower) {

                        peakPower = powerW;

                        peakTime =
                            new Date(ts)
                                .toLocaleTimeString(
                                    "de-DE",
                                    {
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    }
                                );
                    }
                }
                else {

                    tomorrowWh += wh;
                }
            }
        );

        return {

            today:
                Number((todayWh / 1000).toFixed(1)),

            tomorrow:
                Number((tomorrowWh / 1000).toFixed(1)),

            peakPower:
                Number((peakPower / 1000).toFixed(1)),

            peakTime,

            periods
        };
    }

    //
    // Erwarteter Ertrag von heute 00:00 bis jetzt (kWh), die gerade
    // laufende Periode anteilig. Wird bei jedem Aufruf live berechnet.
    //
    getExpectedYieldNow(
        forecast
    ) {

        if (
            !forecast ||
            !forecast.periods
        ) {

            return 0;
        }

        const now = Date.now();

        const todayKey = this.dayKey(now);

        const HALF_HOUR = 30 * 60 * 1000;

        let totalWh = 0;

        Object.entries(
            forecast.periods
        ).forEach(
            ([end, wh]) => {

                const endTs = Number(end);

                const startTs = endTs - HALF_HOUR;

                if (
                    this.dayKey(startTs) !== todayKey ||
                    startTs >= now
                ) {

                    return;
                }

                if (endTs <= now) {

                    totalWh += wh;
                }
                else {

                    totalWh +=
                        wh * (now - startTs) / HALF_HOUR;
                }
            }
        );

        return Number(
            (totalWh / 1000).toFixed(2)
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

            // Cache im alten Format (ohne periods) verwerfen
            if (
                !cache ||
                !cache.data ||
                !cache.data.periods
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

        console.log(
            "[SOLCAST] Cache saved"
        );
    }
}

module.exports =
    SolcastProvider;