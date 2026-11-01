const NodeHelper = require("node_helper");

const ForecastSolarProvider =
    require("./providers/forecastsolar");

const SolcastProvider =
    require("./providers/solcast");

const FroniusProvider =
    require("./providers/fronius");

module.exports = NodeHelper.create({

    start() {

        console.log(
            "[MMM-PVForecast] started"
        );

        this.configData = null;

        this.forecastSolarProvider = null;
        this.solcastProvider = null;

        this.primaryProvider = null;

        this.froniusProvider = null;

        this.latestResult = null;
    },

    socketNotificationReceived(
        notification,
        payload
    ) {

        if (
            notification !==
            "PVFORECAST_CONFIG"
        ) {

            return;
        }

        this.configData =
            payload;

        //
        // Forecast.Solar
        //
        this.forecastSolarProvider =
            new ForecastSolarProvider();

        //
        // Solcast
        //
        if (
            payload.solcast
        ) {

            this.solcastProvider =
                new SolcastProvider(
                    payload.solcast
                );
        }

        //
        // Primärer Provider
        //
        if (
            payload.provider ===
            "solcast"
        ) {

            this.primaryProvider =
                "solcast";
        }
        else {

            this.primaryProvider =
                "forecastsolar";
        }

        console.log(
            "[MMM-PVForecast] Primary Provider:",
            this.primaryProvider
        );

        //
        // Fronius
        //
        if (
            payload.fronius &&
            payload.fronius.enabled
        ) {

            this.froniusProvider =
                new FroniusProvider(
                    payload.fronius.host
                );
        }

        this.updateData();

        setInterval(
            () => {

                this.updateData();

            },
            payload.updateInterval ||
            (
                30 * 60 * 1000
            )
        );

        if (
            this.froniusProvider
        ) {

            setInterval(
                () => {

                    this.updateFroniusOnly();

                },
                60 * 1000
            );
        }
    },

    async getForecastData() {

        //
        // Solcast primär
        //
        if (
            this.primaryProvider ===
            "solcast"
        ) {

            try {

                console.log(
                    "[MMM-PVForecast] Trying Solcast"
                );

                const forecast =
                    await this.solcastProvider
                        .getForecast(
                            this.configData
                        );

                const expectedYield =
                    this.solcastProvider
                        .getExpectedYieldNow(
                            forecast
                        );

                return {

                    forecast,
                    expectedYield
                };
            }

            catch (error) {

                console.warn(
                    "[MMM-PVForecast] Solcast failed, trying Forecast.Solar"
                );

                const forecast =
                    await this
                        .forecastSolarProvider
                        .getForecast(
                            this.configData
                        );

                const expectedYield =
                    this
                        .forecastSolarProvider
                        .getExpectedYieldNow(
                            forecast
                        );

                return {

                    forecast,
                    expectedYield
                };
            }
        }

        //
        // Forecast.Solar primär
        //
        try {

            console.log(
                "[MMM-PVForecast] Trying Forecast.Solar"
            );

            const forecast =
                await this
                    .forecastSolarProvider
                    .getForecast(
                        this.configData
                    );

            const expectedYield =
                this
                    .forecastSolarProvider
                    .getExpectedYieldNow(
                        forecast
                    );

            return {

                forecast,
                expectedYield
            };
        }

        catch (error) {

            console.warn(
                "[MMM-PVForecast] Forecast.Solar failed, trying Solcast"
            );

            const forecast =
                await this
                    .solcastProvider
                    .getForecast(
                        this.configData
                    );

            const expectedYield =
                this
                    .solcastProvider
                    .getExpectedYieldNow(
                        forecast
                    );

            return {

                forecast,
                expectedYield
            };
        }
    },

    async updateData() {

        try {

            const {

                forecast,
                expectedYield

            } =
                await this
                    .getForecastData();

            const result = {

                today:
                    forecast.today,

                tomorrow:
                    forecast.tomorrow,

                peakPower:
                    forecast.peakPower,

                peakTime:
                    forecast.peakTime,

                expectedYield,

                hasFronius:
                    false
            };

            if (
                this.froniusProvider
            ) {

                const fronius =
                    await this
                        .froniusProvider
                        .getData();

                const deltaPercent =
                    this
                        .froniusProvider
                        .calculateDelta(
                            fronius.actualYield,
                            expectedYield
                        );

                result.hasFronius =
                    true;

                result.actualYield =
                    fronius.actualYield;

                result.deltaPercent =
                    deltaPercent;

                result.batterySoc =
                    fronius.batterySoc;

                result.currentPV =
                    fronius.pvPower;
            }

            this.latestResult =
                result;

            this.sendSocketNotification(
                "PVFORECAST_DATA",
                result
            );
        }

        catch (error) {

            console.error(
                "[MMM-PVForecast]",
                error
            );
        }
    },

    async updateFroniusOnly() {

        try {

            if (
                !this.froniusProvider ||
                !this.latestResult
            ) {

                return;
            }

            const fronius =
                await this
                    .froniusProvider
                    .getData();

            const deltaPercent =
                this
                    .froniusProvider
                    .calculateDelta(
                        fronius.actualYield,
                        this.latestResult
                            .expectedYield
                    );

            this.latestResult.actualYield =
                fronius.actualYield;

            this.latestResult.deltaPercent =
                deltaPercent;

            this.latestResult.batterySoc =
                fronius.batterySoc;

            this.latestResult.currentPV =
                fronius.pvPower;

            this.sendSocketNotification(
                "PVFORECAST_DATA",
                this.latestResult
            );
        }

        catch (error) {

            console.error(
                "[MMM-PVForecast]",
                error
            );
        }
    }
});