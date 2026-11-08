import type { ReactElement } from "react";
import { drop, icon } from "./icons";
import { hasRain, type ModelDay } from "./model";
import {
	deg,
	estW,
	GRAY,
	INK,
	PAPER,
	trimToFit,
	type View,
} from "./primitives";

const sign = (v: number) => (v < 0 ? -1 : 1);

const edge = (a: number[], b: number[], tb: number) => {
	const h = b[0] - a[0];
	return h ? (3 * (b[1] - a[1])) / h / 2 - tb / 2 : tb;
};

// Monotone cubic interpolation (same as d3.curveMonotoneX): flat runs stay
// flat, no overshoot. vertical: points are [y, x] and the curve runs down.
export function monotone(pts: number[][], vertical = false): string {
	const P = vertical
		? (a: number, b: number) => `${b} ${a}`
		: (a: number, b: number) => `${a} ${b}`;
	const n = pts.length;
	const t = new Array<number>(n).fill(0);
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
	t[0] = edge(pts[0], pts[1], t[1] || 0);
	t[n - 1] = edge(pts[n - 2], pts[n - 1], t[n - 2] || 0);
	let d = `M${P(pts[0][0], pts[0][1])}`;
	for (let i = 0; i < n - 1; i++) {
		const dx = (pts[i + 1][0] - pts[i][0]) / 3;
		d += `C${P(pts[i][0] + dx, pts[i][1] + dx * t[i])} ${P(pts[i + 1][0] - dx, pts[i + 1][1] - dx * t[i + 1])} ${P(pts[i + 1][0], pts[i + 1][1])}`;
	}
	return d;
}

export interface ChartGeom {
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
export function stats(
	xs: number[],
	labelY: number,
	valueY: number,
	size: number,
	day: ModelDay,
	uvXs: number[] | undefined,
	V: View,
): ReactElement[] {
	const { txt } = V;
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

export function footer(
	x0: number,
	x1: number,
	ruleY: number,
	y: number,
	size: number,
	V: View,
): ReactElement[] {
	const { rect, txt } = V;
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
export function chart(
	days: ModelDay[],
	g: ChartGeom,
	V: View,
	hasGray: boolean,
): ReactElement[] {
	const { k, rect, txt } = V;
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
export function dayRows(y0: number, pitch: number, V: View): ReactElement[] {
	const { rect, txt } = V;
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
export function todayBlock(V: View): ReactElement[] {
	const { rect, txt, bigTemp } = V;
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
