const { execFile } = require("child_process");
const path = require("path");

class OpenMeteoProvider {

    async getForecast(config) {

        return new Promise((resolve, reject) => {

            const array = config.arrays[0];

            /*
             * Open-Meteo nutzt dieselbe Azimutlogik
             * wie Forecast.Solar:
             *
             * 0   = Süd
             * -90 = Ost
             * 90  = West
             * 180 = Nord
             */

            const omAzimuth =
                ((Number(array.azimuth) - 180 + 540) % 360) - 180;

            const script =
                path.join(__dirname, "openmeteo.py");

            const python = path.join(
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
                (error, stdout, stderr) => {

                    if (error) {
                        reject(
                            new Error(
                                stderr || error.message
                            )
                        );
                        return;
                    }

                    try {
                        resolve(
                            JSON.parse(stdout)
                        );
                    } catch (err) {
                        reject(err);
                    }
                }
            );
        });
    }

    getExpectedYieldNow(forecast) {

        if (!forecast?.periods) {
            return 0;
        }

        const now = Date.now();

        let nearest = 0;
        let nearestDelta = Number.MAX_SAFE_INTEGER;

        Object.entries(forecast.periods)
            .forEach(([timestamp, value]) => {

                const diff =
                    Math.abs(
                        Number(timestamp) - now
                    );

                if (diff < nearestDelta) {
                    nearestDelta = diff;
                    nearest = value;
                }
            });

        return nearest;
    }
}

module.exports = OpenMeteoProvider;