import type { ReactNode } from "react";
import { INK, PAPER } from "./primitives";

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

export function icon(
	name: string,
	cx: number,
	cy: number,
	kf: number,
	sw: number,
) {
	const spec = ICONS[name] || ICONS.cloudy;
	const children: ReactNode[] = [];
	const add = (
		tag: "line" | "path" | "circle",
		a: Record<string, string | number>,
	) => {
		const idx = children.length;
		if (tag === "line") {
			children.push(<line key={idx} {...a} />);
		} else if (tag === "path") {
			children.push(<path key={idx} {...a} />);
		} else {
			children.push(<circle key={idx} {...a} />);
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
			<circle
				key={children.length}
				cx={p[0]}
				cy={p[1]}
				r={1.3}
				fill={INK}
				stroke="none"
			/>,
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
			key={`icon-${cx}-${cy}`}
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
export function drop(cx: number, cy: number, h: number, filled: boolean) {
	const w = h * 0.735;
	const top = cy - h / 2;
	const rb = w / 2;
	const cb = cy + h / 2 - rb;
	const d =
		`M${cx} ${top}C${cx + w * 0.12} ${top + h * 0.22} ${cx + rb} ${cb - rb * 0.9} ` +
		`${cx + rb} ${cb}A${rb} ${rb} 0 0 1 ${cx - rb} ${cb}` +
		`C${cx - rb} ${cb - rb * 0.9} ${cx - w * 0.12} ${top + h * 0.22} ${cx} ${top}Z`;
	return filled ? (
		<path key={`drop-${cx}-${cy}`} d={d} fill={INK} />
	) : (
		<path
			key={`drop-${cx}-${cy}`}
			d={d}
			fill="none"
			stroke={INK}
			strokeWidth={h * 0.11}
		/>
	);
}
