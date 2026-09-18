import * as path from "node:path";
import {ROUTE_IMAGE} from "./Routes.js";
import * as process from "node:process";

export const SERVER_PORT = Number(process.env['PORT'] ?? 3000);
export const SERVER_HOST = '0.0.0.0';
export const REFRESH_RATE_SECONDS = Number(process.env['REFRESH_RATE_SECONDS'] ?? 900);
export const TIMEZONE = process.env['APP_TIMEZONE'] ?? 'Asia/Shanghai';
export const ALLOW_FIRMWARE_UPDATE = true;
export const BUTTON_2_CLICK_FUNCTION = 'sleep';
export const BYOS_ENABLED = process.env['BYOS_ENABLED'] === 'true' || mayReadEnv('TEST') === 'true';
export const BYOS_PROXY = process.env['BYOS_PROXY'] === 'true' || mayReadEnv('TEST') === 'true';

export const SECRET_KEY = readEnvOrFail('SECRET_KEY');
export const PUBLIC_URL_ORIGIN = readEnvOrFail('PUBLIC_URL_ORIGIN');
export const IS_TEST_ENV = mayReadEnv('TEST') === 'true';
export const SCREEN_URL = PUBLIC_URL_ORIGIN + ROUTE_IMAGE + '?secret_key=' + SECRET_KEY;
export const EPD_SCREEN_URL = PUBLIC_URL_ORIGIN + '/device-image?secret_key=' + SECRET_KEY;
// Default theme after the Qixi visual preview has been accepted.
export const SCREEN_THEME = process.env['SCREEN_THEME'] ?? 'default';
export const ASSETS_FOLDER = path.join(import.meta.dirname, '..', 'assets');
export const TEMPLATE_FOLDER = path.join(import.meta.dirname, '/', 'Template');
export const BYOS_DEVICE_MAC = mayReadEnv('BYOS_DEVICE_MAC');
export const BYOS_DEVICE_ACCESS_TOKEN = mayReadEnv('BYOS_DEVICE_ACCESS_TOKEN');

function mayReadEnv(key: string): string | undefined {
    const value = process.env[key];
    if (value === undefined || value.length < 2) return undefined;
    return value;
}

function readEnvOrFail(key: string): string {
    const value = process.env[key];
    if (value === undefined) throw new Error(`Environment variable "${key}" is not set`);
    return value;
}
