import type { ReactElement } from "react";
import { chart, dayRows, footer, monotone, stats, todayBlock } from "./chart";
import { drop, icon } from "./icons";
import { hasRain } from "./model";
import {
	estimateTextWidth,
	formatDegrees,
	INK,
	PAPER,
	trimToFit,
	type View,
} from "./primitives";

// Same designs and coordinate systems as the Terminus renderer (800 or 400
// wide). Extra height above each design's base height goes to the chart.

const TALL = 860;

export function designFull(
	viewHeight: number,
	view: View,
	hasGray: boolean,
): ReactElement[] {
	const { rect, txt, bigTemp } = view;
	const today = view.days[0];
	const tomorrow = view.days[1];
	const extraHeight = viewHeight - 480;
	const out: ReactElement[] = [
		txt(24, 43, trimToFit(view.station, 232, 20, 600), {
			size: 20,
			weight: 600,
		}),
		txt(24, 64, view.dateLong, { size: 14 }),
		bigTemp(24, 178, 112, 191, view.now.temp),
		icon(view.now.icon, 223.0, 122.9, 2.068, 3.2),
		txt(24, 213, view.now.text, { size: 18, weight: 500 }),
		...stats([24, 104, 184], 249, 277, 22, today, [24, 90, 156, 222], view),
		rect(24, 335 + extraHeight, 232, 1),
	];
	if (tomorrow) {
		out.push(
			txt(
				24,
				359 + extraHeight,
				`${view.i18n.tomorrow} · ${tomorrow.label.toUpperCase()}`,
				{
					size: 11,
					weight: 600,
					letterSpacing: 1,
				},
			),
			icon(tomorrow.icon, 44.0, 389.9 + extraHeight, 1.32, 2.5),
			txt(
				76,
				399 + extraHeight,
				`${formatDegrees(tomorrow.high)} / ${formatDegrees(tomorrow.low)}`,
				{
					size: 24,
					weight: 600,
				},
			),
		);
		if (hasRain(tomorrow)) {
			const rainPercentWidth = estimateTextWidth(`${tomorrow.rain}%`, 18, 500);
			out.push(
				txt(256, 396 + extraHeight, `${tomorrow.rain}%`, {
					size: 18,
					weight: 500,
					anchor: "end",
				}),
				drop(
					256 - rainPercentWidth - 6.5 - 4.15,
					389.35 + extraHeight,
					11.3,
					(tomorrow.rain ?? 0) >= 50,
				),
			);
		}
	}
	out.push(
		...chart(
			view.days,
			{
				startX: 296,
				endX: 776,
				gridTop: 48,
				baseY: 382 + extraHeight,
				rainTopY: 322 + extraHeight * 0.75,
				maxTempY: 88,
				minTempY: 286 + extraHeight * 0.75,
				showLegend: true,
				highStrokeWidth: 2.5,
				lowStrokeWidth: 1.5,
				highRadius: 4.5,
				highRadiusStrokeWidth: 2,
				lowRadius: 3.3,
				highLabelOffset: -12,
				lowLabelOffset: 24,
				highFontSize: 17,
				lowFontSize: 15,
				iconScale: 1,
				iconStrokeWidth: 2,
				dayLabelY: 409 + extraHeight,
				dayFontSize: 15,
				pillWidth: 34,
				pillHeight: 24,
				pillY: 392 + extraHeight,
			},
			view,
			hasGray,
		),
		...footer(24, 776, 436 + extraHeight, 458 + extraHeight, 13, view),
	);
	return out;
}

export function designPortrait(
	viewHeight: number,
	view: View,
	hasGray: boolean,
): ReactElement[] {
	const baseY = viewHeight - 86;
	const extraHeight = Math.max(0, baseY - 78 - 262 - 420) / 2;
	return [
		...todayBlock(view),
		...chart(
			view.days,
			{
				startX: 24,
				endX: 376,
				gridTop: 222,
				baseY,
				rainTopY: baseY - 40 - extraHeight,
				maxTempY: 262 + extraHeight,
				minTempY: baseY - 78 - extraHeight,
				maxScale: 22,
				showLegend: false,
				highStrokeWidth: 2,
				lowStrokeWidth: 1.5,
				highRadius: 3.5,
				highRadiusStrokeWidth: 1.75,
				lowRadius: 2.6,
				highLabelOffset: -10,
				lowLabelOffset: 19,
				highFontSize: 15,
				lowFontSize: 13,
				iconScale: 0.8,
				iconStrokeWidth: 1.6,
				dayLabelY: baseY + 25,
				dayFontSize: 13,
				pillWidth: 30,
				pillHeight: 20,
				pillY: baseY + 10,
			},
			view,
			hasGray,
		),
		...footer(24, 376, viewHeight - 42, viewHeight - 21, 12, view),
	];
}

/** The curve turned sideways for very tall half slots. */
export function designColumn(viewHeight: number, view: View): ReactElement[] {
	const { nextKey, rect, txt } = view;
	const days = view.days;
	const dayCount = days.length;
	const topY = 222;
	const bottomY = viewHeight - 56;
	const rowPitch = (bottomY - topY) / dayCount;
	const rowCenterY = (index: number) => topY + rowPitch * (index + 0.5);
	const highs = days.map((day) => day.high ?? 0);
	const lows = days.map((day) => day.low ?? 0);
	const maxTemp = Math.max(...highs);
	const minTemp = Math.min(...lows);
	let scale = 124 / (maxTemp - minTemp || 1);
	let leftX = 214;
	if (scale > 14) {
		leftX += (124 - (maxTemp - minTemp) * 14) / 2;
		scale = 14;
	}
	const tempToX = (temp: number) => leftX + (temp - minTemp) * scale;
	const withCurveEnds = (xValues: number[]) => [
		[topY, xValues[0]],
		...xValues.map((x, index) => [rowCenterY(index), x]),
		[bottomY, xValues[dayCount - 1]],
	];
	const out: ReactElement[] = [
		...todayBlock(view),
		<path
			key={nextKey()}
			d={monotone(withCurveEnds(highs.map(tempToX)), true)}
			fill="none"
			stroke={INK}
			strokeWidth={2.5}
		/>,
		<path
			key={nextKey()}
			d={monotone(withCurveEnds(lows.map(tempToX)), true)}
			fill="none"
			stroke={INK}
			strokeWidth={1.5}
		/>,
	];
	days.forEach((day, index) => {
		const centerY = rowCenterY(index);
		const baselineY = centerY + 5;
		const highX = tempToX(day.high ?? 0);
		const lowX = tempToX(day.low ?? 0);
		if (index === 0) {
			const labelPillWidth = Math.max(
				34,
				estimateTextWidth(day.label, 15, 600) + 14,
			);
			out.push(
				rect(40 - labelPillWidth / 2, centerY - 11, labelPillWidth, 22, {
					rx: 11,
				}),
				txt(40, baselineY, day.label, {
					size: 15,
					weight: 600,
					anchor: "middle",
					fill: PAPER,
				}),
			);
		} else {
			out.push(
				txt(40, baselineY, day.label, {
					size: 15,
					weight: 600,
					anchor: "middle",
				}),
			);
		}
		out.push(icon(day.icon, 82, centerY - 1, 0.9, 1.8));
		if (hasRain(day)) {
			out.push(
				drop(116.5, centerY - 0.5, 9.6, (day.rain ?? 0) >= 50),
				txt(126, baselineY, `${day.rain}%`, { size: 14, weight: 500 }),
			);
		}
		out.push(
			<circle
				key={nextKey()}
				cx={highX}
				cy={centerY}
				r={4.5}
				fill={PAPER}
				stroke={INK}
				strokeWidth={2}
			/>,
			<circle key={nextKey()} cx={lowX} cy={centerY} r={3.3} fill={INK} />,
			txt(lowX - 9, baselineY, formatDegrees(day.low), {
				size: 15,
				weight: 500,
				anchor: "end",
			}),
			txt(highX + 9, baselineY, formatDegrees(day.high), {
				size: 16,
				weight: 600,
			}),
		);
	});
	out.push(...footer(24, 376, viewHeight - 42, viewHeight - 21, 12, view));
	return out;
}

/** Today plus a list of the next six days. */
export function designList(viewHeight: number, view: View): ReactElement[] {
	const extraHeight = viewHeight - 480;
	return [
		...todayBlock(view),
		...dayRows(235, 32 + Math.min(extraHeight / 6, 16), view),
		...footer(24, 376, 438 + extraHeight, 459 + extraHeight, 12, view),
	];
}

/** Today on the left, compact curve on the right. */
export function designWide(
	viewHeight: number,
	view: View,
	hasGray: boolean,
): ReactElement[] {
	const { txt, bigTemp } = view;
	const extraHeight = viewHeight - 240;
	return [
		txt(24, 40, trimToFit(view.station, 248, 18, 600), {
			size: 18,
			weight: 600,
		}),
		txt(24, 60, view.dateShort, { size: 14 }),
		bigTemp(24, 150 + extraHeight / 2, 80, 196, view.now.temp),
		icon(view.now.icon, 222, 112 + extraHeight / 2, 1.5, 2.5),
		txt(24, 182 + extraHeight / 2, view.now.text, { size: 16, weight: 500 }),
		txt(
			24,
			214 + extraHeight,
			view.updated + (view.credit ? ` · ${view.credit}` : ""),
			{
				size: 12,
				weight: 500,
			},
		),
		...chart(
			view.days,
			{
				startX: 296,
				endX: 776,
				gridTop: 40,
				baseY: 184 + extraHeight,
				rainTopY: 160 + extraHeight * 0.75,
				maxTempY: 68,
				minTempY: 128 + extraHeight * 0.75,
				showLegend: false,
				iconCenterY: 24,
				highStrokeWidth: 2,
				lowStrokeWidth: 1.5,
				highRadius: 3.5,
				highRadiusStrokeWidth: 1.75,
				lowRadius: 2.6,
				highLabelOffset: -9,
				lowLabelOffset: 18,
				highFontSize: 14,
				lowFontSize: 12,
				iconScale: 0.75,
				iconStrokeWidth: 1.6,
				dayLabelY: 211 + extraHeight,
				dayFontSize: 14,
				pillWidth: 30,
				pillHeight: 21,
				pillY: 196 + extraHeight,
			},
			view,
			hasGray,
		),
	];
}

/** Today only, for small quarter slots. */
export function designQuadrant(viewHeight: number, view: View): ReactElement[] {
	const { txt, bigTemp } = view;
	const extraHeight = viewHeight - 240;
	const dateWidth = estimateTextWidth(view.dateShort, 14);
	const station = trimToFit(view.station, 352 - dateWidth - 16, 18, 600);
	return [
		txt(376, 40, view.dateShort, { size: 14, anchor: "end" }),
		txt(24, 40, station, { size: 18, weight: 600 }),
		bigTemp(24, 118 + extraHeight / 3, 80, 320, view.now.temp),
		icon(view.now.icon, 347, 80 + extraHeight / 3, 1.5, 2.5),
		txt(376, 118 + extraHeight / 3, view.now.text, {
			size: 16,
			weight: 500,
			anchor: "end",
		}),
		...stats(
			[24, 144, 264],
			150 + (extraHeight * 2) / 3,
			173 + (extraHeight * 2) / 3,
			20,
			view.days[0],
			[24, 144, 264, 332],
			view,
		),
		...footer(24, 376, 196 + extraHeight, 218 + extraHeight, 12, view),
	];
}

// ---- layout planning ---------------------------------------------------------
// Picks [design, viewBox width, viewBox height] from the canvas aspect ratio —
// the same shapes as the Terminus renderer's `plan('auto')` plus its tall-slot
// variants (column/portrait) for half-vertical screens.

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

export function plan(
	canvasWidth: number,
	canvasHeight: number,
): [string, number, number] {
	const aspectRatio = canvasWidth / canvasHeight;
	if (canvasWidth >= 600 && canvasHeight >= 360) {
		return ["full", 800, clamp(800 / aspectRatio, 480, 680)];
	}
	if (canvasWidth >= 600) {
		return ["wide", 800, clamp(800 / aspectRatio, 240, 400)];
	}
	if (400 / aspectRatio >= TALL) {
		return ["column", 400, clamp(400 / aspectRatio, TALL, 1400)];
	}
	if (canvasHeight >= 360) {
		return aspectRatio <= 0.6
			? ["portrait", 400, clamp(400 / aspectRatio, 520, 1400)]
			: ["list", 400, clamp(400 / aspectRatio, 480, 760)];
	}
	return ["quadrant", 400, clamp(400 / aspectRatio, 240, 340)];
}
