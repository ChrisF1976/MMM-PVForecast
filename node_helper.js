const NodeHelper = require("node_helper");

const OpenMeteoProvider =
    require("./providers/openmeteo");

const ForecastSolarProvider =
    require("./providers/forecastsolar");

const SolcastProvider =
    require("./providers/solcast");

const FroniusProvider =
    require("./providers/fronius");

// Veraltete Daten im laufenden Betrieb (beide Provider down): max. 6 h
const STALE_MAX_AGE = 6 * 60 * 60 * 1000;

// Wiederholung nach Fehlschlag (innerhalb der aktiven Zeit)
const RETRY_AFTER_FAILURE = 15 * 60 * 1000;

const DEFAULT_ACTIVE_HOURS = { start: "07:00", end: "21:00" };

function parseTime(value, fallback) {

    if (typeof value === "number" && isFinite(value)) {

        return value;
    }

    if (typeof value === "string") {

        const m = value.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);

        if (m) {

            return Number(m[1]) + Number(m[2] || 0) / 60;
        }
    }

    return fallback;
}

function startOfDay(ts) {

    const d = new Date(ts);

    return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
    ).getTime();
}

function dayDiff(then, now) {

    return Math.round(
        (startOfDay(now) - startOfDay(then)) / 86400000
    );
}

module.exports = NodeHelper.create({

    start() {

        console.log("[MMM-PVForecast] started");

        this.configData = null;

        this.forecastSolarProvider = null;
        this.solcastProvider = null;
	this.openMeteoProvider = null;
        this.primaryProvider = null;
        this.froniusProvider = null;

        this.base = null;          // letzte Forecast-Daten
        this.froniusData = null;   // letzte Fronius-Daten

        this.activeSource = null;
        this.lastAttempt = 0;
        this.lastFailed = false;
        this.offlineLoaded = false;
    },

    socketNotificationReceived(notification, payload) {

        if (notification !== "PVFORECAST_CONFIG") {

            return;
        }

        this.configData = payload;

        // Timer aufräumen (Config wird bei jedem Browser-Reload erneut gesendet)
        if (this.updateTimer) {

            clearInterval(this.updateTimer);
        }

        if (this.froniusTimer) {

            clearInterval(this.froniusTimer);
        }

        //
        // Intervall / Cache-Dauer
        // (Cache = updateInterval minus 1 Min. Toleranz, damit jeder
        // Abruf wirklich neu lädt und nicht den Cache trifft)
        //
        this.intervalMs =
            payload.updateInterval || (30 * 60 * 1000);

        const cacheMs =
            Math.max(0, this.intervalMs - 60 * 1000);

        //
        // Aktive Zeit (Serverzeit). activeHours: false = rund um die Uhr
        //
        if (payload.activeHours === false) {

            this.activeWindow = null;
        }
        else {

            const ah = payload.activeHours || DEFAULT_ACTIVE_HOURS;

            this.activeWindow = {
                start: parseTime(ah.start, 7),
                end: parseTime(ah.end, 21)
            };
        }

        console.log(
            "[MMM-PVForecast] Aktive Zeit:",
            this.activeWindow
                ? `${this.activeWindow.start}h - ${this.activeWindow.end}h`
                : "24h"
        );

        this.forecastSolarProvider =
            new ForecastSolarProvider(cacheMs);

        this.solcastProvider = null;

	this.openMeteoProvider =
    	    new OpenMeteoProvider(cacheMs);

        if (
            payload.solcast &&
            payload.solcast.apiKey &&
            payload.solcast.resourceId
        ) {

            this.solcastProvider =
                new SolcastProvider({
                    ...payload.solcast,
                    cacheMs
                });
        }

        if (
	    payload.provider === "solcast" &&
	    this.solcastProvider
	) {
	    this.primaryProvider = "solcast";
	}
	else if (
	    payload.provider === "openmeteo"
	) {
	    this.primaryProvider = "openmeteo";
	}
	else {
	    this.primaryProvider = "forecastsolar";
	}

        console.log(
            "[MMM-PVForecast] Primary Provider:",
            this.primaryProvider,
            "| Solcast verfügbar:",
            !!this.solcastProvider
        );

        this.froniusProvider = null;

        if (payload.fronius && payload.fronius.enabled) {

            this.froniusProvider =
                new FroniusProvider(payload.fronius.host);
        }

        this.lastAttempt = 0;
        this.lastFailed = false;
        this.offlineLoaded = false;

        // Prüft jede Minute, ob ein Forecast-Abruf fällig ist
        this.tick();

        this.updateTimer =
            setInterval(() => this.tick(), 60 * 1000);

        if (this.froniusProvider) {

            this.froniusTimer =
                setInterval(
                    () => this.updateFroniusOnly(),
                    60 * 1000
                );
        }
    },

    isActive(date) {

        if (!this.activeWindow) {

            return true;
        }

        const h = date.getHours() + date.getMinutes() / 60;

        const { start, end } = this.activeWindow;

        if (start === end) {

            return true;
        }

        return start < end
            ? (h >= start && h < end)
            : (h >= start || h < end);
    },

    tick() {

        const now = Date.now();

        if (this.isActive(new Date(now))) {

            const wait =
                this.lastFailed
                    ? Math.min(this.intervalMs, RETRY_AFTER_FAILURE)
                    : this.intervalMs;

            if (now - this.lastAttempt >= wait - 5000) {

                this.lastAttempt = now;

                this.updateData(false);
            }

            return;
        }

        // Außerhalb der aktiven Zeit: keine API-Calls. Beim Start einmalig
        // die letzten Cache-Daten laden, damit das Modul nicht leer bleibt.
        if (!this.base && !this.offlineLoaded) {

            this.offlineLoaded = true;

            this.updateData(true);
        }
    },

    //
    // Reihenfolge: primärer Provider, danach der andere (falls verfügbar)
    //
    getProviderOrder() {

        const all = {
            solcast: this.solcastProvider,
	    openmeteo: this.openMeteoProvider,
            forecastsolar: this.forecastSolarProvider
        };

        const orders = {
	    solcast: [
	        "solcast",
	        "openmeteo",
	        "forecastsolar"
	    ],
	
	    openmeteo: [
	        "openmeteo",
	        "solcast",
	        "forecastsolar"
	    ],
	
	    forecastsolar: [
	        "forecastsolar",
	        "openmeteo",
	        "solcast"
	    ]
	};
	
	const names =
	    orders[this.primaryProvider];

        return names
            .filter(name => all[name])
            .map(name => ({ name, provider: all[name] }));
    },

    //
    // Einmaliger Start-Abruf bei Forecast.Solar außerhalb der aktiven Zeit
    // (kostenlos, kein Solcast-Kontingent), damit die Anzeige nicht bis
    // zum Morgen leer oder veraltet bleibt.
    //
    async bootstrapForecastSolar() {

        if (!this.forecastSolarProvider) {

            return null;
        }

        try {

            console.log(
                "[MMM-PVForecast] Kein aktueller Cache - einmaliger Start-Abruf Forecast.Solar"
            );

            const forecast =
                await this.forecastSolarProvider.getForecast(
                    this.configData
                );

            return {
                forecast,
                expectedYield:
                    this.forecastSolarProvider.getExpectedYieldNow(forecast),
                source: "forecastsolar",
                stale: false,
                fetchedAt: Date.now()
            };
        }

        catch (error) {

            console.warn(
                "[MMM-PVForecast] Start-Abruf fehlgeschlagen:",
                error.message
            );

            return null;
        }
    },

    async getForecastData(offline) {

        const order = this.getProviderOrder();

        const errors = [];

        //
        // 1. Frische Daten: Provider der Reihe nach probieren
        //    (offline = keine API-Calls)
        //
        if (!offline) {

            for (const { name, provider } of order) {

                try {

                    console.log("[MMM-PVForecast] Trying", name);

                    const forecast =
                        await provider.getForecast(this.configData);

                    const expectedYield =
                        provider.getExpectedYieldNow(forecast);

                    if (this.activeSource !== name) {

                        console.warn(
                            "[MMM-PVForecast] Datenquelle:",
                            name
                        );
                    }

                    this.activeSource = name;

                    return {
                        forecast,
                        expectedYield,
                        source: name,
                        stale: false,
                        fetchedAt: Date.now()
                    };
                }

                catch (error) {

                    errors.push(`${name}: ${error.message}`);

                    console.warn(
                        "[MMM-PVForecast]",
                        name,
                        "fehlgeschlagen:",
                        error.message
                    );
                }
            }
        }

        //
        // 2. Notlösung: veraltete Cache-Daten
        //
        const maxAge = offline ? Infinity : STALE_MAX_AGE;

        const candidates = [];

        for (const { name, provider } of order) {

            const cached = provider.getStale(maxAge);

            if (cached) {

                candidates.push({ name, provider, cached });
            }
        }

        if (candidates.length) {

            // Bevorzugt Daten von heute (in Reihenfolge der Provider),
            // sonst die jüngsten vorhandenen
            const pick =
                candidates.find(
                    c => dayDiff(c.cached.timestamp, Date.now()) === 0
                ) ||
                candidates.sort(
                    (x, y) => y.cached.timestamp - x.cached.timestamp
                )[0];

            if (
                offline &&
                dayDiff(pick.cached.timestamp, Date.now()) >= 1
            ) {

                const boot = await this.bootstrapForecastSolar();

                if (boot) {

                    return boot;
                }
            }

            console.warn(
                "[MMM-PVForecast] Verwende Cache von",
                pick.name
            );

            return {
                forecast: pick.cached.data,
                expectedYield:
                    pick.provider.getExpectedYieldNow(pick.cached.data),
                source: pick.name,
                // Offline-Anzeige mit Daten von heute ist nicht "alt"
                stale:
                    !offline ||
                    dayDiff(pick.cached.timestamp, Date.now()) >= 1,
                fetchedAt: pick.cached.timestamp
            };
        }

        //
        // 3. Nachts ganz ohne Cache
        //
        if (offline) {

            const boot = await this.bootstrapForecastSolar();

            if (boot) {

                return boot;
            }
        }

        throw new Error(
            offline
                ? "Kein Cache vorhanden"
                : "Alle Provider fehlgeschlagen: " + errors.join(" | ")
        );
    },

    //
    // Forecast-Teil des Ergebnisses; bei Tageswechsel werden alte Daten
    // korrekt verschoben (gestern "morgen" = heute) bzw. genullt.
    //
    buildForecastPart() {

        const b = this.base;

        if (!b) {

            return null;
        }

        const diff = dayDiff(b.fetchedAt, Date.now());

        const part = {
            today: b.today,
            tomorrow: b.tomorrow,
            peakPower: b.peakPower,
            peakTime: b.peakTime,
            source: b.source,
            stale: b.stale
        };


        if (diff >= 1) {

            part.stale = true;

            part.today = diff === 1 ? b.tomorrow : 0;
            part.tomorrow = 0;
            part.peakPower = 0;
            part.peakTime = "--:--";
            part.expectedYield = 0;
        }

        return part;
    },

    buildResult() {

        const part = this.buildForecastPart();

        if (!part) {

            return null;
        }

        const result = { ...part, hasFronius: false };

        if (this.froniusProvider && this.froniusData) {

            const f = this.froniusData;

            result.hasFronius = true;

            result.actualYield = f.actualYield;

            result.deltaPercent =
                this.froniusProvider.calculateDelta(
                    f.actualYield,
                    part.today
                );

            result.batterySoc = f.batterySoc;

            result.currentPV = f.pvPower;
        }

        return result;
    },

    send() {

        const result = this.buildResult();

        if (result) {

            this.latestResult = result;

            this.sendSocketNotification("PVFORECAST_DATA", result);
        }
    },

    async loadFronius() {

        if (!this.froniusProvider) {

            return;
        }

        try {

            this.froniusData =
                await this.froniusProvider.getData();
        }

        catch (error) {

            console.error("[MMM-PVForecast] Fronius:", error.message);
        }
    },

    async updateData(offline) {

        try {

            const r = await this.getForecastData(offline);

            this.base = {
                today: r.forecast.today,
                tomorrow: r.forecast.tomorrow,
                peakPower: r.forecast.peakPower,
                peakTime: r.forecast.peakTime,
                expectedYield: r.expectedYield,
                raw: r.forecast,
                source: r.source,
                stale: r.stale,
                fetchedAt: r.fetchedAt
            };

            this.lastFailed = r.stale && !offline;
        }

        catch (error) {

            this.lastFailed = !offline;

            console.error("[MMM-PVForecast]", error.message);
        }

        await this.loadFronius();

        this.send();
    },

    async updateFroniusOnly() {

        await this.loadFronius();

        this.send();
    }
});
