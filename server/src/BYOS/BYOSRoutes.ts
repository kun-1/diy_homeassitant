import {Router, Request, Response, NextFunction} from 'express';
import {IncomingHttpHeaders} from 'http';
import {displayRoute} from "./Display.js";
import {setupRoute} from "./Setup.js";
import {logRoute} from "./Log.js";
import {BYOS_DEVICE_ACCESS_TOKEN, BYOS_DEVICE_MAC, BYOS_ENABLED} from "Config.js";
import {ROUTE_BYOS_DISPLAY, ROUTE_BYOS_LOG, ROUTE_BYOS_SETUP} from "Routes.js";
import {pressButton} from "Love/Store.js";

export const BYOSRoutes = Router();

BYOSRoutes.use((req: Request, res: Response, next: NextFunction) => {
    const macId = getMacId(req);
    if (!BYOS_ENABLED) {
        console.error(`[BYOS] [${macId}] device is trying to connect, but BYOS is disabled`);
        res.status(401).json('BYOS is disabled');
        return;
    }
    if (BYOS_DEVICE_MAC === undefined) {
        console.error(`[BYOS] [${macId}] BYOS_DEVICE_MAC is not set in config`);
        res.status(401).json('BYOS is not fully set up');
        return;
    }
    if (macId !== BYOS_DEVICE_MAC) {
        console.error(`[BYOS] [${macId}] device is tried to connect with other MAC, that allowed - rejected`);
        res.status(401).json('This MAC is not allowed');
        return;
    }
    next();
});

BYOSRoutes.get(ROUTE_BYOS_SETUP.slice(4), async (req: Request, res: Response) => {
    res.json(await setupRoute(getMacId(req)));
});

BYOSRoutes.get(ROUTE_BYOS_DISPLAY.slice(4), async (req: Request, res: Response) => {
    res.json(await displayRoute(getMacId(req), req.headers));
});

BYOSRoutes.post(ROUTE_BYOS_LOG.slice(4), async (req, res) => {
    const macId = getMacId(req);
    const accessToken = readAccessToken(req.headers);
    await logRoute(macId, accessToken, req.body);
    res.status(204).send();
});

// Ready for the future physical button. The message body is returned only
// after the authenticated device press, never as part of display polling.
BYOSRoutes.post('/button', (req: Request, res: Response) => {
    const accessToken = readAccessToken(req.headers);
    if (BYOS_DEVICE_ACCESS_TOKEN === undefined || accessToken !== BYOS_DEVICE_ACCESS_TOKEN) {
        res.status(401).json({error: 'invalid access token'});
        return;
    }
    const result = pressButton();
    if (!result) {
        res.status(409).json({error: '没有待打印的信件'});
        return;
    }
    res.status(202).json({status: 'print_requested', messageId: result.message.id, print: result.message, job: result.job});
});

function getMacId(req: Request): string {
    if (typeof req.headers['id'] !== 'string') throw new Error('Missing id header');
    return req.headers['id'];
}

function readAccessToken(headers: IncomingHttpHeaders): string {
    if (typeof headers['access-token'] !== 'string') throw new Error('Missing access-token header');
    return headers['access-token'];
}
