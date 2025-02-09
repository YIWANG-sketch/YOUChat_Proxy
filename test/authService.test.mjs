import assert from 'assert';
import AuthService from '../you_providers/services/authService.mjs';
import BrowserManager from '../you_providers/core/browserManager.mjs';

describe('AuthService', () => {
    let authService;
    let browserManager;

    beforeEach(() => {
        browserManager = new BrowserManager();
        authService = new AuthService(browserManager);
    });

    afterEach(async () => {
        await browserManager.closeAllBrowsers();
    });

    describe('_parseCookies', () => {
        it('should parse cookie string correctly', () => {
            const cookieString = 'name1=value1; name2=value2';
            const result = authService._parseCookies(cookieString);
            
            assert(Array.isArray(result));
            assert.strictEqual(result.length, 2);
            assert.deepStrictEqual(result[0], {
                name: 'name1',
                value: 'value1',
                domain: '.you.com',
                path: '/'
            });
        });
    });

    describe('validateSession', () => {
        it('should handle invalid cookie', async () => {
            // Mock browser page to avoid real network requests
            browserManager.createBrowserInstance = async () => {
                return {
                    newPage: async () => ({
                        setCookie: async () => {},
                        goto: async () => {},
                        content: async () => '{"authenticated":false}',
                        close: async () => {}
                    }),
                    close: async () => {}
                };
            };

            const result = await authService.validateSession('test-session', 'invalid=cookie');
            assert.strictEqual(result, false);
        });
    });

    describe('refreshSession', () => {
        it('should handle refresh failure gracefully', async () => {
            // Mock browser page to avoid real network requests
            browserManager.createBrowserInstance = async () => {
                return {
                    newPage: async () => ({
                        setCookie: async () => {},
                        goto: async () => {},
                        cookies: async () => [],
                        close: async () => {}
                    }),
                    close: async () => {}
                };
            };

            const result = await authService.refreshSession('test-session', 'invalid=cookie');
            assert.strictEqual(result, null);
        });
    });
});
