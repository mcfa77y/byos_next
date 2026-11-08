import { unstable_cache } from "next/cache";
import {
	fetchCurveData,
	geocodeLocation,
	type WeatherCurveParams,
} from "./api";
import {
	dayIcon,
	type HourlyRow,
	type OpenMeteoInput,
	parseCurrent,
	rnd1,
	transformOpenMeteo,
	type WeatherCurveData,
	type WeatherDay,
	wmoIcon,
} from "./transform";

export const dynamic = "force-dynamic";

// Re-export types and transform helpers for consumers and tests
export type {
	HourlyRow,
	OpenMeteoInput,
	WeatherCurveData,
	WeatherCurveParams,
	WeatherDay,
};
export {
	dayIcon,
	fetchCurveData,
	geocodeLocation,
	parseCurrent,
	rnd1,
	transformOpenMeteo,
	wmoIcon,
};

const getCachedCurveData = unstable_cache(
	async (params?: WeatherCurveParams) => fetchCurveData(params),
	["weather-curve-data"],
	{ revalidate: 900 },
);

export default async function getData(
	params?: WeatherCurveParams,
): Promise<WeatherCurveData> {
	try {
		return await getCachedCurveData(params);
	} catch {
		return fetchCurveData(params);
	}
}
