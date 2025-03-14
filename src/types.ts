export interface OptimizationStats {
  original_count: number;
  optimized_count: number;
  savings_percent: number;
  cache_hits: number;
  incremental_updates: number;
}

export interface BatchResult {
  batch_id: string;
  optimized_requests: string[];
  stats: OptimizationStats;
}

export enum CompressionLevel {
  Aggressive = 'Aggressive',
  Balanced = 'Balanced',
  Conservative = 'Conservative'
}

export interface OptimizationConfig {
  windowSize: number;
  batchSize: number;
  semanticMode?: boolean;
  compressionLevel?: CompressionLevel;
  stats?: OptimizationStats;
}

export interface TokenOptimizer {
  optimizeText(text: string): OptimizationStats;
  optimizeBatch(requests: string[]): Promise<BatchResult>;
  addAbbreviation(full: string, abbr: string): void;
  addStopWord(word: string): void;
  getCacheStats(): string;
  clearCache(): void;
  getPerformanceStats(): string;
  dispose(): void;
}

export const DEFAULT_CONFIG: OptimizationConfig = {
  windowSize: 1000,
  batchSize: 10,
  semanticMode: true,
  compressionLevel: CompressionLevel.Balanced
};

export class TokenOptimizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenOptimizationError';
  }
}
