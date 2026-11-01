const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

class ForecastSolarProvider {

    constructor() {

        this.cacheFile = path.join(
            __dirname,
            "..",
            "data",
            "forecast-cache.json"
        );

        this.cacheLifetime =
            30 * 60 * 1000;
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

        try {

            const data =
                await this.fetchForecast(
                    config
                );

            this.saveCache(
                data
            );

            return data;
        }

        catch (error) {

            if (cached) {

                console.warn(
                    "[MMM-PVForecast] Using cached forecast"
                );

                return cached.data;
            }

            throw error;
        }
    }

    async fetchForecast(config) {

        let totalToday = 0;
        let totalTomorrow = 0;

        const combinedWatts = {};
        const combinedWh = {};

        for (const array of config.arrays) {

            const url =
                `https://api.forecast.solar/estimate/` +
                `${config.latitude}/` +
                `${config.longitude}/` +
                `${array.tilt}/` +
                `${array.azimuth}/` +
                `${array.peakPower}`;

            const response =
                await fetch(url);

            if (
                response.status === 429
            ) {

                throw new Error(
                    "Forecast.Solar Rate Limit"
                );
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
	
	    const now =
	        Date.now();
	
	    let bestWh = 0;
	
	    let bestTimestamp = null;
	
	    Object.entries(
	        forecast.wattHours
	    ).forEach(
	        ([timestamp, energy]) => {
	
	            const ts =
	                new Date(
	                    timestamp.replace(
	                        " ",
	                        "T"
	                    )
	                ).getTime();
	
	            if (
	                ts <= now &&
	                energy > bestWh
	            ) {
	
	                bestWh =
	                    energy;
	
	                bestTimestamp =
	                    timestamp;
	            }
	        }
	    );
	
	    console.log(
	        "[PV] NOW:",
	        new Date().toString()
	    );
	
	    console.log(
	        "[PV] MATCHED:",
	        bestTimestamp
	    );
	
	    console.log(
	        "[PV] EXPECTED WH:",
	        bestWh
	    );
	
	    console.log(
	        "[PV] EXPECTED KWH:",
	        (
	            bestWh / 1000
	        ).toFixed(2)
	    );
	
	    return Number(
	        (
	            bestWh / 1000
	        ).toFixed(2)
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
    }
}

module.exports =
    ForecastSolarProvider;