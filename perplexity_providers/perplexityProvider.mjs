import { EventEmitter } from "events";
import puppeteer from 'puppeteer-core';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { v4 as uuidV4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import { createDirectoryIfNotExists, sleep, extractPerplexityCookie, getPerplexitySessionCookie } from "../utils.mjs";
import '../proxyAgent.mjs';
import { detectBrowser } from '../utils/browserDetector.mjs';
import NetworkMonitor from '../networkMonitor.mjs';
import io from 'socket.io-client';

// 添加stealth插件
puppeteerExtra.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerplexityProvider {
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

    async init(config) {
        console.log(`本项目依赖Chrome或Edge浏览器，请勿关闭弹出的浏览器窗口。如果出现错误请检查是否已安装Chrome或Edge浏览器。`);
        
        const browserPath = detectBrowser(this.preferredBrowser); // 检测Chrome和Edge浏览器
        
        this.sessions = {};
        const timeout = 120000;

        if (process.env.USE_MANUAL_LOGIN === "true") {
            this.sessions['manual_login'] = {
                configIndex: 0,
                valid: false,
            };
            console.log("当前使用手动登录模式，跳过配置文件中的 cookie 验证");
        } else {
            // 使用配置文件中的 cookie
            for (let index = 0; index < config.sessions.length; index++) {
                const session = config.sessions[index];
                const extractedCookie = extractPerplexityCookie(session.cookie);

                if (extractedCookie.sessionToken) {
                    const uniqueId = `user_${index}`;
                    this.sessions[uniqueId] = {
                        configIndex: index,
                        ...extractedCookie,
                        valid: false,
                    };
                    console.log(`已添加 #${index} ${uniqueId} (Perplexity cookie)`);
                } else {
                    console.error(`第${index}个cookie无效，请重新获取。`);
                    console.error(`未检测到有效的__Secure-next-auth.session-token字段。`);
                }
            }
            console.log(`已添加 ${Object.keys(this.sessions).length} 个 cookie，开始验证有效性`);
        }

        for (const originalUsername of Object.keys(this.sessions)) {
            let currentUsername = originalUsername;
            let session = this.sessions[currentUsername];
            createDirectoryIfNotExists(path.join(__dirname, "browser_profiles", currentUsername));

            try {
                const browser = await this._launchBrowser();
                const page = await browser.newPage();
                if (process.env.USE_MANUAL_LOGIN === "true") {
                    console.log(`正在为 session #${session.configIndex} 进行手动登录...`);
                    await page.goto("https://www.perplexity.ai", {timeout: timeout});
                    await sleep(3000);
                    console.log(`请在打开的浏览器窗口中手动登录 Perplexity.ai (session #${session.configIndex})`);
                    const { sessionCookie, accountStatus } = await this.waitForManualLogin(page);
                    if (sessionCookie) {
                        const email = accountStatus.username || 'unknown_user';
                        this.sessions[email] = {
                            ...session,
                            cookies: sessionCookie,
                            isPro: accountStatus.isPro,
                        };
                        delete this.sessions[currentUsername];
                        currentUsername = email;
                        session = this.sessions[currentUsername];


                        console.log(`成功获取 ${email} 登录的 cookie${accountStatus.isPro ? '（Pro 账号）' : ''}`);
                    } else {
                        console.error(`未能获取到 session #${session.configIndex} 有效登录的 cookie`);
                        await browser.close();
                        continue;
                    }
                } else {
                    // 使用已有的 cookie
                    const perplexityCookies = getPerplexitySessionCookie(session);
                    await page.setCookie(...perplexityCookies);
                    await page.goto("https://www.perplexity.ai", {timeout: timeout});
                    await sleep(5000);
                }

                // 如果遇到 Cloudflare 挑战就多等一段时间
                const pageContent = await page.content();
                if (pageContent.indexOf("challenges.cloudflare.com") > -1) {
                    console.log(`请在30秒内完成人机验证 (${currentUsername})`);
                    await page.evaluate(() => {
                        alert("请在30秒内完成人机验证");
                    });
                    await sleep(30000);
                }
                try {
                    const isValid = await this.validateSession(page);
                    if (isValid) {
                        session.valid = true;
                        session.browser = browser;
                        session.page = page;
                    } else {
                        console.warn(`警告: ${currentUsername} 验证失败。请检查cookie是否有效。`);
                        await this.clearPerplexityCookies(page);
                        await browser.close();
                    }
                } catch (e) {
                    console.warn(`警告: ${currentUsername} 验证失败。请检查cookie是否有效。`);
                    console.error(e);
                    await this.clearPerplexityCookies(page);
                    await browser.close();
                }

            } catch (e) {
                console.error(`初始化浏览器失败 (${currentUsername})`);
                console.error(e);
            }
        }

        console.log(`验证完毕，有效cookie数量 ${Object.keys(this.sessions).filter((username) => this.sessions[username].valid).length}`);
        // 开始网络监控
        await this.networkMonitor.startMonitoring();
    }

    async clearPerplexityCookies(page) {
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        const cookies = await page.cookies('https://www.perplexity.ai');
        for (const cookie of cookies) {
            await page.deleteCookie(cookie);
        }
        console.log('已自动清理 cookie');
    }

    async checkAccountStatus(page) {
        if (process.env.USE_MANUAL_LOGIN !== "true" && process.env.INCOGNITO_MODE === "true") {
            try {
                await page.waitForSelector('div[class*="inline-flex w-full cursor-pointer select-none items-center justify-start gap-sm rounded-full"]', { timeout: 2000 });

                // 检查无痕模式图标
                const isIncognito = await page.evaluate(() => {
                    const incognitoElement = document.querySelector('div[class*="inline-flex w-full cursor-pointer select-none items-center justify-start gap-sm rounded-full"]');
                    return incognitoElement && incognitoElement.innerHTML.includes('viewBox="0 0 24 24"');
                });

                if (isIncognito) {
                    return { isPro: false, username: 'Incognito User', isIncognito: true };
                } else {
                    return { isPro: false, username: null, isIncognito: false };
                }
            } catch (error) {
                return { isPro: false, username: null, isIncognito: false };
            }
        } else {
            try {
                await page.waitForSelector('div[class*="relative flex items-center gap-x-xs"]', { timeout: 2000 });

                const isPro = await page.evaluate(() => {
                    const svgElement = document.querySelector('div[class*="relative flex aspect-square"] svg');
                    return svgElement && svgElement.innerHTML.includes('fill-super dark:fill-superDark');
                });

                const username = await page.evaluate(() => {
                    const usernameElement = document.querySelector('div[class*="relative flex items-center gap-x-xs"] div');
                    return usernameElement ? usernameElement.textContent.trim() : null;
                });

                return { isPro, username, isIncognito: false };
            } catch (error) {
                return { isPro: false, username: null, isIncognito: false };
            }
        }
    }


    async waitForManualLogin(page) {
        return new Promise(async (resolve) => {
            let isResolved = false;

            const checkLoginCompletion = async () => {
                if (isResolved) return;

                try {
                    const accountStatus = await this.checkAccountStatus(page);
                    if (accountStatus.username) {
                        console.log(`登录成功: ${accountStatus.username}`);
                        const cookies = await page.cookies();
                        const sessionCookie = this.extractPerplexitySessionCookie(cookies);
                        isResolved = true;
                        resolve({ sessionCookie, accountStatus });
                    }
                } catch (error) {
                    // 如果检查失败，继续等待
                }
            };

            // 监听 DOM 变化
            await page.evaluate(() => {
                const observer = new MutationObserver((mutations) => {
                    for (let mutation of mutations) {
                        if (mutation.type === 'childList' || mutation.type === 'subtree') {
                            window.dispatchEvent(new CustomEvent('domChanged'));
                            break;
                        }
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
            });

            // 监听 DOM 变化
            await page.exposeFunction('notifyDomChanged', checkLoginCompletion);
            await page.evaluate(() => {
                window.addEventListener('domChanged', window.notifyDomChanged);
            });

            // 监听导航完成
            page.on('load', checkLoginCompletion);

            setTimeout(() => {
                if (!isResolved) {
                    console.log('登录等待超时');
                    resolve({ sessionCookie: null, accountStatus: null });
                }
            }, 300000);

            // 初始检查
            await checkLoginCompletion();
        });
    }

    async validateSession(page) {
        const accountStatus = await this.checkAccountStatus(page);
        if (accountStatus.username || accountStatus.isIncognito) {
            if (accountStatus.isIncognito) {
                console.log('无痕模式验证成功');
            } else {
                console.log(`账号 ${accountStatus.username} 登录有效${accountStatus.isPro ? '（Pro 账号）' : ''}`);
            }
            return true;
        } else {
            console.log('账号验证失败');
            return false;
        }
    }

    extractPerplexitySessionCookie(cookies) {
        let sessionCookie = [];

        const sessionToken = cookies.find(c => c.name === '__Secure-next-auth.session-token');
        if (sessionToken) {
            sessionCookie.push(sessionToken);
        }

        if (sessionCookie.length === 0) {
            console.error('无法提取有效的会话 cookie');
            return null;
        }

        return sessionCookie;
    }

    async getCompletion({ username, messages, stream = false, proxyModel }) {
        if (this.networkMonitor.isNetworkBlocked()) {
            throw new Error("网络异常，请稍后再试");
        }
        const session = this.sessions[username];
        if (!session || !session.valid) {
            throw new Error(`用户 ${username} 的会话无效`);
        }

        const { page } = session;
        const emitter = new EventEmitter();

        // 转换纯文本
        let previousMessages = messages.map(msg => msg.content).join("\n\n");

        // 生成必要的参数
        const messagePayload = {
            version: "2.13",
            source: "default",
            language: "en-GB",
            timezone: "Europe/London",
            search_focus: "writing",
            frontend_uuid: uuidV4(),
            mode: "concise",
            is_related_query: false,
            is_default_related_query: false,
            visitor_id: uuidV4(),
            user_nextauth_id: uuidV4(),
            frontend_context_uuid: uuidV4(),
            prompt_source: "user",
            query_source: "home",
        };

        await page.addScriptTag({ url: 'https://cdn.socket.io/4.4.1/socket.io.min.js' });

        const ioExists = await page.evaluate(() => typeof io !== 'undefined');
        if (!ioExists) {
            throw new Error("socket.io 客户端脚本加载失败");
        }

        // 移除之前 console
        page.removeAllListeners('console');

        page.on('console', msg => {
            const text = msg.text();
            console.log(text);
        });

        // 唯一的回调函数名
        const callbackName = `nodeCallback_${uuidV4()}`;

        // 在浏览器上下文中建立 WebSocket 连接并发送消息
        await page.exposeFunction(callbackName, (event, data) => {
            if (event === "completion") {
                const { id, text } = data;
                emitter.emit("completion", id, text);
            } else if (event === "end") {
                emitter.emit("end");
            } else if (event === "error") {
                console.error("Error from page.evaluate:", data);
                emitter.emit("error", data);
            }
        });

        await page.evaluate(
            (previousMessages, messagePayload, callbackName, stream) => {
                try {
                    if (typeof io === 'undefined') {
                        window[callbackName]("error", "Socket.io 客户端未定义，请检查脚本是否正确加载。");
                        return;
                    }

                    if (window.socket) {
                        // 如果已有 socket 连接
                        window.socket.disconnect();
                        window.socket = null;
                    }

                    // 累积接收到的 chunk（用于非流）
                    let accumulatedChunks = '';

                    const socket = io("wss://www.perplexity.ai/", {
                        path: "/socket.io",
                        transports: ["websocket"],
                    });

                    window.socket = socket;

                    // 定义监听器函数
                    function onQueryProgress(data) {
                        try {
                            if (data.text) {
                                const textData = JSON.parse(data.text);
                                const chunk = textData.chunks[textData.chunks.length - 1];
                                if (chunk) {
                                    if (stream) {
                                        // 实时发送 chunk
                                        console.log(chunk); // 直接输出 chunk 内容
                                        window[callbackName]("completion", { id: messagePayload.frontend_uuid, text: chunk });
                                    } else {
                                        // 累积 chunk
                                        accumulatedChunks += chunk;
                                    }
                                }
                            }
                            // 检查是否为最后一条消息
                            if (data.final) {
                                if (!stream) {
                                    // 非流发送完整的响应
                                    console.log(accumulatedChunks);
                                    window[callbackName]("completion", { id: messagePayload.frontend_uuid, text: accumulatedChunks });
                                }
                                console.log("请求结束");
                                window[callbackName]("end");

                                // 清理资源
                                socket.off("query_progress", onQueryProgress);
                                socket.disconnect();
                                window.socket = null;
                                delete window[callbackName];
                            }
                        } catch (err) {
                            console.error("Error processing query_progress data:", err);
                            window[callbackName]("error", err.toString());
                        }
                    }

                    // 添加监听器
                    socket.on("query_progress", onQueryProgress);

                    socket.on("connect", () => {
                        // 使用回调处理确认响应
                        socket.emit("perplexity_ask", previousMessages, messagePayload, (response) => {
                        });
                    });
                    socket.on("error", (error) => {
                        console.error("Socket error:", error);
                        window[callbackName]("error", error.toString());
                    });

                    socket.on("connect_error", (error) => {
                        console.error("Socket connect_error:", error);
                        window[callbackName]("error", error.toString());
                    });

                    socket.on("connect_timeout", (timeout) => {
                        console.error("Socket connect_timeout:", timeout);
                        window[callbackName]("error", "Connection timed out");
                    });
                } catch (err) {
                    console.error("Error in page.evaluate:", err);
                    window[callbackName]("error", err.toString());
                }
            },
            previousMessages,
            messagePayload,
            callbackName,
            stream
        );

        const cancel = () => {
            page.evaluate((callbackName) => {
                if (window.socket) {
                    window.socket.disconnect();
                    window.socket = null;
                }
                if (window[callbackName]) {
                    delete window[callbackName];
                }
            }, callbackName).catch(console.error);
        };

        // 触发 'start'
        emitter.emit("start", messagePayload.frontend_uuid);

        return { completion: emitter, cancel };
    }
}

export default PerplexityProvider;
