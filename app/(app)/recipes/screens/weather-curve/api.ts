import {
	type OpenMeteoInput,
	transformOpenMeteo,
	type WeatherCurveData,
} from "./transform";

export interface WeatherCurveParams {
	location?: string;
	latitude?: number;
	longitude?: number;
}

interface GeocodingResponse {
	results?: Array<{
		latitude: number;
		longitude: number;
		name: string;
		country?: string;
	}>;
}

export async function geocodeLocation(
	locationName: string,
): Promise<{ latitude: number; longitude: number; name: string } | null> {
	try {
		const response = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`,
			{ headers: { Accept: "application/json" }, next: { revalidate: 0 } },
		);
		if (!response.ok) return null;
		const data: GeocodingResponse = await response.json();
		const result = data.results?.[0];
		if (!result) return null;
		return {
			latitude: result.latitude,
			longitude: result.longitude,
			name: result.country ? `${result.name}, ${result.country}` : result.name,
		};
	} catch {
		return null;
	}
}

export async function fetchCurveData(
	params?: WeatherCurveParams,
): Promise<WeatherCurveData> {
	const locationName = params?.location?.trim();
	let latitude = params?.latitude;
	let longitude = params?.longitude;
	let station = locationName || "";

	if ((!latitude || !longitude) && locationName) {
		const geocoded = await geocodeLocation(locationName);
		if (geocoded) {
			latitude = geocoded.latitude;
			longitude = geocoded.longitude;
			station = geocoded.name;
		}
	}

	const empty: WeatherCurveData = {
		days: [],
		now: { temp: null, icon: "cloudy" },
		station,
		source: "open-meteo",
		updated: "",
	};

	if (!latitude || !longitude) return empty;

	try {
		const query = new URLSearchParams({
			latitude: String(latitude),
			longitude: String(longitude),
			current: "temperature_2m,weather_code,is_day",
			hourly:
				"temperature_2m,precipitation_probability,precipitation,weather_code,is_day",
			daily: "uv_index_max",
			timezone: "auto",
			forecast_days: "8",
		});
		const response = await fetch(
			`https://api.open-meteo.com/v1/forecast?${query}`,
			{ headers: { Accept: "application/json" }, next: { revalidate: 0 } },
		);
		if (!response.ok) return empty;

		const raw: OpenMeteoInput = await response.json();
		const out = transformOpenMeteo(raw);
		out.station = station;
		return out;
	} catch {
		return empty;
	}
}
