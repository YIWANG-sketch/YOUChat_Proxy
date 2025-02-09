import assert from 'assert';
import {
    generateUUID,
    extractCookie,
    getSessionCookie,
    isValidResponse,
    sanitizeInput
} from '../you_providers/utils/helpers.mjs';

describe('Helpers', () => {
    describe('generateUUID', () => {
        it('should generate valid UUID', () => {
            const uuid = generateUUID();
            assert(uuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
        });
    });

    describe('extractCookie', () => {
        it('should handle string input', () => {
            const cookie = 'name=value';
            assert.strictEqual(extractCookie(cookie), cookie);
        });

        it('should handle array of cookie objects', () => {
            const cookies = [
                { name: 'cookie1', value: 'value1' },
                { name: 'cookie2', value: 'value2' }
            ];
            assert.strictEqual(extractCookie(cookies), 'cookie1=value1; cookie2=value2');
        });

        it('should handle null input', () => {
            assert.strictEqual(extractCookie(null), '');
        });
    });

    describe('getSessionCookie', () => {
        it('should extract session cookie', () => {
            const cookies = 'sessionKey=abc123; other=value';
            assert.strictEqual(getSessionCookie(cookies), 'abc123');
        });

        it('should return null when no session cookie', () => {
            const cookies = 'other=value';
            assert.strictEqual(getSessionCookie(cookies), null);
        });
    });

    describe('isValidResponse', () => {
        it('should validate correct response', () => {
            const response = { status: 200, data: 'content' };
            assert(isValidResponse(response));
        });

        it('should invalidate incorrect response', () => {
            assert(!isValidResponse({ status: 404 }));
            assert(!isValidResponse(null));
        });
    });

    describe('sanitizeInput', () => {
        it('should remove HTML tags', () => {
            const input = '<script>alert("test")</script>';
            const expected = 'scriptalert("test")/script';
            assert.strictEqual(sanitizeInput(input), expected);
        });

        it('should handle non-string input', () => {
            assert.strictEqual(sanitizeInput(null), '');
            assert.strictEqual(sanitizeInput(undefined), '');
            assert.strictEqual(sanitizeInput(123), '');
        });
    });
});
