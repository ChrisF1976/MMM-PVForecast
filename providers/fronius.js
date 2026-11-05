const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

class FroniusProvider {

    constructor(host) {

        this.host = host;

        this.storeFile =
            path.join(
                __dirname,
                "..",
                "data",
                "store.json"
            );
    }

    async getData() {

        const response =
            await fetch(
                `http://${this.host}/solar_api/v1/GetPowerFlowRealtimeData.fcgi`
            );

        if (!response.ok) {

            throw new Error(
                `Fronius returned ${response.status}`
            );
        }

        const json =
            await response.json();

        const site =
            json?.Body?.Data?.Site || {};

        const inverters =
            json?.Body?.Data?.Inverters || {};

        const inverter =
            Object.values(
                inverters
            )[0] || {};

        const pvPower =
            Number(
                site.P_PV || 0
            );

        const batterySoc =
            Number(
                (
                    inverter.SOC || 0
                ).toFixed(0)
            );

        const totalEnergy =
            Number(
                inverter.E_Total || 0
            );

        const actualYield =
            this.updateYield(
                totalEnergy
            );

        return {

            pvPower:
                Number(
                    (
                        pvPower / 1000
                    ).toFixed(1)
                ),

            batterySoc,

            actualYield
        };
    }

    updateYield(totalEnergy) {

        const today =
            new Date()
                .toISOString()
                .substring(
                    0,
                    10
                );

        let state = null;

        try {

            if (
                fs.existsSync(
                    this.storeFile
                )
            ) {

                state =
                    JSON.parse(
                        fs.readFileSync(
                            this.storeFile,
                            "utf8"
                        )
                    );
            }
        }

        catch (err) {

            console.error(
                "[FRONIUS] Store read failed",
                err
            );
        }

        if (
            !state ||
            state.date !== today ||
            typeof state.startEnergy !== "number"
        ) {

            state = {

                date: today,

                startEnergy:
                    totalEnergy
            };

            this.saveState(
                state
            );

            return 0;
        }

        const yieldWh =
            totalEnergy -
            state.startEnergy;

        return Number(
            (
                Math.max(
                    0,
                    yieldWh
                ) / 1000
            ).toFixed(
                2
            )
        );
    }

    saveState(state) {

        const dir =
            path.dirname(
                this.storeFile
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

            this.storeFile,

            JSON.stringify(
                state,
                null,
                2
            )
        );
    }

    calculateDelta(
        actualYield,
        expectedYield
    ) {

        if (
            !expectedYield ||
            expectedYield <= 0
        ) {

            return 0;
        }

        return Number(
            (
                (
                    actualYield
                    /
                    expectedYield
                )
                * 100
            ).toFixed(1)
        );
    }
}

module.exports =
    FroniusProvider;