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

const DESIGN_FULL = "full";
const DESIGN_WIDE = "wide";
const DESIGN_COLUMN = "column";
const DESIGN_PORTRAIT = "portrait";
const DESIGN_LIST = "list";
const DESIGN_QUADRANT = "quadrant";

const VIEWBOX_WIDTH_WIDE = 800;
const VIEWBOX_WIDTH_NARROW = 400;

const WIDE_SCREEN_MIN_WIDTH = 600;
const MEDIUM_SCREEN_MIN_HEIGHT = 360;
const PORTRAIT_ASPECT_RATIO_THRESHOLD = 0.6;
export interface DesignOptions {
	viewHeight: number;
	view: View;
	hasGray?: boolean;
}

export function designFull({
	viewHeight,
	view,
	hasGray = false,
}: DesignOptions): ReactElement[] {
	const { rect, txt, bigTemp } = view;
	const today = view.days[0];
	const tomorrow = view.days[1];
	const extraHeight = viewHeight - 480;
	const out: ReactElement[] = [
		txt({
			x: 24,
			y: 43,
			content: trimToFit({
				text: view.station,
				maxWidth: 232,
				size: 20,
				weight: 600,
			}),
			size: 20,
			weight: 600,
		}),
		txt({ x: 24, y: 64, content: view.dateLong, size: 14 }),
		bigTemp({
			x: 24,
			y: 178,
			size: 112,
			maxRight: 191,
			currentTemp: view.now.temp,
		}),
		icon({
			name: view.now.icon,
			centerX: 223.0,
			centerY: 122.9,
			scaleFactor: 2.068,
			strokeWidth: 3.2,
		}),
		txt({ x: 24, y: 213, content: view.now.text, size: 18, weight: 500 }),
		...stats({
			columnXs: [24, 104, 184],
			labelY: 249,
			valueY: 277,
			fontSize: 22,
			day: today,
			uvColumnXs: [24, 90, 156, 222],
			view,
		}),
		rect({ x: 24, y: 335 + extraHeight, width: 232, height: 1 }),
	];
	if (tomorrow) {
		out.push(
			txt({
				x: 24,
				y: 359 + extraHeight,
				content: `${view.i18n.tomorrow} · ${tomorrow.label.toUpperCase()}`,
				size: 11,
				weight: 600,
				letterSpacing: 1,
			}),
			icon({
				name: tomorrow.icon,
				centerX: 44.0,
				centerY: 389.9 + extraHeight,
				scaleFactor: 1.32,
				strokeWidth: 2.5,
			}),
			txt({
				x: 76,
				y: 399 + extraHeight,
				content: `${formatDegrees(tomorrow.high)} / ${formatDegrees(tomorrow.low)}`,
				size: 24,
				weight: 600,
			}),
		);
		if (hasRain(tomorrow)) {
			const rainPercentWidth = estimateTextWidth({
				text: `${tomorrow.rain}%`,
				size: 18,
				weight: 500,
			});
			out.push(
				txt({
					x: 256,
					y: 396 + extraHeight,
					content: `${tomorrow.rain}%`,
					size: 18,
					weight: 500,
					anchor: "end",
				}),
				drop({
					centerX: 256 - rainPercentWidth - 6.5 - 4.15,
					centerY: 389.35 + extraHeight,
					height: 11.3,
					filled: (tomorrow.rain ?? 0) >= 50,
				}),
			);
		}
	}
	out.push(
		...chart({
			days: view.days,
			geom: {
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
		}),
		...footer({
			startX: 24,
			endX: 776,
			ruleY: 436 + extraHeight,
			textY: 458 + extraHeight,
			fontSize: 13,
			view,
		}),
	);
	return out;
}

export function designPortrait({
	viewHeight,
	view,
	hasGray = false,
}: DesignOptions): ReactElement[] {
	const baseY = viewHeight - 86;
	const extraHeight = Math.max(0, baseY - 78 - 262 - 420) / 2;
	return [
		...todayBlock(view),
		...chart({
			days: view.days,
			geom: {
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
		}),
		...footer({
			startX: 24,
			endX: 376,
			ruleY: viewHeight - 42,
			textY: viewHeight - 21,
			fontSize: 12,
			view,
		}),
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
				estimateTextWidth({ text: day.label, size: 15, weight: 600 }) + 14,
			);
			out.push(
				rect({
					x: 40 - labelPillWidth / 2,
					y: centerY - 11,
					width: labelPillWidth,
					height: 22,
					extraProps: {
						rx: 11,
					},
				}),
				txt({
					x: 40,
					y: baselineY,
					content: day.label,
					size: 15,
					weight: 600,
					anchor: "middle",
					fill: PAPER,
				}),
			);
		} else {
			out.push(
				txt({
					x: 40,
					y: baselineY,
					content: day.label,
					size: 15,
					weight: 600,
					anchor: "middle",
				}),
			);
		}
		out.push(
			icon({
				name: day.icon,
				centerX: 82,
				centerY: centerY - 1,
				scaleFactor: 0.9,
				strokeWidth: 1.8,
			}),
		);
		if (hasRain(day)) {
			out.push(
				drop({
					centerX: 116.5,
					centerY: centerY - 0.5,
					height: 9.6,
					filled: (day.rain ?? 0) >= 50,
				}),
				txt({
					x: 126,
					y: baselineY,
					content: `${day.rain}%`,
					size: 14,
					weight: 500,
				}),
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
			txt({
				x: lowX - 9,
				y: baselineY,
				content: formatDegrees(day.low),
				size: 15,
				weight: 500,
				anchor: "end",
			}),
			txt({
				x: highX + 9,
				y: baselineY,
				content: formatDegrees(day.high),
				size: 16,
				weight: 600,
			}),
		);
	});
	out.push(
		...footer({
			startX: 24,
			endX: 376,
			ruleY: viewHeight - 42,
			textY: viewHeight - 21,
			fontSize: 12,
			view,
		}),
	);
	return out;
}

/** Today plus a list of the next six days. */
export function designList(viewHeight: number, view: View): ReactElement[] {
	const extraHeight = viewHeight - 480;
	return [
		...todayBlock(view),
		...dayRows({
			firstBaselineY: 235,
			rowPitch: 32 + Math.min(extraHeight / 6, 16),
			view,
		}),
		...footer({
			startX: 24,
			endX: 376,
			ruleY: 438 + extraHeight,
			textY: 459 + extraHeight,
			fontSize: 12,
			view,
		}),
	];
}

/** Today on the left, compact curve on the right. */
export function designWide({
	viewHeight,
	view,
	hasGray = false,
}: DesignOptions): ReactElement[] {
	const { txt, bigTemp } = view;
	const extraHeight = viewHeight - 240;
	return [
		txt({
			x: 24,
			y: 40,
			content: trimToFit({
				text: view.station,
				maxWidth: 248,
				size: 18,
				weight: 600,
			}),
			size: 18,
			weight: 600,
		}),
		txt({ x: 24, y: 60, content: view.dateShort, size: 14 }),
		bigTemp({
			x: 24,
			y: 150 + extraHeight / 2,
			size: 80,
			maxRight: 196,
			currentTemp: view.now.temp,
		}),
		icon({
			name: view.now.icon,
			centerX: 222,
			centerY: 112 + extraHeight / 2,
			scaleFactor: 1.5,
			strokeWidth: 2.5,
		}),
		txt({
			x: 24,
			y: 182 + extraHeight / 2,
			content: view.now.text,
			size: 16,
			weight: 500,
		}),
		txt({
			x: 24,
			y: 214 + extraHeight,
			content: view.updated + (view.credit ? ` · ${view.credit}` : ""),
			size: 12,
			weight: 500,
		}),
		...chart({
			days: view.days,
			geom: {
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
		}),
	];
}

/** Today only, for small quarter slots. */
export function designQuadrant(viewHeight: number, view: View): ReactElement[] {
	const { txt, bigTemp } = view;
	const extraHeight = viewHeight - 240;
	const dateWidth = estimateTextWidth({ text: view.dateShort, size: 14 });
	const station = trimToFit({
		text: view.station,
		maxWidth: 352 - dateWidth - 16,
		size: 18,
		weight: 600,
	});
	return [
		txt({ x: 376, y: 40, content: view.dateShort, size: 14, anchor: "end" }),
		txt({ x: 24, y: 40, content: station, size: 18, weight: 600 }),
		bigTemp({
			x: 24,
			y: 118 + extraHeight / 3,
			size: 80,
			maxRight: 320,
			currentTemp: view.now.temp,
		}),
		icon({
			name: view.now.icon,
			centerX: 347,
			centerY: 80 + extraHeight / 3,
			scaleFactor: 1.5,
			strokeWidth: 2.5,
		}),
		txt({
			x: 376,
			y: 118 + extraHeight / 3,
			content: view.now.text,
			size: 16,
			weight: 500,
			anchor: "end",
		}),
		...stats({
			columnXs: [24, 144, 264],
			labelY: 150 + (extraHeight * 2) / 3,
			valueY: 173 + (extraHeight * 2) / 3,
			fontSize: 20,
			day: view.days[0],
			uvColumnXs: [24, 144, 264, 332],
			view,
		}),
		...footer({
			startX: 24,
			endX: 376,
			ruleY: 196 + extraHeight,
			textY: 218 + extraHeight,
			fontSize: 12,
			view,
		}),
	];
}

export interface ClampOptions {
	value: number;
	min: number;
	max: number;
}

function clamp({ value, min, max }: ClampOptions) {
	return Math.max(min, Math.min(max, value));
}

export function plan(
	canvasWidth: number,
	canvasHeight: number,
): [string, number, number] {
	const aspectRatio = canvasWidth / canvasHeight;
	if (
		canvasWidth >= WIDE_SCREEN_MIN_WIDTH &&
		canvasHeight >= MEDIUM_SCREEN_MIN_HEIGHT
	) {
		return [
			DESIGN_FULL,
			VIEWBOX_WIDTH_WIDE,
			clamp({ value: VIEWBOX_WIDTH_WIDE / aspectRatio, min: 480, max: 680 }),
		];
	}
	if (canvasWidth >= WIDE_SCREEN_MIN_WIDTH) {
		return [
			DESIGN_WIDE,
			VIEWBOX_WIDTH_WIDE,
			clamp({ value: VIEWBOX_WIDTH_WIDE / aspectRatio, min: 240, max: 400 }),
		];
	}
	if (VIEWBOX_WIDTH_NARROW / aspectRatio >= TALL) {
		return [
			DESIGN_COLUMN,
			VIEWBOX_WIDTH_NARROW,
			clamp({
				value: VIEWBOX_WIDTH_NARROW / aspectRatio,
				min: TALL,
				max: 1400,
			}),
		];
	}
	if (canvasHeight >= MEDIUM_SCREEN_MIN_HEIGHT) {
		return aspectRatio <= PORTRAIT_ASPECT_RATIO_THRESHOLD
			? [
					DESIGN_PORTRAIT,
					VIEWBOX_WIDTH_NARROW,
					clamp({
						value: VIEWBOX_WIDTH_NARROW / aspectRatio,
						min: 520,
						max: 1400,
					}),
				]
			: [
					DESIGN_LIST,
					VIEWBOX_WIDTH_NARROW,
					clamp({
						value: VIEWBOX_WIDTH_NARROW / aspectRatio,
						min: 480,
						max: 760,
					}),
				];
	}
	return [
		DESIGN_QUADRANT,
		VIEWBOX_WIDTH_NARROW,
		clamp({ value: VIEWBOX_WIDTH_NARROW / aspectRatio, min: 240, max: 340 }),
	];
}
