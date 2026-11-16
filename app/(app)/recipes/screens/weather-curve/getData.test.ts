import { parseCurrent, transformOpenMeteo } from "./getData";

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

describe("transformOpenMeteo rain probability mapping", () => {
	const sampleTimes = [
		"2026-11-15T00:00",
		"2026-11-15T01:00",
		"2026-11-15T02:00",
		"2026-11-15T03:00",
		"2026-11-15T04:00",
		"2026-11-15T05:00",
		"2026-11-15T06:00",
		"2026-11-15T07:00",
		"2026-11-15T08:00",
		"2026-11-15T09:00",
		"2026-11-15T10:00",
		"2026-11-15T11:00",
		"2026-11-15T12:00",
	];

	it("maps maximum hourly precipitation probability to day rain", () => {
		const result = transformOpenMeteo({
			hourly: {
				time: sampleTimes,
				temperature_2m: sampleTimes.map(() => 15),
				precipitation_probability: [
					10, 20, 75, 40, 15, 0, 5, 10, 20, 30, 40, 50, 60,
				],
			},
		});
		expect(result.days).toHaveLength(1);
		expect(result.days[0].rain).toBe(75);
	});

	it("falls back to daily precipitation_probability_max when hourly probability is absent", () => {
		const result = transformOpenMeteo({
			hourly: {
				time: sampleTimes,
				temperature_2m: sampleTimes.map(() => 15),
			},
			daily: {
				time: ["2026-11-15"],
				precipitation_probability_max: [85],
			},
		});
		expect(result.days).toHaveLength(1);
		expect(result.days[0].rain).toBe(85);
	});

	it("returns null rain when no probability is available", () => {
		const result = transformOpenMeteo({
			hourly: {
				time: sampleTimes,
				temperature_2m: sampleTimes.map(() => 15),
			},
		});
		expect(result.days).toHaveLength(1);
		expect(result.days[0].rain).toBeNull();
	});
});
