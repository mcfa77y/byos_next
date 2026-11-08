/// <reference types="jest" />

const executeTakeFirst = jest.fn();
const where = jest.fn(() => ({ executeTakeFirst }));
const selectAll = jest.fn(() => ({ where }));
const selectFrom = jest.fn(() => ({ selectAll }));

jest.mock("@/lib/database/db", () => ({
	db: {
		selectFrom,
	},
}));

jest.mock("@/lib/database/scoped-db", () => ({
	withExplicitUserScope: jest.fn(async (_userId, callback) =>
		callback({ selectFrom }),
	),
}));

jest.mock("@/lib/database/utils", () => ({
	checkDbConnection: jest.fn(async () => ({ ready: true })),
}));

jest.mock("@/lib/device/request-headers", () => ({
	parseRequestHeaders: jest.fn((request: Request) => ({
		apiKey: request.headers.get("access-token"),
		hostUrl: "http://byos.local",
		width: 800,
		height: 480,
	})),
	resolveUserIdFromApiKey: jest.fn(async () => "user-1"),
}));

jest.mock("@/lib/display/select", () => ({
	selectDisplayForDevice: jest.fn(
		async (device: { api_key?: string; screen?: string }) => ({
			screen: device.screen ?? "simple-text",
			profile: {
				model: {
					name: "trmnl",
					width: 800,
					height: 480,
					mime_type: "image/png",
				},
			},
			width: 800,
			height: 480,
			imageUrl: `http://byos.local/api/bitmap/${device.screen ?? "simple-text"}.png?access_token=${device.api_key}`,
			baseQueryParams: `access_token=${device.api_key}`,
		}),
	),
}));

jest.mock("../utils", () => ({
	getActivePlaylistItem: jest.fn(async () => ({
		screen_id: "weather-curve",
		duration: 30,
	})),
}));

jest.mock("@/lib/logger", () => ({
	logError: jest.fn(),
	logInfo: jest.fn(),
}));

import { GET } from "./route";

describe("GET /api/display/current", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns 401 when no access token is provided", async () => {
		const req = new Request("http://byos.local/api/display/current");
		const res = await GET(req);
		expect(res.status).toBe(401);
	});

	it("returns active playlist item screen and embeds access_token in image_url", async () => {
		executeTakeFirst.mockResolvedValue({
			id: "2",
			friendly_id: "INKY73",
			api_key: "test-api-key",
			display_mode: "playlist",
			playlist_id: "playlist-1",
			current_playlist_index: 0,
			screen: "simple-text",
			model: "inky_frame_7_3",
		});

		const req = new Request("http://byos.local/api/display/current", {
			headers: { "access-token": "test-api-key" },
		});
		const res = await GET(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.status).toBe(200);
		expect(json.image_url).toContain("weather-curve.png");
		expect(json.image_url).toContain("access_token=test-api-key");
		expect(json.refresh_rate).toBe(30);
	});
});
