import {EventEmitter} from "events";
import puppeteer from 'puppeteer-core';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {v4 as uuidV4} from "uuid";
import path from "path";
import {fileURLToPath} from "url";
import {createDirectoryIfNotExists, sleep} from "../utils.mjs";
import '../proxyAgent.mjs';
import NetworkMonitor from "../networkMonitor.mjs";
import {detectBrowser} from "../utils/browserDetector.mjs";

// 添加stealth插件
puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class HappyApiProvider {
    constructor(config) {
        this.config = config;
        this.sessions = {};
        this.preferredBrowser = 'auto';
        this.networkMonitor = new NetworkMonitor();
    }

    async _launchBrowser() {
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
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            });
            return browser;
        } catch (error) {
            console.error('Failed to launch browser:', error);
            throw error;
        }
    }

    async init() {
        console.log(`本项目依赖 Chrome 或 Edge 浏览器，请勿关闭弹出的浏览器窗口。如果出现错误请检查是否已安装 Chrome 或 Edge 浏览器。`);

        const browserPath = detectBrowser(this.preferredBrowser);

        this.sessions = {};

        // 手动登录
        const currentUsername = 'manual_login';
        createDirectoryIfNotExists(path.join(__dirname, "browser_profiles", currentUsername));

        try {
            const browser = await this._launchBrowser();
            const page = await browser.newPage();

            console.log(`请在打开的浏览器窗口中手动登录 happyapi.org`);
            await page.goto("https://happyapi.org", {waitUntil: 'networkidle0'});
            await sleep(3000); // 等待页面加载完毕

            const sessionCookie = await this.waitForManualLogin(page);
            if (sessionCookie) {
                this.sessions[currentUsername] = {browser, page, sessionCookie, valid: true};
                console.log(`成功获取会话 cookie`);
            } else {
                console.error(`未能检测到登录状态，请确保已成功登录`);
                await browser.close();
            }

        } catch (error) {
            console.error(`初始化浏览器失败`);
            console.error(error);
        }

        // 开始网络监控
        await this.networkMonitor.startMonitoring();
    }

    async waitForManualLogin(page) {
        return new Promise((resolve) => {
            const checkLoginStatus = async () => {
                // 检查是否存在特定的登录成功标识元素
                const isLoggedIn = await this.checkLoginStatus(page);
                if (isLoggedIn) {
                    console.log(`检测到登录成功`);
                    const cookies = await page.cookies();
                    const sessionCookie = this.extractSessionCookie(cookies);
                    resolve(sessionCookie);
                } else {
                    setTimeout(checkLoginStatus, 1000);
                }
            };

            page.on('request', (request) => {
                if (request.url() === 'https://happyapi.org/api/v1/auths/signin' && request.method() === 'POST') {
                    console.log('检测到登录请求');
                    checkLoginStatus();
                }
            });

            checkLoginStatus();
        });
    }

    extractSessionCookie(cookies) {
        const cfClearance = cookies.find(c => c.name === 'cf_clearance')?.value;
        const token = cookies.find(c => c.name === 'token')?.value;

        if (cfClearance && token) {
            return [
                {
                    name: 'cf_clearance',
                    value: cfClearance,
                    domain: 'happyapi.org',
                    path: '/',
                    httpOnly: true,
                    secure: true,
                    sameSite: 'Lax',
                },
                {
                    name: 'token',
                    value: token,
                    domain: 'happyapi.org',
                    path: '/',
                    httpOnly: true,
                    secure: true,
                    sameSite: 'Lax',
                }
            ];
        } else {
            console.error('无法提取有效的会话 cookie');
            return null;
        }
    }

    async checkLoginStatus(page) {
        try {
            const userNameElement = await page.waitForSelector('div.self-center.font-medium', {timeout: 5000});
            const userName = await page.evaluate(element => element.textContent, userNameElement);
            return true;
        } catch {
            return false;
        }
    }

    async getCompletion({username, messages, stream = false, proxyModel}) {
        const session = this.sessions[username];
        if (!session || !session.valid) {
            throw new Error(`用户 ${username} 的会话无效`);
        }
        //刷新页面
        await session.page.goto("https://happyapi.org", {waitUntil: 'domcontentloaded'});

        const {page} = session;
        const emitter = new EventEmitter();

        try {

            let userQuery = messages.map(msg => msg.content).join("\n\n");

            const inputSelector = 'textarea#chat-textarea';
            const sendButtonSelector = 'button#send-message-button';

            // 输入消息
            await page.waitForSelector(inputSelector, {visible: true});

            await page.evaluate((selector, message) => {
                const textarea = document.querySelector(selector);
                textarea.value = message;

                // 手动触发事件
                textarea.dispatchEvent(new Event('input', {bubbles: true}));
                textarea.dispatchEvent(new Event('change', {bubbles: true}));
            }, inputSelector, userQuery.trim());

            await page.waitForTimeout(100);

            // 点击发送按钮
            await page.waitForSelector(sendButtonSelector, {visible: true});
            await page.click(sendButtonSelector);

            // 监听请求
            const targetUrl = 'https://happyapi.org/api/chat/completions';

            const traceId = uuidV4();
            let finalResponse = ""; // 存储最终响应
            let responseStarted = false; // 是否开始接收
            let isEnding = false; // 是否正在结束

            // 清理函数
            const cleanup = async () => {
                clearTimeout(responseTimeout);
                page.removeListener('response', responseHandler);
            };

            const responseTimeout = setTimeout(() => {
                if (!isEnding) {
                    isEnding = true;
                    emitter.emit('error', new Error('请求超时'));
                    cleanup();
                }
            }, 60000);

            const responseHandler = async (response) => {
                if (response.url() === targetUrl) {
                    try {
                        const buffer = await response.buffer();
                        const text = buffer.toString('utf8');

                        // 处理流式数据
                        const lines = text.split('\n\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.substring(6).trim();
                                if (data === '[DONE]') {
                                    if (!isEnding) {
                                        isEnding = true;
                                        console.log("请求结束");
                                        emitter.emit('end');
                                        cleanup();
                                    }
                                    return;
                                }
                                if (data.length === 0) {
                                    continue;
                                }
                                const parsedData = JSON.parse(data);
                                const contentDelta = parsedData.choices[0].delta.content || '';

                                if (stream) {
                                    emitter.emit('completion', traceId, contentDelta);
                                } else {
                                    finalResponse += contentDelta;
                                }
                            }
                        }
                    } catch (e) {
                        if (!isEnding) {
                            isEnding = true;
                            console.error("请求发生错误", e);
                            emitter.emit('error', e);
                            cleanup();
                        }
                    }
                }
            };

            // 监听response
            page.on('response', responseHandler);

            // 清除计时器和监听器
            emitter.on('end', () => {
                cleanup();
            });
            emitter.on('error', () => {
                cleanup();
            });

            return {
                completion: emitter,
                cancel: () => {
                }
            };
        } catch (error) {
            emitter.emit('error', error);
            return {
                completion: emitter,
                cancel: () => { }
            };
        }
    }
}

export default HappyApiProvider;
