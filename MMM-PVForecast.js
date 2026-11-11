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
        document.createElement("div");

    wrapper.className =
        "pvforecast";

    if (!this.dataLoaded) {

        wrapper.innerHTML = `
            <div class="pv-card">
                <div class="pv-loading">
                    Loading PV Forecast...
                </div>
            </div>
        `;

        return wrapper;
    }

    const providerName =
        this.forecast.source === "solcast"
            ? "Solcast"
            : this.forecast.source === "openmeteo"
                ? "Open-Meteo"
                : "Forecast.Solar";

    const maxForecast =
        Math.max(
            this.forecast.today,
            this.forecast.tomorrow,
            1
        );

    const todayWidth =
        (
            this.forecast.today
            /
            maxForecast
        ) * 100;

    const tomorrowWidth =
        (
            this.forecast.tomorrow
            /
            maxForecast
        ) * 100;

    const deltaClass =
        this.forecast.deltaPercent >= 100
            ? "pv-positive"
            : "pv-negative";

    wrapper.innerHTML = `

        <div class="pv-card">

            <div class="pv-header">

                <div class="pv-title">
                    ☀ PV Forecast
                </div>

                <div class="pv-provider">
                    ${providerName}${this.forecast.stale ? " (alt)" : ""}
                </div>

            </div>

            <div class="pv-forecast-row">

                <div class="pv-label">
                    Today
                </div>

                <div class="pv-bar">
                    <div
                        class="pv-bar-fill"
                        style="
                            width:${todayWidth}%;
                        "
                    ></div>
                </div>

                <div class="pv-value">
                    ${this.forecast.today.toFixed(1)} kWh
                </div>

            </div>

            <div class="pv-forecast-row">

                <div class="pv-label">
                    Tomorrow
                </div>

                <div class="pv-bar">
                    <div
                        class="pv-bar-fill"
                        style="
                            width:${tomorrowWidth}%;
                        "
                    ></div>
                </div>

                <div class="pv-value">
                    ${this.forecast.tomorrow.toFixed(1)} kWh
                </div>

            </div>

            <div class="pv-peak-row">

                <div>
                    ⚡ Peak
                </div>

                <div>
                    ${this.forecast.peakPower.toFixed(1)} kW
                </div>

                <div>
                    ${this.forecast.peakTime}
                </div>

            </div>

            <div class="pv-separator"></div>

            <div class="pv-stat-row">
                <span>✓ Actual</span>
                <span>${this.forecast.actualYield.toFixed(2)} kWh</span>
            </div>

            <div class="pv-stat-row">
                <span>◉ Forecast</span>
                <span>${this.forecast.today.toFixed(2)} kWh</span>
            </div>

            <div class="pv-delta-row">

                <span>
                    ▲ Delta
                </span>

                <span class="${deltaClass}">
                    ${this.forecast.deltaPercent.toFixed(1)} %
                </span>

            </div>

            ${this.config.showLiveData ? `

                <div class="pv-separator"></div>

                <div class="pv-live-grid">

                    <div class="pv-live-card">

                        <div class="pv-live-label">
                            ⚡ PV Now
                        </div>

                        <div class="pv-live-value">
                            ${(this.forecast.currentPV * 1000).toFixed(0)} W
                        </div>

                    </div>

                    <div class="pv-live-card">

                        <div class="pv-live-label">
                            🔋 Battery
                        </div>

                        <div class="pv-live-value">
                            ${this.forecast.batterySoc} %
                        </div>

                    </div>

                </div>

            ` : ""}

        </div>
    `;

    return wrapper;
}

});