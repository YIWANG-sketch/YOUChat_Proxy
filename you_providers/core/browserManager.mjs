import puppeteer from 'puppeteer-core';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Logger from '../utils/logger.mjs';

// 添加stealth插件
puppeteerExtra.use(StealthPlugin());

class BrowserManager {
    constructor() {
        this.browsers = new Map();
        this.logger = new Logger();
    }

    async createBrowserInstance() {
        try {
            const browser = await puppeteerExtra.launch({
                headless: 'new',
                executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--use-gl=swiftshader',
                    '--no-zygote',
                    '--single-process',
                    '--disable-setuid-sandbox'
                ],
                ignoreDefaultArgs: ['--disable-extensions'],
                env: {
                    ...process.env,
                    DISPLAY: ':99'
                }
            });
            return browser;
        } catch (error) {
            this.logger.error('Failed to create browser instance:', error);
            throw error;
        }
    }

    async getBrowser(sessionId) {
        if (!this.browsers.has(sessionId)) {
            const browser = await this.createBrowserInstance();
            this.browsers.set(sessionId, browser);
        }
        return this.browsers.get(sessionId);
    }

    async closeBrowser(sessionId) {
        const browser = this.browsers.get(sessionId);
        if (browser) {
            await browser.close();
            this.browsers.delete(sessionId);
        }
    }

    async closeAllBrowsers() {
        for (const [sessionId, browser] of this.browsers) {
            await this.closeBrowser(sessionId);
        }
    }
}

export default BrowserManager;
