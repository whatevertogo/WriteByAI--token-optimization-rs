"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenOptimizationServer = void 0;
var index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
var types_js_1 = require("@modelcontextprotocol/sdk/types.js");
var types_1 = require("./types");
var TRANSPORT_ERROR = 1;
// 动态导入Rust模块
// @ts-ignore
var addon = require('../token-optimization-rs/token-optimization-rs.win32-x64-msvc.node');
var TokenOptimizationServer = /** @class */ (function () {
    function TokenOptimizationServer(config) {
        if (config === void 0) { config = types_1.DEFAULT_CONFIG; }
        var _this = this;
        var _a;
        this.server = new index_js_1.Server({
            name: 'token-optimization-server',
            version: '0.2.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        // 初始化Rust优化器
        this.optimizer = new addon.TokenOptimizer(config.batchSize, config.windowSize, (_a = config.semanticMode) !== null && _a !== void 0 ? _a : true);
        this.setupToolHandlers();
        this.server.onerror = function (error) {
            console.error('[MCP Error]', error);
            // 对于严重错误，我们应该优雅地关闭服务器
            if (error instanceof types_js_1.McpError && error.code === TRANSPORT_ERROR) {
                _this.close().catch(console.error);
            }
        };
        // 处理进程终止信号
        process.on('SIGINT', function () { return _this.close(); });
        process.on('SIGTERM', function () { return _this.close(); });
    }
    TokenOptimizationServer.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, 3, 4]);
                        return [4 /*yield*/, this.server.close()];
                    case 1:
                        _a.sent();
                        // 释放Rust模块资源
                        if (this.optimizer) {
                            this.optimizer.dispose();
                        }
                        return [3 /*break*/, 4];
                    case 2:
                        error_1 = _a.sent();
                        console.error('关闭服务器时发生错误:', error_1);
                        return [3 /*break*/, 4];
                    case 3:
                        process.exit(0);
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    TokenOptimizationServer.prototype.setupToolHandlers = function () {
        var _this = this;
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, ({
                        tools: [
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
                        ],
                    })];
            });
        }); });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, function (request) { return __awaiter(_this, void 0, void 0, function () {
            var args, requests, result, content, optimized, full, abbr, word;
            return __generator(this, function (_a) {
                args = request.params.arguments;
                switch (request.params.name) {
                    case 'optimize_batch': {
                        requests = args.requests;
                        result = this.optimizer.optimizeBatch(requests);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2),
                                    },
                                ],
                            }];
                    }
                    case 'compress_data': {
                        content = args.content;
                        optimized = this.optimizer.optimizeText(content);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify({
                                            compressed: optimized,
                                            stats: {
                                                original_count: content.length,
                                                optimized_count: optimized.length,
                                                savings_percent: ((content.length - optimized.length) / content.length) * 100,
                                            },
                                        }, null, 2),
                                    },
                                ],
                            }];
                    }
                    case 'add_abbreviation': {
                        full = args.full;
                        abbr = args.abbr;
                        this.optimizer.addAbbreviation(full, abbr);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify({ success: true }, null, 2),
                                    },
                                ],
                            }];
                    }
                    case 'add_stop_word': {
                        word = args.word;
                        this.optimizer.addStopWord(word);
                        return [2 /*return*/, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify({ success: true }, null, 2),
                                    },
                                ],
                            }];
                    }
                    default:
                        throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, "Unknown tool: ".concat(request.params.name));
                }
                return [2 /*return*/];
            });
        }); });
    };
    TokenOptimizationServer.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var transport, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 4]);
                        transport = new stdio_js_1.StdioServerTransport();
                        return [4 /*yield*/, this.server.connect(transport)];
                    case 1:
                        _a.sent();
                        console.error('Token Optimization MCP server running on stdio');
                        return [3 /*break*/, 4];
                    case 2:
                        error_2 = _a.sent();
                        console.error('启动服务器失败:', error_2);
                        return [4 /*yield*/, this.close()];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return TokenOptimizationServer;
}());
exports.TokenOptimizationServer = TokenOptimizationServer;
// 如果直接运行此文件
if (require.main === module) {
    var server = new TokenOptimizationServer();
    server.run().catch(console.error);
}
console.log('addon:', addon);
