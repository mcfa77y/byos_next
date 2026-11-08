/// <reference types="jest" />
import { selectDisplayForDevice } from "./select";

jest.mock("@/lib/trmnl/device-profile", () => ({
	getDeviceProfile: jest.fn(
		async (modelName?: string | null, paletteId?: string | null) => ({
			model: {
				name: modelName ?? "trmnl",
				width: 800,
				height: 480,
				mime_type: "image/png",
			},
			palette: paletteId ? { id: paletteId } : null,
		}),
	),
}));

describe("selectDisplayForDevice", () => {
	it("embeds access_token in imageUrl when device.api_key is present", async () => {
		const selection = await selectDisplayForDevice(
			{
				screen: "weather-curve",
				model: "inky_frame_7_3",
				palette_id: "color-7a",
				screen_orientation: "landscape",
				screen_width: 800,
				screen_height: 480,
				api_key: "test-device-key",
			},
			{ hostUrl: "http://192.168.4.66:3000" },
		);

		expect(selection.imageUrl).toContain("access_token=test-device-key");
		expect(selection.baseQueryParams).toContain("access_token=test-device-key");
	});
});
