import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { z } from "zod";
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
} from "@/lib/recipes/constants";
import type { RecipeDefinition } from "@/lib/recipes/types";
import {
	createScreenProfile,
	type ScreenProfile,
} from "@/lib/trmnl/screen-profile";
import { PreSatori } from "@/utils/pre-satori";
import {
	designColumn,
	designFull,
	designList,
	designPortrait,
	designQuadrant,
	designWide,
	plan,
} from "./designs";
import getData from "./getData";
import {
	buildModel,
	type Data,
	dataSchema,
	type Params,
	paramsSchema,
} from "./model";
import { createPrimitives, INK, PAPER, type View } from "./primitives";

export { dataSchema, paramsSchema };

export default function WeatherCurve({
	width = DEFAULT_IMAGE_WIDTH,
	height = DEFAULT_IMAGE_HEIGHT,
	screen,
	params,
	data,
}: Readonly<{
	width?: number;
	height?: number;
	screen?: ScreenProfile;
	params: Params;
	data: Data;
}>) {
	const profile = screen ?? createScreenProfile({ width, height });
	const canvasWidth = profile.logicalWidth;
	const canvasHeight = profile.logicalHeight;
	const [selectedDesign, viewWidth, viewHeight] = plan(
		canvasWidth,
		canvasHeight,
	);
	// Bit-depth 1 screens drop #aaa entirely: rain area becomes a dot pattern.
	const hasGray = profile.bitDepth > 1 || profile.colors > 2;
	const view: View = {
		...buildModel(data, params),
		...createPrimitives({
			canvasWidth,
			canvasHeight,
			viewWidth,
			viewHeight,
		}),
	};
	const needsDots = !hasGray && view.hasRain;
	const renderedItems: ReactNode[] = [];

	if (view.days.length === 0) {
		renderedItems.push(
			view.txt({
				x: 24,
				y: viewHeight / 2,
				content: view.station || "Weather Curve",
				size: 20,
				weight: 600,
			}),
			view.txt({
				x: 24,
				y: viewHeight / 2 + 24,
				content: "Loading…",
				size: 16,
			}),
		);
	} else {
		const renderByDesign: Record<string, () => ReactElement[]> = {
			full: () => designFull({ viewHeight, view, hasGray }),
			portrait: () => designPortrait({ viewHeight, view, hasGray }),
			column: () => designColumn(viewHeight, view),
			list: () => designList(viewHeight, view),
			wide: () => designWide({ viewHeight, view, hasGray }),
			quadrant: () => designQuadrant(viewHeight, view),
		};
		renderedItems.push(...renderByDesign[selectedDesign]());
	}

	// txt() output goes to the HTML overlay; everything else stays in the SVG.
	const svgChildren: ReactNode[] = [];
	const textChildren: ReactNode[] = [];
	for (const element of renderedItems) {
		(isValidElement(element) && element.type === "div"
			? textChildren
			: svgChildren
		).push(element);
	}

	return (
		<PreSatori width={canvasWidth} height={canvasHeight}>
			<div
				className="font-inter"
				style={{
					display: "flex",
					position: "relative",
					width: canvasWidth,
					height: canvasHeight,
					backgroundColor: PAPER,
				}}
			>
				<svg
					width={canvasWidth}
					height={canvasHeight}
					viewBox={`0 0 ${viewWidth} ${viewHeight}`}
					preserveAspectRatio="xMidYMid meet"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>Weather Curve</title>
					{needsDots && (
						<defs>
							<pattern
								id="wc-dots"
								width={2}
								height={2}
								patternUnits="userSpaceOnUse"
							>
								<rect x={0} y={0} width={1} height={1} fill={INK} />
							</pattern>
						</defs>
					)}
					{svgChildren}
				</svg>
				{textChildren}
			</div>
		</PreSatori>
	);
}

export const definition: RecipeDefinition<
	typeof paramsSchema,
	typeof dataSchema
> = {
	meta: {
		slug: "weather-curve",
		title: "Weather Curve",
		description:
			"7-day temperature curve with rain probability and per-day icons, powered by Open-Meteo. Ported from the Terminus Weather Curve extension.",
		published: true,
		tags: ["weather", "api", "live-data", "configurable", "svg"],
		author: { name: "Terminus Weather Curve" },
		category: "display-components",
		version: "1.0.0",
	},
	paramsSchema,
	dataSchema,
	getData: async (params) => {
		const data = await getData({
			location: params.location,
			latitude: params.latitude,
			longitude: params.longitude,
		});
		return data as z.infer<typeof dataSchema>;
	},
	Component: ({ width, height, screen, params, data }) => (
		<WeatherCurve
			width={width}
			height={height}
			screen={screen}
			params={params}
			data={data}
		/>
	),
};
