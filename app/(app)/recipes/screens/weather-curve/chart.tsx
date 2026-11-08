import type { ReactElement } from "react";
import { drop, icon } from "./icons";
import { hasRain, type ModelDay } from "./model";
import {
	estimateTextWidth,
	formatDegrees,
	GRAY,
	INK,
	PAPER,
	trimToFit,
	type View,
} from "./primitives";

const sign = (value: number) => (value < 0 ? -1 : 1);

const edgeSlope = (
	pointA: number[],
	pointB: number[],
	neighborTangent: number,
) => {
	const deltaX = pointB[0] - pointA[0];
	return deltaX
		? (3 * (pointB[1] - pointA[1])) / deltaX / 2 - neighborTangent / 2
		: neighborTangent;
};

// Monotone cubic interpolation (same as d3.curveMonotoneX): flat runs stay
// flat, no overshoot. vertical: points are [y, x] and the curve runs down.
export function monotone(points: number[][], vertical = false): string {
	const formatPoint = vertical
		? (x: number, y: number) => `${y} ${x}`
		: (x: number, y: number) => `${x} ${y}`;
	const pointCount = points.length;
	const tangents = new Array<number>(pointCount).fill(0);
	for (let i = 1; i < pointCount - 1; i++) {
		const deltaX0 = points[i][0] - points[i - 1][0];
		const deltaX1 = points[i + 1][0] - points[i][0];
		const slope0 = (points[i][1] - points[i - 1][1]) / deltaX0;
		const slope1 = (points[i + 1][1] - points[i][1]) / deltaX1;
		const weightedSlope =
			(slope0 * deltaX1 + slope1 * deltaX0) / (deltaX0 + deltaX1);
		tangents[i] =
			(sign(slope0) + sign(slope1)) *
				Math.min(
					Math.abs(slope0),
					Math.abs(slope1),
					0.5 * Math.abs(weightedSlope),
				) || 0;
	}
	tangents[0] = edgeSlope(points[0], points[1], tangents[1] || 0);
	tangents[pointCount - 1] = edgeSlope(
		points[pointCount - 2],
		points[pointCount - 1],
		tangents[pointCount - 2] || 0,
	);
	let pathData = `M${formatPoint(points[0][0], points[0][1])}`;
	for (let i = 0; i < pointCount - 1; i++) {
		const deltaXThird = (points[i + 1][0] - points[i][0]) / 3;
		pathData += `C${formatPoint(points[i][0] + deltaXThird, points[i][1] + deltaXThird * tangents[i])} ${formatPoint(points[i + 1][0] - deltaXThird, points[i + 1][1] - deltaXThird * tangents[i + 1])} ${formatPoint(points[i + 1][0], points[i + 1][1])}`;
	}
	return pathData;
}

export interface ChartGeom {
	startX: number;
	endX: number;
	gridTop: number;
	baseY: number;
	rainTopY: number;
	maxTempY: number;
	minTempY: number;
	maxScale?: number;
	showLegend?: boolean;
	iconCenterY?: number;
	highStrokeWidth: number;
	lowStrokeWidth: number;
	highRadius: number;
	highRadiusStrokeWidth: number;
	lowRadius: number;
	highLabelOffset: number;
	lowLabelOffset: number;
	highFontSize: number;
	lowFontSize: number;
	iconScale: number;
	iconStrokeWidth: number;
	dayLabelY: number;
	dayFontSize: number;
	pillWidth: number;
	pillHeight: number;
	pillY: number;
}

/** uvColumnXs: the columns used instead of columnXs when today's UV index is shown. */
export function stats(
	columnXs: number[],
	labelY: number,
	valueY: number,
	fontSize: number,
	day: ModelDay,
	uvColumnXs: number[] | undefined,
	view: View,
): ReactElement[] {
	const { txt } = view;
	const showUv = view.showUv && uvColumnXs && day.uv != null;
	const items: [string, string][] = [
		[view.i18n.high, formatDegrees(day.high)],
		[view.i18n.low, formatDegrees(day.low)],
	];
	if (hasRain(day)) items.push([view.i18n.rain, `${day.rain}%`]);
	if (showUv) items.push(["UV", String(day.uv)]);
	const positions = showUv ? uvColumnXs : columnXs;
	return items.flatMap((statItem, index) => [
		txt(positions[index], labelY, statItem[0], {
			size: 11,
			weight: 600,
			letterSpacing: 1,
		}),
		txt(positions[index], valueY, statItem[1], {
			size: fontSize,
			weight: 600,
		}),
	]);
}

export function footer(
	startX: number,
	endX: number,
	ruleY: number,
	textY: number,
	fontSize: number,
	view: View,
): ReactElement[] {
	const { rect, txt } = view;
	return [
		rect(startX, ruleY, endX - startX, 1),
		txt(
			startX,
			textY,
			view.i18n.title + (view.credit ? ` · ${view.credit}` : ""),
			{
				size: fontSize,
				weight: 500,
			},
		),
		txt(endX, textY, view.updated, {
			size: fontSize,
			weight: 500,
			anchor: "end",
		}),
	];
}

/** 7-day chart: highs, lows, chance of rain, one icon per day. */
export function chart(
	days: ModelDay[],
	geom: ChartGeom,
	view: View,
	hasGray: boolean,
): ReactElement[] {
	const { nextKey, rect, txt } = view;
	const out: ReactElement[] = [];
	const dayCount = days.length;
	const columnWidth = (geom.endX - geom.startX) / dayCount;
	const columnCenterX = (dayIndex: number) =>
		geom.startX + columnWidth * (dayIndex + 0.5);
	const highs = days.map((day) => day.high ?? 0);
	const lows = days.map((day) => day.low ?? 0);
	const maxTemp = Math.max(...highs);
	const minTemp = Math.min(...lows);
	let scale = (geom.minTempY - geom.maxTempY) / (maxTemp - minTemp || 1);
	let topY = geom.maxTempY;
	if (geom.maxScale && scale > geom.maxScale) {
		topY +=
			(geom.minTempY - geom.maxTempY - (maxTemp - minTemp) * geom.maxScale) / 2;
		scale = geom.maxScale;
	}
	const tempToY = (temp: number) => topY + (maxTemp - temp) * scale;
	const rainToY = (probability: number) =>
		geom.baseY - (probability / 100) * (geom.baseY - geom.rainTopY);
	const withChartEnds = (yValues: number[]) => {
		const points = yValues.map((y, index) => [columnCenterX(index), y]);
		return [
			[geom.startX, yValues[0]],
			...points,
			[geom.endX, yValues[dayCount - 1]],
		];
	};

	for (let index = 1; index < dayCount; index++) {
		const gridX = Math.floor(geom.startX + columnWidth * index) + 0.5;
		out.push(
			<line
				key={nextKey()}
				x1={gridX}
				y1={geom.gridTop}
				x2={gridX}
				y2={geom.baseY}
				stroke={hasGray ? GRAY : INK}
				strokeWidth={1}
			/>,
		);
	}

	if (view.hasRain) {
		out.push(
			<path
				key={nextKey()}
				d={`${monotone(withChartEnds(days.map((day) => rainToY(day.rain || 0))))}L${geom.endX} ${geom.baseY}L${geom.startX} ${geom.baseY}Z`}
				fill={hasGray ? GRAY : "url(#wc-dots)"}
			/>,
		);
		for (let x = geom.startX; x < geom.endX; x += 4) {
			out.push(rect(x, geom.rainTopY, 1, 1));
		}
	}
	if (geom.showLegend && view.hasRain) {
		const legendWidth = estimateTextWidth(view.i18n.legend, 11, 500) + 10;
		out.push(
			rect(
				geom.endX - legendWidth - 5,
				geom.rainTopY + 3,
				legendWidth + 5,
				16,
				{ fill: PAPER },
			),
			txt(geom.endX - 5, geom.rainTopY + 15, view.i18n.legend, {
				size: 11,
				weight: 500,
				anchor: "end",
			}),
		);
	}
	out.push(
		rect(geom.startX, geom.baseY, geom.endX - geom.startX, 1),
		<path
			key={nextKey()}
			d={monotone(withChartEnds(highs.map(tempToY)))}
			fill="none"
			stroke={INK}
			strokeWidth={geom.highStrokeWidth}
		/>,
		<path
			key={nextKey()}
			d={monotone(withChartEnds(lows.map(tempToY)))}
			fill="none"
			stroke={INK}
			strokeWidth={geom.lowStrokeWidth}
		/>,
	);

	days.forEach((day, index) => {
		const centerX = columnCenterX(index);
		const highY = tempToY(day.high ?? 0);
		const lowY = tempToY(day.low ?? 0);
		out.push(
			<circle
				key={nextKey()}
				cx={centerX}
				cy={highY}
				r={geom.highRadius}
				fill={PAPER}
				stroke={INK}
				strokeWidth={geom.highRadiusStrokeWidth}
			/>,
			<circle
				key={nextKey()}
				cx={centerX}
				cy={lowY}
				r={geom.lowRadius}
				fill={INK}
			/>,
			txt(centerX, highY + geom.highLabelOffset, formatDegrees(day.high), {
				size: geom.highFontSize,
				weight: 600,
				anchor: "middle",
			}),
			txt(centerX, lowY + geom.lowLabelOffset, formatDegrees(day.low), {
				size: geom.lowFontSize,
				weight: 500,
				anchor: "middle",
			}),
			icon(
				day.icon,
				centerX,
				geom.iconCenterY || (highY + lowY) / 2,
				geom.iconScale,
				geom.iconStrokeWidth,
			),
		);
		if (index === 0) {
			const labelPillWidth = Math.max(
				geom.pillWidth,
				estimateTextWidth(day.label, geom.dayFontSize, 600) +
					geom.pillHeight * 0.6,
			);
			out.push(
				rect(
					centerX - labelPillWidth / 2,
					geom.pillY,
					labelPillWidth,
					geom.pillHeight,
					{ rx: geom.pillHeight / 2 },
				),
				txt(centerX, geom.dayLabelY, day.label, {
					size: geom.dayFontSize,
					weight: 600,
					anchor: "middle",
					fill: PAPER,
				}),
			);
		} else {
			out.push(
				txt(centerX, geom.dayLabelY, day.label, {
					size: geom.dayFontSize,
					weight: 600,
					anchor: "middle",
				}),
			);
		}
	});
	return out;
}

/** The next six days as rows (day, icon, rain, low–high bar); first baseline y0. */
export function dayRows(
	firstBaselineY: number,
	rowPitch: number,
	view: View,
): ReactElement[] {
	const { rect, txt } = view;
	const rows = view.days.slice(1, 7);
	if (!rows.length) return [];
	const minLow = Math.min(...rows.map((day) => day.low ?? 0));
	const maxHigh = Math.max(...rows.map((day) => day.high ?? 0));
	const tempToBarX = (temp: number) =>
		204 + ((temp - minLow) * 132) / (maxHigh - minLow || 1);
	const out: ReactElement[] = [];
	rows.forEach((day, index) => {
		const baselineY = firstBaselineY + rowPitch * index;
		out.push(
			txt(24, baselineY, day.label, { size: 15, weight: 600 }),
			icon(day.icon, 77, baselineY - 6, 0.86, 1.75),
		);
		if (hasRain(day)) {
			out.push(
				drop(114.5, baselineY - 5.5, 9.6, (day.rain ?? 0) >= 50),
				txt(124, baselineY, `${day.rain}%`, { size: 14, weight: 500 }),
			);
		}
		out.push(
			txt(194, baselineY, formatDegrees(day.low), {
				size: 15,
				weight: 500,
				anchor: "end",
			}),
		);
		for (let x = 204; x < 336; x += 4) out.push(rect(x, baselineY - 7, 1, 2));
		out.push(
			rect(
				tempToBarX(day.low ?? 0),
				baselineY - 10,
				tempToBarX(day.high ?? 0) - tempToBarX(day.low ?? 0) || 1,
				8,
				{
					rx: 4,
				},
			),
			txt(371.3, baselineY, formatDegrees(day.high), {
				size: 15,
				weight: 600,
				anchor: "end",
			}),
		);
	});
	return out;
}

/** Today block shared by the list/portrait/column designs (y 0–208). */
export function todayBlock(view: View): ReactElement[] {
	const { rect, txt, bigTemp } = view;
	const dateWidth = estimateTextWidth(view.dateShort, 14);
	const station = trimToFit(view.station, 352 - dateWidth - 16, 18, 600);
	return [
		txt(376, 40, view.dateShort, { size: 14, anchor: "end" }),
		txt(24, 40, station, { size: 18, weight: 600 }),
		bigTemp(24, 134, 96, 318, view.now.temp),
		icon(view.now.icon, 347, 87.85, 1.826, 2.8),
		txt(376, 133, view.now.text, { size: 16, weight: 500, anchor: "end" }),
		...stats(
			[24, 144, 264],
			166,
			189,
			20,
			view.days[0],
			[24, 144, 264, 332],
			view,
		),
		rect(24, 208, 352, 1),
	];
}
