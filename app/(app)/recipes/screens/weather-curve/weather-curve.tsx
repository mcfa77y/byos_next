import React, {
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
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
	DesignColumn,
	DesignFull,
	DesignList,
	DesignPortrait,
	DesignQuadrant,
	DesignWide,
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

function partitionTree(
	node: ReactNode,
	svgChildren: ReactNode[],
	textChildren: ReactNode[],
) {
	React.Children.forEach(node, (child) => {
		if (!isValidElement(child)) return;
		if (child.type === React.Fragment) {
			const { children } = child.props as { children?: ReactNode };
			partitionTree(children, svgChildren, textChildren);
		} else if (child.type === "span") {
			// Transparent structural grouping span used for semantic loop keys
			const { children } = child.props as { children?: ReactNode };
			partitionTree(children, svgChildren, textChildren);
		} else if (typeof child.type === "function") {
			// Component function: evaluate and recurse
			const rendered = (child.type as (props: unknown) => ReactNode)(
				child.props,
			);
			partitionTree(rendered, svgChildren, textChildren);
		} else if (child.type === "div") {
			textChildren.push(child);
		} else {
			svgChildren.push(child);
		}
	});
}

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
	const { Txt } = view;

	let content: ReactElement;
	if (view.days.length === 0) {
		content = (
			<>
				<Txt
					x={24}
					y={viewHeight / 2}
					content={view.station || "Weather Curve"}
					size={20}
					weight={600}
				/>
				<Txt x={24} y={viewHeight / 2 + 24} content="Loading…" size={16} />
			</>
		);
	} else {
		switch (selectedDesign) {
			case "full":
				content = (
					<DesignFull viewHeight={viewHeight} view={view} hasGray={hasGray} />
				);
				break;
			case "portrait":
				content = (
					<DesignPortrait
						viewHeight={viewHeight}
						view={view}
						hasGray={hasGray}
					/>
				);
				break;
			case "column":
				content = <DesignColumn viewHeight={viewHeight} view={view} />;
				break;
			case "list":
				content = <DesignList viewHeight={viewHeight} view={view} />;
				break;
			case "wide":
				content = (
					<DesignWide viewHeight={viewHeight} view={view} hasGray={hasGray} />
				);
				break;
			case "quadrant":
				content = <DesignQuadrant viewHeight={viewHeight} view={view} />;
				break;
			default:
				content = (
					<DesignFull viewHeight={viewHeight} view={view} hasGray={hasGray} />
				);
		}
	}

	// Partition evaluated nodes: Txt (divs) to HTML overlay; paths/rects/lines/circles to SVG
	const svgChildren: ReactNode[] = [];
	const textChildren: ReactNode[] = [];
	partitionTree(content, svgChildren, textChildren);

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
