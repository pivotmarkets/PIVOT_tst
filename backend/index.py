import os
import json
import logging
import requests
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

class RealTimeDataProvider:
    """Fetches real-time data from various sources including social media"""
    
    def __init__(self):
        self.session = None
        self.reddit_token = None
        self.token_expires_at = None
    
    async def get_reddit_oauth_token(self) -> Optional[str]:
        """Get Reddit OAuth token"""
        if not Config.REDDIT_CLIENT_ID or not Config.REDDIT_CLIENT_SECRET:
            logger.warning("Reddit OAuth credentials not configured")
            return None
        
        # Check if token is still valid
        if self.reddit_token and self.token_expires_at:
            if datetime.now() < self.token_expires_at:
                return self.reddit_token
        
        try:
            auth = aiohttp.BasicAuth(Config.REDDIT_CLIENT_ID, Config.REDDIT_CLIENT_SECRET)
            data = {'grant_type': 'client_credentials'}
            headers = {'User-Agent': Config.REDDIT_USER_AGENT}
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://www.reddit.com/api/v1/access_token',
                    auth=auth,
                    data=data,
                    headers=headers
                ) as response:
                    if response.status == 200:
                        token_data = await response.json()
                        self.reddit_token = token_data['access_token']
                        # Token typically expires in 3600 seconds, set expiry with buffer
                        self.token_expires_at = datetime.now() + timedelta(seconds=3000)
                        logger.info("Successfully obtained Reddit OAuth token")
                        return self.reddit_token
                    else:
                        logger.error(f"Failed to get Reddit token: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error getting Reddit OAuth token: {e}")
            return None
    
    async def get_reddit_trending_by_category(self, categories: List[str] = None, posts_per_category: int = 5) -> List[Dict[str, Any]]:
        """Get trending posts using OAuth authentication"""
        category_subreddit_map = {
            'crypto': ['cryptocurrency', 'bitcoin', 'ethereum', 'defi'],
            'tech': ['technology', 'programming', 'futurology', 'startups'],
            'politics': ['politics', 'worldnews', 'news'],
            'sports': ['sports', 'nfl', 'nba', 'soccer', 'baseball'],
            'economics': ['economics', 'economy', 'investing']
        }
        
        if categories is None:
            categories = ['crypto', 'tech', 'politics', 'sports']
        
        # Get OAuth token
        access_token = await self.get_reddit_oauth_token()
        
        if not access_token:
            logger.warning("No Reddit token available, returning empty results")
            return []
        
        try:
            all_trending_posts = []
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            
            async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context)) as session:
                for category in categories:
                    subreddits = category_subreddit_map.get(category, [category])
                    category_posts = []
                    
                    for subreddit in subreddits:
                        url = f"https://oauth.reddit.com/r/{subreddit}/hot"
                        params = {'limit': posts_per_category}
                        headers = {
                            'Authorization': f'bearer {access_token}',
                            'User-Agent': Config.REDDIT_USER_AGENT
                        }
                        
                        try:
                            async with session.get(url, headers=headers, params=params) as response:
                                if response.status == 200:
                                    data = await response.json()
                                    posts = data['data']['children']
                                    for post in posts:
                                        post_data = post['data']
                                        category_posts.append({
                                            'title': post_data['title'],
                                            'score': post_data['score'],
                                            'subreddit': subreddit,
                                            'category': category,
                                            'created_utc': post_data['created_utc'],
                                            'num_comments': post_data['num_comments'],
                                            'url': f"https://reddit.com{post_data['permalink']}",
                                            'selftext': post_data.get('selftext', '')[:500],
                                            'author': post_data.get('author', 'unknown'),
                                            'upvote_ratio': post_data.get('upvote_ratio', 0.5)
                                        })
                                elif response.status == 401:
                                    logger.error("Reddit OAuth token expired or invalid")
                                    self.reddit_token = None
                                    return []
                                else:
                                    logger.error(f"Reddit OAuth API returned status {response.status} for r/{subreddit}")
                            
                            # Add small delay between requests
                            await asyncio.sleep(0.5)
                            
                        except Exception as e:
                            logger.error(f"Error fetching from r/{subreddit}: {e}")
                            continue
                    
                    category_posts.sort(key=lambda x: x['score'], reverse=True)
                    all_trending_posts.extend(category_posts[:posts_per_category])
            
            all_trending_posts.sort(key=lambda x: x['score'], reverse=True)
            return all_trending_posts
            
        except Exception as e:
            logger.error(f"Error fetching Reddit trending by category: {e}")
            return []
    
    async def get_stock_data(self, symbols: List[str] = None) -> Dict[str, Any]:
        """Get stock data from Alpha Vantage"""
        if symbols is None:
            symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA']
        
        if not Config.ALPHA_VANTAGE_API_KEY:
            logger.warning("Alpha Vantage API key not found!")
            return {}
        
        try:
            stock_data = {}
            async with aiohttp.ClientSession() as session:
                for symbol in symbols:
                    url = "https://www.alphavantage.co/query"
                    params = {
                        'function': 'GLOBAL_QUOTE',
                        'symbol': symbol,
                        'apikey': Config.ALPHA_VANTAGE_API_KEY
                    }
                    async with session.get(url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()
                            quote = data.get('Global Quote', {})
                            if quote:
                                stock_data[symbol] = {
                                    'price': float(quote.get('05. price', 0)),
                                    'change_percent': float(quote.get('10. change percent', '0%').rstrip('%')),
                                    'volume': int(quote.get('06. volume', 0))
                                }
                    await asyncio.sleep(0.2)  # Rate limit protection
            return stock_data
        except Exception as e:
            logger.error(f"Error fetching stock data: {e}")
            return {}
    
    async def get_news_headlines(self, categories: List[str] = None) -> List[Dict[str, Any]]:
        """Get real news headlines from NewsAPI"""
        if not Config.NEWS_API_KEY:
            logger.warning("NewsAPI key not found!")
            return []
        
        try:
            headlines = []
            categories = categories or ['business', 'technology', 'sports']
            
            async with aiohttp.ClientSession() as session:
                for category in categories:
                    url = "https://newsapi.org/v2/top-headlines"
                    params = {
                        'apiKey': Config.NEWS_API_KEY,
                        'category': category,
                        'language': 'en',
                        'pageSize': 10
                    }
                    
                    async with session.get(url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()
                            for article in data.get('articles', []):
                                headlines.append({
                                    'title': article['title'],
                                    'description': article['description'],
                                    'source': article['source']['name'],
                                    'published_at': article['publishedAt'],
                                    'url': article['url'],
                                    'category': category
                                })
            
            return headlines
        except Exception as e:
            logger.error(f"Error fetching news headlines: {e}")
            return []

class EnhancedAIMarketAssistant:
    """Enhanced AI assistant with real-time data integration"""
    
    def __init__(self):
        self.gemini_client = None
        self.data_provider = RealTimeDataProvider()
        
        if Config.GEMINI_API_KEY:
            try:
                genai.configure(api_key=Config.GEMINI_API_KEY)
                self.gemini_client = genai.GenerativeModel('gemini-2.0-flash-exp')
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
                self.gemini_client = None
    
    async def gather_real_time_context(self, query: str) -> Dict[str, Any]:
        """Gather relevant real-time data based on query"""
        context = {
            'stock_data': {},
            'reddit_trends': [],
            'news_headlines': [],
            'timestamp': datetime.now().isoformat()
        }
        
        query_lower = query.lower()
        
        stock_symbols = []
        if any(term in query_lower for term in ['stock', 'apple', 'google', 'microsoft', 'tesla', 'nvidia']):
            stock_symbols.extend(['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA'])
        
        reddit_categories = []
        if 'crypto' in query_lower:
            reddit_categories.append('crypto')
        if 'stock' in query_lower or 'finance' in query_lower:
            reddit_categories.append('economics')
        if 'politics' in query_lower:
            reddit_categories.append('politics')
        if 'technology' in query_lower or 'tech' in query_lower:
            reddit_categories.append('tech')
        if 'sports' in query_lower:
            reddit_categories.append('sports')
        
        news_categories = []
        if 'news' in query_lower:
            news_categories = ['general', 'business']
        else:
            news_categories = [cat for cat in ['business', 'technology', 'sports'] if cat in query_lower]
        
        if not reddit_categories:
            reddit_categories = ['crypto', 'tech']
        if not news_categories:
            news_categories = ['business', 'technology']
        
        tasks = [
            self.data_provider.get_stock_data(stock_symbols) if stock_symbols else self._empty_dict(),
            self.data_provider.get_reddit_trending_by_category(reddit_categories, 3),
            self.data_provider.get_news_headlines(news_categories)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        if len(results) > 0 and not isinstance(results[0], Exception):
            context['stock_data'] = results[0]
        if len(results) > 1 and not isinstance(results[1], Exception):
            context['reddit_trends'] = results[1]
        if len(results) > 2 and not isinstance(results[2], Exception):
            context['news_headlines'] = results[2]
        
        return context
    
    async def _empty_dict(self):
        return {}
    
    async def generate_prediction_markets_async(self, query: str, num_suggestions: int = 10) -> List[MarketSuggestion]:
        """Generate prediction markets with real-time data integration"""
        if not self.gemini_client:
            return self._fallback_suggestions(query)
        
        try:
            real_time_context = await self.gather_real_time_context(query)
            
            current_date = datetime.now().strftime('%Y-%m-%d %H:%M')
            min_end_time = datetime.now() + timedelta(hours=1)
            min_end_date = min_end_time.strftime('%d/%m/%Y %H:%M')
            
            context_str = self._build_context_string(real_time_context)
            
            prompt = f"""
Based on the query: "{query}"
Current date and time: {current_date}
IMPORTANT: All markets must end at least 1 hour from the current time. Minimum end time: {min_end_date}

REAL-TIME DATA CONTEXT:
{context_str}

Generate {num_suggestions} relevant yes/no prediction market suggestions.
Use current trends, news, and social sentiment to inform probabilities.

Return ONLY a JSON array with these fields for each suggestion:
- title: Concise title
- question: Clear yes/no question
- description: 1-2 sentences
- context: 2-3 sentences of background
- resolution_criteria: Detailed criteria
- sources: Array of 3-4 sources
- end_date: Future date in DD/MM/YYYY HH:MM format
- category: Category string
- ai_probability: Number between 0.1-0.9
- confidence: Number between 0.3-0.8
- sentiment_score: Number between 0-1
- key_factors: Array of 3-5 strings
"""
            
            response = self.gemini_client.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.6,
                    "max_output_tokens": 3000
                }
            )
            
            content = response.text
            content = self._clean_json_response(content)
            
            suggestions_data = json.loads(content)
            suggestions = []
            
            for data in suggestions_data:
                data['real_time_data'] = real_time_context
                suggestions.append(MarketSuggestion(**data))
            
            return self._validate_market_times(suggestions)
            
        except Exception as e:
            logger.error(f"Enhanced market generation failed: {e}")
            return self._fallback_suggestions(query)
    
    async def get_trending_news_async(self, categories: List[str] = None, limit: int = 10) -> List[NewsItem]:
        """Fetch and process real trending news from Reddit"""
        try:
            reddit_categories = []
            if categories:
                for cat in categories:
                    if cat.lower() in ['cryptocurrency', 'crypto', 'bitcoin', 'aptos']:
                        reddit_categories.append('crypto')
                    elif cat.lower() in ['technology', 'tech', 'programming']:
                        reddit_categories.append('tech')
                    elif cat.lower() in ['politics', 'worldnews', 'news']:
                        reddit_categories.append('politics')
                    elif cat.lower() in ['sports', 'nfl', 'nba', 'soccer']:
                        reddit_categories.append('sports')
                    elif cat.lower() in ['economics', 'economy', 'investing']:
                        reddit_categories.append('economics')
            
            if not reddit_categories:
                reddit_categories = ['crypto', 'tech', 'politics', 'sports']
            
            reddit_posts = await self.data_provider.get_reddit_trending_by_category(
                reddit_categories, posts_per_category=max(3, limit // len(reddit_categories))
            )
            
            news_items = []
            current_time = datetime.now()
            
            for post in reddit_posts[:limit]:
                post_time = datetime.fromtimestamp(post['created_utc'])
                time_ago = current_time - post_time
                
                if time_ago.days > 0:
                    time_str = f"{time_ago.days}d ago"
                elif time_ago.seconds > 3600:
                    time_str = f"{time_ago.seconds // 3600}h ago"
                else:
                    time_str = f"{time_ago.seconds // 60}m ago"
                
                if post['score'] > 5000 or post['num_comments'] > 500:
                    impact_level = "high"
                elif post['score'] > 1000 or post['num_comments'] > 100:
                    impact_level = "medium"
                else:
                    impact_level = "low"
                
                market_potential = min(1.0, (post['score'] / 10000 + post['num_comments'] / 1000) * 0.8)
                if post['category'] in ['crypto', 'tech']:
                    market_potential = min(1.0, market_potential + 0.2)
                
                suggested_questions = [
                    f"Will this Reddit post reach 10k upvotes within 24 hours?",
                    f"Will the topic discussed become a major news story this week?"
                ]
                
                if post['category'] == 'crypto':
                    suggested_questions.append("Will this impact crypto markets by >5% this week?")
                elif post['category'] == 'tech':
                    suggested_questions.append("Will this tech trend gain mainstream adoption?")
                elif post['category'] == 'politics':
                    suggested_questions.append("Will this political event affect policy outcomes?")
                elif post['category'] == 'sports':
                    suggested_questions.append("Will this sports news affect team performance?")
                
                summary = post['title']
                if post.get('selftext') and len(post['selftext']) > 50:
                    summary += f" - {post['selftext'][:200]}..."
                
                news_item = NewsItem(
                    title=post['title'],
                    summary=summary,
                    category=post['category'],
                    impact_level=impact_level,
                    market_potential=market_potential,
                    suggested_market_questions=suggested_questions[:3],
                    timestamp=post_time.strftime('%Y-%m-%d %H:%M'),
                    subreddit=post['subreddit'],
                    score=post['score'],
                    num_comments=post['num_comments'],
                    url=post['url'],
                    real_data_context={
                        'reddit_post': post,
                        'time_ago': time_str,
                        'upvote_ratio': post.get('upvote_ratio', 0.5)
                    }
                )
                news_items.append(news_item)
            
            return news_items
            
        except Exception as e:
            logger.error(f"Enhanced Reddit trending news generation failed: {e}")
            return self._fallback_news({})
    
    def _build_context_string(self, context: Dict[str, Any]) -> str:
        """Build a detailed context string from real-time data"""
        parts = []
        
        if context.get('stock_data'):
            parts.append("CURRENT STOCK DATA:")
            for symbol, data in context['stock_data'].items():
                parts.append(f"- {symbol}: ${data['price']:.2f} ({data['change_percent']:+.2f}% change)")
        
        if context.get('reddit_trends'):
            parts.append("\nREDDIT TRENDS (SOCIAL SENTIMENT):")
            for trend in context['reddit_trends'][:10]:
                parts.append(f"- r/{trend['subreddit']}: {trend['title']} (Score: {trend['score']}, Comments: {trend['num_comments']})")
        
        if context.get('news_headlines'):
            parts.append("\nLATEST NEWS HEADLINES:")
            for headline in context['news_headlines'][:10]:
                parts.append(f"- {headline['source']}: {headline['title']}")
        
        parts.append(f"\nTimestamp: {context['timestamp']}")
        
        return '\n'.join(parts)
    
    def _clean_json_response(self, content: str) -> str:
        """Clean Gemini's JSON response"""
        content = content.strip()
        if content.startswith('```json'):
            content = content[7:]
        if content.startswith('```'):
            content = content[3:]
        if content.endswith('```'):
            content = content[:-3]
        return content.strip()
    
    def _validate_market_times(self, suggestions: List[MarketSuggestion]) -> List[MarketSuggestion]:
        """Validate market end times"""
        current_time = datetime.now()
        min_end_time = current_time + timedelta(hours=1)
        validated = []
        
        for suggestion in suggestions:
            try:
                end_datetime = datetime.strptime(suggestion.end_date, '%d/%m/%Y %H:%M') if ' ' in suggestion.end_date else datetime.strptime(suggestion.end_date + ' 23:59', '%d/%m/%Y %H:%M')
                if end_datetime < min_end_time:
                    new_end_time = min_end_time + timedelta(days=30)
                    suggestion.end_date = new_end_time.strftime('%d/%m/%Y %H:%M')
                validated.append(suggestion)
            except ValueError:
                default_end_time = min_end_time + timedelta(days=30)
                suggestion.end_date = default_end_time.strftime('%d/%m/%Y %H:%M')
                validated.append(suggestion)
        return validated
    
    def _fallback_suggestions(self, query: str) -> List[MarketSuggestion]:
        """Fallback suggestions"""
        end_date = (datetime.now() + timedelta(hours=1, days=30)).strftime('%d/%m/%Y %H:%M')
        return [MarketSuggestion(
            title=f"Prediction: {query}",
            question=f"Will {query} occur?",
            description="Fallback market due to data fetch failure.",
            context="Limited data available.",
            resolution_criteria="Based on reliable sources.",
            sources=["Fallback"],
            end_date=end_date,
            category="general",
            ai_probability=0.5,
            confidence=0.3,
            sentiment_score=0.5,
            key_factors=["Unknown"],
            real_time_data={}
        )]
    
    def _fallback_news(self, context: Dict[str, Any]) -> List[NewsItem]:
        """Fallback news"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
        return [NewsItem(
            title="Fallback News",
            summary="Real-time data fetch failed.",
            category="general",
            impact_level="low",
            market_potential=0.5,
            suggested_market_questions=["Will data integration succeed soon?"],
            timestamp=timestamp,
            real_data_context=context
        )]

class EnhancedPredictionAPI:
    """Enhanced API with real-time data-driven predictions"""
    
    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)
        self.ai_assistant = EnhancedAIMarketAssistant()
        self.register_routes()
    
    def register_routes(self):
        """Register all API routes"""
        
        @self.app.route('/api/predict', methods=['POST'])
        def generate_prediction_markets():
            try:
                data = request.json
                query = data.get('query', '')
                num_suggestions = data.get('num_suggestions', 10)
                
                if not query:
                    return jsonify({'success': False, 'error': 'Query is required'}), 400
                
                session_id = str(uuid.uuid4())
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    suggestions = loop.run_until_complete(
                        self.ai_assistant.generate_prediction_markets_async(query, num_suggestions)
                    )
                finally:
                    loop.close()
                
                return jsonify({
                    'success': True,
                    'session_id': session_id,
                    'query': query,
                    'prediction_markets': [asdict(s) for s in suggestions],
                    'count': len(suggestions),
                    'note': 'Predictions based on real-time data'
                })
            except Exception as e:
                logger.error(f"Error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/news/trending', methods=['GET', 'POST'])
        def get_trending_news():
            try:
                if request.method == 'POST':
                    data = request.json or {}
                    categories = data.get('categories', ['crypto', 'tech', 'politics', 'sports'])
                    limit = data.get('limit', 15)
                else:
                    categories_param = request.args.get('categories')
                    if categories_param:
                        categories = [cat.strip() for cat in categories_param.split(',')]
                    else:
                        categories = ['crypto', 'tech', 'politics', 'sports']
                    limit = int(request.args.get('limit', 15))
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    news_items = loop.run_until_complete(
                        self.ai_assistant.get_trending_news_async(categories, limit)
                    )
                finally:
                    loop.close()
                
                categorized_news = {}
                for item in news_items:
                    if item.category not in categorized_news:
                        categorized_news[item.category] = []
                    categorized_news[item.category].append(asdict(item))
                
                return jsonify({
                    'success': True,
                    'timestamp': datetime.now().isoformat(),
                    'news_count': len(news_items),
                    'categories': categories,
                    'trending_news': [asdict(item) for item in news_items],
                    'categorized_news': categorized_news,
                    'note': 'Trending topics from Reddit (OAuth authenticated)'
                })
            except Exception as e:
                logger.error(f"Error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/reddit/trending', methods=['GET'])
        def get_reddit_trending():
            """Get raw Reddit trending posts"""
            try:
                categories = request.args.get('categories', 'crypto,tech,politics,sports').split(',')
                posts_per_category = int(request.args.get('posts_per_category', 5))
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    reddit_posts = loop.run_until_complete(
                        self.ai_assistant.data_provider.get_reddit_trending_by_category(
                            [cat.strip() for cat in categories], posts_per_category
                        )
                    )
                finally:
                    loop.close()
                
                categorized_posts = {}
                for post in reddit_posts:
                    category = post['category']
                    if category not in categorized_posts:
                        categorized_posts[category] = []
                    
                    post_time = datetime.fromtimestamp(post['created_utc'])
                    time_ago = datetime.now() - post_time
                    if time_ago.days > 0:
                        post['time_ago'] = f"{time_ago.days}d ago"
                    elif time_ago.seconds > 3600:
                        post['time_ago'] = f"{time_ago.seconds // 3600}h ago"
                    else:
                        post['time_ago'] = f"{time_ago.seconds // 60}m ago"
                    
                    categorized_posts[category].append(post)
                
                return jsonify({
                    'success': True,
                    'timestamp': datetime.now().isoformat(),
                    'total_posts': len(reddit_posts),
                    'categories': list(categorized_posts.keys()),
                    'reddit_posts': reddit_posts,
                    'categorized_posts': categorized_posts,
                    'note': 'OAuth authenticated Reddit data'
                })
            except Exception as e:
                logger.error(f"Error fetching Reddit trending: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/market/search-suggestions', methods=['POST'])
        def get_market_suggestions():
            """Market search suggestions endpoint (alias for /api/predict)"""
            try:
                data = request.json
                query = data.get('query', '')
                num_suggestions = data.get('num_suggestions', 10)
                
                if not query:
                    return jsonify({'success': False, 'error': 'Query is required'}), 400
                
                session_id = str(uuid.uuid4())
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    suggestions = loop.run_until_complete(
                        self.ai_assistant.generate_prediction_markets_async(query, num_suggestions)
                    )
                finally:
                    loop.close()
                
                return jsonify({
                    'success': True,
                    'session_id': session_id,
                    'query': query,
                    'prediction_markets': [asdict(s) for s in suggestions],
                    'count': len(suggestions),
                    'note': 'Predictions based on real-time data'
                })
            except Exception as e:
                logger.error(f"Error in search suggestions: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/market/analyze', methods=['POST'])
        def analyze_market():
            try:
                data = request.json
                description = data.get('description', '')
                
                if not description:
                    return jsonify({'success': False, 'error': 'Description required'}), 400
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    suggestions = loop.run_until_complete(
                        self.ai_assistant.generate_prediction_markets_async(description, 1)
                    )
                finally:
                    loop.close()
                
                if suggestions:
                    s = suggestions[0]
                    return jsonify({
                        'success': True,
                        'analysis': {
                            'probability': s.ai_probability,
                            'confidence': s.confidence,
                            'sentiment_score': s.sentiment_score,
                            'key_factors': s.key_factors,
                            'resolution_criteria': s.resolution_criteria,
                            'real_time_data': s.real_time_data
                        }
                    })
                return jsonify({'success': False, 'error': 'Analysis failed'}), 500
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/market/quick-prediction', methods=['POST'])
        def quick_prediction():
            try:
                data = request.json
                query = data.get('query', '')
                
                if not query:
                    return jsonify({'success': False, 'error': 'Query required'}), 400
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    suggestions = loop.run_until_complete(
                        self.ai_assistant.generate_prediction_markets_async(query, 1)
                    )
                finally:
                    loop.close()
                
                if suggestions:
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
                return jsonify({'success': False, 'error': 'Prediction failed'}), 500
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
                'supported_categories': ['crypto', 'tech', 'politics', 'sports', 'economics'],
                'reddit_sources': {
                    'crypto': ['cryptocurrency', 'bitcoin', 'ethereum', 'defi'],
                    'tech': ['technology', 'programming', 'futurology', 'startups'],
                    'politics': ['politics', 'worldnews', 'news'],
                    'sports': ['sports', 'nfl', 'nba', 'soccer', 'baseball'],
                    'economics': ['economics', 'economy', 'investing']
                },
                'note': 'Enhanced with Reddit OAuth authentication'
            })
    
    def run(self, host='0.0.0.0', port=8000, debug=False):
        logger.info(f"Starting Enhanced Prediction API Server on {host}:{port}")
        logger.info(f"Integrations: Gemini {'✓' if Config.GEMINI_API_KEY else '✗'}, NewsAPI {'✓' if Config.NEWS_API_KEY else '✗'}, AlphaVantage {'✓' if Config.ALPHA_VANTAGE_API_KEY else '✗'}, Reddit OAuth {'✓' if Config.REDDIT_CLIENT_ID else '✗'}")
        logger.info("Features: Reddit OAuth authentication for reliable data access")
        logger.info("Supported categories: crypto, tech, politics, sports, economics")
        
        if not Config.GEMINI_API_KEY:
            logger.warning("Missing GEMINI_API_KEY! AI features will be limited.")
        if not Config.REDDIT_CLIENT_ID or not Config.REDDIT_CLIENT_SECRET:
            logger.warning("Missing Reddit OAuth credentials! Reddit features will not work.")
        
        self.app.run(host=host, port=port, debug=debug)

if __name__ == "__main__":
    api_server = EnhancedPredictionAPI()
    port = int(os.getenv("PORT", 8000))
    api_server.run(host='0.0.0.0', port=port, debug=False)