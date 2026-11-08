import { z } from "zod";

export const paramsSchema = z.object({
	location: z
		.string()
		.default("San Francisco")
		.describe("City or place name to fetch weather for")
		.meta({ title: "Location", placeholder: "San Francisco" }),
	latitude: z
		.number()
		.default(0)
		.describe(
			"Optional exact latitude; when set with longitude, skips geocoding",
		)
		.meta({ title: "Latitude" }),
	longitude: z
		.number()
		.default(0)
		.describe(
			"Optional exact longitude; when set with latitude, skips geocoding",
		)
		.meta({ title: "Longitude" }),
	units: z
		.string()
		.default("fahrenheit")
		.describe('Temperature units: "fahrenheit" or "celsius"')
		.meta({ title: "Units" }),
	language: z
		.string()
		.default("en")
		.describe('UI language: "en" or "de"')
		.meta({ title: "Language" }),
	showUv: z
		.boolean()
		.default(true)
		.describe("Show today's UV index next to high/low/rain when available")
		.meta({ title: "Show UV Index" }),
});

const daySchema = z.object({
	date: z.string(),
	weekday: z.number(),
	day: z.number(),
	month: z.number(),
	high: z.number().nullable(),
	low: z.number().nullable(),
	rain: z.number().nullable(),
	icon: z.string(),
	uv: z.number().nullable(),
});

export const dataSchema = z.object({
	days: z.array(daySchema).default([]),
	now: z
		.object({ temp: z.number().nullable(), icon: z.string() })
		.default({ temp: null, icon: "cloudy" }),
	station: z.string().default(""),
	source: z.string().default("open-meteo"),
	updated: z.string().default(""),
});

export type Data = z.infer<typeof dataSchema>;
export type Params = z.infer<typeof paramsSchema>;
export type Day = z.infer<typeof daySchema>;

// ---- i18n -----------------------------------------------------------------

interface I18nShape {
	days: readonly string[];
	daysLong: readonly string[];
	months: readonly string[];
	monthsShort: readonly string[];
	high: string;
	low: string;
	rain: string;
	tomorrow: string;
	legend: string;
	updated: string;
	title: string;
	cond: Record<string, string>;
}

export type I18n = I18nShape;

const I18N = {
	de: {
		days: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
		daysLong: [
			"Montag",
			"Dienstag",
			"Mittwoch",
			"Donnerstag",
			"Freitag",
			"Samstag",
			"Sonntag",
		],
		months: [
			"Januar",
			"Februar",
			"März",
			"April",
			"Mai",
			"Juni",
			"Juli",
			"August",
			"September",
			"Oktober",
			"November",
			"Dezember",
		],
		monthsShort: [
			"Jan",
			"Feb",
			"Mär",
			"Apr",
			"Mai",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Okt",
			"Nov",
			"Dez",
		],
		high: "HOCH",
		low: "TIEF",
		rain: "REGEN",
		tomorrow: "MORGEN",
		legend: "100 % Regenrisiko",
		updated: "Aktualisiert",
		title: "Weather Curve",
		cond: {
			"clear-day": "Sonnig",
			"clear-night": "Klar",
			"partly-cloudy-day": "Teils bewölkt",
			"partly-cloudy-night": "Teils bewölkt",
			"partly-cloudy-rain": "Schauer",
			cloudy: "Bewölkt",
			fog: "Nebel",
			wind: "Windig",
			rain: "Regen",
			sleet: "Schneeregen",
			snow: "Schnee",
			hail: "Hagel",
			thunderstorm: "Gewitter",
		} as Record<string, string>,
	},
	en: {
		days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
		daysLong: [
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
			"Sunday",
		],
		months: [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		],
		monthsShort: [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		],
		high: "HIGH",
		low: "LOW",
		rain: "RAIN",
		tomorrow: "TOMORROW",
		legend: "100 % chance of rain",
		updated: "Updated",
		title: "Weather Curve",
		cond: {
			"clear-day": "Sunny",
			"clear-night": "Clear",
			"partly-cloudy-day": "Partly cloudy",
			"partly-cloudy-night": "Partly cloudy",
			"partly-cloudy-rain": "Showers",
			cloudy: "Cloudy",
			fog: "Fog",
			wind: "Windy",
			rain: "Rain",
			sleet: "Sleet",
			snow: "Snow",
			hail: "Hail",
			thunderstorm: "Thunderstorm",
		} as Record<string, string>,
	},
} as const satisfies Record<"de" | "en", I18nShape>;

const isDe = (t: I18n) => t.days[0] === "Mo";

function dateLong(t: I18n, d: Day) {
	return isDe(t)
		? `${t.daysLong[d.weekday]}, ${d.day}. ${t.months[d.month - 1]}`
		: `${t.daysLong[d.weekday]}, ${t.months[d.month - 1]} ${d.day}`;
}
function dateShort(t: I18n, d: Day) {
	return isDe(t)
		? `${t.days[d.weekday]}, ${d.day}. ${t.monthsShort[d.month - 1]}`
		: `${t.days[d.weekday]}, ${t.monthsShort[d.month - 1]} ${d.day}`;
}

// ---- view model -----------------------------------------------------------

export interface ModelDay {
	label: string;
	high: number | null;
	low: number | null;
	rain: number | null;
	icon: string;
	uv: number | null;
}

export interface Model {
	t: I18n;
	days: ModelDay[];
	now: { temp: number | null; icon: string; text: string };
	station: string;
	credit: string;
	dateLong: string;
	dateShort: string;
	updated: string;
	uvOn: boolean;
	hasRain: boolean;
}

export const hasRain = (d: ModelDay) => d.rain != null;

export function buildModel(data: Data, params: Params): Model {
	const t = params.language === "de" ? I18N.de : I18N.en;
	const u = params.units?.trim().toLowerCase();
	const fahrenheit =
		u !== "celsius" && u !== "celcius" && u !== "c" && u !== "metric";
	const temp = (c: number | null) => {
		if (c == null) return null;
		return Math.round(fahrenheit ? (c * 9) / 5 + 32 : c);
	};
	const hm = data.updated.slice(11, 16);
	const h = Number.parseInt(hm, 10);
	let clock = "";
	if (hm) {
		if (fahrenheit) {
			const period = h < 12 ? " AM" : " PM";
			clock = `${h % 12 || 12}${hm.slice(2)}${period}`;
		} else {
			clock = hm;
		}
	}
	const first = data.days[0];
	return {
		t,
		days: data.days.map((d) => ({
			label: t.days[d.weekday],
			high: temp(d.high),
			low: temp(d.low),
			rain: d.rain,
			icon: d.icon,
			uv: d.uv,
		})),
		now: {
			temp: temp(data.now.temp),
			icon: data.now.icon,
			text: t.cond[data.now.icon] || "",
		},
		station: data.station || (data.source === "open-meteo" ? "Open-Meteo" : ""),
		credit: data.source === "open-meteo" && data.station ? "Open-Meteo" : "",
		dateLong: first ? dateLong(t, first) : "",
		dateShort: first ? dateShort(t, first) : "",
		updated: clock ? `${t.updated} ${clock}` : "",
		uvOn: params.showUv,
		hasRain: data.days.some((d) => d.rain != null),
	};
}
