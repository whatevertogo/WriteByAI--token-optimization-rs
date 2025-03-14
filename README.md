# Token Optimization MCP Server

一个用于优化token使用的MCP服务器实现，支持多种压缩策略和实时配置。

## 功能特点

- 多种压缩级别：
  - Aggressive（激进）：最大化压缩率
  - Balanced（平衡）：平衡压缩率和信息保留
  - Conservative（保守）：保证信息完整性
- 智能缓存系统
- 增量更新支持
- 实时性能统计
- CLION中可视化配置

## 安装

1. 克隆仓库：
```bash
git clone https://github.com/yourusername/token-optimization-mcp.git
cd token-optimization-mcp
```

2. 安装依赖：
```bash
npm install
```

3. 构建项目：
```bash
npm run build
```

## 配置

有两种方式配置服务器：

1. 使用配置界面：
```json
{
    "name": "configure_optimization"
}
```

2. 直接设置参数：
```json
{
    "name": "configure_optimization",
    "arguments": {
        "compressionLevel": "Balanced",
        "batchSize": 100,
        "windowSize": 1000,
        "semanticMode": true
    }
}
```

## 可用工具

- `configure_optimization`: 配置优化器
- `optimize_batch`: 批量优化请求
- `compress_data`: 压缩单条数据
- `add_abbreviation`: 添加自定义缩写
- `add_stop_word`: 添加自定义虚词
- `get_performance_stats`: 获取性能统计

## 在Cline中使用

1. 在Cline的MCP设置中添加：
```json
{
  "mcpServers": {
    "token-optimization": {
      "command": "node",
      "args": ["path/to/dist/index.js"],
      "disabled": false,
      "autoApprove": [
        "optimize_batch",
        "compress_data",
        "configure_optimization",
        "get_performance_stats",
        "add_abbreviation",
        "add_stop_word"
      ]
    }
  }
}
```

2. 重启Cline即可使用

## 开发

- 本项目使用TypeScript和Rust开发
- Rust部分需要安装Rust工具链
- 使用`npm run dev`启动开发模式

## 许可证

MIT License

## 贡献

欢迎提交Pull Request或Issue！
