import { parseCurrent } from "./getData";

describe("parseCurrent timezone regex", () => {
	it("preserves explicit positive or negative UTC offset", () => {
		const result = parseCurrent({
			input: {
				current: {
					time: "2026-11-08T12:00:00+02:00",
					temperature_2m: 18.2,
					weather_code: 1,
					is_day: 1,
				},
			},
			zone: "Z",
		});
		expect(result?.updated).toBe("2026-11-08T12:00:00+02:00");
		expect(result?.temp).toBe(18.2);
	});

	it("preserves explicit UTC Z indicator", () => {
		const result = parseCurrent({
			input: {
				current: {
					time: "2026-11-08T12:00:00Z",
					temperature_2m: 15.0,
					weather_code: 0,
					is_day: 1,
				},
			},
			zone: "+00:00",
		});
		expect(result?.updated).toBe("2026-11-08T12:00:00Z");
	});

	it("appends default zone when no timezone is present", () => {
		const result = parseCurrent({
			input: {
				current: {
					time: "2026-11-08T12:00",
					temperature_2m: 20.4,
					weather_code: 2,
					is_day: 1,
				},
			},
			zone: "+01:00",
		});
		expect(result?.updated).toBe("2026-11-08T12:00:00+01:00");
	});
});
