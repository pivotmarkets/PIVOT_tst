import os
import json
import logging
import asyncio
import aiohttp
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
import uuid
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
import certifi
import ssl

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
class Config:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    NEWS_API_KEY = os.getenv("NEWS_API_KEY")
    REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
    REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
    REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "web:prediction-markets-api:v1.0.0 (by /u/predictionmarkets)")
    ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")

# --------------------------------------------------------------
# GLOBAL EVENT LOOP – ONE LOOP FOR THE ENTIRE PROCESS
# --------------------------------------------------------------
_app_loop = asyncio.get_event_loop()

def _run_async(coro):
    """Run coroutine on the global loop without ever closing it."""
    future = asyncio.run_coroutine_threadsafe(coro, _app_loop)
    return future.result()

# --------------------------------------------------------------
# Data Models
# --------------------------------------------------------------
@dataclass
class MarketSuggestion:
    title: str
    question: str
    description: str
    context: str
    resolution_criteria: str
    sources: List[str]
    end_date: str
    category: str
    ai_probability: float
    confidence: float
    sentiment_score: float
    key_factors: List[str]
    real_time_data: Dict[str, Any]

@dataclass
class NewsItem:
    title: str
    summary: str
    category: str
    impact_level: str
    market_potential: float
    suggested_market_questions: List[str]
    timestamp: str
    real_data_context: Dict[str, Any]
    subreddit: Optional[str] = None
    score: Optional[int] = None
    num_comments: Optional[int] = None
    url: Optional[str] = None

# --------------------------------------------------------------
# Real-Time Data Provider
# --------------------------------------------------------------
class RealTimeDataProvider:
    def __init__(self):
        self.session = None
        self.reddit_token = None
        self.token_expires_at = None

    async def get_reddit_oauth_token(self) -> Optional[str]:
        if not Config.REDDIT_CLIENT_ID or not Config.REDDIT_CLIENT_SECRET:
            logger.warning("Reddit OAuth credentials not configured")
            return None
        if self.reddit_token and self.token_expires_at and datetime.now() < self.token_expires_at:
            return self.reddit_token
        try:
            auth = aiohttp.BasicAuth(Config.REDDIT_CLIENT_ID, Config.REDDIT_CLIENT_SECRET)
            data = {'grant_type': 'client_credentials'}
            headers = {'User-Agent': Config.REDDIT_USER_AGENT}
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://www.reddit.com/api/v1/access_token',
                    auth=auth, data=data, headers=headers
                ) as response:
                    if response.status == 200:
                        token_data = await response.json()
                        self.reddit_token = token_data['access_token']
                        self.token_expires_at = datetime.now() + timedelta(seconds=3000)
                        logger.info("Obtained Reddit OAuth token")
                        return self.reddit_token
                    else:
                        logger.error(f"Reddit token failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Reddit token error: {e}")
            return None

    async def get_reddit_trending_by_category(self, categories: List[str] = None, posts_per_category: int = 5) -> List[Dict[str, Any]]:
        category_subreddit_map = {
            'crypto': ['cryptocurrency', 'bitcoin', 'ethereum', 'defi'],
            'tech': ['technology', 'programming', 'futurology', 'startups'],
            'politics': ['politics', 'worldnews', 'news'],
            'sports': ['sports', 'nfl', 'nba', 'soccer', 'baseball'],
            'economics': ['economics', 'economy', 'investing']
        }
        if categories is None:
            categories = ['crypto', 'tech', 'politics', 'sports']
        access_token = await self.get_reddit_oauth_token()
        if not access_token:
            return []
        try:
            all_posts = []
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context)) as session:
                for category in categories:
                    subreddits = category_subreddit_map.get(category, [category])
                    for subreddit in subreddits:
                        url = f"https://oauth.reddit.com/r/{subreddit}/hot"
                        params = {'limit': posts_per_category}
                        headers = {'Authorization': f'bearer {access_token}', 'User-Agent': Config.REDDIT_USER_AGENT}
                        try:
                            async with session.get(url, headers=headers, params=params) as response:
                                if response.status == 200:
                                    data = await response.json()
                                    for post in data['data']['children']:
                                        p = post['data']
                                        all_posts.append({
                                            'title': p['title'],
                                            'score': p['score'],
                                            'subreddit': subreddit,
                                            'category': category,
                                            'created_utc': p['created_utc'],
                                            'num_comments': p['num_comments'],
                                            'url': f"https://reddit.com{p['permalink']}",
                                            'selftext': p.get('selftext', '')[:500],
                                            'author': p.get('author', 'unknown'),
                                            'upvote_ratio': p.get('upvote_ratio', 0.5)
                                        })
                            await asyncio.sleep(0.5)
                        except Exception as e:
                            logger.error(f"Reddit fetch error r/{subreddit}: {e}")
            all_posts.sort(key=lambda x: x['score'], reverse=True)
            return all_posts
        except Exception as e:
            logger.error(f"Reddit trending error: {e}")
            return []

    async def get_stock_data(self, symbols: List[str] = None) -> Dict[str, Any]:
        if symbols is None:
            symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA']
        if not Config.ALPHA_VANTAGE_API_KEY:
            return {}
        try:
            data = {}
            async with aiohttp.ClientSession() as session:
                for symbol in symbols:
                    url = "https://www.alphavantage.co/query"
                    params = {'function': 'GLOBAL_QUOTE', 'symbol': symbol, 'apikey': Config.ALPHA_VANTAGE_API_KEY}
                    async with session.get(url, params=params) as resp:
                        if resp.status == 200:
                            j = await resp.json()
                            q = j.get('Global Quote', {})
                            if q:
                                data[symbol] = {
                                    'price': float(q.get('05. price', 0)),
                                    'change_percent': float(q.get('10. change percent', '0%').rstrip('%')),
                                    'volume': int(q.get('06. volume', 0))
                                }
                    await asyncio.sleep(0.2)
            return data
        except Exception as e:
            logger.error(f"Stock data error: {e}")
            return {}

    async def get_news_headlines(self, categories: List[str] = None) -> List[Dict[str, Any]]:
        if not Config.NEWS_API_KEY:
            return []
        try:
            headlines = []
            categories = categories or ['business', 'technology', 'sports']
            async with aiohttp.ClientSession() as session:
                for cat in categories:
                    url = "https://newsapi.org/v2/top-headlines"
                    params = {'apiKey': Config.NEWS_API_KEY, 'category': cat, 'language': 'en', 'pageSize': 10}
                    async with session.get(url, params=params) as resp:
                        if resp.status == 200:
                            j = await resp.json()
                            for a in j.get('articles', []):
                                headlines.append({
                                    'title': a['title'],
                                    'description': a['description'],
                                    'source': a['source']['name'],
                                    'published_at': a['publishedAt'],
                                    'url': a['url'],
                                    'category': cat
                                })
            return headlines
        except Exception as e:
            logger.error(f"News headlines error: {e}")
            return []

# --------------------------------------------------------------
# AI Assistant
# --------------------------------------------------------------
class EnhancedAIMarketAssistant:
    def __init__(self):
        self.gemini_client = None
        self.data_provider = RealTimeDataProvider()
        if Config.GEMINI_API_KEY:
            try:
                genai.configure(api_key=Config.GEMINI_API_KEY)
                self.gemini_client = genai.GenerativeModel('gemini-2.0-flash')
                logger.info("Gemini 2.0 Flash initialized")
            except Exception as e:
                logger.error(f"Gemini init failed: {e}")
                self.gemini_client = None

    async def gather_real_time_context(self, query: str) -> Dict[str, Any]:
        context = {'stock_data': {}, 'reddit_trends': [], 'news_headlines': [], 'timestamp': datetime.now().isoformat()}
        ql = query.lower()
        stock_symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'] if any(x in ql for x in ['stock', 'apple', 'google', 'microsoft', 'tesla', 'nvidia']) else []
        reddit_cats = ['crypto'] if 'crypto' in ql else ['economics'] if 'stock' in ql or 'finance' in ql else ['politics'] if 'politics' in ql else ['tech'] if 'tech' in ql else ['sports'] if 'sports' in ql else ['crypto', 'tech']
        news_cats = ['business', 'technology'] if 'news' not in ql else ['general', 'business']
        tasks = [
            self.data_provider.get_stock_data(stock_symbols) if stock_symbols else asyncio.sleep(0),
            self.data_provider.get_reddit_trending_by_category(reddit_cats, 3),
            self.data_provider.get_news_headlines(news_cats)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        if len(results) > 0 and not isinstance(results[0], Exception): context['stock_data'] = results[0]
        if len(results) > 1 and not isinstance(results[1], Exception): context['reddit_trends'] = results[1]
        if len(results) > 2 and not isinstance(results[2], Exception): context['news_headlines'] = results[2]
        return context

    async def generate_prediction_markets_async(self, query: str, num_suggestions: int = 4) -> List[MarketSuggestion]:
        if not self.gemini_client:
            return self._fallback_suggestions(query)
        num_suggestions = min(num_suggestions, 4)
        try:
            real_time_context = await self.gather_real_time_context(query)
            current_date = datetime.now().strftime('%Y-%m-%d %H:%M')
            min_end_date = (datetime.now() + timedelta(hours=1)).strftime('%d/%m/%Y %H:%M')
            context_str = self._build_context_string(real_time_context)
            context_lines = context_str.split('\n')
            if len(context_lines) > 15:
                context_lines = context_lines[:15] + ['... (trimmed)']
                context_str = '\n'.join(context_lines)
            prompt = f"""
Based on query: "{query}"
Time: {current_date}
Min end: {min_end_date}
Context: {context_str}

Generate {num_suggestions} yes/no markets. ONLY JSON array. No text.
Keys:
{{
  "title": "Short",
  "question": "Yes/no?",
  "description": "1 sentence",
  "context": "1 sentence",
  "resolution_criteria": "Rules",
  "sources": ["src1", "src2"],
  "end_date": "DD/MM/YYYY HH:MM",
  "category": "crypto",
  "ai_probability": 0.5,
  "confidence": 0.5,
  "sentiment_score": 0.5,
  "key_factors": ["f1", "f2"]
}}
"""
            for attempt in range(5):
                try:
                    response = await self.gemini_client.generate_content_async(
                        prompt,
                        generation_config={"temperature": 0.6, "max_output_tokens": 2000}
                    )
                    content = self._clean_json_response(response.text)
                    data = json.loads(content)
                    suggestions = [MarketSuggestion(**{**d, 'real_time_data': real_time_context}) for d in data]
                    return self._validate_market_times(suggestions)
                except json.JSONDecodeError as e:
                    logger.warning(f"JSON failed (attempt {attempt+1}): {e}")
                    if attempt == 4:
                        return self._fallback_suggestions(query)
                    await asyncio.sleep(3 ** attempt)
                except Exception as e:
                    logger.error(f"Gemini error (attempt {attempt+1}): {e}")
                    if attempt == 4:
                        return self._fallback_suggestions(query)
                    await asyncio.sleep(10)
        except Exception as e:
            logger.error(f"Market gen failed: {e}")
            return self._fallback_suggestions(query)

    def _build_context_string(self, context: Dict[str, Any]) -> str:
        parts = []
        if context.get('stock_data'):
            parts.append("STOCKS:")
            for s, d in context['stock_data'].items():
                parts.append(f"- {s}: ${d['price']:.2f} ({d['change_percent']:+.2f}%)")
        if context.get('reddit_trends'):
            parts.append("REDDIT:")
            for t in context['reddit_trends'][:5]:
                parts.append(f"- {t['title']} (r/{t['subreddit']}, {t['score']} pts)")
        if context.get('news_headlines'):
            parts.append("NEWS:")
            for h in context['news_headlines'][:5]:
                parts.append(f"- {h['title']}")
        parts.append(f"Time: {context['timestamp']}")
        return '\n'.join(parts)

    def _clean_json_response(self, content: str) -> str:
        content = content.strip()
        if content.startswith('```json'): content = content[7:]
        elif content.startswith('```'): content = content[3:]
        if content.endswith('```'): content = content[:-3]
        content = content.strip()
        if not content or content == '[]': return '[]'
        if not content.startswith('['): content = '[' + content
        if not content.endswith(']'): content += ']'
        content = re.sub(r"(?<!\\)'([^']*)'", r'"\1"', content)
        content = re.sub(r'("\s*[^"]*?)(?=\s*[,}\]]|$)', r'\1"', content)
        content = re.sub(r',\s*([}\]])', r'\1', content)
        try:
            array_match = re.search(r'\[.*?\]', content, re.DOTALL)
            if array_match: content = array_match.group(0)
        except: pass
        return content.strip()

    def _validate_market_times(self, suggestions: List[MarketSuggestion]) -> List[MarketSuggestion]:
        min_time = datetime.now() + timedelta(hours=1)
        for s in suggestions:
            try:
                end = datetime.strptime(s.end_date, '%d/%m/%Y %H:%M') if ' ' in s.end_date else datetime.strptime(s.end_date + ' 23:59', '%d/%m/%Y %H:%M')
                if end < min_time:
                    s.end_date = (min_time + timedelta(days=30)).strftime('%d/%m/%Y %H:%M')
            except:
                s.end_date = (min_time + timedelta(days=30)).strftime('%d/%m/%Y %H:%M')
        return suggestions

    def _fallback_suggestions(self, query: str) -> List[MarketSuggestion]:
        end = (datetime.now() + timedelta(hours=1, days=30)).strftime('%d/%m/%Y %H:%M')
        return [MarketSuggestion(
            title=f"Prediction: {query}",
            question=f"Will {query} occur?",
            description="Fallback due to error.",
            context="Limited data.",
            resolution_criteria="Reliable sources.",
            sources=["Fallback"],
            end_date=end,
            category="general",
            ai_probability=0.5,
            confidence=0.3,
            sentiment_score=0.5,
            key_factors=["Unknown"],
            real_time_data={}
        )]

    async def get_trending_news_async(self, categories: List[str] = None, limit: int = 10) -> List[NewsItem]:
        try:
            reddit_cats = []
            if categories:
                for c in categories:
                    cl = c.lower()
                    if cl in ['cryptocurrency', 'crypto', 'bitcoin', 'aptos']: reddit_cats.append('crypto')
                    elif cl in ['technology', 'tech', 'programming']: reddit_cats.append('tech')
                    elif cl in ['politics', 'worldnews', 'news']: reddit_cats.append('politics')
                    elif cl in ['sports', 'nfl', 'nba', 'soccer']: reddit_cats.append('sports')
                    elif cl in ['economics', 'economy', 'investing']: reddit_cats.append('economics')
            if not reddit_cats: reddit_cats = ['crypto', 'tech', 'politics', 'sports']
            posts = await self.data_provider.get_reddit_trending_by_category(reddit_cats, max(3, limit // len(reddit_cats)))
            items = []
            now = datetime.now()
            for p in posts[:limit]:
                pt = datetime.fromtimestamp(p['created_utc'])
                ago = now - pt
                time_str = f"{ago.days}d ago" if ago.days > 0 else f"{ago.seconds//3600}h ago" if ago.seconds > 3600 else f"{ago.seconds//60}m ago"
                impact = "high" if p['score'] > 5000 or p['num_comments'] > 500 else "medium" if p['score'] > 1000 or p['num_comments'] > 100 else "low"
                potential = min(1.0, (p['score']/10000 + p['num_comments']/1000) * 0.8)
                if p['category'] in ['crypto', 'tech']: potential = min(1.0, potential + 0.2)
                questions = [f"Will this post reach 10k upvotes in 24h?", f"Will topic become major news?"]
                if p['category'] == 'crypto': questions.append("Will this move crypto >5%?")
                items.append(NewsItem(
                    title=p['title'],
                    summary=p['title'] + (f" - {p['selftext'][:200]}..." if p.get('selftext') else ""),
                    category=p['category'],
                    impact_level=impact,
                    market_potential=potential,
                    suggested_market_questions=questions[:3],
                    timestamp=pt.strftime('%Y-%m-%d %H:%M'),
                    subreddit=p['subreddit'],
                    score=p['score'],
                    num_comments=p['num_comments'],
                    url=p['url'],
                    real_data_context={'reddit_post': p, 'time_ago': time_str, 'upvote_ratio': p.get('upvote_ratio', 0.5)}
                ))
            return items
        except Exception as e:
            logger.error(f"News gen failed: {e}")
            return []

# --------------------------------------------------------------
# Flask API
# --------------------------------------------------------------
class EnhancedPredictionAPI:
    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)
        self.ai_assistant = EnhancedAIMarketAssistant()
        self.register_routes()

    def register_routes(self):
        @self.app.route('/api/predict', methods=['POST'])
        def generate_prediction_markets():
            try:
                data = request.json
                query = data.get('query', '')
                num_suggestions = data.get('num_suggestions', 4)
                if not query:
                    return jsonify({'success': False, 'error': 'Query required'}), 400
                suggestions = _run_async(
                    self.ai_assistant.generate_prediction_markets_async(query, num_suggestions)
                )
                return jsonify({
                    'success': True,
                    'session_id': str(uuid.uuid4()),
                    'query': query,
                    'prediction_markets': [asdict(s) for s in suggestions],
                    'count': len(suggestions),
                    'note': 'Real-time data powered'
                })
            except Exception as e:
                logger.error(f"Predict error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500

        @self.app.route('/api/news/trending', methods=['GET', 'POST'])
        def get_trending_news():
            try:
                if request.method == 'POST':
                    data = request.json or {}
                    categories = data.get('categories', ['crypto', 'tech', 'politics', 'sports'])
                    limit = data.get('limit', 15)
                else:
                    cats = request.args.get('categories')
                    categories = [c.strip() for c in cats.split(',')] if cats else ['crypto', 'tech', 'politics', 'sports']
                    limit = int(request.args.get('limit', 15))
                news_items = _run_async(self.ai_assistant.get_trending_news_async(categories, limit))
                categorized = {}
                for item in news_items:
                    cat = item.category
                    if cat not in categorized: categorized[cat] = []
                    categorized[cat].append(asdict(item))
                return jsonify({
                    'success': True,
                    'timestamp': datetime.now().isoformat(),
                    'news_count': len(news_items),
                    'categories': categories,
                    'trending_news': [asdict(i) for i in news_items],
                    'categorized_news': categorized
                })
            except Exception as e:
                logger.error(f"News error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500

        @self.app.route('/api/reddit/trending', methods=['GET'])
        def get_reddit_trending():
            try:
                categories = request.args.get('categories', 'crypto,tech,politics,sports').split(',')
                posts_per = int(request.args.get('posts_per_category', 5))
                posts = _run_async(
                    self.ai_assistant.data_provider.get_reddit_trending_by_category(
                        [c.strip() for c in categories], posts_per
                    )
                )
                categorized = {}
                for p in posts:
                    cat = p['category']
                    if cat not in categorized: categorized[cat] = []
                    pt = datetime.fromtimestamp(p['created_utc'])
                    ago = datetime.now() - pt
                    p['time_ago'] = f"{ago.days}d ago" if ago.days > 0 else f"{ago.seconds//3600}h ago" if ago.seconds > 3600 else f"{ago.seconds//60}m ago"
                    categorized[cat].append(p)
                return jsonify({
                    'success': True,
                    'total_posts': len(posts),
                    'reddit_posts': posts,
                    'categorized_posts': categorized
                })
            except Exception as e:
                logger.error(f"Reddit error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500

        @self.app.route('/api/market/search-suggestions', methods=['POST'])
        def get_market_suggestions():
            return generate_prediction_markets()

        @self.app.route('/api/market/analyze', methods=['POST'])
        def analyze_market():
            try:
                desc = request.json.get('description', '')
                if not desc: return jsonify({'success': False, 'error': 'Description required'}), 400
                suggestions = _run_async(self.ai_assistant.generate_prediction_markets_async(desc, 1))
                if not suggestions: return jsonify({'success': False, 'error': 'Failed'}), 500
                s = suggestions[0]
                return jsonify({'success': True, 'analysis': {
                    'probability': s.ai_probability,
                    'confidence': s.confidence,
                    'sentiment_score': s.sentiment_score,
                    'key_factors': s.key_factors,
                    'resolution_criteria': s.resolution_criteria,
                    'real_time_data': s.real_time_data
                }})
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500

        @self.app.route('/api/market/quick-prediction', methods=['POST'])
        def quick_prediction():
            try:
                query = request.json.get('query', '')
                if not query: return jsonify({'success': False, 'error': 'Query required'}), 400
                suggestions = _run_async(self.ai_assistant.generate_prediction_markets_async(query, 1))
                if not suggestions: return jsonify({'success': False, 'error': 'Failed'}), 500
                s = suggestions[0]
                prob = s.ai_probability
                answer = "Likely YES" if prob > 0.7 else "Likely NO" if prob < 0.3 else "Uncertain"
                return jsonify({
                    'success': True,
                    'query': query,
                    'answer': f"{answer} ({prob:.1%})",
                    'confidence': s.confidence,
                    'factors': s.key_factors,
                    'market_suggestion': asdict(s)
                })
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500

        @self.app.route('/api/health', methods=['GET'])
        def health_check():
            return jsonify({
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'services': {
                    'gemini': bool(Config.GEMINI_API_KEY),
                    'newsapi': bool(Config.NEWS_API_KEY),
                    'alphavantage': bool(Config.ALPHA_VANTAGE_API_KEY),
                    'reddit_oauth': bool(Config.REDDIT_CLIENT_ID and Config.REDDIT_CLIENT_SECRET)
                },
                'note': 'Event loop fixed, Gemini 2.0 Flash + JSON repair'
            })

    def run(self, host='0.0.0.0', port=8000, debug=False):
        logger.info(f"Starting API on {host}:{port}")
        self.app.run(host=host, port=port, debug=debug)

if __name__ == "__main__":
    api_server = EnhancedPredictionAPI()
    port = int(os.getenv("PORT", 8000))
    api_server.run(host='0.0.0.0', port=port, debug=False)
