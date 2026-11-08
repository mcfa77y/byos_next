import sharp from "sharp";
import { getDeviceProfile } from "../trmnl/device-profile";
import { renderDeviceImage } from "./device-image";

describe("renderDeviceImage", () => {
	it("renders a 1x1 black pixel PNG buffer", async () => {
		const png = await sharp({
			create: {
				width: 10,
				height: 10,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 1 },
			},
		})
			.png()
			.toBuffer();

		const profile = await getDeviceProfile(null);

		const res = await renderDeviceImage({
			png,
			profile,
		});

		expect(res.buffer).toBeInstanceOf(Buffer);
		expect(res.buffer.length).toBeGreaterThan(0);
		expect(res.size_limit_exceeded).toBe(false);
	});
});
