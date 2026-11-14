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

    batteryIcon(soc) {

        if (soc >= 88) return "fa-battery-full";
        if (soc >= 63) return "fa-battery-three-quarters";
        if (soc >= 38) return "fa-battery-half";
        if (soc >= 13) return "fa-battery-quarter";
        return "fa-battery-empty";
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

        const f = this.forecast;

        const providerName =
            f.source === "solcast"
                ? "Solcast"
                : f.source === "openmeteo"
                    ? "Open-Meteo"
                    : "Forecast.Solar";

        const maxForecast =
            Math.max(
                f.today,
                f.tomorrow,
                1
            );

        const todayWidth =
            (f.today / maxForecast) * 100;

        const tomorrowWidth =
            (f.tomorrow / maxForecast) * 100;

        // deltaPercent ist bisher das Verhaeltnis Ist/Soll in % (100 = exakt).
        // Anzeige als echte Abweichung: -12.0 % bzw. +44.2 %
        const delta =
            f.deltaPercent - 100;

        const deltaClass =
            delta >= 0
                ? "pv-positive"
                : "pv-negative";

        const deltaText =
            (delta >= 0 ? "+" : "")
            + delta.toFixed(1)
            + " %";

        wrapper.innerHTML = `

        <div class="pv-card">

            <div class="pv-header">

                <div class="pv-title">
                    <i class="fa fa-sun"></i>
                    <span>PV Forecast</span>
                </div>

                <div class="pv-provider">
                    ${providerName}${f.stale ? " (alt)" : ""}
                </div>

            </div>

            <div class="pv-forecast-row">

                <div class="pv-label">Today</div>

                <div class="pv-bar">
                    <div
                        class="pv-bar-fill"
                        style="width:${todayWidth}%;"
                    ></div>
                </div>

                <div class="pv-value">
                    ${f.today.toFixed(1)} kWh
                </div>

            </div>

            <div class="pv-forecast-row">

                <div class="pv-label">Tomorrow</div>

                <div class="pv-bar">
                    <div
                        class="pv-bar-fill"
                        style="width:${tomorrowWidth}%;"
                    ></div>
                </div>

                <div class="pv-value">
                    ${f.tomorrow.toFixed(1)} kWh
                </div>

            </div>

            <div class="pv-peak-row">
                <span class="pv-peak-left">
                    <i class="fa fa-chart-bar pv-icon"></i>
                    <span class="pv-peak-label">Peak</span>
                </span>
                <span class="pv-peak-value">${f.peakPower.toFixed(1)} kW</span>
                <span class="pv-peak-time">at ${f.peakTime}</span>
            </div>

            <div class="pv-separator"></div>

            <div class="pv-stat-row">
                <span class="pv-stat-left">
                    <i class="fa fa-bolt pv-icon"></i>
                    <span class="pv-stat-label">Actual</span>
                </span>
                <span class="pv-stat-value">${f.actualYield.toFixed(1)} kWh</span>
            </div>

            <div class="pv-stat-row">
                <span class="pv-stat-left">
                    <i class="fa fa-bullseye pv-icon"></i>
                    <span class="pv-stat-label">Expected</span>
                </span>
                <span class="pv-stat-value">${f.today.toFixed(1)} kWh</span>
            </div>

            <div class="pv-stat-row">
                <span class="pv-stat-left">
                    <i class="fa fa-chart-line pv-icon"></i>
                    <span class="pv-stat-label">Delta</span>
                </span>
                <span class="pv-stat-value ${deltaClass}">${deltaText}</span>
            </div>

            ${this.config.showLiveData ? `

                <div class="pv-separator"></div>

                <div class="pv-live-grid">

                    <div class="pv-live-card">
                        <i class="fa fa-solar-panel pv-live-icon"></i>
                        <div class="pv-live-text">
                            <div class="pv-live-label">PV Now</div>
                            <div class="pv-live-value">
                                ${(f.currentPV * 1000).toFixed(0)} W
                            </div>
                        </div>
                    </div>

                    <div class="pv-live-card">
                        <i class="fa ${this.batteryIcon(f.batterySoc)} pv-live-icon"></i>
                        <div class="pv-live-text">
                            <div class="pv-live-label">Battery</div>
                            <div class="pv-live-value">
                                ${f.batterySoc} %
                            </div>
                        </div>
                    </div>

                </div>

            ` : ""}

        </div>
        `;

        return wrapper;
    }

});
