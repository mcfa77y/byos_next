jest.mock("next/font/google", () => ({
	Geist: () => ({ variable: "--font-sans" }),
	Geist_Mono: () => ({ variable: "--font-mono" }),
	Inter: () => ({ variable: "--font-inter" }),
	JetBrains_Mono: () => ({ variable: "--font-jetbrains-mono" }),
	Cinzel: () => ({ variable: "--font-cinzel" }),
	Cinzel_Decorative: () => ({ variable: "--font-cinzel-decorative" }),
	Bebas_Neue: () => ({ variable: "--font-bebas-neue" }),
	Space_Grotesk: () => ({ variable: "--font-space-grotesk" }),
	Space_Mono: () => ({ variable: "--font-space-mono" }),
	Press_Start_2P: () => ({ variable: "--font-press-start-2p" }),
	VT323: () => ({ variable: "--font-vt323" }),
	Silkscreen: () => ({ variable: "--font-silkscreen" }),
}));
jest.mock("next/font/local", () => () => ({ variable: "--font-mock" }));
jest.mock("@/utils/pre-satori", () => ({
	PreSatori: ({ children }: { children: React.ReactNode }) =>
		React.createElement("div", { "data-testid": "pre-satori" }, children),
}));

import React from "react";
import type { Data, Params } from "./model";
import WeatherCurve from "./weather-curve";

describe("WeatherCurve component", () => {
	const sampleData: Data = {
		now: { temp: 18, icon: "partly-cloudy-day" },
		days: [
			{
				date: "2026-11-08",
				weekday: 6,
				day: 8,
				month: 10,
				high: 22,
				low: 14,
				icon: "partly-cloudy-day",
				rain: 20,
				uv: 5,
			},
			{
				date: "2026-11-09",
				weekday: 0,
				day: 9,
				month: 10,
				high: 20,
				low: 12,
				icon: "rain",
				rain: 80,
				uv: 3,
			},
			{
				date: "2026-11-10",
				weekday: 1,
				day: 10,
				month: 10,
				high: 19,
				low: 11,
				icon: "cloudy",
				rain: 10,
				uv: 4,
			},
			{
				date: "2026-11-11",
				weekday: 2,
				day: 11,
				month: 10,
				high: 23,
				low: 13,
				icon: "clear-day",
				rain: 0,
				uv: 6,
			},
			{
				date: "2026-11-12",
				weekday: 3,
				day: 12,
				month: 10,
				high: 21,
				low: 12,
				icon: "partly-cloudy-day",
				rain: 30,
				uv: 5,
			},
			{
				date: "2026-11-13",
				weekday: 4,
				day: 13,
				month: 10,
				high: 18,
				low: 10,
				icon: "rain",
				rain: 90,
				uv: 2,
			},
			{
				date: "2026-11-14",
				weekday: 5,
				day: 14,
				month: 10,
				high: 17,
				low: 9,
				icon: "thunderstorm",
				rain: 70,
				uv: 2,
			},
		],
		station: "San Francisco",
		source: "open-meteo",
		updated: "2026-11-08T12:00:00Z",
	};

	const sampleParams: Params = {
		location: "San Francisco",
		latitude: 37.7749,
		longitude: -122.4194,
		units: "celsius",
		language: "en",
		showUv: true,
	};

	const testCases = [
		{ name: "wide", width: 800, height: 280 },
		{ name: "column", width: 400, height: 1000 },
		{ name: "portrait", width: 400, height: 800 },
		{ name: "list", width: 400, height: 500 },
		{ name: "quadrant", width: 400, height: 260 },
		{ name: "empty-days", width: 800, height: 480, empty: true },
	];

	for (const tc of testCases) {
		it(`renders ${tc.name} design cleanly without throwing`, () => {
			const data = tc.empty ? { ...sampleData, days: [] } : sampleData;
			const element = React.createElement(WeatherCurve, {
				width: tc.width,
				height: tc.height,
				data,
				params: sampleParams,
			});
			const rendered = (
				element.type as (props: unknown) => React.ReactElement<{
					children: React.ReactElement<{ children: React.ReactNode }>;
				}>
			)(element.props);
			expect(rendered).toBeDefined();
			const rootDiv = rendered.props.children;
			const children = React.Children.toArray(rootDiv.props.children);
			const svg = children[0] as React.ReactElement<{
				children: React.ReactNode;
			}>;
			expect(svg.type).toBe("svg");
			const svgInner = React.Children.toArray(svg.props.children);
			expect(svgInner.length).toBeGreaterThan(0);
			// Check that text overlay elements (divs) were partitioned
			const textChildren = children.slice(1) as React.ReactElement[];
			expect(textChildren.length).toBeGreaterThan(0);
			for (const txt of textChildren) {
				expect(txt.type).toBe("div");
			}
		});
	}

	it("renders dot pattern for rain on 1-bit or bw palette screens", () => {
		const element = React.createElement(WeatherCurve, {
			width: 800,
			height: 480,
			data: sampleData,
			params: sampleParams,
			screen: {
				physicalWidth: 800,
				physicalHeight: 480,
				logicalWidth: 800,
				logicalHeight: 480,
				pixelRatio: 1,
				ditherPixelRatio: 1,
				uiScale: 1,
				gapScale: 1,
				sizeTier: "md",
				density: "1x",
				orientation: "landscape",
				aspectRatio: 800 / 480,
				colors: 4,
				bitDepth: 2,
				supportsColor: false,
				isCompact: false,
				isHalfScreen: false,
				isLarge: false,
				paletteId: "bw",
			},
		});
		const rendered = (
			element.type as (props: unknown) => React.ReactElement<{
				children: React.ReactElement<{ children: React.ReactNode }>;
			}>
		)(element.props);
		const rootDiv = rendered.props.children;
		const children = React.Children.toArray(rootDiv.props.children);
		const svg = children[0] as React.ReactElement<{
			children: React.ReactNode;
		}>;
		const svgInner = React.Children.toArray(svg.props.children);
		const defs = svgInner.find(
			(child) => React.isValidElement(child) && child.type === "defs",
		);
		expect(defs).toBeDefined();
	});

	it("renders dot pattern for rain on discrete 7-color e-ink palette screens", () => {
		const element = React.createElement(WeatherCurve, {
			width: 800,
			height: 480,
			data: sampleData,
			params: sampleParams,
			screen: {
				physicalWidth: 800,
				physicalHeight: 480,
				logicalWidth: 800,
				logicalHeight: 480,
				pixelRatio: 1,
				ditherPixelRatio: 1,
				uiScale: 1,
				gapScale: 1,
				sizeTier: "md",
				density: "1x",
				orientation: "landscape",
				aspectRatio: 800 / 480,
				colors: 7,
				bitDepth: 3,
				supportsColor: true,
				isCompact: false,
				isHalfScreen: false,
				isLarge: false,
				paletteId: "color-7a",
			},
		});
		const rendered = (
			element.type as (props: unknown) => React.ReactElement<{
				children: React.ReactElement<{ children: React.ReactNode }>;
			}>
		)(element.props);
		const rootDiv = rendered.props.children;
		const children = React.Children.toArray(rootDiv.props.children);
		const svg = children[0] as React.ReactElement<{
			children: React.ReactNode;
		}>;
		const svgInner = React.Children.toArray(svg.props.children);
		const defs = svgInner.find(
			(child) => React.isValidElement(child) && child.type === "defs",
		);
		expect(defs).toBeDefined();
	});

	it("renders rain percentages and stats when rain data is present", () => {
		const element = React.createElement(WeatherCurve, {
			width: 800,
			height: 480,
			data: sampleData,
			params: sampleParams,
		});
		const rendered = (
			element.type as (props: unknown) => React.ReactElement<{
				children: React.ReactElement<{ children: React.ReactNode }>;
			}>
		)(element.props);
		const rootDiv = rendered.props.children;
		const children = React.Children.toArray(rootDiv.props.children);
		const textDivs = children.slice(1) as React.ReactElement<{
			children: React.ReactNode;
		}>[];
		const textContents = textDivs.map((d) => String(d.props.children));
		expect(textContents).toContain("RAIN");
		expect(textContents).toContain("20%");
	});

	it("renders color-coded curves and drops when screen supports color", () => {
		const element = React.createElement(WeatherCurve, {
			width: 800,
			height: 480,
			data: sampleData,
			params: sampleParams,
			screen: {
				physicalWidth: 800,
				physicalHeight: 480,
				logicalWidth: 800,
				logicalHeight: 480,
				pixelRatio: 1,
				ditherPixelRatio: 1,
				uiScale: 1,
				gapScale: 1,
				sizeTier: "md",
				density: "1x",
				orientation: "landscape",
				aspectRatio: 800 / 480,
				colors: 7,
				bitDepth: 3,
				supportsColor: true,
				isCompact: false,
				isHalfScreen: false,
				isLarge: false,
				paletteId: "color-7a",
			},
		});
		const rendered = (
			element.type as (props: unknown) => React.ReactElement<{
				children: React.ReactElement<{ children: React.ReactNode }>;
			}>
		)(element.props);
		const rootDiv = rendered.props.children;
		const children = React.Children.toArray(rootDiv.props.children);
		const svg = children[0] as React.ReactElement<{
			children: React.ReactNode;
		}>;
		const svgInner = React.Children.toArray(svg.props.children);
		// High temp path with red stroke (#FF0000)
		const redPath = svgInner.find(
			(child) =>
				React.isValidElement<{ stroke?: string }>(child) &&
				child.type === "path" &&
				child.props.stroke === "#FF0000",
		);
		expect(redPath).toBeDefined();
		// Low temp path with blue stroke (#0000FF)
		const bluePath = svgInner.find(
			(child) =>
				React.isValidElement<{ stroke?: string }>(child) &&
				child.type === "path" &&
				child.props.stroke === "#0000FF",
		);
		expect(bluePath).toBeDefined();
	});
});
