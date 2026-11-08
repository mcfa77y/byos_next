/// <reference types="jest" />

jest.mock("@/lib/database/scoped-db", () => ({
	withDeviceApiKey: jest.fn(),
}));
jest.mock("@/lib/database/utils", () => ({
	checkDbConnection: jest.fn(async () => ({ ready: true })),
}));

import { parseRequestHeaders } from "./request-headers";

describe("parseRequestHeaders", () => {
	it("extracts apiKey from Access-Token header", () => {
		const req = new Request("http://localhost/api/display", {
			headers: { "Access-Token": "token-123" },
		});
		expect(parseRequestHeaders(req).apiKey).toBe("token-123");
	});

	it("extracts apiKey from api_key header (Bruno / OpenAPI client format)", () => {
		const req = new Request("http://localhost/api/display", {
			headers: { api_key: "token-456" },
		});
		expect(parseRequestHeaders(req).apiKey).toBe("token-456");
	});

	it("extracts apiKey from access_token search param", () => {
		const req = new Request(
			"http://localhost/api/bitmap/test.png?access_token=token-789",
		);
		expect(parseRequestHeaders(req).apiKey).toBe("token-789");
	});

	it("extracts apiKey from api_key search param", () => {
		const req = new Request(
			"http://localhost/api/bitmap/test.png?api_key=token-abc",
		);
		expect(parseRequestHeaders(req).apiKey).toBe("token-abc");
	});
});
