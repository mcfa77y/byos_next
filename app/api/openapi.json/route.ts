import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { parseRequestHeaders } from "@/lib/device/request-headers";

/**
 * GET /api/openapi.json
 * Serves the OpenAPI 3.0.3 specification for direct import into Bruno / Postman / Swagger.
 */
export async function GET(request: Request) {
	const { hostUrl } = parseRequestHeaders(request);
	return NextResponse.json(buildOpenApiSpec(hostUrl), { status: 200 });
}
