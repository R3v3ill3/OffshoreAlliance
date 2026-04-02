/**
 * AI Caching Utilities
 *
 * Disabled by default - ready for future AI features
 */

export interface AIResponseCache {
  cache_id: number;
  cache_key: string;
  prompt_hash: string;
  prompt: string;
  response: any;
  model_name: string;
  model_version?: string;
  tokens_used?: number;
  cost_usd?: number;
  created_at: string;
  last_accessed_at: string;
  access_count: number;
  expires_at?: string;
  is_active: boolean;
  metadata: any;
}

export interface AICacheStats {
  total_entries: number;
  active_entries: number;
  expired_entries: number;
  total_tokens: number;
  total_cost: number;
  avg_access_count: number;
  cache_hits: number;
  cache_misses: number;
}

/**
 * Generate a cache key for AI responses (client-side version)
 */
export function generateCacheKey(prompt: string, modelName: string): string {
  const crypto = window.crypto || (window as any).msCrypto;
  const text = prompt + modelName;
  let hash = 0;

  // Simple string hash for client-side use
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return `ai:${modelName}:${hash}`;
}

/**
 * Check if AI caching is enabled (disabled by default)
 */
export function isAICachingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_CACHE_ENABLED === 'true';
}

/**
 * Calculate cache hit rate
 */
export function calculateHitRate(stats: AICacheStats): number {
  const total = stats.cache_hits + stats.cache_misses;
  if (total === 0) return 0;
  return Math.round((stats.cache_hits / total) * 100);
}

/**
 * Format cache savings
 */
export function formatSavings(stats: AICacheStats): string {
  if (!stats.total_cost) return "$0.00";

  const hitRate = calculateHitRate(stats);
  const savedAmount = (stats.total_cost * hitRate) / 100;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(savedAmount);
}
