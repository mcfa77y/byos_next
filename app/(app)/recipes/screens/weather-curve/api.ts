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

const GEOCODING_API_BASE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_API_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_GEOCODE_COUNT = "1";
const DEFAULT_LANGUAGE = "en";
const JSON_FORMAT = "json";
const JSON_ACCEPT_HEADERS = { Accept: "application/json" };
const NO_STORE_CACHE_OPTION = { revalidate: 0 };
const FORECAST_DAYS_COUNT = "8";
const DEFAULT_TIMEZONE = "auto";
const CURRENT_WEATHER_FIELDS = "temperature_2m,weather_code,is_day";
const HOURLY_WEATHER_FIELDS =
	"temperature_2m,precipitation_probability,precipitation,weather_code,is_day";
const DAILY_WEATHER_FIELDS = "uv_index_max";
const DEFAULT_FALLBACK_ICON = "cloudy";
const DEFAULT_WEATHER_SOURCE = "open-meteo";

export async function geocodeLocation(
	locationName: string,
): Promise<{ latitude: number; longitude: number; name: string } | null> {
	try {
		const searchParams = new URLSearchParams({
			name: locationName,
			count: DEFAULT_GEOCODE_COUNT,
			language: DEFAULT_LANGUAGE,
			format: JSON_FORMAT,
		});
		const response = await fetch(
			`${GEOCODING_API_BASE_URL}?${searchParams.toString()}`,
			{ headers: JSON_ACCEPT_HEADERS, next: NO_STORE_CACHE_OPTION },
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
		now: { temp: null, icon: DEFAULT_FALLBACK_ICON },
		station,
		source: DEFAULT_WEATHER_SOURCE,
		updated: "",
	};

	if (!latitude || !longitude) return empty;

	try {
		const query = new URLSearchParams({
			latitude: String(latitude),
			longitude: String(longitude),
			current: CURRENT_WEATHER_FIELDS,
			hourly: HOURLY_WEATHER_FIELDS,
			daily: DAILY_WEATHER_FIELDS,
			timezone: DEFAULT_TIMEZONE,
			forecast_days: FORECAST_DAYS_COUNT,
		});
		const response = await fetch(`${FORECAST_API_BASE_URL}?${query}`, {
			headers: JSON_ACCEPT_HEADERS,
			next: NO_STORE_CACHE_OPTION,
		});
		if (!response.ok) return empty;

		const raw: OpenMeteoInput = await response.json();
		const out = transformOpenMeteo(raw);
		out.station = station;
		return out;
	} catch {
		return empty;
	}
}
