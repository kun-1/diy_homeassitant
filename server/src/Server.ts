import express, {NextFunction, Request, Response} from "express";
import {
    SECRET_KEY,
    SERVER_HOST,
    SERVER_PORT,
    BYOS_ENABLED,
    REFRESH_RATE_SECONDS,
    SCREEN_URL, IS_TEST_ENV, ASSETS_FOLDER
} from "Config.js";
import {buildEpdScreen, buildScreen, checkImageUrl, getScreenHash} from "Screen/Screen.js";
import {BYOSRoutes} from "BYOS/BYOSRoutes.js";
import {ROUTE_ADMIN, ROUTE_ADMIN_API, ROUTE_IMAGE, ROUTE_PLUGIN_REDIRECT} from "Routes.js";
import {initPuppeteer} from "./Screen/RenderHTML.js";
import {renderAdminPage} from "Admin/AdminPage.js";
import {adminRoutes} from "Admin/AdminRoutes.js";
import {inboxRoutes} from "Love/InboxRoutes.js";

export const app = express();
app.use(express.json());
app.use('/assets', express.static(ASSETS_FOLDER));

app.use(ROUTE_ADMIN_API, adminRoutes);
app.use('/api/inbox', inboxRoutes);

if (BYOS_ENABLED) {
    app.use('/api', BYOSRoutes);
}

app.get('/', (_, res: Response) => {
    res.redirect(ROUTE_ADMIN);
})

app.get(ROUTE_ADMIN, (_, res: Response) => {
    res.type('html').send(renderAdminPage());
});
app.get(`${ROUTE_ADMIN}/screen`, async (_req: Request, res: Response) => {
    res.type('bmp').send(await buildScreen());
});
app.get('/device-image', async (req: Request, res: Response) => {
    if (!isSecretKeyValid(req, res)) return;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(await buildEpdScreen());
});

function isSecretKeyValid(req: Request, res: Response) {
    if (req.query['secret_key'] !== SECRET_KEY) {
        res.setHeader('Content-Type', 'application/json');
        res.status(401).json('Wrong or missing secret_key');
        return false;
    }
    return true;
}

app.get(ROUTE_PLUGIN_REDIRECT, async (req: Request, res: Response) => {
    if (!isSecretKeyValid(req, res)) {
        return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.json({
        filename: 'custom-screen-' + await getScreenHash(),
        url: SCREEN_URL,
        refresh_rate: REFRESH_RATE_SECONDS,
    });
});

app.get(ROUTE_IMAGE, async (req: Request, res: Response) => {
    if (!isSecretKeyValid(req, res)) {
        return;
    }
    const image1bit = await buildScreen();
    res.setHeader('Content-Type', 'image/bmp');
    res.send(image1bit);
})

app.use((req: Request, res: Response) => {
    console.log(`[404] ${req.method} ${req.url}`);
    res.status(404).json({error: 'Not Found', message: 'The requested path could not be found: ' + req.url});
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({error: 'Internal Server Error', message: 'Something went wrong!'});
});

if (!IS_TEST_ENV) {
    app.listen(SERVER_PORT, SERVER_HOST, async (error) => {
        if (error) {
            throw error;
        } else {
            await initPuppeteer();
            console.log(`Server started on port ${SERVER_PORT}; admin is available at /admin`);
            checkImageUrl(SCREEN_URL);
        }
    })
}
