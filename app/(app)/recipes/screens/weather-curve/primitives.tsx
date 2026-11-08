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
export function estW(s: string, size: number, weight = 400): number {
	let w = 0;
	for (const ch of s) w += charW(ch);
	return w * size * (weight >= 600 ? 1.02 : 1);
}

export function trimToFit(s: string, maxW: number, size: number, weight = 400) {
	if (estW(s, size, weight) <= maxW) return s;
	while (s.length > 1 && estW(`${s}…`, size, weight) > maxW) {
		s = s.slice(0, -1);
	}
	return `${s.replace(/\s+$/, "")}…`;
}

export const deg = (t: number | null) => (t == null ? "–" : `${t}°`);

// Neither takumi nor satori draws SVG <text> (takumi drops it, satori throws),
// and CSS transforms aren't reliable either — so text renders as absolutely
// positioned HTML in canvas units, computed directly from the design's
// viewBox coords. y stays a baseline: top = y − 0.775·size (Inter's ascent).
const ASCENT = 0.775;

export interface TextOpts {
	size: number;
	weight?: number;
	fill?: string;
	anchor?: "start" | "middle" | "end";
	ls?: number;
}

/**
 * Per-render coordinate transform and element factory (xMidYMid meet).
 * Eliminates mutable module globals across concurrent renders.
 */
export function createPrimitives(
	cw: number,
	ch: number,
	vw: number,
	vh: number,
) {
	let key = 0;
	const k = () => `e${key++}`;
	const scale = Math.min(cw / vw, ch / vh);
	const offX = (cw - vw * scale) / 2;
	const offY = (ch - vh * scale) / 2;

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

	function txt(x: number, y: number, s: string, o: TextOpts): ReactElement {
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

	return { k, rect, txt, bigTemp };
}

export interface Primitives {
	k: () => string;
	rect: (
		x: number,
		y: number,
		w: number,
		h: number,
		extra?: Record<string, string | number>,
	) => ReactElement;
	txt: (x: number, y: number, s: string, o: TextOpts) => ReactElement;
	bigTemp: (
		x: number,
		y: number,
		size: number,
		maxRight: number,
		now: number | null,
	) => ReactElement;
}
export type View = Model & Primitives;
