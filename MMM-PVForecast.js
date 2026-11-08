Module.register("MMM-PVForecast", {

    defaults: {

        provider: "solcast",

        // Zeilen "PV Jetzt" und "Akku" anzeigen (nur mit Fronius)
        showLiveData: true,

        // Zeitfenster (Serverzeit), in dem Forecast-APIs abgerufen werden.
        // false = rund um die Uhr
        activeHours: {
            start: "07:00",
            end: "21:00"
        },

        updateInterval:
            120 * 60 * 1000
    },

    start() {

        this.dataLoaded =
            false;

        this.forecast = {

            today: 0,
            tomorrow: 0,

            peakPower: 0,
            peakTime: "--:--",

            expectedYield: 0,

            actualYield: 0,

            deltaPercent: 0,

            batterySoc: 0,

            currentPV: 0,

            hasFronius: false
        };

        this.sendSocketNotification(
            "PVFORECAST_CONFIG",
            this.config
        );
    },

    notificationReceived(
        notification,
        payload
    ) {

        if (
            notification ===
            "MODULE_DOM_CREATED"
        ) {

            this.updateDom(
                1000
            );
        }
    },

    socketNotificationReceived(
        notification,
        payload
    ) {

        if (
            notification !==
            "PVFORECAST_DATA"
        ) {

            return;
        }

        this.forecast =
            payload;

        this.dataLoaded =
            true;

        this.updateDom(
            1000
        );
    },

    getStyles() {

        return [

            "MMM-PVForecast.css"
        ];
    },

    getDom() {

        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "pvforecast";

        if (
            !this.dataLoaded
        ) {

            wrapper.innerHTML =
                `
                <div class="pv-title">
                    PV Forecast
                </div>

                <div class="pv-loading">
                    Lade Daten...
                </div>
                `;

            return wrapper;
        }

        const deltaClass =
            this.forecast
                .deltaPercent >= 0

                ? "pv-positive"

                : "pv-negative";

        wrapper.innerHTML =

            `
            <div class="pv-title">
	    PV Forecast
	    <small style="opacity:.5;font-size:.55em;">
	        ${
	            this.forecast.source === "solcast"
	                ? "Solcast"
	                : this.forecast.source === "openmeteo"
	                    ? "Open-Meteo"
	                    : "Forecast.Solar"
	        }${this.forecast.stale ? " (alt)" : ""}
	    </small>
	</div>

            <div class="pv-row">
                <span>
                    Heute
                </span>

                <span>
                    ${this.forecast.today.toFixed(1)} kWh
                </span>
            </div>

            <div class="pv-row">
                <span>
                    Morgen
                </span>

                <span>
                    ${this.forecast.tomorrow.toFixed(1)} kWh
                </span>
            </div>

            <div class="pv-row">
                <span>
                    Peak
                </span>

                <span>
                    ${this.forecast.peakPower.toFixed(1)} kW
                    @
                    ${this.forecast.peakTime}
                </span>
            </div>
            `;

        if (
            this.forecast.hasFronius
        ) {

            wrapper.innerHTML +=

                `
                <div class="pv-separator"></div>

                <div class="pv-row">
                    <span>
                        Ist
                    </span>

                    <span>
                        ${this.forecast.actualYield.toFixed(2)} kWh
                    </span>
                </div>

                <div class="pv-row">
                    <span>
                        Soll
                    </span>

                    <span>
                        ${this.forecast.expectedYield.toFixed(2)} kWh
                    </span>
                </div>

                <div class="pv-row">
                    <span>
                        Delta
                    </span>

                    <span class="${deltaClass}">
                        ${this.forecast.deltaPercent.toFixed(1)}%
                    </span>
                </div>
                `;

            if (this.config.showLiveData) {

                wrapper.innerHTML +=

                    `
                <div class="pv-separator"></div>

                <div class="pv-row">
                    <span>
                        PV Jetzt
                    </span>

                    <span>
                        ${this.forecast.currentPV.toFixed(1)} kW
                    </span>
                </div>

                <div class="pv-row">
                    <span>
                        Akku
                    </span>

                    <span>
                        ${this.forecast.batterySoc}%
                    </span>
                </div>
                    `;
            }

        }

        return wrapper;
    }
});