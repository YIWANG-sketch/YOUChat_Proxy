import YouProvider from './you_providers/youProvider.mjs';
import PerplexityProvider from './perplexity_providers/perplexityProvider.mjs';
import HappyApiProvider from './happyapi_providers/happyApi.mjs';
import path from 'path';
import fs from 'fs';

// 获取配置文件路径
function getConfigPath() {
    return process.platform === 'linux' ? '/app/config/config.mjs' : path.join(process.cwd(), 'config.mjs');
}

// 确保配置文件存在
function ensureConfigFile() {
    const configPath = getConfigPath();
    const defaultConfigPath = path.join(process.cwd(), 'config.mjs');

    // 只在 Linux 系统下进行特殊处理
    if (process.platform === 'linux') {
        try {
            // 创建配置目录
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            // 如果配置文件不存在，从当前目录复制
            if (!fs.existsSync(configPath) && fs.existsSync(defaultConfigPath)) {
                fs.copyFileSync(defaultConfigPath, configPath);
            }
            // 确保配置文件存在
            if (!fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, 'export const config = {};');
            }
            fs.chmodSync(configPath, 0o777);
            console.log('Successfully set up config.mjs in config directory (Linux)');
        } catch (err) {
            console.log(err);
        }
    }
}

// 确保配置文件存在
ensureConfigFile();

// 导入配置
const configModule = await import(getConfigPath());
const config = configModule.config;

class ProviderManager {
    constructor() {
        // 根据环境变量初始化提供者
        const activeProvider = process.env.ACTIVE_PROVIDER || 'you';

        switch (activeProvider) {
            case 'you':
                this.provider = new YouProvider(config);
                break;
            case 'perplexity':
                this.provider = new PerplexityProvider(config);
                break;
            case 'happyapi':
                this.provider = new HappyApiProvider();
                break;
            default:
                throw new Error('Invalid ACTIVE_PROVIDER. Use "you", "perplexity", or "happyapi".');
        }

        console.log(`Initialized with ${activeProvider} provider.`);
    }

    async init() {
        await this.provider.init(this.provider.config);
        console.log(`Provider initialized.`);
    }

    async getCompletion(params) {
        return this.provider.getCompletion(params);
    }

    getCurrentProvider() {
        return this.provider.constructor.name;
    }

    getLogger() {
        return this.provider.logger;
    }

    getSessionManager() {
        return this.provider.sessionManager;
    }
}

export default ProviderManager;
