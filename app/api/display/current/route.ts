import { NextResponse } from "next/server";
import { withExplicitUserScope } from "@/lib/database/scoped-db";
import { checkDbConnection } from "@/lib/database/utils";
import {
	DISPLAY_FALLBACK_REFRESH_SECONDS,
	normalizeRefreshSchedule,
} from "@/lib/device/defaults";
import {
	parseRequestHeaders,
	resolveUserIdFromApiKey,
} from "@/lib/device/request-headers";
import { selectDisplayForDevice } from "@/lib/display/select";
import { logError, logInfo } from "@/lib/logger";
import { DeviceDisplayMode } from "@/lib/mixup/constants";
import {
	buildDeviceImageFilename,
	buildDeviceImageUrl,
} from "@/lib/render/device-image-url";
import type { Device } from "@/lib/types";
import { getActivePlaylistItem } from "../utils";

/**
 * GET /api/display/current
 * Fetch the current screen for a device.
 *
 * Headers:
 * - Access-Token (required): Device API Key
 */
export async function GET(request: Request) {
	const headers = parseRequestHeaders(request);
	const { apiKey } = headers;
	const apiKeyPrefix = apiKey?.slice(0, 6);

	if (!apiKey) {
		return NextResponse.json(
			{ status: 401, error: "Access-Token header is required" },
			{ status: 401 },
		);
	}

	const { ready } = await checkDbConnection();
	if (!ready) {
		logInfo("Database not available for /api/display/current", {
			source: "api/display/current",
			metadata: { apiKey: apiKeyPrefix },
		});
		return NextResponse.json(
			{ status: 503, error: "Database not available" },
			{ status: 503 },
		);
	}

	try {
		const userId = await resolveUserIdFromApiKey(apiKey, {
			assumeDbReady: true,
		});
		const device = userId
			? await withExplicitUserScope(userId, (scopedDb) =>
					scopedDb
						.selectFrom("devices")
						.selectAll()
						.where("api_key", "=", apiKey)
						.executeTakeFirst(),
				)
			: null;

		if (!device) {
			return NextResponse.json(
				{ status: 404, error: "Device not found" },
				{ status: 404 },
			);
		}
		const deviceData = device as unknown as Device;
		let screenToDisplay = deviceData.screen;
		const refreshSchedule = normalizeRefreshSchedule(
			deviceData.refresh_schedule,
		);
		let dynamicRefreshRate =
			refreshSchedule?.default_refresh_rate || DISPLAY_FALLBACK_REFRESH_SECONDS;

		if (
			deviceData.display_mode === DeviceDisplayMode.PLAYLIST &&
			deviceData.playlist_id
		) {
			const activeItem = await getActivePlaylistItem(
				deviceData.playlist_id,
				deviceData.current_playlist_index || 0,
				deviceData.timezone || "UTC",
			);
			if (activeItem) {
				screenToDisplay = activeItem.screen_id;
				dynamicRefreshRate = activeItem.duration;
			}
		}

		const selection = await selectDisplayForDevice(
			{
				...deviceData,
				screen: screenToDisplay,
			},
			{
				hostUrl: headers.hostUrl,
				width: headers.width,
				height: headers.height,
			},
		);

		let imageUrl = selection.imageUrl;
		if (
			deviceData.display_mode === DeviceDisplayMode.MIXUP &&
			deviceData.mixup_id
		) {
			const mixupParams = new URLSearchParams(selection.baseQueryParams);
			if (headers.apiKey && !mixupParams.has("access_token")) {
				mixupParams.set("access_token", headers.apiKey);
			}
			imageUrl = buildDeviceImageUrl({
				baseUrl: headers.hostUrl,
				imagePath: `mixup/${deviceData.mixup_id}`,
				profile: selection.profile,
				query: mixupParams.toString(),
			});
		}

		logInfo("Current display request successful", {
			source: "api/display/current",
			metadata: {
				deviceId: deviceData.friendly_id,
				screen: screenToDisplay,
			},
		});
		return NextResponse.json(
			{
				status: 200,
				refresh_rate: dynamicRefreshRate,
				image_url: imageUrl,
				filename: buildDeviceImageFilename(
					screenToDisplay ?? "current",
					"current",
					selection.profile,
				),
				rendered_at: deviceData.last_update_time || new Date().toISOString(),
			},
			{ status: 200 },
		);
	} catch (error) {
		logError(error as Error, {
			source: "api/display/current",
			metadata: { apiKey: apiKeyPrefix },
		});
		return NextResponse.json(
			{ status: 500, error: "Internal server error" },
			{ status: 500 },
		);
	}
}
