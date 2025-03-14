import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { TokenOptimizer, OptimizationConfig, DEFAULT_CONFIG, TokenOptimizationError, OptimizationStats, CompressionLevel } from './types';
import { McpInputProcessor } from './McpInputProcessor';

const TRANSPORT_ERROR = 1;

// 动态导入Rust模块
// @ts-ignore
const addon = require('../token-optimization-rs/token-optimization-rs.win32-x64-msvc.node');

export class TokenOptimizationServer {
  private server: Server;
  private optimizer: TokenOptimizer;
  private inputProcessor: McpInputProcessor;

  constructor(config: OptimizationConfig = DEFAULT_CONFIG) {
    this.server = new Server(
      {
        name: 'token-optimization-server',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 初始化Rust优化器
    this.optimizer = new addon.TokenOptimizer(
      config.batchSize,
      config.windowSize,
      config.semanticMode ?? true,
    );
    
    // 初始化输入处理器
    this.inputProcessor = new McpInputProcessor(config);
    
    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => {
      console.error('[MCP Error]', error);
      // 对于严重错误，我们应该优雅地关闭服务器
      if (error instanceof McpError && error.code === TRANSPORT_ERROR) {
        this.close().catch(console.error);
      }
    };

    // 处理进程终止信号
    process.on('SIGINT', () => this.close());
    process.on('SIGTERM', () => this.close());
  }

  private async close() {
    try {
      await this.server.close();
      // 释放Rust模块资源
      if (this.optimizer) {
        this.optimizer.dispose();
      }
    } catch (error) {
      console.error('关闭服务器时发生错误:', error);
    } finally {
      process.exit(0);
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
                    name: 'configure_optimization',
                    description: '配置Token优化器',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            compressionLevel: {
                                type: 'string',
                                enum: ['Aggressive', 'Balanced', 'Conservative'],
                                description: '压缩级别（激进/平衡/保守）'
                            },
                            batchSize: {
                                type: 'number',
                                description: '批处理大小',
                                minimum: 1,
                                maximum: 1000
                            },
                            windowSize: {
                                type: 'number',
                                description: '窗口大小(ms)',
                                minimum: 100,
                                maximum: 5000
                            },
                            semanticMode: {
                                type: 'boolean',
                                description: '是否启用语义模式'
                            }
                        }
                    },
        },
        {
          name: 'optimize_batch',
          description: '批量优化多个请求的token使用',
          inputSchema: {
            type: 'object',
            properties: {
              requests: {
                type: 'array',
                items: { type: 'string' },
                description: '需要优化的请求数组',
              },
              config: {
                type: 'object',
                properties: {
                  windowSize: {
                    type: 'number',
                    description: '时间窗口大小(ms)',
                  },
                  batchSize: {
                    type: 'number',
                    description: '批量大小',
                  },
                },
                required: ['windowSize', 'batchSize'],
              },
            },
            required: ['requests'],
          },
        },
        {
          name: 'compress_data',
          description: '压缩数据以减少token使用',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: '需要压缩的内容',
              },
              mode: {
                type: 'string',
                enum: ['semantic', 'lossless'],
                description: '压缩模式',
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'add_abbreviation',
          description: '添加自定义缩写',
          inputSchema: {
            type: 'object',
            properties: {
              full: {
                type: 'string',
                description: '完整词组',
              },
              abbr: {
                type: 'string',
                description: '缩写',
              },
            },
            required: ['full', 'abbr'],
          },
        },
        {
          name: 'add_stop_word',
          description: '添加自定义虚词',
          inputSchema: {
            type: 'object',
            properties: {
              word: {
                type: 'string',
                description: '要添加的虚词',
              },
            },
            required: ['word'],
          },
        },
        {
          name: 'get_performance_stats',
          description: '获取性能统计信息',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = request.params.arguments as Record<string, unknown>;
      
      try {
        switch (request.params.name) {
          case 'configure_optimization': {
            // 接收并应用新配置
            if (args.compressionLevel || args.batchSize || args.windowSize || args.semanticMode !== undefined) {
              const newConfig: Partial<OptimizationConfig> = {};
              
              if (args.compressionLevel) {
                newConfig.compressionLevel = args.compressionLevel as CompressionLevel;
              }
              if (args.batchSize) {
                newConfig.batchSize = args.batchSize as number;
              }
              if (args.windowSize) {
                newConfig.windowSize = args.windowSize as number;
              }
              if (args.semanticMode !== undefined) {
                newConfig.semanticMode = args.semanticMode as boolean;
              }

              // 更新配置
              this.inputProcessor.updateConfig(newConfig);
              
              // 返回更新后的配置状态
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      status: 'success',
                      config: this.inputProcessor.getConfig()
                    }, null, 2),
                  },
                ],
              };
            }

            // 如果没有参数，返回配置界面
            return {
              content: [
                {
                  type: 'html',
                  text: this.inputProcessor.generateConfigUI(),
                },
              ],
            };
          }

          case 'optimize_batch': {
            const requests = args.requests as string[];
            const result = await this.optimizer.optimizeBatch(requests);
            
            // 发送统计信息到配置界面
            if (this.inputProcessor) {
              this.inputProcessor.updateConfig({
                ...this.inputProcessor.getConfig(),
                stats: result.stats,
              });
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'compress_data': {
            const content = args.content as string;
            const stats = this.optimizer.optimizeText(content);
            
            // 更新统计信息
            if (this.inputProcessor) {
              this.inputProcessor.updateConfig({
                ...this.inputProcessor.getConfig(),
                stats,
              });
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(stats, null, 2),
                },
              ],
            };
          }

          case 'add_abbreviation': {
            const full = args.full as string;
            const abbr = args.abbr as string;
            this.optimizer.addAbbreviation(full, abbr);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }, null, 2),
                },
              ],
            };
          }

          case 'add_stop_word': {
            const word = args.word as string;
            this.optimizer.addStopWord(word);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true }, null, 2),
                },
              ],
            };
          }

          case 'get_performance_stats': {
            const stats = this.optimizer.getPerformanceStats();
            return {
              content: [
                {
                  type: 'text',
                  text: stats,
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof TokenOptimizationError) {
          throw new McpError(ErrorCode.InvalidRequest, error.message);
        }
        throw error;
      }
    });
  }

  async run() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Token Optimization MCP server running on stdio');
    } catch (error) {
      console.error('启动服务器失败:', error);
      await this.close();
    }
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const server = new TokenOptimizationServer();
  server.run().catch(console.error);
}
