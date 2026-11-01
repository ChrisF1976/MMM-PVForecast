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

        const storage =
            json?.Body?.Data?.Inverters ||
            {};

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

        const actualYield =
            this.updateYield(
                pvPower
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

    updateYield(pvPower) {

        const today =
            new Date()
                .toISOString()
                .substring(
                    0,
                    10
                );

        let state = {

            date: today,

            yieldWh: 0,

            lastTimestamp:
                Date.now()
        };

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
            state.date !== today
        ) {

            state = {

                date: today,

                yieldWh: 0,

                lastTimestamp:
                    Date.now()
            };
        }

        const now =
            Date.now();

        const deltaSeconds =
            (
                now -
                state.lastTimestamp
            ) / 1000;

        state.yieldWh +=
            (
                pvPower *
                deltaSeconds
            ) / 3600;

        state.lastTimestamp =
            now;

        this.saveState(
            state
        );

        return Number(
            (
                state.yieldWh / 1000
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

      /*  return Number(

            (
                (
                    (
                        actualYield -
                        expectedYield
                    )
                    /
                    expectedYield
                )
                *
                100
            ).toFixed(
                1
            )
        );
	*/
	
    }
}

module.exports =
    FroniusProvider;