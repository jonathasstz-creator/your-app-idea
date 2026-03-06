
import { getAuthTokenFromStorage } from "./auth-storage";

export interface StatsRange {
  from: string;
  to: string;
}

export interface StatsKpis {
  sessions_7d: number;
  sessions_30d: number;
  attempts_7d: number;
  attempts_30d: number;
  practice_time_7d_sec: number;
  accuracy_avg: number;
  latency_avg: number;
  best_streak: number;
  best_score: number;
}

export interface StatsDailyEntry {
  date: string;
  sessions: number;
  accuracy_avg: number;
  latency_avg: number;
  score_avg: number;
}

export interface StatsHeatmapNote {
  midi: number;
  error_rate: number;
  latency_avg: number;
  sample_size: number;
}

export interface StatsErrorPair {
  expected_pitch: number;
  played_pitch: number;
  count: number;
  error_rate: number;
}

export interface StatsChapterRecommendation {
  type: string;
  label: string;
  reason: string;
}

export interface StatsChapter {
  chapter_id: number | string;
  title: string;
  unlocked: boolean;
  progress_pct: number;
  sessions_total: number;
  accuracy_avg: number;
  latency_avg: number;
  practice_time_sec: number;
  last_session_at: string | null;
  heatmap_top_notes: StatsHeatmapNote[];
  recommendation: StatsChapterRecommendation;
}

export interface StatsSuggestion {
  type: string;
  title: string;
  body: string;
  cta_label?: string;
  cta_action?: string;
}

export interface StatsUnlock {
  chapter_id: number | string;
  unlocked: boolean;
  reason: string;
}

export interface StatsViewModel {
  version?: number;
  api_version?: string;
  generated_at: string;
  user_id: string;
  range: StatsRange;
  kpis: StatsKpis;
  daily: StatsDailyEntry[];
  chapters: StatsChapter[];
  global_heatmap: StatsHeatmapNote[];
  global_heatmap_top_notes: StatsHeatmapNote[];
  error_pairs: StatsErrorPair[];
  suggestions: StatsSuggestion[];
  unlocks: StatsUnlock[];
  recent_sessions?: {
    session_id: string;
    chapter_id: number;
    lesson_id: string;
    completed_at: string;
    hits: number;
    misses: number;
    late: number;
    latency_avg_ms: number;
    duration_sec: number;
  }[];
}

export type AnalyticsSource = "api" | "static";

export interface StatsCacheEntry {
  stats: StatsViewModel;
  timestamp: number;
}

type AnalyticsMode = "api" | "static" | "off";

export class AnalyticsClientError extends Error {
  status?: number;
  source?: AnalyticsSource;

  constructor(message: string, options?: { status?: number; source?: AnalyticsSource }) {
    super(message);
    this.status = options?.status;
    this.source = options?.source;
  }
}

const FALLBACK_PATH = "/local-analytics/overview.json";
const CACHE_PREFIX = "stats_cache_v1";

const decodeSub = (token: string | null): string | null => {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const sub = payload?.sub;
    return typeof sub === "string" && sub.trim() ? sub : null;
  } catch {
    return null;
  }
};

const getCacheKey = (): string | null => {
  const token = getAuthTokenFromStorage();
  const sub = decodeSub(token);
  return sub ? `${CACHE_PREFIX}_${sub}` : null;
};
export class AnalyticsClient {
  private readonly baseUrl: string;
  private readonly mode: AnalyticsMode;
  private readonly enableStaticFallback: boolean;

  constructor() {
    const metaEnv = (import.meta as any).env;
    const envBase = metaEnv.VITE_VIEWER_API_URL ?? "";
    this.baseUrl = envBase.replace(/\/$/, "");
    this.mode = this.resolveMode(metaEnv.VITE_ANALYTICS_MODE);
    const fallbackFlag = metaEnv.VITE_ENABLE_STATIC_FALLBACK ?? "false";
    this.enableStaticFallback = String(fallbackFlag).toLowerCase() === "true";
  }

  loadCache(): StatsCacheEntry | null {
    const cacheKey = getCacheKey();
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.stats) {
        // Evita cache de outro usuário
        const sub = decodeSub(getAuthTokenFromStorage());
        if (sub && parsed.stats?.user_id && parsed.stats.user_id !== sub) {
          localStorage.removeItem(cacheKey);
          return null;
        }
        return {
          stats: parsed.stats as StatsViewModel,
          timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
        };
      }
      if (parsed?.kpis) {
        return { stats: parsed as StatsViewModel, timestamp: Date.now() };
      }
    } catch (error) {
      console.warn("[Analytics] Falha ao ler cache", error);
    }
    return null;
  }

  saveCache(stats: StatsViewModel): void {
    const cacheKey = getCacheKey();
    if (!cacheKey) return;
    try {
      const payload: StatsCacheEntry = { stats, timestamp: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("[Analytics] Falha ao salvar cache", error);
    }
  }

  async fetchOverview(days = 30): Promise<{ stats: StatsViewModel; source: AnalyticsSource }> {
    if (this.mode === "off") {
      throw new AnalyticsClientError("Analytics desativado", { source: "api" });
    }

    if (this.mode === "static") {
      const stats = await this.fetchFallback();
      this.saveCache(stats);
      return { stats, source: "static" };
    }

    let primaryError: unknown = null;
    try {
      const stats = await this.fetchFromApi(days);
      this.saveCache(stats);
      return { stats, source: "api" };
    } catch (error) {
      primaryError = error;
    }

    if (this.enableStaticFallback) {
      try {
        const stats = await this.fetchFallback();
        this.saveCache(stats);
        return { stats, source: "static" };
      } catch (fallbackError) {
        if (fallbackError instanceof Error) {
          throw fallbackError;
        }
        if (primaryError instanceof Error) {
          throw primaryError;
        }
        throw new AnalyticsClientError("Fallback de analytics falhou", { source: "static" });
      }
    }

    if (primaryError instanceof Error) {
      throw primaryError;
    }
    throw new AnalyticsClientError("Analytics API indisponível", { source: "api" });
  }

  private resolveMode(rawMode: unknown): AnalyticsMode {
    const value = String(rawMode ?? "api").toLowerCase();
    if (value === "static" || value === "off") return value;
    return "api";
  }

  private async fetchFromApi(days: number): Promise<StatsViewModel> {
    const endpoint = this.buildEndpoint(days);
    const headers = this.buildHeaders();
    try {
      const response = await fetch(endpoint, {
        headers,
        mode: "cors",
        credentials: "include",
      });
      if (!response.ok) {
        const detail =
          response.status === 401
            ? "401 - Autenticação necessária (token ou UUID local ausente)"
            : `API retornou ${response.status}`;
        throw new AnalyticsClientError(detail, { status: response.status, source: "api" });
      }
      console.info("[Analytics] Fonte: API", { endpoint, status: response.status });
      return response.json();
    } catch (error) {
      if (error instanceof AnalyticsClientError) throw error;
      throw new AnalyticsClientError("Falha ao buscar analytics (rede/offline)", {
        source: "api",
      });
    }
  }

  private buildEndpoint(days: number): string {
    const rawPath = this.baseUrl
      ? `${this.baseUrl}/v1/analytics/overview`
      : "/v1/analytics/overview";
    const target = rawPath.startsWith("http")
      ? new URL(rawPath)
      : new URL(rawPath, window.location.origin);
    target.searchParams.set("days", days.toString());
    return target.toString();
  }

  private buildHeaders(): Headers {
    const headers = new Headers({ Accept: "application/json" });
    const token = getAuthTokenFromStorage();
    if (!token) {
      throw new AnalyticsClientError("Auth obrigatório. Faça login para ver analytics.");
    }
    headers.set("Authorization", `Bearer ${token}`);
    return headers;
  }

  private async fetchFallback(): Promise<StatsViewModel> {
    try {
      const fallbackUrl = new URL(FALLBACK_PATH, window.location.origin).toString();
      const response = await fetch(fallbackUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new AnalyticsClientError("Fallback JSON indisponível", { source: "static" });
      }
      console.info("[Analytics] Fonte: fallback estático", { fallbackUrl });
      return response.json();
    } catch (error) {
      if (error instanceof AnalyticsClientError) throw error;
      throw new AnalyticsClientError("Falha ao carregar fallback estático", { source: "static" });
    }
  }

}
