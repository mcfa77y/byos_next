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
  const cw = profile.logicalWidth;
  const ch = profile.logicalHeight;
  const [design, vw, vh] = plan(cw, ch);
  // Bit-depth 1 screens drop #aaa entirely: rain area becomes a dot pattern.
  const hasGray = profile.bitDepth > 1 || profile.colors > 2;
  const V: View = {
    ...buildModel(data, params),
    ...createPrimitives(cw, ch, vw, vh),
  };
  const needsDots = !hasGray && V.hasRain;
  const items: ReactNode[] = [];

  if (V.days.length === 0) {
    items.push(
      V.txt(24, vh / 2, V.station || "Weather Curve", {
        size: 20,
        weight: 600,
      }),
      V.txt(24, vh / 2 + 24, "Loading…", { size: 16 }),
    );
  } else {
    const render: Record<string, () => ReactElement[]> = {
      full: () => designFull(vh, V, hasGray),
      portrait: () => designPortrait(vh, V, hasGray),
      column: () => designColumn(vh, V),
      list: () => designList(vh, V),
      wide: () => designWide(vh, V, hasGray),
      quadrant: () => designQuadrant(vh, V),
    };
    items.push(...render[design]());
  }

  // txt() output goes to the HTML overlay; everything else stays in the SVG.
  const svgChildren: ReactNode[] = [];
  const textChildren: ReactNode[] = [];
  for (const el of items) {
    (isValidElement(el) && el.type === "div" ? textChildren : svgChildren).push(
      el,
    );
  }

  return (
    <PreSatori width={cw} height={ch}>
      <div
        className="font-inter"
        style={{
          display: "flex",
          position: "relative",
          width: cw,
          height: ch,
          backgroundColor: PAPER,
        }}
      >
        <svg
          width={cw}
          height={ch}
          viewBox={`0 0 ${vw} ${vh}`}
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
