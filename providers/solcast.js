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
            30 * 60 * 1000;
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

        try {

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

        catch (error) {

            if (cached) {

                console.warn(
                    "[SOLCAST] Using cached data"
                );

                return cached.data;
            }

            throw error;
        }
    }

    parseData(
        forecastJson,
        actualJson
    ) {

        const forecasts =
            forecastJson.forecasts || [];

        const actuals =
            actualJson
                .estimated_actuals || [];

        let todayWh = 0;
        let tomorrowWh = 0;

        let peakPower = 0;
        let peakTime = "--:--";

        const expectedActuals = {};

        const today =
            new Date()
                .toISOString()
                .substring(
                    0,
                    10
                );

        const tomorrow =
            new Date(
                Date.now()
                +
                86400000
            )
                .toISOString()
                .substring(
                    0,
                    10
                );

        forecasts.forEach(
            entry => {

                const ts =
                    new Date(
                        entry.period_end
                    );

                const date =
                    ts
                        .toISOString()
                        .substring(
                            0,
                            10
                        );

                const powerW =
                    Math.round(
                        entry.pv_estimate
                        *
                        1000
                    );

                const intervalWh =
                    powerW
                    *
                    0.5;

                if (
                    date === today
                ) {

                    todayWh +=
                        intervalWh;
                }

                if (
                    date === tomorrow
                ) {

                    tomorrowWh +=
                        intervalWh;
                }

                if (
                    powerW >
                    peakPower
                ) {

                    peakPower =
                        powerW;

                    peakTime =
                        ts
                            .toLocaleTimeString(
                                "de-DE",
                                {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                }
                            );
                }
            }
        );

        actuals.forEach(
            entry => {

                const ts =
                    new Date(
                        entry.period_end
                    );

                const date =
                    ts
                        .toISOString()
                        .substring(
                            0,
                            10
                        );

                if (
                    date !== today
                ) {

                    return;
                }

                const powerW =
                    Math.round(
                        entry.pv_estimate
                        *
                        1000
                    );

                const intervalWh =
                    powerW
                    *
                    0.5;

                expectedActuals[
                    entry.period_end
                ] =
                    intervalWh;
            }
        );

        return {

            today:
                Number(
                    (
                        todayWh
                        /
                        1000
                    ).toFixed(
                        1
                    )
                ),

            tomorrow:
                Number(
                    (
                        tomorrowWh
                        /
                        1000
                    ).toFixed(
                        1
                    )
                ),

            peakPower:
                Number(
                    (
                        peakPower
                        /
                        1000
                    ).toFixed(
                        1
                    )
                ),

            peakTime,

            expectedActuals
        };
    }

    getExpectedYieldNow(
        forecast
    ) {

        let totalWh = 0;

        let matched =
            null;

        const now =
            Date.now();

        Object.entries(
            forecast.expectedActuals
        ).forEach(
            ([timestamp, wh]) => {

                const ts =
                    new Date(
                        timestamp
                    ).getTime();

                if (
                    ts <= now
                ) {

                    totalWh +=
                        wh;

                    matched =
                        timestamp;
                }
            }
        );

        console.log(
            "[SOLCAST] NOW:",
            new Date().toString()
        );

        console.log(
            "[SOLCAST] MATCHED:",
            matched
        );

        console.log(
            "[SOLCAST] TOTAL WH:",
            totalWh
        );

        console.log(
            "[SOLCAST] EXPECTED:",
            (
                totalWh
                /
                1000
            ).toFixed(
                2
            ),
            "kWh"
        );

        return Number(
            (
                totalWh
                /
                1000
            ).toFixed(
                2
            )
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

            return JSON.parse(
                fs.readFileSync(
                    this.cacheFile,
                    "utf8"
                )
            );
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