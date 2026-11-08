#!/usr/bin/env python3

import asyncio
import json
import sys
from datetime import datetime

from open_meteo_solar_forecast import OpenMeteoSolarForecast


async def main():

    if len(sys.argv) != 6:
        raise ValueError(
            "Usage: openmeteo.py <lat> <lon> <tilt> <azimuth> <kwp>"
        )

    latitude = float(sys.argv[1])
    longitude = float(sys.argv[2])
    tilt = float(sys.argv[3])
    azimuth = float(sys.argv[4])
    kwp = float(sys.argv[5])

    async with OpenMeteoSolarForecast(
        latitude=latitude,
        longitude=longitude,
        declination=tilt,
        azimuth=azimuth,
        dc_kwp=kwp
    ) as forecast:

        estimate = await forecast.estimate()

        peak_power = max(estimate.watts.values())

        result = {
	    "today": round(
	        estimate.energy_production_today / 1000,
	        1
	    ),
	
	    "tomorrow": round(
	        estimate.energy_production_tomorrow / 1000,
	        1
	    ),
	
	    "currentPower": estimate.power_production_now,
	
	    "peakPower": round(
	        max(estimate.watts.values()) / 1000,
	        1
	    ),
	
	    "peakTime": estimate.power_highest_peak_time_today.strftime(
	        "%H:%M"
	    )
	}

        print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main())