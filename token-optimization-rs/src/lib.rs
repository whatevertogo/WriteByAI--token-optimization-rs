use napi_derive::napi;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use rayon::prelude::*;
use rayon::ThreadPoolBuilder;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use lru::LruCache;
use jieba_rs::Jieba;
use bloomfilter::Bloom;
use diff::Patch;

// 状态快照
#[derive(Clone)]
struct StateSnapshot {
    content: String,
    timestamp: SystemTime,
}

// 上下文缓存系统
static CONTEXT_CACHE: Lazy<Arc<RwLock<LruCache<String, String>>>> = Lazy::new(|| {
    Arc::new(RwLock::new(LruCache::new(10000))) // 约1GB/万token的容量
});

// 重复检测过滤器
static DUPLICATE_FILTER: Lazy<Arc<RwLock<Bloom<String>>>> = Lazy::new(|| {
    Arc::new(RwLock::new(Bloom::new(100000, 0.01))) // 10万容量，1%误判率
});

// 全局分词器实例
static JIEBA: Lazy<Jieba> = Lazy::new(Jieba::new);

#[derive(Debug, Serialize, Deserialize)]
#[napi(object)]
pub struct OptimizationConfig {
    pub batch_size: i64,
    pub window_size: i64,
    pub semantic_mode: bool,
    pub compression_level: CompressionLevel,
}

#[derive(Debug, Serialize, Deserialize)]
#[napi(object)]
pub enum CompressionLevel {
    Aggressive,
    Balanced,
    Conservative,
}

#[derive(Debug, Serialize, Deserialize)]
#[napi(object)]
pub struct OptimizationStats {
    pub original_count: i64,
    pub optimized_count: i64,
    pub savings_percent: f64,
    pub cache_hits: i64,
    pub incremental_updates: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[napi(object)]
pub struct BatchResult {
    pub batch_id: String,
    pub optimized_requests: Vec<String>,
    pub stats: OptimizationStats,
}

#[derive(Debug)]
#[napi]
pub struct TokenOptimizer {
    config: OptimizationConfig,
    state_snapshots: VecDeque<StateSnapshot>,
    cache_hits: std::sync::atomic::AtomicUsize,
    cache_misses: std::sync::atomic::AtomicUsize,
    incremental_updates: std::sync::atomic::AtomicUsize,
}

#[napi]
impl TokenOptimizer {
    #[napi(constructor)]
    pub fn new(batch_size: i64, window_size: i64, semantic_mode: bool) -> Self {
        Self {
            config: OptimizationConfig {
                batch_size,
                window_size,
                semantic_mode,
                compression_level: CompressionLevel::Balanced,
            },
            state_snapshots: VecDeque::with_capacity(5),
            cache_hits: std::sync::atomic::AtomicUsize::new(0),
            cache_misses: std::sync::atomic::AtomicUsize::new(0),
            incremental_updates: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    #[napi]
    pub fn optimize_text(&mut self, text: String) -> OptimizationStats {
        // 1. 检查缓存
        if let Some(cached) = CONTEXT_CACHE.read().get(&text) {
            self.cache_hits.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return OptimizationStats {
                original_count: text.len() as i64,
                optimized_count: cached.len() as i64,
                savings_percent: (1.0 - (cached.len() as f64 / text.len() as f64)) * 100.0,
                cache_hits: self.cache_hits.load(std::sync::atomic::Ordering::Relaxed) as i64,
                incremental_updates: self.incremental_updates.load(std::sync::atomic::Ordering::Relaxed) as i64,
            };
        }
        
        self.cache_misses.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        // 2. 检查增量更新
        if let Some(optimized) = self.try_incremental_update(&text) {
            self.incremental_updates.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return OptimizationStats {
                original_count: text.len() as i64,
                optimized_count: optimized.len() as i64,
                savings_percent: (1.0 - (optimized.len() as f64 / text.len() as f64)) * 100.0,
                cache_hits: self.cache_hits.load(std::sync::atomic::Ordering::Relaxed) as i64,
                incremental_updates: self.incremental_updates.load(std::sync::atomic::Ordering::Relaxed) as i64,
            };
        }

        // 3. 执行完整优化
        let optimized = match self.config.compression_level {
            CompressionLevel::Aggressive => self.aggressive_optimize(&text),
            CompressionLevel::Balanced => self.balanced_optimize(&text),
            CompressionLevel::Conservative => self.conservative_optimize(&text),
        };

        // 4. 更新缓存和状态
        CONTEXT_CACHE.write().put(text.clone(), optimized.clone());
        self.update_state_snapshot(text.clone());

        OptimizationStats {
            original_count: text.len() as i64,
            optimized_count: optimized.len() as i64,
            savings_percent: (1.0 - (optimized.len() as f64 / text.len() as f64)) * 100.0,
            cache_hits: self.cache_hits.load(std::sync::atomic::Ordering::Relaxed) as i64,
            incremental_updates: self.incremental_updates.load(std::sync::atomic::Ordering::Relaxed) as i64,
        }
    }

    #[napi]
    pub fn optimize_batch(&self, requests: Vec<String>) -> Result<BatchResult, napi::Error> {
        if requests.is_empty() {
            return Err(napi::Error::from_reason("Empty request batch"));
        }
        if requests.len() > 1000 {
            return Err(napi::Error::from_reason("Batch size exceeds limit (1000)"));
        }

        let chunk_size = std::cmp::max(1, requests.len() / num_cpus::get());
        let optimized_requests: Vec<String> = requests
            .par_chunks(chunk_size)
            .flat_map(|chunk| {
                chunk.par_iter().map(|req| {
                    if let Some(cached) = CONTEXT_CACHE.read().get(req) {
                        cached.clone()
                    } else {
                        let optimized = match self.config.compression_level {
                            CompressionLevel::Aggressive => self.aggressive_optimize(req),
                            CompressionLevel::Balanced => self.balanced_optimize(req),
                            CompressionLevel::Conservative => self.conservative_optimize(req),
                        };
                        CONTEXT_CACHE.write().put(req.clone(), optimized.clone());
                        optimized
                    }
                })
            })
            .collect();

        let original_count: i64 = requests.iter().map(|s| s.len() as i64).sum();
        let optimized_count: i64 = optimized_requests.iter().map(|s| s.len() as i64).sum();
        let savings_percent = (1.0 - (optimized_count as f64 / original_count as f64)) * 100.0;

        Ok(BatchResult {
            batch_id: format!("{}", SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map_err(|e| napi::Error::from_reason(format!("Time error: {}", e)))?
                .as_millis()),
            optimized_requests,
            stats: OptimizationStats {
                original_count,
                optimized_count,
                savings_percent,
                cache_hits: self.cache_hits.load(std::sync::atomic::Ordering::Relaxed) as i64,
                incremental_updates: self.incremental_updates.load(std::sync::atomic::Ordering::Relaxed) as i64,
            },
        })
    }

    // 内部方法
    fn try_incremental_update(&self, text: &str) -> Option<String> {
        for snapshot in self.state_snapshots.iter().rev() {
            if snapshot.timestamp.elapsed().unwrap() <= Duration::from_millis(200) {
                if let Some(patches) = diff::diff(&snapshot.content, text) {
                    if patches.len() < text.len() / 4 { // 如果差异小于25%
                        return Some(self.apply_patches(&snapshot.content, patches));
                    }
                }
            }
        }
        None
    }

    fn apply_patches(&self, base: &str, patches: Vec<Patch>) -> String {
        let mut result = base.to_string();
        for patch in patches {
            // 简化的patch应用逻辑
            match patch {
                Patch::Add(pos, text) => {
                    result.insert_str(pos, &text);
                }
                Patch::Remove(pos, len) => {
                    result.replace_range(pos..pos+len, "");
                }
            }
        }
        result
    }

    fn update_state_snapshot(&mut self, content: String) {
        if self.state_snapshots.len() >= 5 {
            self.state_snapshots.pop_front();
        }
        self.state_snapshots.push_back(StateSnapshot {
            content,
            timestamp: SystemTime::now(),
        });
    }

    fn aggressive_optimize(&self, text: &str) -> String {
        let words: Vec<&str> = JIEBA.cut_for_search(text, true);
        let filtered: Vec<String> = words
            .into_iter()
            .filter(|&word| !self.is_stop_word(word))
            .map(|word| self.get_abbreviation(word).unwrap_or(word.to_string()))
            .collect();
        
        let mut result = filtered.join("");
        // 压缩重复
        let repeated = Regex::new(r"(.{2,})\1+").unwrap();
        result = repeated.replace_all(&result, "$1").to_string();
        result
    }

    fn balanced_optimize(&self, text: &str) -> String {
        let words: Vec<&str> = JIEBA.cut_for_search(text, true);
        let processed: Vec<String> = words
            .into_iter()
            .map(|word| {
                if self.is_key_term(word) {
                    word.to_string()
                } else {
                    self.get_abbreviation(word).unwrap_or(word.to_string())
                }
            })
            .collect();
        processed.join("")
    }

    fn conservative_optimize(&self, text: &str) -> String {
        let words: Vec<&str> = JIEBA.cut_for_search(text, true);
        let processed: Vec<String> = words
            .into_iter()
            .map(|word| self.get_abbreviation(word).unwrap_or(word.to_string()))
            .collect();
        processed.join("")
    }

    fn is_stop_word(&self, word: &str) -> bool {
        static STOP_WORDS: Lazy<RwLock<Vec<String>>> = Lazy::new(|| {
            RwLock::new(vec![
                "的".to_string(), "了".to_string(), "着".to_string(),
                "来".to_string(), "去".to_string(), "把".to_string(),
            ])
        });
        STOP_WORDS.read().contains(&word.to_string())
    }

    fn is_key_term(&self, word: &str) -> bool {
        // 简化的关键词判断逻辑
        word.chars().count() > 2 || word.contains(|c: char| c.is_numeric())
    }

    fn get_abbreviation(&self, word: &str) -> Option<String> {
        static ABBREVIATIONS: Lazy<RwLock<HashMap<String, String>>> = Lazy::new(|| {
            let mut map = HashMap::new();
            map.insert("人工智能".to_string(), "AI".to_string());
            map.insert("机器学习".to_string(), "ML".to_string());
            RwLock::new(map)
        });
        ABBREVIATIONS.read().get(word).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compression_levels() {
        let optimizer = TokenOptimizer::new(10, 1000, true);
        let text = "这是一个人工智能和机器学习的测试用例";
        
        let aggressive = optimizer.aggressive_optimize(text);
        let balanced = optimizer.balanced_optimize(text);
        let conservative = optimizer.conservative_optimize(text);

        assert!(aggressive.len() < balanced.len());
        assert!(balanced.len() < conservative.len());
    }

    #[test]
    fn test_incremental_update() {
        let mut optimizer = TokenOptimizer::new(10, 1000, true);
        let text1 = "初始文本";
        let text2 = "初始文本追加内容";

        optimizer.update_state_snapshot(text1.to_string());
        if let Some(result) = optimizer.try_incremental_update(text2) {
            assert!(result.len() < text2.len());
        }
    }
}
