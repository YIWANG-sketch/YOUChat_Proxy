import assert from 'assert';
import ChatService from '../you_providers/services/chatService.mjs';
import BrowserManager from '../you_providers/core/browserManager.mjs';

describe('ChatService', () => {
    let chatService;
    let browserManager;

    beforeEach(() => {
        browserManager = new BrowserManager();
        chatService = new ChatService(browserManager);
    });

    afterEach(async () => {
        // Clean up any active chats
        for (const [sessionId] of chatService.activeChats) {
            await chatService.endChat(sessionId);
        }
        await browserManager.closeAllBrowsers();
    });

    describe('Chat Session Management', () => {
        it('should initialize chat session', async () => {
            const sessionId = 'test-session';
            const cookie = 'test=cookie';
            
            // Mock browser page to avoid real network requests
            browserManager.createBrowserInstance = async () => {
                return {
                    newPage: async () => ({
                        setCookie: async () => {},
                        goto: async () => {},
                        close: async () => {}
                    }),
                    close: async () => {}
                };
            };

            const result = await chatService.initChat(sessionId, cookie);
            assert.strictEqual(result, true);
        });

        it('should handle chat session cleanup', async () => {
            const sessionId = 'test-session';
            await chatService.endChat(sessionId);
            assert(!chatService.activeChats.has(sessionId), 'Chat session should be removed');
        });
    });

    describe('Message Handling', () => {
        it('should throw error when sending message to uninitialized chat', async () => {
            const sessionId = 'nonexistent-session';
            try {
                await chatService.sendMessage(sessionId, 'test message');
                assert.fail('Should throw error');
            } catch (error) {
                assert(error.message === 'Chat session not initialized');
            }
        });
    });

    describe('Cookie Parsing', () => {
        it('should parse cookie string correctly', () => {
            const cookieString = 'name1=value1; name2=value2';
            const result = chatService._parseCookies(cookieString);
            
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
});
