import { TokenOptimizationServer } from './index';

async function main() {
    try {
        const server = new TokenOptimizationServer();
        await server.run();
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

main().catch(console.error);
