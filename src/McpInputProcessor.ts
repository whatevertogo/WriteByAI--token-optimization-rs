import { CompressionLevel, OptimizationConfig } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class McpInputProcessor {
  private config: OptimizationConfig;
  private themeColors: {[key: string]: string};
  private settingsPath: string;

  constructor(config: OptimizationConfig) {
    this.config = config;
    this.settingsPath = path.join(process.env.APPDATA || '', 'Code - Insiders/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json');
    
    // 从MCP设置文件加载主题颜色
    this.themeColors = {
      'Aggressive': 'rgb(234, 67, 53)',
      'Balanced': 'rgb(66, 133, 244)',
      'Conservative': 'rgb(52, 168, 83)'
    };
    
    this.loadThemeColors();
    this.applyStoredSettings();
  }

  private loadThemeColors(): void {
    try {
      const mcpSettings = this.readSettings();
      const uiTheme = mcpSettings?.mcpServers?.['token-optimization']?.config?.optimization?.ui?.theme;
      if (uiTheme) {
        this.themeColors = {
          'Aggressive': uiTheme.aggressive || this.themeColors.Aggressive,
          'Balanced': uiTheme.balanced || this.themeColors.Balanced,
          'Conservative': uiTheme.conservative || this.themeColors.Conservative
        };
      }
    } catch (error) {
      console.warn('无法加载MCP主题设置，使用默认主题');
    }
  }

  private applyStoredSettings(): void {
    const stored = this.loadSettings();
    if (Object.keys(stored).length > 0) {
      this.updateConfig(stored);
    }
  }

  private readSettings(): any {
    try {
      const content = fs.readFileSync(this.settingsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn('无法读取MCP设置文件');
      return null;
    }
  }

  private writeSettings(settings: any): void {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
      console.error('无法写入MCP设置文件:', error);
    }
  }

  loadSettings(): Partial<OptimizationConfig> {
    try {
      const mcpSettings = this.readSettings();
      const optimizationConfig = mcpSettings?.mcpServers?.['token-optimization']?.config?.optimization;
      if (optimizationConfig) {
        return {
          compressionLevel: optimizationConfig.compressionLevel,
          batchSize: optimizationConfig.batchSize,
          windowSize: optimizationConfig.windowSize,
          semanticMode: optimizationConfig.semanticMode
        };
      }
    } catch (error) {
      console.warn('无法加载MCP设置，使用默认配置');
    }
    return {};
  }

  saveSettings(config: Partial<OptimizationConfig>): void {
    try {
      const mcpSettings = this.readSettings();
      if (!mcpSettings) return;

      if (!mcpSettings.mcpServers['token-optimization'].config) {
        mcpSettings.mcpServers['token-optimization'].config = {};
      }

      mcpSettings.mcpServers['token-optimization'].config.optimization = {
        ...mcpSettings.mcpServers['token-optimization'].config.optimization,
        ...config,
        ui: {
          showStats: true,
          theme: this.themeColors
        }
      };

      this.writeSettings(mcpSettings);
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }

  generateConfigUI(): string {
    return `
    <div style="padding: 20px; font-family: Arial, sans-serif;">
      <h3 style="color: #333;">Token 优化配置</h3>
      
      <div style="margin: 20px 0;">
        <label style="display: block; margin-bottom: 10px;">压缩级别：</label>
        <div style="display: flex; gap: 10px;">
          ${this.createCompressionButton(CompressionLevel.Aggressive, '激进模式', 'rgb(234, 67, 53)')}
          ${this.createCompressionButton(CompressionLevel.Balanced, '平衡模式', 'rgb(66, 133, 244)')}
          ${this.createCompressionButton(CompressionLevel.Conservative, '保守模式', 'rgb(52, 168, 83)')}
        </div>
      </div>

      <div style="margin: 20px 0;">
        <label style="display: block; margin-bottom: 10px;">配置选项：</label>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
          <div style="margin-bottom: 10px;">
            <label>批处理大小：</label>
            <input type="number" 
                   id="batchSize" 
                   value="${this.config.batchSize}"
                   min="1" 
                   max="1000"
                   style="width: 100px; padding: 5px;"
            />
          </div>
          <div style="margin-bottom: 10px;">
            <label>窗口大小(ms)：</label>
            <input type="number" 
                   id="windowSize" 
                   value="${this.config.windowSize}"
                   min="100" 
                   max="5000"
                   step="100"
                   style="width: 100px; padding: 5px;"
            />
          </div>
          <div>
            <label>
              <input type="checkbox" 
                     id="semanticMode" 
                     ${this.config.semanticMode ? 'checked' : ''}
              />
              启用语义模式
            </label>
          </div>
        </div>
      </div>

      <div id="compressionStats" style="margin: 20px 0; padding: 15px; background: #f0f7ff; border-radius: 5px;">
        <h4 style="margin: 0 0 10px 0;">压缩统计</h4>
        <div id="statsContent">等待压缩...</div>
      </div>

      <button onclick="saveSettings()" style="
        padding: 10px 20px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        margin-top: 15px;
      ">
        保存设置
      </button>
    </div>

    <script>
    function updateCompressionLevel(level) {
      // 移除所有按钮的active样式
      document.querySelectorAll('.compression-btn').forEach(btn => {
        btn.style.opacity = '0.7';
      });
      
      // 添加当前按钮的active样式
      const activeBtn = document.getElementById(\`btn-\${level}\`);
      if (activeBtn) {
        activeBtn.style.opacity = '1';
      }

      // 发送配置更新到服务器
      window.postMessage({
        type: 'updateConfig',
        config: getConfigValues()
      }, '*');
    }

    function getConfigValues() {
      return {
        compressionLevel: document.querySelector('.compression-btn[style*="opacity: 1"]').dataset.level,
        batchSize: parseInt(document.getElementById('batchSize').value),
        windowSize: parseInt(document.getElementById('windowSize').value),
        semanticMode: document.getElementById('semanticMode').checked
      };
    }

    function saveSettings() {
      window.postMessage({
        type: 'saveSettings',
        config: getConfigValues()
      }, '*');

      // 显示保存成功提示
      const notification = document.createElement('div');
      notification.textContent = '设置已保存';
      notification.style.cssText = \`
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 20px;
        background-color: #4CAF50;
        color: white;
        border-radius: 5px;
        animation: fadeOut 3s forwards;
      \`;
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    }

    // 监听配置变化
    document.getElementById('batchSize').addEventListener('change', () => {
      updateCompressionLevel(document.querySelector('.compression-btn[style*="opacity: 1"]').dataset.level);
    });

    document.getElementById('windowSize').addEventListener('change', () => {
      updateCompressionLevel(document.querySelector('.compression-btn[style*="opacity: 1"]').dataset.level);
    });

    document.getElementById('semanticMode').addEventListener('change', () => {
      updateCompressionLevel(document.querySelector('.compression-btn[style*="opacity: 1"]').dataset.level);
    });

    // 初始化默认压缩级别
    updateCompressionLevel('${this.config.compressionLevel || CompressionLevel.Balanced}');

    // 更新统计信息
    function updateStats(stats) {
      const statsDiv = document.getElementById('statsContent');
      statsDiv.innerHTML = \`
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>原始大小：\${stats.original_count}</div>
          <div>压缩大小：\${stats.optimized_count}</div>
          <div>压缩率：\${stats.savings_percent.toFixed(2)}%</div>
          <div>缓存命中：\${stats.cache_hits}</div>
          <div>增量更新：\${stats.incremental_updates}</div>
        </div>
      \`;
    }

    // 监听统计更新和保存设置消息
    window.addEventListener('message', (event) => {
      if (event.data.type === 'updateStats') {
        updateStats(event.data.stats);
      }
    });

    // 添加淡出动画
    const style = document.createElement('style');
    style.textContent = \`
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    \`;
    document.head.appendChild(style);
    </script>
    `;
  }

  private createCompressionButton(level: CompressionLevel, label: string, defaultColor: string): string {
    const color = this.themeColors[level] || defaultColor;
    return `
    <button
      id="btn-${level}"
      class="compression-btn"
      data-level="${level}"
      onclick="updateCompressionLevel('${level}')"
      style="
        padding: 10px 20px;
        border: none;
        border-radius: 5px;
        background-color: ${color};
        color: white;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
      "
    >
      ${label}
    </button>
    `;
  }

  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
    if (!config.stats) {  // 如果不是统计信息更新，则保存设置
      this.saveSettings(this.config);
    }
  }

  getConfig(): OptimizationConfig {
    return this.config;
  }
}
