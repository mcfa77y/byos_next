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
	circleA: { x: number; y: number; r: number },
	circleB: { x: number; y: number; r: number },
) {
	const dx = circleB.x - circleA.x;
	const dy = circleB.y - circleA.y;
	const distance = Math.hypot(dx, dy);
	const chordOffset =
		(circleA.r * circleA.r - circleB.r * circleB.r + distance * distance) /
		(2 * distance);
	const perpHeight = Math.sqrt(
		Math.max(circleA.r * circleA.r - chordOffset * chordOffset, 0),
	);
	const midX = circleA.x + (chordOffset * dx) / distance;
	const midY = circleA.y + (chordOffset * dy) / distance;
	const point1 = {
		x: midX + (perpHeight * dy) / distance,
		y: midY - (perpHeight * dx) / distance,
	};
	const point2 = {
		x: midX - (perpHeight * dy) / distance,
		y: midY + (perpHeight * dx) / distance,
	};
	return point1.y < point2.y ? point1 : point2;
}

export interface ArcToOptions {
	circle: { x: number; y: number; r: number };
	from: { x: number; y: number };
	to: { x: number; y: number };
}

function arcTo({ circle, from, to }: ArcToOptions) {
	let span =
		Math.atan2(to.y - circle.y, to.x - circle.x) -
		Math.atan2(from.y - circle.y, from.x - circle.x);
	while (span < 0) span += 2 * Math.PI;
	return `A${circle.r} ${circle.r} 0 ${span > Math.PI ? 1 : 0} 1 ${to.x} ${to.y}`;
}

function cloudPath(cloudParams: number[]): string {
	const leftCircle = {
		x: cloudParams[1],
		y: cloudParams[0] - cloudParams[2],
		r: cloudParams[2],
	};
	const topCircle = {
		x: cloudParams[3],
		y: cloudParams[4],
		r: cloudParams[5],
	};
	const rightCircle = {
		x: cloudParams[6],
		y: cloudParams[0] - cloudParams[7],
		r: cloudParams[7],
	};
	const start = { x: leftCircle.x, y: cloudParams[0] };
	const leftTopJoin = upperIntersection(leftCircle, topCircle);
	const topRightJoin = upperIntersection(topCircle, rightCircle);
	const end = { x: rightCircle.x, y: cloudParams[0] };
	return `M${start.x} ${start.y}${arcTo({ circle: leftCircle, from: start, to: leftTopJoin })}${arcTo({ circle: topCircle, from: leftTopJoin, to: topRightJoin })}${arcTo({ circle: rightCircle, from: topRightJoin, to: end })}Z`;
}

function moonPath(moonParams: number[]): string {
	const outerCircle = {
		x: moonParams[0],
		y: moonParams[1],
		r: moonParams[2],
	};
	const innerCircle = {
		x: moonParams[0] + moonParams[2] * 0.55,
		y: moonParams[1] - moonParams[2] * 0.45,
		r: moonParams[2] * 0.8,
	};
	const dx = innerCircle.x - outerCircle.x;
	const dy = innerCircle.y - outerCircle.y;
	const distance = Math.hypot(dx, dy);
	const chordOffset =
		(outerCircle.r * outerCircle.r -
			innerCircle.r * innerCircle.r +
			distance * distance) /
		(2 * distance);
	const perpHeight = Math.sqrt(
		Math.max(outerCircle.r * outerCircle.r - chordOffset * chordOffset, 0),
	);
	const midX = outerCircle.x + (chordOffset * dx) / distance;
	const midY = outerCircle.y + (chordOffset * dy) / distance;
	const point1 = {
		x: midX + (perpHeight * dy) / distance,
		y: midY - (perpHeight * dx) / distance,
	};
	const point2 = {
		x: midX - (perpHeight * dy) / distance,
		y: midY + (perpHeight * dx) / distance,
	};
	return `M${point1.x} ${point1.y}A${outerCircle.r} ${outerCircle.r} 0 1 0 ${point2.x} ${point2.y}A${innerCircle.r} ${innerCircle.r} 0 0 1 ${point1.x} ${point1.y}Z`;
}
export interface IconOptions {
	name: string;
	centerX: number;
	centerY: number;
	scaleFactor: number;
	strokeWidth: number;
}

export function icon({
	name,
	centerX,
	centerY,
	scaleFactor,
	strokeWidth,
}: IconOptions) {
	const spec = ICONS[name] || ICONS.cloudy;
	const children: ReactNode[] = [];
	const add = (
		tag: "line" | "path" | "circle",
		attributes: Record<string, string | number>,
	) => {
		const idx = children.length;
		if (tag === "line") {
			children.push(<line key={idx} {...attributes} />);
		} else if (tag === "path") {
			children.push(<path key={idx} {...attributes} />);
		} else {
			children.push(<circle key={idx} {...attributes} />);
		}
	};

	if (spec.sun) {
		const sun = spec.sun;
		add("circle", {
			cx: sun[0],
			cy: sun[1],
			r: sun[2],
			vectorEffect: "non-scaling-stroke",
		});
		for (let i = 0; i < 8; i++) {
			const angle = (i * Math.PI) / 4;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			add("line", {
				x1: sun[0] + cos * sun[3],
				y1: sun[1] + sin * sun[3],
				x2: sun[0] + cos * sun[4],
				y2: sun[1] + sin * sun[4],
				vectorEffect: "non-scaling-stroke",
			});
		}
	}
	if (spec.moon)
		add("path", {
			d: moonPath(spec.moon),
			vectorEffect: "non-scaling-stroke",
		});
	if (spec.cloud) {
		const pathData = cloudPath(spec.cloud);
		if (spec.sun || spec.moon) {
			add("path", {
				d: pathData,
				fill: PAPER,
				stroke: PAPER,
				strokeWidth: strokeWidth + 0.6,
				vectorEffect: "non-scaling-stroke",
			});
		}
		add("path", {
			d: pathData,
			fill: PAPER,
			vectorEffect: "non-scaling-stroke",
		});
	}
	if (spec.drops) {
		const drops = spec.drops;
		for (let j = -1; j <= 1; j++) {
			const x = drops[0] + j * drops[1];
			add("line", {
				x1: x + drops[4] / 2,
				y1: drops[2],
				x2: x - drops[4] / 2,
				y2: drops[3],
				vectorEffect: "non-scaling-stroke",
			});
		}
	}
	for (const lineCoords of spec.lines || []) {
		add("line", {
			x1: lineCoords[0],
			y1: lineCoords[1],
			x2: lineCoords[2],
			y2: lineCoords[3],
			vectorEffect: "non-scaling-stroke",
		});
	}
	for (const pathData of spec.paths || []) {
		add("path", { d: pathData, vectorEffect: "non-scaling-stroke" });
	}
	for (const point of spec.dots || []) {
		children.push(
			<circle
				key={children.length}
				cx={point[0]}
				cy={point[1]}
				r={1.3}
				fill={INK}
				stroke="none"
			/>,
		);
	}
	for (const ring of spec.rings || []) {
		add("circle", {
			cx: ring[0],
			cy: ring[1],
			r: 1.4,
			vectorEffect: "non-scaling-stroke",
		});
	}
	return (
		<g
			key={`icon-${centerX}-${centerY}`}
			transform={`translate(${centerX} ${centerY}) scale(${scaleFactor})`}
			fill="none"
			stroke={INK}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{children}
		</g>
	);
}

const DROP_WIDTH_TO_HEIGHT_RATIO = 0.735;
const DROP_STROKE_WIDTH_FACTOR = 0.11;
const DROP_TOP_CONTROL_X_FACTOR = 0.12;
const DROP_TOP_CONTROL_Y_FACTOR = 0.22;
const DROP_BOTTOM_CONTROL_OFFSET_FACTOR = 0.9;

export interface DropOptions {
	centerX: number;
	centerY: number;
	height: number;
	filled: boolean;
}

/** Rain drop: filled from 50% chance of rain, outlined below. */
export function drop({ centerX, centerY, height, filled }: DropOptions) {
	const width = height * DROP_WIDTH_TO_HEIGHT_RATIO;
	const topY = centerY - height / 2;
	const bottomRadius = width / 2;
	const bottomCenterY = centerY + height / 2 - bottomRadius;
	const controlPointOffsetY =
		bottomCenterY - bottomRadius * DROP_BOTTOM_CONTROL_OFFSET_FACTOR;
	const controlPointOffsetX = width * DROP_TOP_CONTROL_X_FACTOR;
	const controlPointTopY = topY + height * DROP_TOP_CONTROL_Y_FACTOR;

	const pathData =
		`M${centerX} ${topY}C${centerX + controlPointOffsetX} ${controlPointTopY} ${centerX + bottomRadius} ${controlPointOffsetY} ` +
		`${centerX + bottomRadius} ${bottomCenterY}A${bottomRadius} ${bottomRadius} 0 0 1 ${centerX - bottomRadius} ${bottomCenterY}` +
		`C${centerX - bottomRadius} ${controlPointOffsetY} ${centerX - controlPointOffsetX} ${controlPointTopY} ${centerX} ${topY}Z`;
	return filled ? (
		<path key={`drop-${centerX}-${centerY}`} d={pathData} fill={INK} />
	) : (
		<path
			key={`drop-${centerX}-${centerY}`}
			d={pathData}
			fill="none"
			stroke={INK}
			strokeWidth={height * DROP_STROKE_WIDTH_FACTOR}
		/>
	);
}
