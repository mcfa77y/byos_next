// Open-Meteo → neutral day model, ported from
// terminus/extensions/weather/src/transform.ts (Weather Curve extension).

export interface OpenMeteoInput {
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

export interface HourlyRow {
	t: Date;
	isoDate: string;
	temperature: number | null;
	icon: string;
	precipitation: number | null;
	prob: number | null;
}

const FORECAST_DAYS_TARGET = 7;
const DAY_HOURS = new Set([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
const SEVERE_WEATHER_ICONS = ["thunderstorm", "hail", "snow", "sleet"];
const SEVERE_OCCURRENCE_THRESHOLD = 2;
const RAIN_OCCURRENCE_THRESHOLD = 4;
const WET_HOUR_THRESHOLD_COUNT = 2;
const MIN_PRECIPITATION_AMOUNT = 0.1;
const MIN_HOURS_PER_DAY = 12;

const DEFAULT_WEATHER_ICON = "cloudy";
const RAIN_ICON = "rain";
const PARTLY_CLOUDY_RAIN_ICON = "partly-cloudy-rain";
const CLEAR_DAY_ICON = "clear-day";
const PARTLY_CLOUDY_DAY_ICON = "partly-cloudy-day";

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const TIME_STRING_LENGTH_MINUTES = 16;
const TIME_STRING_LENGTH_HOURS = 13;
const ISO_DATETIME_LENGTH_SECONDS = 19;
const ISO_DATE_LENGTH = 10;
const DAYS_PER_WEEK = 7;
const MONDAY_INDEX_OFFSET = 6;

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
	89: "thunderstorm",
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
		.map((hour) => (hour.icon || "").replace("-night", "-day"))
		.filter(Boolean);
	if (!icons.length) return DEFAULT_WEATHER_ICON;

	const counts: Record<string, number> = {};
	for (const iconName of icons) {
		counts[iconName] = (counts[iconName] || 0) + 1;
	}

	for (const severeIcon of SEVERE_WEATHER_ICONS) {
		if ((counts[severeIcon] || 0) >= SEVERE_OCCURRENCE_THRESHOLD) {
			return severeIcon;
		}
	}
	if ((counts.rain || 0) >= RAIN_OCCURRENCE_THRESHOLD) return RAIN_ICON;

	let baseIcon = DEFAULT_WEATHER_ICON;
	let maxCount = -1;
	for (const [iconName, count] of Object.entries(counts)) {
		if (count > maxCount) {
			maxCount = count;
			baseIcon = iconName;
		}
	}

	const wetHours = hours.filter(
		(hour) => (hour.precipitation || 0) >= MIN_PRECIPITATION_AMOUNT,
	).length;
	if (wetHours >= WET_HOUR_THRESHOLD_COUNT) {
		return baseIcon === PARTLY_CLOUDY_DAY_ICON || baseIcon === CLEAR_DAY_ICON
			? PARTLY_CLOUDY_RAIN_ICON
			: RAIN_ICON;
	}
	return baseIcon;
}

function parseHourlyRows(input: OpenMeteoInput): HourlyRow[] {
	const hourly = input?.hourly || {};
	const times = hourly.time || [];
	const temperatures = hourly.temperature_2m || [];
	const probabilities = hourly.precipitation_probability || [];
	const precipitations = hourly.precipitation || [];
	const codes = hourly.weather_code || [];
	const isDayFlags = hourly.is_day || [];

	return times.map((timestamp, index) => ({
		t: new Date(timestamp),
		isoDate: timestamp.slice(0, 10),
		temperature: temperatures[index] ?? null,
		icon: wmoIcon(codes[index], (isDayFlags[index] ?? 1) !== 0),
		precipitation: precipitations[index] ?? null,
		prob: probabilities[index] ?? null,
	}));
}

const pad = (n: number) => String(n).padStart(2, "0");

function formatZoneOffset(offsetSeconds: number): string {
	const sign = offsetSeconds >= 0 ? "+" : "-";
	const abs = Math.abs(offsetSeconds);
	const hours = Math.floor(abs / SECONDS_PER_HOUR);
	const minutes = Math.floor((abs % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
	return `${sign}${pad(hours)}:${pad(minutes)}`;
}

export function parseCurrent(
	input: OpenMeteoInput,
	zone: string,
	firstRow?: HourlyRow,
) {
	const current = input?.current;
	if (current?.time) {
		let timeStr = current.time;
		if (timeStr.length === TIME_STRING_LENGTH_MINUTES) {
			timeStr = `${timeStr}:00`;
		} else if (timeStr.length === TIME_STRING_LENGTH_HOURS) {
			timeStr = `${timeStr}:00:00`;
		}
		const hasZone = /(?:[+-]\d\d:?\d\d|Z)$/i.test(timeStr);
		return {
			temp: rnd1(current.temperature_2m),
			icon: wmoIcon(current.weather_code, (current.is_day ?? 1) !== 0),
			updated: hasZone
				? timeStr
				: `${timeStr.slice(0, ISO_DATETIME_LENGTH_SECONDS)}${zone}`,
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
	dateStr: string,
	dayRows: HourlyRow[],
	uvIndex?: number | null,
): WeatherDay {
	const temperatureValues = dayRows
		.map((row) => row.temperature)
		.filter((temp): temp is number => temp != null);
	const probabilityValues = dayRows
		.map((row) => row.prob)
		.filter((prob): prob is number => prob != null);
	const dayDate = new Date(`${dateStr}T12:00:00Z`);
	const weekday = (dayDate.getUTCDay() + MONDAY_INDEX_OFFSET) % DAYS_PER_WEEK;

	const daytimeHours = dayRows.filter((row) => {
		const hour = Number.parseInt(row.t.toISOString().slice(11, 13), 10);
		return DAY_HOURS.has(hour);
	});

	return {
		date: dateStr,
		weekday,
		day: Number.parseInt(dateStr.slice(8, 10), 10),
		month: Number.parseInt(dateStr.slice(5, 7), 10),
		high: temperatureValues.length
			? rnd1(Math.max(...temperatureValues))
			: null,
		low: temperatureValues.length ? rnd1(Math.min(...temperatureValues)) : null,
		rain: probabilityValues.length ? Math.max(...probabilityValues) : null,
		icon: dayIcon(daytimeHours.length ? daytimeHours : dayRows),
		uv: uvIndex ?? null,
	};
}

function parseUvMap(daily?: OpenMeteoInput["daily"]): Record<string, number> {
	const uvMap: Record<string, number> = {};
	if (!daily?.time || !daily?.uv_index_max) return uvMap;

	for (let index = 0; index < daily.time.length; index++) {
		const uvValue = daily.uv_index_max[index];
		if (typeof uvValue === "number") {
			uvMap[daily.time[index].slice(0, 10)] = Math.round(uvValue);
		}
	}
	return uvMap;
}

function groupByDate(rows: HourlyRow[]): Map<string, HourlyRow[]> {
	const byDate = new Map<string, HourlyRow[]>();
	for (const row of rows) {
		const list = byDate.get(row.isoDate) ?? [];
		if (!byDate.has(row.isoDate)) byDate.set(row.isoDate, list);
		list.push(row);
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
		.filter(
			(dateKey) => (byDate.get(dateKey)?.length || 0) >= MIN_HOURS_PER_DAY,
		)
		.toSorted((a, b) => a.localeCompare(b));
	const todayStr = input?.current?.time
		? input.current.time.slice(0, ISO_DATE_LENGTH)
		: fullDates[0];
	const ahead = fullDates.filter((dateKey) => dateKey >= todayStr);
	const dates = ahead.length >= FORECAST_DAYS_TARGET ? ahead : fullDates;

	const days: WeatherDay[] = [];
	for (const dateStr of dates) {
		days.push(buildDay(dateStr, byDate.get(dateStr) || [], uvMap[dateStr]));
		if (days.length === FORECAST_DAYS_TARGET) break;
	}

	return {
		days,
		now: {
			temp: now ? now.temp : null,
			icon: now ? now.icon : DEFAULT_WEATHER_ICON,
		},
		station: "",
		source: "open-meteo",
		updated: now ? now.updated : "",
	};
}
