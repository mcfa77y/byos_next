import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiSpec } from "../lib/api/openapi.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const spec = buildOpenApiSpec("http://192.168.4.66:3000");

// 1. Write root openapi.json
fs.writeFileSync(
	path.join(rootDir, "openapi.json"),
	JSON.stringify(spec, null, 2),
	"utf-8",
);
console.log("Wrote openapi.json");

// 2. Generate Bruno collection in bruno/
const brunoDir = path.join(rootDir, "bruno");
const envsDir = path.join(brunoDir, "environments");
fs.mkdirSync(envsDir, { recursive: true });

// bruno.json
fs.writeFileSync(
	path.join(brunoDir, "bruno.json"),
	JSON.stringify(
		{
			version: "1",
			name: "BYOS Next.js TRMNL API",
			type: "collection",
			ignore: ["node_modules", ".git"],
		},
		null,
		2,
	),
	"utf-8",
);

// collection.bru for root headers
fs.writeFileSync(
	path.join(brunoDir, "collection.bru"),
	`headers {
  Access-Token: {{access_token}}
  ID: {{mac_address}}
}
`,
	"utf-8",
);

// environments/local.bru
fs.writeFileSync(
	path.join(envsDir, "local.bru"),
	`vars {
  base_url: http://192.168.4.66:3000
  access_token: 9f2217ee9a24d01544d39849
  mac_address: EE:4B:50:07:3F:74
  device_id: INKY73
  model: inky_frame_7_3
}
`,
	"utf-8",
);

// Helper to slugify folder names
function sanitizeFolder(name) {
	return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

let count = 0;
for (const [routePath, methods] of Object.entries(spec.paths)) {
	for (const [method, op] of Object.entries(methods)) {
		const tag = op.tags?.[0] || "General";
		const folder = path.join(brunoDir, sanitizeFolder(tag));
		fs.mkdirSync(folder, { recursive: true });

		const reqName = op.summary || `${method.toUpperCase()} ${routePath}`;
		const filename = `${sanitizeFolder(reqName)}.bru`;

		// Convert OpenAPI route params /path/{id} to /path/:id
		const brunoUrlPath = routePath.replace(/\{([^}]+)\}/g, ":$1");
		const fullUrl = `{{base_url}}${brunoUrlPath}`;

		const lines = [];
		lines.push("meta {");
		lines.push(`  name: ${reqName}`);
		lines.push("  type: http");
		lines.push(`  seq: ${++count}`);
		lines.push("}");
		lines.push("");
		lines.push(`${method} {`);
		lines.push(`  url: ${fullUrl}`);
		lines.push(`  body: ${op.requestBody ? "json" : "none"}`);
		lines.push("  auth: inherit");
		lines.push("}");
		lines.push("");

		// Params: query, path
		const queryParams = (op.parameters || []).filter((p) => p.in === "query");
		if (queryParams.length > 0) {
			lines.push("params:query {");
			for (const p of queryParams) {
				const val =
					p.schema?.example !== undefined ? String(p.schema.example) : "";
				lines.push(`  ${p.name}: ${val}`);
			}
			lines.push("}");
			lines.push("");
		}

		const pathParams = (op.parameters || []).filter((p) => p.in === "path");
		if (pathParams.length > 0) {
			lines.push("params:path {");
			for (const p of pathParams) {
				const val =
					p.schema?.example !== undefined
						? String(p.schema.example)
						: p.name === "id"
							? "{{device_id}}"
							: "";
				lines.push(`  ${p.name}: ${val}`);
			}
			lines.push("}");
			lines.push("");
		}

		// Body if present
		if (op.requestBody?.content?.["application/json"]?.schema) {
			const schema = op.requestBody.content["application/json"].schema;
			const exampleBody = {};
			if (schema.properties) {
				for (const [k, v] of Object.entries(schema.properties)) {
					exampleBody[k] =
						v.example !== undefined
							? v.example
							: v.type === "object"
								? {}
								: v.type === "array"
									? []
									: null;
				}
			}
			lines.push("body:json {");
			lines.push(
				JSON.stringify(exampleBody, null, 2)
					.split("\n")
					.map((l) => `  ${l}`)
					.join("\n"),
			);
			lines.push("}");
			lines.push("");
		}

		// Headers
		const headerParams = (op.parameters || []).filter(
			(p) => p.in === "header" && p.name !== "Access-Token" && p.name !== "ID",
		);
		if (headerParams.length > 0) {
			lines.push("headers {");
			for (const p of headerParams) {
				const val =
					p.schema?.example !== undefined ? String(p.schema.example) : "";
				lines.push(`  ${p.name}: ${val}`);
			}
			lines.push("}");
			lines.push("");
		}

		fs.writeFileSync(path.join(folder, filename), lines.join("\n"), "utf-8");
	}
}

console.log(`Successfully generated Bruno collection with ${count} requests.`);
