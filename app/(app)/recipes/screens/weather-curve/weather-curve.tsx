import { isValidElement, type ReactElement, type ReactNode } from "react";
import { z } from "zod";
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
} from "@/lib/recipes/constants";
import type { RecipeDefinition } from "@/lib/recipes/types";
import {
	createScreenProfile,
	type ScreenProfile,
} from "@/lib/trmnl/screen-profile";
import { PreSatori } from "@/utils/pre-satori";
import getData from "./getData";

// Declarative port of terminus/extensions/weather/src/renderer.js.
// The original draws with DOM APIs and measures text with
// getComputedTextLength(); rasterizers (satori/takumi) can't measure text,
// so truncation / pill widths / big-temp scaling use an approximate
// advance-width table tuned to Inter.
// shortcut: font-weight is ignored by the satori/takumi font tables (Inter is
// registered at weight 400 only); all text renders regular weight there.

const GRAY = "#aaa";
const PAPER = "#fff";
const INK = "#000";

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

type Data = z.infer<typeof dataSchema>;
type Params = z.infer<typeof paramsSchema>;
type Day = z.infer<typeof daySchema>;

// ---- i18n -----------------------------------------------------------------

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

type I18n = I18nShape;

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

interface ModelDay {
	label: string;
	high: number | null;
	low: number | null;
	rain: number | null;
	icon: string;
	uv: number | null;
}

interface Model {
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

function buildModel(data: Data, params: Params): Model {
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

// ---- approximate text metrics ---------------------------------------------

const WIDE = 0.62;
const MED = 0.55;
const NARROW = 0.33;

function charW(ch: string): number {
	if ("MW@#%&".includes(ch)) return 0.82;
	if (/[A-Z]/.test(ch)) return WIDE;
	if ("m w".includes(ch)) return 0.82;
	if (/[a-z]/.test(ch)) return MED;
	if (/\d/.test(ch)) return 0.57;
	if ("iltfj.,'()°".includes(ch)) return NARROW;
	return 0.45; // spaces, punctuation, fallback
}

/** Approximate advance width of `s` rendered at `size` px in Inter. */
function estW(s: string, size: number, weight = 400): number {
	let w = 0;
	for (const ch of s) w += charW(ch);
	return w * size * (weight >= 600 ? 1.02 : 1);
}

function trimToFit(s: string, maxW: number, size: number, weight = 400) {
	if (estW(s, size, weight) <= maxW) return s;
	while (s.length > 1 && estW(`${s}…`, size, weight) > maxW) {
		s = s.slice(0, -1);
	}
	return `${s.replace(/\s+$/, "")}…`;
}

// ---- SVG primitives --------------------------------------------------------

let key = 0;
const k = () => `e${key++}`;

function rect(
	x: number,
	y: number,
	w: number,
	h: number,
	extra: Record<string, string | number> = {},
): ReactElement {
	return (
		<rect key={k()} x={x} y={y} width={w} height={h} fill={INK} {...extra} />
	);
}

// Neither takumi nor satori draws SVG <text> (takumi drops it, satori throws),
// and CSS transforms aren't reliable either — so text renders as absolutely
// positioned HTML in canvas units, computed directly from the design's
// viewBox coords. y stays a baseline: top = y − 0.775·size (Inter's ascent).
const ASCENT = 0.775;

// Design units → canvas units; set per render before the design draws.
let scale = 1;
let offX = 0;
let offY = 0;

function txt(
	x: number,
	y: number,
	s: string,
	o: {
		size: number;
		weight?: number;
		fill?: string;
		anchor?: "start" | "middle" | "end";
		ls?: number;
	},
): ReactElement {
	const size = o.size * scale;
	const w = estW(s, o.size, o.weight || 400) * scale;
	let anchorOffset = 0;
	if (o.anchor === "end") {
		anchorOffset = w;
	} else if (o.anchor === "middle") {
		anchorOffset = w / 2;
	}
	const left = offX + x * scale - anchorOffset;
	return (
		<div
			key={k()}
			// PreSatori maps font-* classes to the registered font tables; a bare
			// style.fontFamily is overridden by its blockkie default.
			className="font-inter"
			style={{
				position: "absolute",
				left,
				top: offY + (y - ASCENT * o.size) * scale,
				fontSize: size,
				fontWeight: o.weight || 400,
				color: o.fill || INK,
				// letterSpacing omitted: takumi's parser rejects negative values.
				lineHeight: 1,
				whiteSpace: "pre",
			}}
		>
			{s}
		</div>
	);
}

const deg = (t: number | null) => (t == null ? "–" : `${t}°`);
const hasRain = (d: ModelDay) => d.rain != null;

/** Big current temperature; shrinks only if it would run into the icon. */
function bigTemp(
	x: number,
	y: number,
	size: number,
	maxRight: number,
	now: number | null,
) {
	const s = deg(now);
	const w = estW(s, size, 500) - 0.04 * size * s.length;
	if (x + w <= maxRight) {
		return txt(x, y, s, { size, weight: 500, ls: -0.04 * size });
	}
	const scaled = (size * (maxRight - x)) / w;
	return txt(x, y, s, { size: scaled, weight: 500, ls: -0.04 * scaled });
}

// ---- Icons ------------------------------------------------------------------
// Geometry fitted to the design at chart size (k = 1), origin = icon anchor.
// cloud: [bottom, left x, left r, top x, top y, top r, right x, right r]
// sun: [x, y, r, ray start, ray end]; drops: [center x, spacing, top y, bottom y, slant]
const RAIN_CLOUD = [3.43, -5.82, 4.9, 0.53, -4.71, 6.46, 6.23, 4.52];
const RAIN_DROPS = [0.48, 5.16, 7.33, 11.14, 1.27];
const PARTLY_CLOUD = [10.0, -8.12, 4.24, -2.63, 2.95, 5.58, 2.3, 3.91];

interface IconSpec {
	sun?: number[];
	moon?: number[];
	cloud?: number[];
	drops?: number[];
	lines?: number[][];
	paths?: string[];
	dots?: number[][];
	rings?: number[][];
}

const ICONS: Record<string, IconSpec> = {
	rain: { cloud: RAIN_CLOUD, drops: RAIN_DROPS },
	cloudy: { cloud: [8.75, -6.42, 5.26, 0.39, 0.88, 7.49, 6.77, 5.01] },
	"partly-cloudy-day": {
		sun: [4.38, -4.38, 4.38, 6.98, 8.63],
		cloud: PARTLY_CLOUD,
	},
	"partly-cloudy-night": { moon: [4.6, -4.6, 5.4], cloud: PARTLY_CLOUD },
	"partly-cloudy-rain": {
		sun: [5.0, -6.88, 3.75, 5.68, 7.42],
		cloud: [5.62, -8.12, 4.24, -2.63, -1.44, 5.58, 2.3, 3.91],
		drops: [-1.87, 4.37, 9.44, 12.43, 1.19],
	},
	"clear-day": { sun: [0, 0, 5.2, 8.2, 10.2] },
	"clear-night": { moon: [0, 0, 8] },
	fog: {
		cloud: RAIN_CLOUD,
		lines: [
			[-7, 8.5, 7, 8.5],
			[-4, 12, 9, 12],
		],
	},
	wind: {
		paths: [
			"M-10 -4H4A3.5 3.5 0 1 0 0.5 -7.5",
			"M-10 1.5H7A3.5 3.5 0 1 1 3.5 5",
			"M-10 7H-1",
		],
	},
	snow: {
		cloud: RAIN_CLOUD,
		dots: [
			[-4.7, 9],
			[0.5, 11.5],
			[5.6, 9],
		],
	},
	sleet: {
		cloud: RAIN_CLOUD,
		drops: [0.48, 10.32, 7.33, 11.14, 1.27],
		dots: [[0.5, 9.5]],
	},
	hail: {
		cloud: RAIN_CLOUD,
		rings: [
			[-4.7, 9.3],
			[0.5, 11.8],
			[5.6, 9.3],
		],
	},
	thunderstorm: { cloud: RAIN_CLOUD, paths: ["M2 6L-1.5 10.5H2L-0.5 15"] },
};

function upperIntersection(
	a: { x: number; y: number; r: number },
	b: { x: number; y: number; r: number },
) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const d = Math.hypot(dx, dy);
	const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
	const h = Math.sqrt(Math.max(a.r * a.r - l * l, 0));
	const mx = a.x + (l * dx) / d;
	const my = a.y + (l * dy) / d;
	const p = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
	const q = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
	return p.y < q.y ? p : q;
}

function arcTo(
	c: { x: number; y: number; r: number },
	from: { x: number; y: number },
	to: { x: number; y: number },
) {
	let span =
		Math.atan2(to.y - c.y, to.x - c.x) - Math.atan2(from.y - c.y, from.x - c.x);
	while (span < 0) span += 2 * Math.PI;
	return `A${c.r} ${c.r} 0 ${span > Math.PI ? 1 : 0} 1 ${to.x} ${to.y}`;
}

function cloudPath(p: number[]): string {
	const L = { x: p[1], y: p[0] - p[2], r: p[2] };
	const T = { x: p[3], y: p[4], r: p[5] };
	const R = { x: p[6], y: p[0] - p[7], r: p[7] };
	const start = { x: L.x, y: p[0] };
	const lt = upperIntersection(L, T);
	const tr = upperIntersection(T, R);
	const end = { x: R.x, y: p[0] };
	return `M${start.x} ${start.y}${arcTo(L, start, lt)}${arcTo(T, lt, tr)}${arcTo(R, tr, end)}Z`;
}

function moonPath(m: number[]): string {
	const o = { x: m[0], y: m[1], r: m[2] };
	const i = {
		x: m[0] + m[2] * 0.55,
		y: m[1] - m[2] * 0.45,
		r: m[2] * 0.8,
	};
	const dx = i.x - o.x;
	const dy = i.y - o.y;
	const d = Math.hypot(dx, dy);
	const l = (o.r * o.r - i.r * i.r + d * d) / (2 * d);
	const h = Math.sqrt(o.r * o.r - l * l);
	const mx = o.x + (l * dx) / d;
	const my = o.y + (l * dy) / d;
	const p = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
	const q = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
	return `M${p.x} ${p.y}A${o.r} ${o.r} 0 1 0 ${q.x} ${q.y}A${i.r} ${i.r} 0 0 1 ${p.x} ${p.y}Z`;
}

function icon(name: string, cx: number, cy: number, kf: number, sw: number) {
	const spec = ICONS[name] || ICONS.cloudy;
	const children: ReactNode[] = [];
	const add = (
		tag: "line" | "path" | "circle",
		a: Record<string, string | number>,
	) => {
		if (tag === "line") {
			children.push(<line key={k()} {...a} />);
		} else if (tag === "path") {
			children.push(<path key={k()} {...a} />);
		} else {
			children.push(<circle key={k()} {...a} />);
		}
	};

	if (spec.sun) {
		const s = spec.sun;
		add("circle", {
			cx: s[0],
			cy: s[1],
			r: s[2],
			vectorEffect: "non-scaling-stroke",
		});
		for (let i = 0; i < 8; i++) {
			const a = (i * Math.PI) / 4;
			const c = Math.cos(a);
			const sn = Math.sin(a);
			add("line", {
				x1: s[0] + c * s[3],
				y1: s[1] + sn * s[3],
				x2: s[0] + c * s[4],
				y2: s[1] + sn * s[4],
				vectorEffect: "non-scaling-stroke",
			});
		}
	}
	if (spec.moon)
		add("path", { d: moonPath(spec.moon), vectorEffect: "non-scaling-stroke" });
	if (spec.cloud) {
		const d = cloudPath(spec.cloud);
		if (spec.sun || spec.moon) {
			add("path", {
				d,
				fill: PAPER,
				stroke: PAPER,
				strokeWidth: sw + 0.6,
				vectorEffect: "non-scaling-stroke",
			});
		}
		add("path", { d, fill: PAPER, vectorEffect: "non-scaling-stroke" });
	}
	if (spec.drops) {
		const r = spec.drops;
		for (let j = -1; j <= 1; j++) {
			const x = r[0] + j * r[1];
			add("line", {
				x1: x + r[4] / 2,
				y1: r[2],
				x2: x - r[4] / 2,
				y2: r[3],
				vectorEffect: "non-scaling-stroke",
			});
		}
	}
	for (const l of spec.lines || []) {
		add("line", {
			x1: l[0],
			y1: l[1],
			x2: l[2],
			y2: l[3],
			vectorEffect: "non-scaling-stroke",
		});
	}
	for (const p of spec.paths || []) {
		add("path", { d: p, vectorEffect: "non-scaling-stroke" });
	}
	for (const p of spec.dots || []) {
		children.push(
			<circle key={k()} cx={p[0]} cy={p[1]} r={1.3} fill={INK} stroke="none" />,
		);
	}
	for (const p of spec.rings || []) {
		add("circle", {
			cx: p[0],
			cy: p[1],
			r: 1.4,
			vectorEffect: "non-scaling-stroke",
		});
	}
	return (
		<g
			key={k()}
			transform={`translate(${cx} ${cy}) scale(${kf})`}
			fill="none"
			stroke={INK}
			strokeWidth={sw}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{children}
		</g>
	);
}

/** Rain drop: filled from 50% chance of rain, outlined below. */
function drop(cx: number, cy: number, h: number, filled: boolean) {
	const w = h * 0.735;
	const top = cy - h / 2;
	const rb = w / 2;
	const cb = cy + h / 2 - rb;
	const d =
		`M${cx} ${top}C${cx + w * 0.12} ${top + h * 0.22} ${cx + rb} ${cb - rb * 0.9} ` +
		`${cx + rb} ${cb}A${rb} ${rb} 0 0 1 ${cx - rb} ${cb}` +
		`C${cx - rb} ${cb - rb * 0.9} ${cx - w * 0.12} ${top + h * 0.22} ${cx} ${top}Z`;
	return filled ? (
		<path key={k()} d={d} fill={INK} />
	) : (
		<path key={k()} d={d} fill="none" stroke={INK} strokeWidth={h * 0.11} />
	);
}

// ---- curve ------------------------------------------------------------------
// Monotone cubic interpolation (same as d3.curveMonotoneX): flat runs stay
// flat, no overshoot. vertical: points are [y, x] and the curve runs down.

function monotone(pts: number[][], vertical = false): string {
	const P = vertical
		? (a: number, b: number) => `${b} ${a}`
		: (a: number, b: number) => `${a} ${b}`;
	const n = pts.length;
	const t = new Array<number>(n).fill(0);
	const sign = (v: number) => (v < 0 ? -1 : 1);
	for (let i = 1; i < n - 1; i++) {
		const h0 = pts[i][0] - pts[i - 1][0];
		const h1 = pts[i + 1][0] - pts[i][0];
		const s0 = (pts[i][1] - pts[i - 1][1]) / h0;
		const s1 = (pts[i + 1][1] - pts[i][1]) / h1;
		const p = (s0 * h1 + s1 * h0) / (h0 + h1);
		t[i] =
			(sign(s0) + sign(s1)) *
				Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
	}
	const edge = (a: number[], b: number[], tb: number) => {
		const h = b[0] - a[0];
		return h ? (3 * (b[1] - a[1])) / h / 2 - tb / 2 : tb;
	};
	t[0] = edge(pts[0], pts[1], t[1] || 0);
	t[n - 1] = edge(pts[n - 2], pts[n - 1], t[n - 2] || 0);
	let d = `M${P(pts[0][0], pts[0][1])}`;
	for (let i = 0; i < n - 1; i++) {
		const dx = (pts[i + 1][0] - pts[i][0]) / 3;
		d += `C${P(pts[i][0] + dx, pts[i][1] + dx * t[i])} ${P(pts[i + 1][0] - dx, pts[i + 1][1] - dx * t[i + 1])} ${P(pts[i + 1][0], pts[i + 1][1])}`;
	}
	return d;
}

// ---- shared pieces ----------------------------------------------------------

interface ChartGeom {
	x0: number;
	x1: number;
	gridTop: number;
	base: number;
	rainTop: number;
	yMax: number;
	yMin: number;
	maxScale?: number;
	legend?: boolean;
	iconY?: number;
	hiW: number;
	loW: number;
	hiR: number;
	hiRW: number;
	loR: number;
	hiOff: number;
	loOff: number;
	hiSize: number;
	loSize: number;
	iconK: number;
	iconSW: number;
	dayY: number;
	daySize: number;
	pillW: number;
	pillH: number;
	pillY: number;
}

/** uvXs: the columns used instead of xs when today's UV index is shown. */
function stats(
	xs: number[],
	labelY: number,
	valueY: number,
	size: number,
	day: ModelDay,
	uvXs: number[] | undefined,
	V: Model,
): ReactElement[] {
	const uv = V.uvOn && uvXs && day.uv != null;
	const items: [string, string][] = [
		[V.t.high, deg(day.high)],
		[V.t.low, deg(day.low)],
	];
	if (hasRain(day)) items.push([V.t.rain, `${day.rain}%`]);
	if (uv) items.push(["UV", String(day.uv)]);
	const at = uv ? uvXs : xs;
	return items.flatMap((s, i) => [
		txt(at[i], labelY, s[0], { size: 11, weight: 600, ls: 1 }),
		txt(at[i], valueY, s[1], { size, weight: 600 }),
	]);
}

function footer(
	x0: number,
	x1: number,
	ruleY: number,
	y: number,
	size: number,
	V: Model,
): ReactElement[] {
	return [
		rect(x0, ruleY, x1 - x0, 1),
		txt(x0, y, V.t.title + (V.credit ? ` · ${V.credit}` : ""), {
			size,
			weight: 500,
		}),
		txt(x1, y, V.updated, { size, weight: 500, anchor: "end" }),
	];
}

/** 7-day chart: highs, lows, chance of rain, one icon per day. */
function chart(
	days: ModelDay[],
	g: ChartGeom,
	V: Model,
	hasGray: boolean,
): ReactElement[] {
	const out: ReactElement[] = [];
	const n = days.length;
	const colW = (g.x1 - g.x0) / n;
	const cx = (i: number) => g.x0 + colW * (i + 0.5);
	const highs = days.map((d) => d.high ?? 0);
	const lows = days.map((d) => d.low ?? 0);
	const tmax = Math.max(...highs);
	const tmin = Math.min(...lows);
	let scale = (g.yMin - g.yMax) / (tmax - tmin || 1);
	let top = g.yMax;
	if (g.maxScale && scale > g.maxScale) {
		top += (g.yMin - g.yMax - (tmax - tmin) * g.maxScale) / 2;
		scale = g.maxScale;
	}
	const ty = (t: number) => top + (tmax - t) * scale;
	const ry = (p: number) => g.base - (p / 100) * (g.base - g.rainTop);
	const withEnds = (ys: number[]) => {
		const pts = ys.map((y, i) => [cx(i), y]);
		return [[g.x0, ys[0]], ...pts, [g.x1, ys[n - 1]]];
	};

	for (let i = 1; i < n; i++) {
		const gx = Math.floor(g.x0 + colW * i) + 0.5;
		out.push(
			<line
				key={k()}
				x1={gx}
				y1={g.gridTop}
				x2={gx}
				y2={g.base}
				stroke={hasGray ? GRAY : INK}
				strokeWidth={1}
			/>,
		);
	}

	if (V.hasRain) {
		out.push(
			<path
				key={k()}
				d={`${monotone(withEnds(days.map((d) => ry(d.rain || 0))))}L${g.x1} ${g.base}L${g.x0} ${g.base}Z`}
				fill={hasGray ? GRAY : "url(#wc-dots)"}
			/>,
		);
		for (let x = g.x0; x < g.x1; x += 4) {
			out.push(rect(x, g.rainTop, 1, 1));
		}
	}
	if (g.legend && V.hasRain) {
		const lw = estW(V.t.legend, 11, 500) + 10;
		out.push(
			rect(g.x1 - lw - 5, g.rainTop + 3, lw + 5, 16, { fill: PAPER }),
			txt(g.x1 - 5, g.rainTop + 15, V.t.legend, {
				size: 11,
				weight: 500,
				anchor: "end",
			}),
		);
	}
	out.push(
		rect(g.x0, g.base, g.x1 - g.x0, 1),
		<path
			key={k()}
			d={monotone(withEnds(highs.map(ty)))}
			fill="none"
			stroke={INK}
			strokeWidth={g.hiW}
		/>,
		<path
			key={k()}
			d={monotone(withEnds(lows.map(ty)))}
			fill="none"
			stroke={INK}
			strokeWidth={g.loW}
		/>,
	);

	days.forEach((d, i) => {
		const x = cx(i);
		const yh = ty(d.high ?? 0);
		const yl = ty(d.low ?? 0);
		out.push(
			<circle
				key={k()}
				cx={x}
				cy={yh}
				r={g.hiR}
				fill={PAPER}
				stroke={INK}
				strokeWidth={g.hiRW}
			/>,
			<circle key={k()} cx={x} cy={yl} r={g.loR} fill={INK} />,
			txt(x, yh + g.hiOff, deg(d.high), {
				size: g.hiSize,
				weight: 600,
				anchor: "middle",
			}),
			txt(x, yl + g.loOff, deg(d.low), {
				size: g.loSize,
				weight: 500,
				anchor: "middle",
			}),
			icon(d.icon, x, g.iconY || (yh + yl) / 2, g.iconK, g.iconSW),
		);
		if (i === 0) {
			const pw = Math.max(
				g.pillW,
				estW(d.label, g.daySize, 600) + g.pillH * 0.6,
			);
			out.push(
				rect(x - pw / 2, g.pillY, pw, g.pillH, { rx: g.pillH / 2 }),
				txt(x, g.dayY, d.label, {
					size: g.daySize,
					weight: 600,
					anchor: "middle",
					fill: PAPER,
				}),
			);
		} else {
			out.push(
				txt(x, g.dayY, d.label, {
					size: g.daySize,
					weight: 600,
					anchor: "middle",
				}),
			);
		}
	});
	return out;
}

/** The next six days as rows (day, icon, rain, low–high bar); first baseline y0. */
function dayRows(y0: number, pitch: number, V: Model): ReactElement[] {
	const rows = V.days.slice(1, 7);
	if (!rows.length) return [];
	const lo = Math.min(...rows.map((d) => d.low ?? 0));
	const hi = Math.max(...rows.map((d) => d.high ?? 0));
	const bx = (v: number) => 204 + ((v - lo) * 132) / (hi - lo || 1);
	const out: ReactElement[] = [];
	rows.forEach((d, i) => {
		const b = y0 + pitch * i;
		out.push(
			txt(24, b, d.label, { size: 15, weight: 600 }),
			icon(d.icon, 77, b - 6, 0.86, 1.75),
		);
		if (hasRain(d)) {
			out.push(
				drop(114.5, b - 5.5, 9.6, (d.rain ?? 0) >= 50),
				txt(124, b, `${d.rain}%`, { size: 14, weight: 500 }),
			);
		}
		out.push(txt(194, b, deg(d.low), { size: 15, weight: 500, anchor: "end" }));
		for (let x = 204; x < 336; x += 4) out.push(rect(x, b - 7, 1, 2));
		out.push(
			rect(bx(d.low ?? 0), b - 10, bx(d.high ?? 0) - bx(d.low ?? 0) || 1, 8, {
				rx: 4,
			}),
			txt(371.3, b, deg(d.high), { size: 15, weight: 600, anchor: "end" }),
		);
	});
	return out;
}

/** Today block shared by the list/portrait/column designs (y 0–208). */
function todayBlock(V: Model): ReactElement[] {
	const dateW = estW(V.dateShort, 14);
	const station = trimToFit(V.station, 352 - dateW - 16, 18, 600);
	return [
		txt(376, 40, V.dateShort, { size: 14, anchor: "end" }),
		txt(24, 40, station, { size: 18, weight: 600 }),
		bigTemp(24, 134, 96, 318, V.now.temp),
		icon(V.now.icon, 347, 87.85, 1.826, 2.8),
		txt(376, 133, V.now.text, { size: 16, weight: 500, anchor: "end" }),
		...stats([24, 144, 264], 166, 189, 20, V.days[0], [24, 144, 264, 332], V),
		rect(24, 208, 352, 1),
	];
}

// ---- designs ----------------------------------------------------------------
// Same designs and coordinate systems as the Terminus renderer (800 or 400
// wide). Extra height above each design's base height goes to the chart.

const TALL = 860;

function designFull(H: number, V: Model, hasGray: boolean): ReactElement[] {
	const t = V.days[0];
	const m = V.days[1];
	const e = H - 480;
	const out: ReactElement[] = [
		txt(24, 43, trimToFit(V.station, 232, 20, 600), { size: 20, weight: 600 }),
		txt(24, 64, V.dateLong, { size: 14 }),
		bigTemp(24, 178, 112, 191, V.now.temp),
		icon(V.now.icon, 223.0, 122.9, 2.068, 3.2),
		txt(24, 213, V.now.text, { size: 18, weight: 500 }),
		...stats([24, 104, 184], 249, 277, 22, t, [24, 90, 156, 222], V),
		rect(24, 335 + e, 232, 1),
	];
	if (m) {
		out.push(
			txt(24, 359 + e, `${V.t.tomorrow} · ${m.label.toUpperCase()}`, {
				size: 11,
				weight: 600,
				ls: 1,
			}),
			icon(m.icon, 44.0, 389.9 + e, 1.32, 2.5),
			txt(76, 399 + e, `${deg(m.high)} / ${deg(m.low)}`, {
				size: 24,
				weight: 600,
			}),
		);
		if (hasRain(m)) {
			const pctW = estW(`${m.rain}%`, 18, 500);
			out.push(
				txt(256, 396 + e, `${m.rain}%`, {
					size: 18,
					weight: 500,
					anchor: "end",
				}),
				drop(256 - pctW - 6.5 - 4.15, 389.35 + e, 11.3, (m.rain ?? 0) >= 50),
			);
		}
	}
	out.push(
		...chart(
			V.days,
			{
				x0: 296,
				x1: 776,
				gridTop: 48,
				base: 382 + e,
				rainTop: 322 + e * 0.75,
				yMax: 88,
				yMin: 286 + e * 0.75,
				legend: true,
				hiW: 2.5,
				loW: 1.5,
				hiR: 4.5,
				hiRW: 2,
				loR: 3.3,
				hiOff: -12,
				loOff: 24,
				hiSize: 17,
				loSize: 15,
				iconK: 1,
				iconSW: 2,
				dayY: 409 + e,
				daySize: 15,
				pillW: 34,
				pillH: 24,
				pillY: 392 + e,
			},
			V,
			hasGray,
		),
		...footer(24, 776, 436 + e, 458 + e, 13, V),
	);
	return out;
}

function designPortrait(H: number, V: Model, hasGray: boolean): ReactElement[] {
	const base = H - 86;
	const extra = Math.max(0, base - 78 - 262 - 420) / 2;
	return [
		...todayBlock(V),
		...chart(
			V.days,
			{
				x0: 24,
				x1: 376,
				gridTop: 222,
				base,
				rainTop: base - 40 - extra,
				yMax: 262 + extra,
				yMin: base - 78 - extra,
				maxScale: 22,
				legend: false,
				hiW: 2,
				loW: 1.5,
				hiR: 3.5,
				hiRW: 1.75,
				loR: 2.6,
				hiOff: -10,
				loOff: 19,
				hiSize: 15,
				loSize: 13,
				iconK: 0.8,
				iconSW: 1.6,
				dayY: base + 25,
				daySize: 13,
				pillW: 30,
				pillH: 20,
				pillY: base + 10,
			},
			V,
			hasGray,
		),
		...footer(24, 376, H - 42, H - 21, 12, V),
	];
}

/** The curve turned sideways for very tall half slots. */
function designColumn(H: number, V: Model): ReactElement[] {
	const days = V.days;
	const n = days.length;
	const top = 222;
	const bottom = H - 56;
	const pitch = (bottom - top) / n;
	const cy = (i: number) => top + pitch * (i + 0.5);
	const highs = days.map((d) => d.high ?? 0);
	const lows = days.map((d) => d.low ?? 0);
	const tmax = Math.max(...highs);
	const tmin = Math.min(...lows);
	let scale = 124 / (tmax - tmin || 1);
	let left = 214;
	if (scale > 14) {
		left += (124 - (tmax - tmin) * 14) / 2;
		scale = 14;
	}
	const tx = (t: number) => left + (t - tmin) * scale;
	const withEnds = (xs: number[]) => [
		[top, xs[0]],
		...xs.map((x, i) => [cy(i), x]),
		[bottom, xs[n - 1]],
	];
	const out: ReactElement[] = [
		...todayBlock(V),
		<path
			key={k()}
			d={monotone(withEnds(highs.map(tx)), true)}
			fill="none"
			stroke={INK}
			strokeWidth={2.5}
		/>,
		<path
			key={k()}
			d={monotone(withEnds(lows.map(tx)), true)}
			fill="none"
			stroke={INK}
			strokeWidth={1.5}
		/>,
	];
	days.forEach((d, i) => {
		const y = cy(i);
		const b = y + 5;
		const xh = tx(d.high ?? 0);
		const xl = tx(d.low ?? 0);
		if (i === 0) {
			const pw = Math.max(34, estW(d.label, 15, 600) + 14);
			out.push(
				rect(40 - pw / 2, y - 11, pw, 22, { rx: 11 }),
				txt(40, b, d.label, {
					size: 15,
					weight: 600,
					anchor: "middle",
					fill: PAPER,
				}),
			);
		} else {
			out.push(
				txt(40, b, d.label, { size: 15, weight: 600, anchor: "middle" }),
			);
		}
		out.push(icon(d.icon, 82, y - 1, 0.9, 1.8));
		if (hasRain(d)) {
			out.push(
				drop(116.5, y - 0.5, 9.6, (d.rain ?? 0) >= 50),
				txt(126, b, `${d.rain}%`, { size: 14, weight: 500 }),
			);
		}
		out.push(
			<circle
				key={k()}
				cx={xh}
				cy={y}
				r={4.5}
				fill={PAPER}
				stroke={INK}
				strokeWidth={2}
			/>,
			<circle key={k()} cx={xl} cy={y} r={3.3} fill={INK} />,
			txt(xl - 9, b, deg(d.low), { size: 15, weight: 500, anchor: "end" }),
			txt(xh + 9, b, deg(d.high), { size: 16, weight: 600 }),
		);
	});
	out.push(...footer(24, 376, H - 42, H - 21, 12, V));
	return out;
}

/** Today plus a list of the next six days. */
function designList(H: number, V: Model): ReactElement[] {
	const e = H - 480;
	return [
		...todayBlock(V),
		...dayRows(235, 32 + Math.min(e / 6, 16), V),
		...footer(24, 376, 438 + e, 459 + e, 12, V),
	];
}

/** Today on the left, compact curve on the right. */
function designWide(H: number, V: Model, hasGray: boolean): ReactElement[] {
	const e = H - 240;
	return [
		txt(24, 40, trimToFit(V.station, 248, 18, 600), { size: 18, weight: 600 }),
		txt(24, 60, V.dateShort, { size: 14 }),
		bigTemp(24, 150 + e / 2, 80, 196, V.now.temp),
		icon(V.now.icon, 222, 112 + e / 2, 1.5, 2.5),
		txt(24, 182 + e / 2, V.now.text, { size: 16, weight: 500 }),
		txt(24, 214 + e, V.updated + (V.credit ? ` · ${V.credit}` : ""), {
			size: 12,
			weight: 500,
		}),
		...chart(
			V.days,
			{
				x0: 296,
				x1: 776,
				gridTop: 40,
				base: 184 + e,
				rainTop: 160 + e * 0.75,
				yMax: 68,
				yMin: 128 + e * 0.75,
				legend: false,
				iconY: 24,
				hiW: 2,
				loW: 1.5,
				hiR: 3.5,
				hiRW: 1.75,
				loR: 2.6,
				hiOff: -9,
				loOff: 18,
				hiSize: 14,
				loSize: 12,
				iconK: 0.75,
				iconSW: 1.6,
				dayY: 211 + e,
				daySize: 14,
				pillW: 30,
				pillH: 21,
				pillY: 196 + e,
			},
			V,
			hasGray,
		),
	];
}

/** Today only, for small quarter slots. */
function designQuadrant(H: number, V: Model): ReactElement[] {
	const e = H - 240;
	const dateW = estW(V.dateShort, 14);
	const station = trimToFit(V.station, 352 - dateW - 16, 18, 600);
	return [
		txt(376, 40, V.dateShort, { size: 14, anchor: "end" }),
		txt(24, 40, station, { size: 18, weight: 600 }),
		bigTemp(24, 118 + e / 3, 80, 320, V.now.temp),
		icon(V.now.icon, 347, 80 + e / 3, 1.5, 2.5),
		txt(376, 118 + e / 3, V.now.text, { size: 16, weight: 500, anchor: "end" }),
		...stats(
			[24, 144, 264],
			150 + (e * 2) / 3,
			173 + (e * 2) / 3,
			20,
			V.days[0],
			[24, 144, 264, 332],
			V,
		),
		...footer(24, 376, 196 + e, 218 + e, 12, V),
	];
}

// ---- layout planning ---------------------------------------------------------
// Picks [design, viewBox width, viewBox height] from the canvas aspect ratio —
// the same shapes as the Terminus renderer's `plan('auto')` plus its tall-slot
// variants (column/portrait) for half-vertical screens.

function clamp(v: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, v));
}

function plan(w: number, h: number): [string, number, number] {
	const aspect = w / h;
	if (w >= 600 && h >= 360) return ["full", 800, clamp(800 / aspect, 480, 680)];
	if (w >= 600) return ["wide", 800, clamp(800 / aspect, 240, 400)];
	if (400 / aspect >= TALL)
		return ["column", 400, clamp(400 / aspect, TALL, 1400)];
	if (h >= 360) {
		return aspect <= 0.6
			? ["portrait", 400, clamp(400 / aspect, 520, 1400)]
			: ["list", 400, clamp(400 / aspect, 480, 760)];
	}
	return ["quadrant", 400, clamp(400 / aspect, 240, 340)];
}

// ---- component -----------------------------------------------------------------

export default function WeatherCurve({
	width = DEFAULT_IMAGE_WIDTH,
	height = DEFAULT_IMAGE_HEIGHT,
	screen,
	params,
	data,
}: Readonly<{
	width?: number;
	height?: number;
	screen?: ScreenProfile;
	params: Params;
	data: Data;
}>) {
	const profile = screen ?? createScreenProfile({ width, height });
	const cw = profile.logicalWidth;
	const ch = profile.logicalHeight;
	const [design, vw, vh] = plan(cw, ch);
	// Bit-depth 1 screens drop #aaa entirely: rain area becomes a dot pattern.
	const hasGray = profile.bitDepth > 1 || profile.colors > 2;
	const V = buildModel(data, params);

	key = 0;
	// Uniform scale fitting the design viewBox to the canvas (xMidYMid meet);
	// module vars consumed by txt() while the design draws.
	scale = Math.min(cw / vw, ch / vh);
	offX = (cw - vw * scale) / 2;
	offY = (ch - vh * scale) / 2;
	const needsDots = !hasGray && V.hasRain;
	const items: ReactNode[] = [];

	if (V.days.length === 0) {
		items.push(
			txt(24, vh / 2, V.station || "Weather Curve", { size: 20, weight: 600 }),
			txt(24, vh / 2 + 24, "Loading…", { size: 16 }),
		);
	} else {
		const render: Record<string, () => ReactElement[]> = {
			full: () => designFull(vh, V, hasGray),
			portrait: () => designPortrait(vh, V, hasGray),
			column: () => designColumn(vh, V),
			list: () => designList(vh, V),
			wide: () => designWide(vh, V, hasGray),
			quadrant: () => designQuadrant(vh, V),
		};
		items.push(...render[design]());
	}

	// txt() output goes to the HTML overlay; everything else stays in the SVG.
	const svgChildren: ReactNode[] = [];
	const textChildren: ReactNode[] = [];
	for (const el of items) {
		(isValidElement(el) && el.type === "div" ? textChildren : svgChildren).push(
			el,
		);
	}

	return (
		<PreSatori width={cw} height={ch}>
			<div
				className="font-inter"
				style={{
					display: "flex",
					position: "relative",
					width: cw,
					height: ch,
					backgroundColor: PAPER,
				}}
			>
				<svg
					width={cw}
					height={ch}
					viewBox={`0 0 ${vw} ${vh}`}
					preserveAspectRatio="xMidYMid meet"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>Weather Curve</title>
					{needsDots && (
						<defs>
							<pattern
								id="wc-dots"
								width={2}
								height={2}
								patternUnits="userSpaceOnUse"
							>
								<rect x={0} y={0} width={1} height={1} fill={INK} />
							</pattern>
						</defs>
					)}
					{svgChildren}
				</svg>
				{textChildren}
			</div>
		</PreSatori>
	);
}

export const definition: RecipeDefinition<
	typeof paramsSchema,
	typeof dataSchema
> = {
	meta: {
		slug: "weather-curve",
		title: "Weather Curve",
		description:
			"7-day temperature curve with rain probability and per-day icons, powered by Open-Meteo. Ported from the Terminus Weather Curve extension.",
		published: true,
		tags: ["weather", "api", "live-data", "configurable", "svg"],
		author: { name: "Terminus Weather Curve" },
		category: "display-components",
		version: "1.0.0",
	},
	paramsSchema,
	dataSchema,
	getData: async (params) => {
		const data = await getData({
			location: params.location,
			latitude: params.latitude,
			longitude: params.longitude,
		});
		return data as z.infer<typeof dataSchema>;
	},
	Component: ({ width, height, screen, params, data }) => (
		<WeatherCurve
			width={width}
			height={height}
			screen={screen}
			params={params}
			data={data}
		/>
	),
};
