import YouProvider from './you_providers/youProvider.mjs';
import PerplexityProvider from './perplexity_providers/perplexityProvider.mjs';
import HappyApiProvider from './happyapi_providers/happyApi.mjs';
import path from 'path';

// 获取配置文件路径
function getConfigPath() {
    return process.platform === 'linux' ? '/app/config/config.mjs' : path.join(process.cwd(), 'config.mjs');
}

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
