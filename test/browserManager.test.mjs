import assert from 'assert';
import BrowserManager from '../you_providers/core/browserManager.mjs';

describe('BrowserManager', () => {
    let browserManager;

    beforeEach(() => {
        browserManager = new BrowserManager();
        // Mock createBrowserInstance to avoid launching real browser
        browserManager.createBrowserInstance = async () => ({
            newPage: async () => ({
                close: async () => {}
            }),
            close: async () => {}
        });
    });

    afterEach(async () => {
        await browserManager.closeAllBrowsers();
    });

    it('should create a new browser instance', async () => {
        const browser = await browserManager.createBrowserInstance();
        assert(browser, 'Browser instance should be created');
        assert(typeof browser.close === 'function', 'Browser instance should have close method');
        await browser.close();
    });

    it('should get the same browser instance for the same session', async () => {
        const sessionId = 'test-session';
        const browser1 = await browserManager.getBrowser(sessionId);
        const browser2 = await browserManager.getBrowser(sessionId);
        assert.strictEqual(browser1, browser2, 'Should return the same browser instance');
    });

    it('should close browser instance', async () => {
        const sessionId = 'test-session';
        await browserManager.getBrowser(sessionId);
        await browserManager.closeBrowser(sessionId);
        assert(!browserManager.browsers.has(sessionId), 'Browser should be removed from map');
    });
});
