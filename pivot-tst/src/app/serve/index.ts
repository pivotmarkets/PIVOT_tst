/**
 * Prediction Markets API Client - TypeScript
 * Complete client library for interacting with the prediction markets server
 */

// Types and Interfaces
interface MarketSuggestion {
  title: string;
  question: string;
  description: string;
  context: string;
  resolution_criteria: string;
  sources: string[];
  end_date: string;
  category: string;
  ai_probability: number;
  confidence: number;
  sentiment_score: number;
  key_factors: string[];
}

interface NewsItem {
  title: string;
  summary: string;
  category: string;
  impact_level: string;
  market_potential: number;
  suggested_market_questions: string[];
  timestamp: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

interface PredictionMarketsResponse extends ApiResponse {
  session_id?: string;
  query: string;
  prediction_markets: MarketSuggestion[];
  count: number;
  note?: string;
}

interface TrendingNewsResponse extends ApiResponse {
  timestamp: string;
  news_count: number;
  categories_requested: string[];
  trending_news: NewsItem[];
}

interface MarketAnalysisResponse extends ApiResponse {
  analysis: {
    probability: string;
    confidence: string;
    sentiment_score: number;
    key_factors: string[];
    resolution_criteria: string;
  };
}

interface QuickPredictionResponse extends ApiResponse {
  query: string;
  answer: string;
  probability: string;
  confidence: string;
  factors: string[];
  market_suggestion: MarketSuggestion;
}

interface HealthCheckResponse extends ApiResponse {
  status: string;
  timestamp: string;
  services: {
    gemini: boolean;
    api: boolean;
  };
  message: string;
  time_constraint?: string;
}

interface TrendsResponse extends ApiResponse {
  trends: Array<{
    id: string;
    title: string;
    summary: string;
    category: string;
    source: string;
    engagement_score: number;
    market_potential: number;
    suggested_questions: string[];
  }>;
}

interface DebugGeminiResponse extends ApiResponse {
  message?: string;
  response?: string;
  model?: string;
  api_key_set?: boolean;
  api_key_length?: number;
  error_type?: string;
}

interface ApiInfoResponse extends ApiResponse {
  message: string;
  description: string;
  time_constraint: string;
  endpoints: Record<string, string>;
  usage: {
    prediction_markets: {
      url: string;
      method: string;
      body: {
        query: string;
        num_suggestions: number;
      };
    };
    trending_news: {
      url: string;
      method: string;
      GET_params: string;
      POST_body: {
        categories: string[];
        limit: number;
      };
    };
  };
  example_queries: string[];
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

type NewsCategory = "politics" | "sports" | "crypto" | "technology" | "economics" | "general";

/**
 * Main API Client Class
 */
class PredictionMarketsAPI {
  private baseUrl: string;
  public sessionId: string | null = null;

  constructor(baseUrl: string = "https://pivot-tst.onrender.com") {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  private async makeRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Store session ID if provided
      if (data.session_id) {
        this.sessionId = data.session_id;
      }

      return data as T;
    } catch (error) {
      console.error(`API Request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Main prediction markets generation
   * POST /api/predict
   */
  async generatePredictionMarkets(
    query: string,
    numSuggestions: number = 6,
    userId?: string,
  ): Promise<PredictionMarketsResponse> {
    const body: any = {
      query,
      num_suggestions: numSuggestions,
    };

    if (userId) {
      body.user_id = userId;
    }

    return await this.makeRequest<PredictionMarketsResponse>("/api/predict", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Market search suggestions (alternative endpoint)
   * POST /api/market/search-suggestions
   */
  async getMarketSuggestions(
    query: string,
    numSuggestions: number = 6,
    userId?: string,
  ): Promise<PredictionMarketsResponse> {
    const body: any = {
      query,
      num_suggestions: numSuggestions,
    };

    if (userId) {
      body.user_id = userId;
    }

    return await this.makeRequest<PredictionMarketsResponse>("/api/market/search-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Get trending news for prediction markets
   * GET/POST /api/news/trending
   */
  async getTrendingNews(
    categories?: NewsCategory[] | null,
    limit: number = 10,
    usePost: boolean = false,
  ): Promise<TrendingNewsResponse> {
    if (usePost) {
      // POST version
      const body: any = {};
      if (categories) body.categories = categories;
      if (limit) body.limit = limit;

      return await this.makeRequest<TrendingNewsResponse>("/api/news/trending", {
        method: "POST",
        body: JSON.stringify(body),
      });
    } else {
      // GET version with query parameters
      const params = new URLSearchParams();
      if (categories && categories.length > 0) {
        params.append("categories", categories.join(","));
      }
      if (limit) {
        params.append("limit", limit.toString());
      }

      const queryString = params.toString();
      const endpoint = queryString ? `/api/news/trending?${queryString}` : "/api/news/trending";

      return await this.makeRequest<TrendingNewsResponse>(endpoint, {
        method: "GET",
      });
    }
  }

  /**
   * Analyze a specific market description
   * POST /api/market/analyze
   */
  async analyzeMarket(description: string): Promise<MarketAnalysisResponse> {
    return await this.makeRequest<MarketAnalysisResponse>("/api/market/analyze", {
      method: "POST",
      body: JSON.stringify({ description }),
    });
  }

  /**
   * Get quick yes/no prediction
   * POST /api/market/quick-prediction
   */
  async getQuickPrediction(query: string): Promise<QuickPredictionResponse> {
    return await this.makeRequest<QuickPredictionResponse>("/api/market/quick-prediction", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  }

  /**
   * Get trending topics (legacy endpoint)
   * GET /api/trends
   */
  async getTrends(): Promise<TrendsResponse> {
    return await this.makeRequest<TrendsResponse>("/api/trends", {
      method: "GET",
    });
  }

  /**
   * Health check
   * GET /api/health
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return await this.makeRequest<HealthCheckResponse>("/api/health", {
      method: "GET",
    });
  }

  /**
   * Debug Gemini connection
   * GET /api/debug/gemini
   */
  async debugGemini(): Promise<DebugGeminiResponse> {
    return await this.makeRequest<DebugGeminiResponse>("/api/debug/gemini", {
      method: "GET",
    });
  }

  /**
   * Get API information
   * GET /
   */
  async getApiInfo(): Promise<ApiInfoResponse> {
    return await this.makeRequest<ApiInfoResponse>("/", {
      method: "GET",
    });
  }
}

// Default export for easier importing
export default PredictionMarketsAPI;

// Named exports
export {
  PredictionMarketsAPI,
  // Types
  type MarketSuggestion,
  type NewsItem,
  type NewsCategory,
  type PredictionMarketsResponse,
  type TrendingNewsResponse,
  type MarketAnalysisResponse,
  type QuickPredictionResponse,
  type HealthCheckResponse,
  type TrendsResponse,
  type DebugGeminiResponse,
  type ApiInfoResponse,
  type ApiResponse,
};
