import Logger from '../utils/logger.mjs';
import { extractCookie, getSessionCookie } from '../utils/helpers.mjs';

class AuthService {
    constructor(browserManager) {
        this.browserManager = browserManager;
        this.logger = new Logger();
    }

    async validateSession(sessionId, cookie) {
        try {
            const browser = await this.browserManager.getBrowser(sessionId);
            const page = await browser.newPage();
            
            await page.setCookie(...this._parseCookies(cookie));
            await page.goto('https://you.com/api/auth/user', {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            const response = await page.content();
            const isValid = response.includes('"authenticated":true');

            await page.close();
            return isValid;
        } catch (error) {
            this.logger.error('Session validation failed:', error);
            return false;
        }
    }

    _parseCookies(cookieString) {
        const cookies = cookieString.split(';').map(cookie => {
            const [name, value] = cookie.trim().split('=');
            return {
                name,
                value,
                domain: '.you.com',
                path: '/'
            };
        });
        return cookies;
    }

    async refreshSession(sessionId, cookie) {
        try {
            const browser = await this.browserManager.getBrowser(sessionId);
            const page = await browser.newPage();
            
            await page.setCookie(...this._parseCookies(cookie));
            await page.goto('https://you.com/chat', {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            const newCookie = await page.cookies();
            await page.close();
            
            return newCookie && newCookie.length > 0 ? extractCookie(newCookie) : null;
        } catch (error) {
            this.logger.error('Session refresh failed:', error);
            return null;
        }
    }
}

export default AuthService;
