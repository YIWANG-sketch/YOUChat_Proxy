import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import { Mutex } from 'async-mutex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
    constructor() {
        this.logMutex = new Mutex();
        if (process.env.NODE_ENV === 'test') {
            this.logFilePath = path.join(process.cwd(), 'requests.log');
        } else {
            this.logFilePath = path.join(__dirname, 'requests.log');
        }
        this.statistics = {};
        this.monthStart = this.getMonthStart();
        this.today = this.getToday();
        this.loadStatistics();
    }

    getMonthStart() {
        const now = new Date();
        // 每月第一天
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        return monthStart;
    }

    getToday() {
        const now = new Date();
        // 获取当天日期
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        today.setHours(0, 0, 0, 0);
        return today;
    }

    // 加载日志
    loadStatistics() {
        this.logMutex.runExclusive(() => {
            if (!fs.existsSync(this.logFilePath)) {
                fs.writeFileSync(this.logFilePath, '', 'utf8');
                return;
            }
            const data = fs.readFileSync(this.logFilePath, 'utf-8');
            const entries = data.split('\n').filter(line => line.trim());
            const validEntries = [];

            for (const line of entries) {
                try {
                    const logEntry = JSON.parse(line);

                    // 补全缺少的字段
                    if (!logEntry.provider) {
                        logEntry.provider = 'you';
                    }
                    if (!logEntry.email) {
                        logEntry.email = 'unknown';
                    }
                    if (!logEntry.mode) {
                        logEntry.mode = 'default';
                    }
                    if (logEntry.model === undefined) {
                        logEntry.model = 'unknown';
                    }
                    if (logEntry.completed === undefined) {
                        logEntry.completed = false;
                    }
                    if (logEntry.unusualQueryVolume === undefined) {
                        logEntry.unusualQueryVolume = false;
                    }

                    // 调整字段顺序
                    const logEntryArray = [
                        ['provider', logEntry.provider],
                        ['email', logEntry.email],
                        ['time', logEntry.time],
                        ['mode', logEntry.mode],
                        ['model', logEntry.model],
                        ['completed', logEntry.completed],
                        ['unusualQueryVolume', logEntry.unusualQueryVolume],
                    ];
                    const formattedLogEntry = Object.fromEntries(logEntryArray);

                    validEntries.push(formattedLogEntry);
                } catch (e) {
                    console.warn(`无法解析的日志，已忽略: ${line}`);
                }
            }

            // 处理有效日志
            for (const logEntry of validEntries) {
                const logDate = new Date(logEntry.time);
                const provider = logEntry.provider;
                const email = logEntry.email;

                // 初始化 provider
                if (!this.statistics[provider]) {
                    this.statistics[provider] = {};
                }

                // 初始化邮箱
                if (!this.statistics[provider][email]) {
                    this.statistics[provider][email] = {
                        allRequests: [],     // 所有请求
                        monthlyRequests: [], // 本月请求
                        dailyRequests: [],   // 当日请求
                        monthlyStats: {
                            totalRequests: 0,
                            defaultModeCount: 0,
                            customModeCount: 0,
                            modelCount: {},
                        },
                        dailyStats: {
                            totalRequests: 0,
                            defaultModeCount: 0,
                            customModeCount: 0,
                            modelCount: {},
                        }
                    };
                }

                const stats = this.statistics[provider][email];
                stats.allRequests.push(logEntry);

                // 本月统计
                if (logDate >= this.monthStart) {
                    stats.monthlyRequests.push(logEntry);
                    this.updateStatistics(stats.monthlyStats, logEntry);
                }

                // 当日统计
                if (logDate >= this.today) {
                    stats.dailyRequests.push(logEntry);
                    this.updateStatistics(stats.dailyStats, logEntry);
                }
            }

            // 对每个 provider 的每个邮箱时间排序
            for (const provider in this.statistics) {
                for (const email in this.statistics[provider]) {
                    const stats = this.statistics[provider][email];
                    stats.allRequests.sort((a, b) => new Date(b.time) - new Date(a.time));
                    stats.monthlyRequests.sort((a, b) => new Date(b.time) - new Date(a.time));
                    stats.dailyRequests.sort((a, b) => new Date(b.time) - new Date(a.time));
                }
            }

            // 清理无效数据
            const cleanedData = validEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            fs.writeFileSync(this.logFilePath, cleanedData);
        }).catch(err => {
            console.error('loadStatistics() 加锁异常:', err);
        });
    }

    // 更新统计
    updateStatistics(stats, logEntry) {
        stats.totalRequests++;
        if (logEntry.mode === 'default') {
            stats.defaultModeCount++;
        } else if (logEntry.mode === 'custom') {
            stats.customModeCount++;
        }

        if (logEntry.model) {
            if (!stats.modelCount[logEntry.model]) {
                stats.modelCount[logEntry.model] = 0;
            }
            stats.modelCount[logEntry.model]++;
        }
    }

    // 记录请求日志
    logRequest({provider, email, time, mode, model, completed, unusualQueryVolume}) {
        const logEntryArray = [
            ['provider', provider || process.env.ACTIVE_PROVIDER || 'you'],
            ['email', email || 'unknown'],
            ['time', time],
            ['mode', mode || 'unknown'],
            ['model', model || 'unknown'],
            ['completed', completed || 'unknown'],
            ['unusualQueryVolume', unusualQueryVolume || 'unknown'],
        ];
        const logEntry = Object.fromEntries(logEntryArray);

        // 写日志与更新 statistics
        this.logMutex.runExclusive(() => {
            fs.appendFileSync(this.logFilePath, JSON.stringify(logEntry) + '\n');

            const logDate = new Date(logEntry.time);
            const providerName = logEntry.provider;
            if (!this.statistics[providerName]) {
                this.statistics[providerName] = {};
            }

            const userEmail = logEntry.email;
            if (!this.statistics[providerName][userEmail]) {
                this.statistics[providerName][userEmail] = {
                    allRequests: [],
                    monthlyRequests: [],
                    dailyRequests: [],
                    monthlyStats: {
                        totalRequests: 0,
                        defaultModeCount: 0,
                        customModeCount: 0,
                        modelCount: {},
                    },
                    dailyStats: {
                        totalRequests: 0,
                        defaultModeCount: 0,
                        customModeCount: 0,
                        modelCount: {},
                    }
                };
            }

            const stats = this.statistics[providerName][userEmail];
            stats.allRequests.push(logEntry);

            // 当日统计
            if (logDate >= this.today) {
                stats.dailyRequests.push(logEntry);
                this.updateStatistics(stats.dailyStats, logEntry);
            }

            // 本月统计
            if (logDate >= this.monthStart) {
                stats.monthlyRequests.push(logEntry);
                this.updateStatistics(stats.monthlyStats, logEntry);
            }
        }).catch(err => {
            console.error('logRequest() 加锁异常:', err);
        });
    }

    // 输出当前统计信息
    printStatistics() {
        const provider = process.env.ACTIVE_PROVIDER || 'you';
        const monthStartStr = this.monthStart.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const todayStr = this.today.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        if (!this.statistics[provider]) {
            console.log(`===== 提供者 ${provider} 没有统计数据 =====`);
            return;
        }
        console.log(`===== 请求统计信息 (${provider}) =====`);
        const emails = Object.keys(this.statistics[provider]).sort();
        for (const email of emails) {
            const stats = this.statistics[provider][email];
            console.log(`用户邮箱: ${email}`);
            console.log(`---------- 本月[${monthStartStr}]统计 ----------`);
            console.log(`总请求次数: ${stats.monthlyStats.totalRequests}`);
            console.log(`default 请求次数: ${stats.monthlyStats.defaultModeCount}`);
            console.log(`custom 请求次数: ${stats.monthlyStats.customModeCount}`);
            console.log('各模型请求次数:');
            for (const [mdl, count] of Object.entries(stats.monthlyStats.modelCount)) {
                console.log(`  - ${mdl}: ${count}`);
            }
            console.log(`---------- 今日[${todayStr}]统计 ----------`);
            console.log(`总请求次数: ${stats.dailyStats.totalRequests}`);
            console.log(`default 请求次数: ${stats.dailyStats.defaultModeCount}`);
            console.log(`custom 请求次数: ${stats.dailyStats.customModeCount}`);
            console.log('各模型请求次数:');
            for (const [mdl, count] of Object.entries(stats.dailyStats.modelCount)) {
                console.log(`  - ${mdl}: ${count}`);
            }
            console.log('------------------------------');
        }
        console.log('================================');
    }
}

export default Logger;
