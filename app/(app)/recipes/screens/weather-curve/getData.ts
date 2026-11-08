import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// Open-Meteo → neutral day model, ported from
// terminus/extensions/weather/src/transform.ts (Weather Curve extension).

interface OpenMeteoInput {
	utc_offset_seconds?: number;
	current?: {
		time?: string;
		temperature_2m?: number;
		weather_code?: number;
		is_day?: number;
	};
	hourly?: {
		time?: string[];
		temperature_2m?: (number | null)[];
		precipitation_probability?: (number | null)[];
		precipitation?: (number | null)[];
		weather_code?: (number | null)[];
		is_day?: (number | null)[];
	};
	daily?: {
		time?: string[];
		uv_index_max?: (number | null)[];
	};
}

export interface WeatherDay {
	date: string;
	weekday: number;
	day: number;
	month: number;
	high: number | null;
	low: number | null;
	rain: number | null;
	icon: string;
	uv: number | null;
}

export interface WeatherCurveData {
	days: WeatherDay[];
	now: { temp: number | null; icon: string };
	station: string;
	source: string;
	updated: string;
}

interface HourlyRow {
	t: Date;
	isoDate: string;
	temperature: number | null;
	icon: string;
	precipitation: number | null;
	prob: number | null;
}

const DAYS = 7;
const DAY_HOURS = new Set([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
const SEVERE = ["thunderstorm", "hail", "snow", "sleet"];

const WMO_ICONS: Record<number, string> = {
	0: "clear",
	1: "clear",
	2: "partly-cloudy",
	3: "cloudy",
	45: "fog",
	48: "fog",
	51: "rain",
	53: "rain",
	55: "rain",
	56: "sleet",
	57: "sleet",
	61: "rain",
	63: "rain",
	65: "rain",
	66: "sleet",
	67: "sleet",
	71: "snow",
	73: "snow",
	75: "snow",
	77: "snow",
	80: "rain",
	81: "rain",
	82: "rain",
	85: "snow",
	86: "snow",
	95: "thunderstorm",
	96: "thunderstorm",
	99: "thunderstorm",
};

export function rnd1(value?: number | null): number | null {
	return value == null ? null : Math.round(value * 10) / 10;
}

export function wmoIcon(
	code?: number | null,
	isDay: boolean | number = true,
): string {
	const icon = (code == null ? undefined : WMO_ICONS[code]) ?? "cloudy";
	if (icon === "clear" || icon === "partly-cloudy") {
		const day = Boolean(isDay);
		return `${icon}-${day ? "day" : "night"}`;
	}
	return icon;
}

export function dayIcon(
	hours: { icon: string; precipitation?: number | null }[],
): string {
	const icons = hours
		.map((h) => (h.icon || "").replace("-night", "-day"))
		.filter(Boolean);
	if (!icons.length) return "cloudy";

	const counts: Record<string, number> = {};
	for (const ic of icons) counts[ic] = (counts[ic] || 0) + 1;

	for (const s of SEVERE) {
		if ((counts[s] || 0) >= 2) return s;
	}
	if ((counts.rain || 0) >= 4) return "rain";

	let base = "cloudy";
	let maxCount = -1;
	for (const [k, v] of Object.entries(counts)) {
		if (v > maxCount) {
			maxCount = v;
			base = k;
		}
	}

	const wet = hours.filter((h) => (h.precipitation || 0) >= 0.1).length;
	if (wet >= 2) {
		return base === "partly-cloudy-day" || base === "clear-day"
			? "partly-cloudy-rain"
			: "rain";
	}
	return base;
}

function parseHourlyRows(input: OpenMeteoInput): HourlyRow[] {
	const h = input?.hourly || {};
	const times = h.time || [];
	const temps = h.temperature_2m || [];
	const probs = h.precipitation_probability || [];
	const precips = h.precipitation || [];
	const codes = h.weather_code || [];
	const isDays = h.is_day || [];

	return times.map((ts, i) => ({
		t: new Date(ts),
		isoDate: ts.slice(0, 10),
		temperature: temps[i] ?? null,
		icon: wmoIcon(codes[i], (isDays[i] ?? 1) !== 0),
		precipitation: precips[i] ?? null,
		prob: probs[i] ?? null,
	}));
}

function formatZoneOffset(offsetSeconds: number): string {
	const sign = offsetSeconds >= 0 ? "+" : "-";
	const abs = Math.abs(offsetSeconds);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${sign}${pad(Math.floor(abs / 3600))}:${pad(Math.floor((abs % 3600) / 60))}`;
}

function parseCurrent(
	input: OpenMeteoInput,
	zone: string,
	firstRow?: HourlyRow,
) {
	const cur = input?.current;
	if (cur?.time) {
		let timeStr = cur.time;
		if (timeStr.length === 16) {
			timeStr = `${timeStr}:00`;
		} else if (timeStr.length === 13) {
			timeStr = `${timeStr}:00:00`;
		}
		const hasZone = /(?:[+-]\d\d:?\d\d|Z)$/i.test(timeStr);
		return {
			temp: rnd1(cur.temperature_2m),
			icon: wmoIcon(cur.weather_code, (cur.is_day ?? 1) !== 0),
			updated: hasZone ? timeStr : `${timeStr.slice(0, 19)}${zone}`,
		};
	}
	if (firstRow) {
		return {
			temp: rnd1(firstRow.temperature),
			icon: firstRow.icon,
			updated: `${firstRow.isoDate}T00:00:00${zone}`,
		};
	}
	return null;
}

function buildDay(
	dStr: string,
	ws: HourlyRow[],
	uv?: number | null,
): WeatherDay {
	const tValues = ws
		.map((w) => w.temperature)
		.filter((t): t is number => t != null);
	const pValues = ws.map((w) => w.prob).filter((p): p is number => p != null);
	const dayDate = new Date(`${dStr}T12:00:00Z`);
	const weekday = (dayDate.getUTCDay() + 6) % 7;

	const dayHours = ws.filter((w) => {
		const hour = Number.parseInt(w.t.toISOString().slice(11, 13), 10);
		return DAY_HOURS.has(hour);
	});

	return {
		date: dStr,
		weekday,
		day: Number.parseInt(dStr.slice(8, 10), 10),
		month: Number.parseInt(dStr.slice(5, 7), 10),
		high: tValues.length ? rnd1(Math.max(...tValues)) : null,
		low: tValues.length ? rnd1(Math.min(...tValues)) : null,
		rain: pValues.length ? Math.max(...pValues) : null,
		icon: dayIcon(dayHours.length ? dayHours : ws),
		uv: uv ?? null,
	};
}

function parseUvMap(daily?: OpenMeteoInput["daily"]): Record<string, number> {
	const uvMap: Record<string, number> = {};
	if (!daily?.time || !daily?.uv_index_max) return uvMap;

	for (let i = 0; i < daily.time.length; i++) {
		const u = daily.uv_index_max[i];
		if (typeof u === "number") {
			uvMap[daily.time[i].slice(0, 10)] = Math.round(u);
		}
	}
	return uvMap;
}

function groupByDate(rows: HourlyRow[]): Map<string, HourlyRow[]> {
	const byDate = new Map<string, HourlyRow[]>();
	for (const r of rows) {
		const list = byDate.get(r.isoDate) ?? [];
		if (!byDate.has(r.isoDate)) byDate.set(r.isoDate, list);
		list.push(r);
	}
	return byDate;
}

export function transformOpenMeteo(input: OpenMeteoInput): WeatherCurveData {
	const rows = parseHourlyRows(input);
	const zone = formatZoneOffset(Number(input?.utc_offset_seconds || 0));
	const now = parseCurrent(input, zone, rows[0]);
	const uvMap = parseUvMap(input?.daily);
	const byDate = groupByDate(rows);

	const fullDates = Array.from(byDate.keys())
		.filter((d) => (byDate.get(d)?.length || 0) >= 12)
		.sort((a, b) => a.localeCompare(b));

	const todayStr = input?.current?.time
		? input.current.time.slice(0, 10)
		: fullDates[0];
	const ahead = fullDates.filter((d) => d >= todayStr);
	const dates = ahead.length >= DAYS ? ahead : fullDates;

	const days: WeatherDay[] = [];
	for (const dStr of dates) {
		days.push(buildDay(dStr, byDate.get(dStr) || [], uvMap[dStr]));
		if (days.length === DAYS) break;
	}

	return {
		days,
		now: {
			temp: now ? now.temp : null,
			icon: now ? now.icon : "cloudy",
		},
		station: "",
		source: "open-meteo",
		updated: now ? now.updated : "",
	};
}

// ---------------------------------------------------------------------------

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

async function geocodeLocation(
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

async function fetchCurveData(
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
