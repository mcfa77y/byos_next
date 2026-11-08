import type { ReactElement } from "react";
import { chart, dayRows, footer, monotone, stats, todayBlock } from "./chart";
import { drop, icon } from "./icons";
import { hasRain } from "./model";
import { deg, estW, INK, PAPER, trimToFit, type View } from "./primitives";

// Same designs and coordinate systems as the Terminus renderer (800 or 400
// wide). Extra height above each design's base height goes to the chart.

const TALL = 860;

export function designFull(
	H: number,
	V: View,
	hasGray: boolean,
): ReactElement[] {
	const { rect, txt, bigTemp } = V;
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

export function designPortrait(
	H: number,
	V: View,
	hasGray: boolean,
): ReactElement[] {
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
export function designColumn(H: number, V: View): ReactElement[] {
	const { k, rect, txt } = V;
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
export function designList(H: number, V: View): ReactElement[] {
	const e = H - 480;
	return [
		...todayBlock(V),
		...dayRows(235, 32 + Math.min(e / 6, 16), V),
		...footer(24, 376, 438 + e, 459 + e, 12, V),
	];
}

/** Today on the left, compact curve on the right. */
export function designWide(
	H: number,
	V: View,
	hasGray: boolean,
): ReactElement[] {
	const { txt, bigTemp } = V;
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
export function designQuadrant(H: number, V: View): ReactElement[] {
	const { txt, bigTemp } = V;
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

export function plan(w: number, h: number): [string, number, number] {
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
