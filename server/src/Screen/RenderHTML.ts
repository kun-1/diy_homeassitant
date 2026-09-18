import puppeteer, {Browser, Page} from "puppeteer";
import fs from 'fs/promises';
import {ASSETS_FOLDER, IS_TEST_ENV} from "Config.js";

export const BASE_URL_CHROME = 'http://localhost';

let browser: Browser | undefined;
let page: Page | undefined;
let initInFlight: Promise<Page> | undefined;
let renderQueue: Promise<unknown> = Promise.resolve();

async function closeRenderer() {
    const oldBrowser = browser;
    browser = undefined;
    page = undefined;
    if (oldBrowser) await oldBrowser.close().catch(() => undefined);
}

async function createPage(): Promise<Page> {
    if (!IS_TEST_ENV) console.log('start of Puppeteer init');
    browser = await puppeteer.launch({
        headless: "shell",
        protocolTimeout: 30000,
        timeout: 30000,
        args: ['--no-sandbox', '--disable-web-security', '--disable-gpu'],
    });
    browser.on('disconnected', () => {
        browser = undefined;
        page = undefined;
    });
    const nextPage = await browser.newPage();
    await nextPage.setViewport({width: 800, height: 480});
    await nextPage.setRequestInterception(true);
    nextPage.on('pageerror', error => console.error('Puppeteer error:', error instanceof Error ? error.message : String(error)));
    nextPage.on('requestfailed', request => console.log(`Puppeteer failed: ${request.failure()?.errorText} ${request.url()}`));
    nextPage.on('request', async interceptedRequest => {
        if (interceptedRequest.isInterceptResolutionHandled()) return;
        const url = interceptedRequest.url();
        if (!url.startsWith(BASE_URL_CHROME + '/assets/')) {
            await interceptedRequest.continue();
            return;
        }
        try {
            const filePathPart = url.replace(BASE_URL_CHROME + '/assets/', '/');
            const file = await fs.readFile(ASSETS_FOLDER + filePathPart);
            await interceptedRequest.respond({body: file});
        } catch {
            await interceptedRequest.abort();
        }
    });
    page = nextPage;
    if (!IS_TEST_ENV) console.log('end of Puppeteer init');
    return nextPage;
}

async function ensurePage(): Promise<Page> {
    if (page && !page.isClosed() && browser?.connected) return page;
    if (!initInFlight) {
        initInFlight = closeRenderer().then(createPage).finally(() => {
            initInFlight = undefined;
        });
    }
    return initInFlight;
}

export async function initPuppeteer() {
    await ensurePage();
}

async function renderOnce(html: string): Promise<Buffer> {
    const activePage = await ensurePage();
    await activePage.goto('about:blank', {waitUntil: 'load'});
    await activePage.setContent(html, {waitUntil: 'load', timeout: 30000});
    const image = await activePage.screenshot({type: 'png'});
    return Buffer.from(image);
}

export async function renderToImage(html: string) {
    const task = renderQueue.then(async () => {
        try {
            return await renderOnce(html);
        } catch (error) {
            console.error('Puppeteer render failed; rebuilding renderer once', error);
            await closeRenderer();
            return renderOnce(html);
        }
    });
    renderQueue = task.catch(() => undefined);
    return task;
}
