import type { ReactElement } from "react";
import type { Model } from "./model";

// The original Terminus renderer measures text with getComputedTextLength();
// rasterizers (satori/takumi) can't measure text, so truncation / pill widths /
// big-temp scaling use an approximate advance-width table tuned to Inter.
// shortcut: font-weight is ignored by the satori/takumi font tables (Inter is
// registered at weight 400 only); all text renders regular weight there.

export const GRAY = "#aaa";
export const PAPER = "#fff";
export const INK = "#000";

const WIDE = 0.62;
const MED = 0.55;
const NARROW = 0.33;

function getCharWidth(char: string): number {
	if ("MW@#%&".includes(char)) return 0.82;
	if (/[A-Z]/.test(char)) return WIDE;
	if ("m w".includes(char)) return 0.82;
	if (/[a-z]/.test(char)) return MED;
	if (/\d/.test(char)) return 0.57;
	if ("iltfj.,'()°".includes(char)) return NARROW;
	return 0.45; // spaces, punctuation, fallback
}

/** Approximate advance width of `text` rendered at `size` px in Inter. */
export function estimateTextWidth(
	text: string,
	size: number,
	weight = 400,
): number {
	let totalWidth = 0;
	for (const char of text) totalWidth += getCharWidth(char);
	return totalWidth * size * (weight >= 600 ? 1.02 : 1);
}

export function trimToFit(
	text: string,
	maxWidth: number,
	size: number,
	weight = 400,
) {
	if (estimateTextWidth(text, size, weight) <= maxWidth) return text;
	let trimmed = text;
	while (
		trimmed.length > 1 &&
		estimateTextWidth(`${trimmed}…`, size, weight) > maxWidth
	) {
		trimmed = trimmed.slice(0, -1);
	}
	return `${trimmed.replace(/\s+$/, "")}…`;
}

export const formatDegrees = (temp: number | null) =>
	temp == null ? "–" : `${temp}°`;

// Neither takumi nor satori draws SVG <text> (takumi drops it, satori throws),
// and CSS transforms aren't reliable either — so text renders as absolutely
// positioned HTML in canvas units, computed directly from the design's
// viewBox coords. y stays a baseline: top = y − 0.775·size (Inter's ascent).
const ASCENT = 0.775;

export interface TextOptions {
	size: number;
	weight?: number;
	fill?: string;
	anchor?: "start" | "middle" | "end";
	letterSpacing?: number;
}

/**
 * Per-render coordinate transform and element factory (xMidYMid meet).
 * Eliminates mutable module globals across concurrent renders.
 */
export function createPrimitives(
	canvasWidth: number,
	canvasHeight: number,
	viewWidth: number,
	viewHeight: number,
) {
	let keyCounter = 0;
	const nextKey = () => `e${keyCounter++}`;
	const scale = Math.min(canvasWidth / viewWidth, canvasHeight / viewHeight);
	const offsetX = (canvasWidth - viewWidth * scale) / 2;
	const offsetY = (canvasHeight - viewHeight * scale) / 2;

	function rect(
		x: number,
		y: number,
		width: number,
		height: number,
		extraProps: Record<string, string | number> = {},
	): ReactElement {
		return (
			<rect
				key={nextKey()}
				x={x}
				y={y}
				width={width}
				height={height}
				fill={INK}
				{...extraProps}
			/>
		);
	}

	function txt(
		x: number,
		y: number,
		content: string,
		options: TextOptions,
	): ReactElement {
		const scaledFontSize = options.size * scale;
		const scaledTextWidth =
			estimateTextWidth(content, options.size, options.weight || 400) * scale;
		let anchorOffset = 0;
		if (options.anchor === "end") {
			anchorOffset = scaledTextWidth;
		} else if (options.anchor === "middle") {
			anchorOffset = scaledTextWidth / 2;
		}
		const left = offsetX + x * scale - anchorOffset;
		return (
			<div
				key={nextKey()}
				// PreSatori maps font-* classes to the registered font tables; a bare
				// style.fontFamily is overridden by its blockkie default.
				className="font-inter"
				style={{
					position: "absolute",
					left,
					top: offsetY + (y - ASCENT * options.size) * scale,
					fontSize: scaledFontSize,
					fontWeight: options.weight || 400,
					color: options.fill || INK,
					// letterSpacing omitted: takumi's parser rejects negative values.
					lineHeight: 1,
					whiteSpace: "pre",
				}}
			>
				{content}
			</div>
		);
	}

	/** Big current temperature; shrinks only if it would run into the icon. */
	function bigTemp(
		x: number,
		y: number,
		size: number,
		maxRight: number,
		currentTemp: number | null,
	) {
		const tempText = formatDegrees(currentTemp);
		const estimatedWidth =
			estimateTextWidth(tempText, size, 500) - 0.04 * size * tempText.length;
		if (x + estimatedWidth <= maxRight) {
			return txt(x, y, tempText, {
				size,
				weight: 500,
				letterSpacing: -0.04 * size,
			});
		}
		const scaledSize = (size * (maxRight - x)) / estimatedWidth;
		return txt(x, y, tempText, {
			size: scaledSize,
			weight: 500,
			letterSpacing: -0.04 * scaledSize,
		});
	}

	return { nextKey, rect, txt, bigTemp };
}

export interface Primitives {
	nextKey: () => string;
	rect: (
		x: number,
		y: number,
		width: number,
		height: number,
		extraProps?: Record<string, string | number>,
	) => ReactElement;
	txt: (
		x: number,
		y: number,
		content: string,
		options: TextOptions,
	) => ReactElement;
	bigTemp: (
		x: number,
		y: number,
		size: number,
		maxRight: number,
		currentTemp: number | null,
	) => ReactElement;
}
export type View = Model & Primitives;
