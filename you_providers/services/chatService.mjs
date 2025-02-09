import Logger from '../utils/logger.mjs';
import { sleep, isValidResponse } from '../utils/helpers.mjs';
import { EventEmitter } from 'events';
import { DEFAULT_TIMEOUT } from '../core/constants.mjs';

class ChatService extends EventEmitter {
    constructor(browserManager) {
        super();
        this.browserManager = browserManager;
        this.logger = new Logger();
        this.activeChats = new Map();
    }

    async initChat(sessionId, cookie) {
        try {
            const browser = await this.browserManager.getBrowser(sessionId);
            const page = await browser.newPage();
            
            await page.setCookie(...this._parseCookies(cookie));
            await page.goto('https://you.com/chat', {
                waitUntil: 'networkidle0',
                timeout: DEFAULT_TIMEOUT
            });

            this.activeChats.set(sessionId, page);
            return true;
        } catch (error) {
            this.logger.error('Chat initialization failed:', error);
            return false;
        }
    }

    async sendMessage(sessionId, message, options = {}) {
        const page = this.activeChats.get(sessionId);
        if (!page) {
            throw new Error('Chat session not initialized');
        }

        try {
            // 发送消息
            await page.type('.chat-input', message);
            await page.keyboard.press('Enter');

            // 等待响应
            await this._waitForResponse(page);

            // 获取最新的回复
            const response = await this._getLatestResponse(page);
            return response;
        } catch (error) {
            this.logger.error('Failed to send message:', error);
            throw error;
        }
    }

    async _waitForResponse(page) {
        try {
            await page.waitForFunction(
                () => !document.querySelector('.typing-indicator'),
                { timeout: DEFAULT_TIMEOUT }
            );
        } catch (error) {
            throw new Error('Response timeout');
        }
    }

    async _getLatestResponse(page) {
        const response = await page.evaluate(() => {
            const messages = document.querySelectorAll('.message-bubble.ai');
            if (messages.length === 0) return null;
            return messages[messages.length - 1].textContent;
        });
        return response;
    }

    async endChat(sessionId) {
        const page = this.activeChats.get(sessionId);
        if (page) {
            await page.close();
            this.activeChats.delete(sessionId);
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
}

export default ChatService;
