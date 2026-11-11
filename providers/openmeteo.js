const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

class OpenMeteoProvider {

    constructor(cacheMs = 0) {

        this.cacheFile =
            path.join(
                __dirname,
                "..",
                "data",
                "openmeteo-cache.json"
            );

        this.cacheLifetime =
            cacheMs;
    }

    getStale(maxAgeMs) {

        const cached =
            this.loadCache();

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

        const data =
            await new Promise(
                (resolve, reject) => {

                    const array =
                        config.arrays[0];

                    /*
                     * Open-Meteo nutzt dieselbe
                     * Azimutlogik wie Forecast.Solar
                     *
                     * 0   = Süd
                     * -90 = Ost
                     * 90  = West
                     * 180 = Nord
                     */

                    const omAzimuth =
                        (
                            (
                                Number(array.azimuth)
                                - 180
                                + 540
                            )
                            % 360
                        )
                        - 180;

                    const script =
                        path.join(
                            __dirname,
                            "openmeteo.py"
                        );

                    const python =
                        path.join(
                            __dirname,
                            "..",
                            ".venv",
                            "bin",
                            "python"
                        );

                    execFile(
                        python,
                        [
                            script,
                            config.latitude,
                            config.longitude,
                            array.tilt,
                            omAzimuth,
                            array.peakPower
                        ],
                        {
                            timeout: 120000
                        },
                        (
                            error,
                            stdout,
                            stderr
                        ) => {

                            if (error) {

                                reject(
                                    new Error(
                                        stderr ||
                                        error.message
                                    )
                                );

                                return;
                            }

                            try {

                                resolve(
                                    JSON.parse(
                                        stdout
                                    )
                                );

                            }
                            catch (err) {

                                reject(err);
                            }
                        }
                    );
                }
            );

        this.saveCache(data);

        return data;
    }

    getExpectedYieldNow() {

        return 0;
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

            const cache =
                JSON.parse(
                    fs.readFileSync(
                        this.cacheFile,
                        "utf8"
                    )
                );

            if (
                !cache ||
                !cache.timestamp ||
                !cache.data
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
    OpenMeteoProvider;