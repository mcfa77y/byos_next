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

const CHAR_WIDTH_EXTRA_WIDE = 0.82;
const CHAR_WIDTH_WIDE = 0.62;
const CHAR_WIDTH_MEDIUM = 0.55;
const CHAR_WIDTH_DIGIT = 0.57;
const CHAR_WIDTH_NARROW = 0.33;
const CHAR_WIDTH_FALLBACK = 0.45;

const BOLD_WEIGHT_THRESHOLD = 600;
const BOLD_WIDTH_FACTOR = 1.02;
const DEFAULT_FONT_WEIGHT = 400;

function getCharWidth(char: string): number {
	if ("MW@#%&".includes(char)) return CHAR_WIDTH_EXTRA_WIDE;
	if (/[A-Z]/.test(char)) return CHAR_WIDTH_WIDE;
	if ("m w".includes(char)) return CHAR_WIDTH_EXTRA_WIDE;
	if (/[a-z]/.test(char)) return CHAR_WIDTH_MEDIUM;
	if (/\d/.test(char)) return CHAR_WIDTH_DIGIT;
	if ("iltfj.,'()°".includes(char)) return CHAR_WIDTH_NARROW;
	return CHAR_WIDTH_FALLBACK; // spaces, punctuation, fallback
}
export interface EstimateTextWidthOptions {
	text: string;
	size: number;
	weight?: number;
}

/** Approximate advance width of `text` rendered at `size` px in Inter. */
export function estimateTextWidth({
	text,
	size,
	weight = DEFAULT_FONT_WEIGHT,
}: EstimateTextWidthOptions): number {
	let totalWidth = 0;
	for (const char of text) totalWidth += getCharWidth(char);
	return (
		totalWidth *
		size *
		(weight >= BOLD_WEIGHT_THRESHOLD ? BOLD_WIDTH_FACTOR : 1)
	);
}

export interface TrimToFitOptions {
	text: string;
	maxWidth: number;
	size: number;
	weight?: number;
}

export function trimToFit({
	text,
	maxWidth,
	size,
	weight = DEFAULT_FONT_WEIGHT,
}: TrimToFitOptions) {
	if (estimateTextWidth({ text, size, weight }) <= maxWidth) return text;
	let trimmed = text;
	while (
		trimmed.length > 1 &&
		estimateTextWidth({ text: `${trimmed}…`, size, weight }) > maxWidth
	) {
		trimmed = trimmed.slice(0, -1);
	}
	return `${trimmed.replace(/\s+$/, "")}…`;
}

export const formatDegrees = (temp: number | null) =>
	temp == null ? "–" : `${temp}°`;
const BIG_TEMP_LETTER_SPACING_FACTOR = -0.04;
const BIG_TEMP_FONT_WEIGHT = 500;
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

export interface CreatePrimitivesOptions {
	canvasWidth: number;
	canvasHeight: number;
	viewWidth: number;
	viewHeight: number;
}

export interface RectOptions {
	x: number;
	y: number;
	width: number;
	height: number;
	fill?: string;
	rx?: number;
}

export function Rect({
	x,
	y,
	width,
	height,
	fill = INK,
	rx,
}: RectOptions): ReactElement {
	return <rect x={x} y={y} width={width} height={height} fill={fill} rx={rx} />;
}

export interface TextRenderOptions extends TextOptions {
	x: number;
	y: number;
	content: string;
}

export interface BigTempOptions {
	x: number;
	y: number;
	size: number;
	maxRight: number;
	currentTemp: number | null;
}

/**
 * Per-render coordinate transform and element factory (xMidYMid meet).
 * Eliminates mutable module globals across concurrent renders.
 */
export function createPrimitives({
	canvasWidth,
	canvasHeight,
	viewWidth,
	viewHeight,
}: CreatePrimitivesOptions) {
	const scale = Math.min(canvasWidth / viewWidth, canvasHeight / viewHeight);
	const offsetX = (canvasWidth - viewWidth * scale) / 2;
	const offsetY = (canvasHeight - viewHeight * scale) / 2;

	function Txt({
		x,
		y,
		content,
		size,
		weight = DEFAULT_FONT_WEIGHT,
		fill = INK,
		anchor,
		letterSpacing: _letterSpacing,
	}: TextRenderOptions): ReactElement {
		const scaledFontSize = size * scale;
		const scaledTextWidth =
			estimateTextWidth({
				text: content,
				size,
				weight,
			}) * scale;
		let anchorOffset = 0;
		if (anchor === "end") {
			anchorOffset = scaledTextWidth;
		} else if (anchor === "middle") {
			anchorOffset = scaledTextWidth / 2;
		}
		const left = offsetX + x * scale - anchorOffset;
		return (
			<div
				// style.fontFamily is overridden by its blockkie default.
				className="font-inter"
				style={{
					position: "absolute",
					left,
					top: offsetY + (y - ASCENT * size) * scale,
					fontSize: scaledFontSize,
					fontWeight: weight,
					color: fill,
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
	function BigTemp({ x, y, size, maxRight, currentTemp }: BigTempOptions) {
		const tempText = formatDegrees(currentTemp);
		const letterSpacing = BIG_TEMP_LETTER_SPACING_FACTOR * size;
		const estimatedWidth =
			estimateTextWidth({
				text: tempText,
				size,
				weight: BIG_TEMP_FONT_WEIGHT,
			}) +
			letterSpacing * tempText.length;
		if (x + estimatedWidth <= maxRight) {
			return (
				<Txt
					x={x}
					y={y}
					content={tempText}
					size={size}
					weight={BIG_TEMP_FONT_WEIGHT}
					letterSpacing={letterSpacing}
				/>
			);
		}
		const scaledSize = (size * (maxRight - x)) / estimatedWidth;
		return (
			<Txt
				x={x}
				y={y}
				content={tempText}
				size={scaledSize}
				weight={BIG_TEMP_FONT_WEIGHT}
				letterSpacing={BIG_TEMP_LETTER_SPACING_FACTOR * scaledSize}
			/>
		);
	}
	return { Rect, Txt, BigTemp };
}

export interface Primitives {
	Rect: (options: RectOptions) => ReactElement;
	Txt: (options: TextRenderOptions) => ReactElement;
	BigTemp: (options: BigTempOptions) => ReactElement;
}
export type View = Model & Primitives;
