import {
    ALLOW_FIRMWARE_UPDATE,
    BUTTON_2_CLICK_FUNCTION,
    BYOS_DEVICE_ACCESS_TOKEN,
    BYOS_PROXY,
    EPD_SCREEN_URL,
} from "Config.js";
import {proxyDisplay} from "./Proxy.js";
import {checkImageUrl, getEpdScreenHash} from "Screen/Screen.js";
import {updateBattery} from "./Battery.js";
import {IncomingHttpHeaders} from "http";
import {getDisplayRefreshSeconds} from "Love/Store.js";

export type DisplayResponse = {
    status: number,
    image_url: string | null,
    filename: string | null,
    refresh_rate: number,
    reset_firmware: boolean,
    update_firmware: boolean,
    firmware_url: string,
    special_function: string,
}

let displayFromProxy = true;

export async function displayRoute(macId: string, headers: IncomingHttpHeaders): Promise<DisplayResponse> {
    const accessToken = readAccessToken(headers);
    updateBattery(Number(headers['battery-voltage']));
    if (BYOS_PROXY && !displayFromProxy) {
        displayFromProxy = true;
        const proxyResp = await getProxyResult(headers);
        if (proxyResp) return proxyResp;
    }
    displayFromProxy = false;
    if (BYOS_DEVICE_ACCESS_TOKEN === undefined) {
        console.error(`[DISPLAY] [${macId}] BYOS_DEVICE_ACCESS_TOKEN is not set in config`);
        throw new Error('BYOS is not fully enabled');
    }
    if (accessToken !== BYOS_DEVICE_ACCESS_TOKEN) {
        console.error(`[DISPLAY] [${macId}] Wrong access-token value from device: ${accessToken}`);
        throw new Error('Wrong access-token value from device');
    }
    const refreshRate = getDisplayRefreshSeconds();
    const filename = 'custom-screen-' + await getEpdScreenHash();
    console.log(`[DISPLAY] [${macId}] frame=${filename.slice(-12)} refresh_seconds=${refreshRate}`);
    return {
        status: 0,
        filename,
        image_url: EPD_SCREEN_URL,
        refresh_rate: refreshRate,
        reset_firmware: false,
        update_firmware: false,
        firmware_url: '',
        special_function: BUTTON_2_CLICK_FUNCTION,
    };
}

async function getProxyResult(headers: IncomingHttpHeaders): Promise<DisplayResponse | null> {
    const response = await proxyDisplay(headers);
    if (!response) return null;
    if (!ALLOW_FIRMWARE_UPDATE) {
        response.update_firmware = false;
        response.reset_firmware = false;
    }
    response.refresh_rate = getDisplayRefreshSeconds();
    response.special_function = BUTTON_2_CLICK_FUNCTION;
    if (response.image_url) {
        checkImageUrl(response.image_url);
    } else if (!response.update_firmware && !response.reset_firmware) {
        return null;
    }
    return response;
}

function readAccessToken(headers: IncomingHttpHeaders): string {
    if (typeof headers['access-token'] !== 'string') throw new Error('Missing access-token header');
    return headers['access-token'];
}
