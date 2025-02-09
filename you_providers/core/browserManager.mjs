import puppeteer from 'puppeteer-core';
import Logger from '../utils/logger.mjs';

class BrowserManager {
    constructor() {
        this.browsers = new Map();
        this.logger = new Logger();
    }

    async createBrowserInstance() {
        try {
            const browser = await puppeteer.launch({
                headless: 'new',
                executablePath: '/usr/bin/google-chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080'
                ]
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
