from dotenv import load_dotenv
import os
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import re

import praw  # Reddit API
import requests
from pytrends.request import TrendReq
import feedparser  # RSS feeds
from bs4 import BeautifulSoup
import openai
from transformers import pipeline
import pandas as pd
from aptos_sdk.account import Account
from aptos_sdk.async_client import RestClient
from aptos_sdk.transactions import EntryFunction, TransactionArgument, TransactionPayload
import schedule
import time

load_dotenv()
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
class Config:
    # Reddit API credentials 
    REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
    REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
    REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "AI_Market_Scraper/1.0")
    
    # OpenAI API key 
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    
    # Aptos configuration
    APTOS_NODE_URL = os.getenv("APTOS_NODE_URL", "https://fullnode.mainnet.aptoslabs.com/v1")
    ADMIN_PRIVATE_KEY = os.getenv("ADMIN_PRIVATE_KEY")
    CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
    
    # Market generation settings
    MIN_SENTIMENT_THRESHOLD = 0.6
    MIN_MENTION_COUNT = 10
    MARKET_DURATION_HOURS = 168  # 1 week
    
    # General subreddits to monitor for trends
    SUBREDDITS = ["technology", "politics", "sports", "cryptocurrency"]

@dataclass
class TrendingTopic:
    keyword: str
    sentiment_score: float
    mention_count: int
    google_trend_score: int
    reddit_score: int
    news_sentiment: float
    related_content: List[str]
    sources: List[str]
    post_id: Optional[str] = None  # Reddit post ID for reference

@dataclass
class MarketProposal:
    description: str
    end_time: int
    confidence_score: float
    topic: TrendingTopic
    oracle_address: str
    resolution_criteria: str  # Added for resolution details

@dataclass
class Market:
    market_id: int
    description: str
    end_time: int
    resolved: bool
    outcome: Optional[bool]  # True for Yes, False for No

class GoogleTrendsScraper:
    """Scrapes Google Trends data for keywords"""
    
    def __init__(self):
        self.pytrends = TrendReq(hl='en-US', tz=360)
    
    async def get_trends(self, keywords: List[str]) -> Dict[str, int]:
        """Get Google Trends interest scores for keywords"""
        trends_data = {}
        
        try:
            batch_size = 5
            for i in range(0, len(keywords), batch_size):
                batch = keywords[i:i+batch_size]
                
                try:
                    self.pytrends.build_payload(batch, timeframe='now 7-d', geo='', cat=0)
                    data = self.pytrends.interest_over_time()
                    
                    if not data.empty:
                        for keyword in batch:
                            if keyword in data.columns:
                                avg_interest = data[keyword].mean()
                                trends_data[keyword] = int(avg_interest)
                    
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"Error getting trends for batch {batch}: {e}")
                    
        except Exception as e:
            logger.error(f"Error in Google Trends scraping: {e}")
        
        return trends_data

class RedditScraper:
    """Scrapes Reddit for discussions and sentiment"""
    
    def __init__(self):
        if Config.REDDIT_CLIENT_ID and Config.REDDIT_CLIENT_SECRET:
            self.reddit = praw.Reddit(
                client_id=Config.REDDIT_CLIENT_ID,
                client_secret=Config.REDDIT_CLIENT_SECRET,
                user_agent=Config.REDDIT_USER_AGENT
            )
        else:
            self.reddit = None
            logger.warning("Reddit API credentials not provided. Reddit scraping disabled.")
    
    async def get_trending_posts(self, limit_per_sub: int = 20) -> List[Dict]:
        """Get trending posts from monitored subreddits"""
        if not self.reddit:
            return []
        
        trending_posts = []
        
        try:
            for subreddit_name in Config.SUBREDDITS:
                try:
                    subreddit = self.reddit.subreddit(subreddit_name)
                    
                    hot_posts = subreddit.hot(limit=limit_per_sub)
                    
                    for post in hot_posts:
                        if not post.stickied and post.score > 100:  # Filter for popular posts
                            comments = []
                            post.comments.replace_more(limit=0)
                            for comment in post.comments.list()[:10]:  # Top 10 comments
                                if hasattr(comment, 'body') and len(comment.body) > 10:
                                    comments.append({
                                        'text': comment.body,
                                        'score': comment.score
                                    })
                            
                            trending_posts.append({
                                'id': post.id,
                                'title': post.title,
                                'text': post.selftext if post.selftext else '',
                                'score': post.score,
                                'num_comments': post.num_comments,
                                'created': post.created_utc,
                                'subreddit': subreddit_name,
                                'comments': comments
                            })
                    
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"Error accessing subreddit {subreddit_name}: {e}")
                    
        except Exception as e:
            logger.error(f"Error in Reddit scraping: {e}")
        
        # Sort by score descending and take top
        trending_posts.sort(key=lambda p: p['score'], reverse=True)
        return trending_posts[:50]

class NewsRSSFeedScraper:
    """Scrapes news from RSS feeds"""
    
    def __init__(self):
        # General news RSS feeds for various topics
        self.news_feeds = [
            'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',  # Technology
            'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',  # Politics
            'https://www.espn.com/espn/rss/news',  # Sports
            'https://cointelegraph.com/rss',  # Crypto
            'https://feeds.bbci.co.uk/news/technology/rss.xml',
            'https://feeds.bbci.co.uk/news/politics/rss.xml',
            'https://feeds.bbci.co.uk/sport/rss.xml',
            'https://cryptoslate.com/feed/',
        ]
    
    async def get_news_for_keyword(self, keyword: str, hours: int = 24) -> List[Dict]:
        """Get recent news articles mentioning the keyword"""
        articles = []
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        for feed_url in self.news_feeds:
            try:
                feed = feedparser.parse(feed_url)
                
                for entry in feed.entries:
                    title_lower = entry.title.lower()
                    summary_lower = getattr(entry, 'summary', '').lower()
                    
                    if keyword.lower() in title_lower or keyword.lower() in summary_lower:
                        try:
                            pub_date = datetime(*entry.published_parsed[:6])
                            if pub_date > cutoff_time:
                                articles.append({
                                    'title': entry.title,
                                    'summary': getattr(entry, 'summary', ''),
                                    'link': entry.link,
                                    'published': pub_date,
                                    'source': feed_url
                                })
                        except Exception:
                            articles.append({
                                'title': entry.title,
                                'summary': getattr(entry, 'summary', ''),
                                'link': entry.link,
                                'published': None,
                                'source': feed_url
                            })
                
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error parsing RSS feed {feed_url}: {e}")
        
        unique_articles = []
        seen_titles = set()
        
        for article in articles:
            title_key = re.sub(r'[^\w]', '', article['title'].lower())
            if title_key not in seen_titles:
                seen_titles.add(title_key)
                unique_articles.append(article)
        
        return unique_articles[:20]

def search_google(query: str) -> List[Dict]:
    """Simple Google search scraper for resolution data"""
    url = f"https://www.google.com/search?q={requests.utils.quote(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, "html.parser")
        results = []
        for g in soup.find_all('div', class_='g'):
            title = g.find('h3')
            title_text = title.text if title else ''
            snippet = g.find('div', class_=['VwiC3b', 'yXK7lf'])
            snippet_text = snippet.text if snippet else ''
            link = g.find('a')
            link_href = link['href'] if link else ''
            if title_text and snippet_text:
                results.append({
                    'title': title_text,
                    'snippet': snippet_text,
                    'link': link_href
                })
        return results[:10]
    except Exception as e:
        logger.error(f"Error in Google search: {e}")
        return []

class FreeSentimentAnalyzer:
    """Sentiment analysis using Hugging Face models"""
    
    def __init__(self):
        try:
            self.analyzer = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                return_all_scores=True
            )
        except:
            self.analyzer = pipeline("sentiment-analysis")
    
    async def analyze_texts(self, texts: List[str]) -> float:
        if not texts:
            return 0.0
        
        try:
            batch_size = 10
            all_scores = []
            
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]
                cleaned_batch = []
                for text in batch:
                    cleaned = re.sub(r'http\S+|www\S+|@\w+|#\w+', '', text)
                    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
                    if len(cleaned) > 10:
                        cleaned_batch.append(cleaned[:512])
                
                if cleaned_batch:
                    results = self.analyzer(cleaned_batch)
                    for result in results:
                        if isinstance(result, list):
                            pos_score = next((r['score'] for r in result if r['label'].lower() in ['positive', 'pos']), 0)
                            neg_score = next((r['score'] for r in result if r['label'].lower() in ['negative', 'neg']), 0)
                            score = pos_score - neg_score
                        else:
                            score = result['score'] if result['label'].lower() in ['positive', 'pos'] else -result['score']
                        all_scores.append(score)
                
                await asyncio.sleep(0.1)
            
            return sum(all_scores) / len(all_scores) if all_scores else 0.0
            
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {e}")
            return 0.0

class FreeTrendAnalyzer:
    """Main trend analyzer using free data sources"""
    
    def __init__(self):
        self.google_trends = GoogleTrendsScraper()
        self.reddit_scraper = RedditScraper()
        self.news_scraper = NewsRSSFeedScraper()
        self.sentiment_analyzer = FreeSentimentAnalyzer()
    
    async def analyze_all_trends(self) -> List[TrendingTopic]:
        """Analyze trends from monitored subreddits"""
        trends = []
        
        logger.info("Fetching Reddit trending posts...")
        trending_posts = await self.reddit_scraper.get_trending_posts()
        
        # Extract keywords from post titles (simple: use title as keyword)
        keywords = [post['title'] for post in trending_posts]
        unique_keywords = list(set(keywords))  # Dedup
        
        logger.info("Fetching Google Trends data...")
        google_trends_data = await self.google_trends.get_trends(unique_keywords)
        
        for post in trending_posts:
            logger.info(f"Analyzing trend for post: {post['title']}")
            
            try:
                keyword = post['title']
                
                # Gather data
                news_articles = await self.news_scraper.get_news_for_keyword(keyword)
                
                # Collect texts for sentiment
                all_texts = [post['title'], post['text']] + [c['text'] for c in post['comments']]
                for article in news_articles:
                    all_texts.append(article['title'])
                    if article['summary']:
                        all_texts.append(article['summary'])
                
                if len(all_texts) < Config.MIN_MENTION_COUNT:
                    logger.info(f"Insufficient mentions for {keyword}: {len(all_texts)}")
                    continue
                
                sentiment_score = await self.sentiment_analyzer.analyze_texts(all_texts)
                
                google_score = google_trends_data.get(keyword, 0)
                
                reddit_score = post['score']
                
                trend = TrendingTopic(
                    keyword=keyword,
                    sentiment_score=sentiment_score,
                    mention_count=len(all_texts),
                    google_trend_score=google_score,
                    reddit_score=reddit_score,
                    news_sentiment=sentiment_score,
                    related_content=all_texts[:10],
                    sources=['reddit', 'google_trends', 'news_rss'],
                    post_id=post['id']
                )
                
                trends.append(trend)
                
            except Exception as e:
                logger.error(f"Error analyzing {post['title']}: {e}")
        
        return trends

class MarketGenerator:
    """Generates market descriptions from trending topics"""
    
    def __init__(self):
        if Config.OPENAI_API_KEY:
            openai.api_key = Config.OPENAI_API_KEY
    
    async def generate_market_proposals(self, trends: List[TrendingTopic]) -> List[MarketProposal]:
        proposals = []
        
        for trend in trends:
            if abs(trend.sentiment_score) < Config.MIN_SENTIMENT_THRESHOLD:
                continue
            
            description, resolution_criteria = await self.generate_market_description(trend)
            if not description:
                continue
            
            end_time = int((datetime.now() + timedelta(hours=Config.MARKET_DURATION_HOURS)).timestamp())
            
            confidence_score = self.calculate_confidence_score(trend)
            
            proposal = MarketProposal(
                description=description,
                end_time=end_time,
                confidence_score=confidence_score,
                topic=trend,
                oracle_address=Config.CONTRACT_ADDRESS,
                resolution_criteria=resolution_criteria
            )
            
            proposals.append(proposal)
        
        proposals.sort(key=lambda x: x.confidence_score, reverse=True)
        return proposals[:5]  # Top 5 proposals
    
    async def generate_market_description(self, trend: TrendingTopic) -> Tuple[Optional[str], str]:
        """Generate market description and resolution criteria based on trend"""
        base_description = f"Will the outcome related to '{trend.keyword}' be positive?"
        resolution_criteria = "Resolved based on major news reports confirming the outcome."
        
        if Config.OPENAI_API_KEY:
            try:
                enhanced, enhanced_criteria = await self.enhance_with_ai(trend)
                return enhanced or base_description, enhanced_criteria or resolution_criteria
            except Exception as e:
                logger.error(f"AI enhancement failed: {e}")
        
        return base_description, resolution_criteria
    
    async def enhance_with_ai(self, trend: TrendingTopic) -> Tuple[Optional[str], Optional[str]]:
        """Enhance description using OpenAI"""
        try:
            context = f"""
            Topic: {trend.keyword}
            Sentiment Score: {trend.sentiment_score}
            Google Trends: {trend.google_trend_score}
            Reddit Activity: {trend.reddit_score}
            Sample Content: {'; '.join(trend.related_content[:3])}
            """
            
            response = await openai.ChatCompletion.acreate(
                model="gpt-4",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an AI that generates engaging Yes/No prediction market questions based on trending Reddit posts and news. Also suggest resolution criteria (e.g., based on news from reputable sources). Keep questions under 100 characters. Focus on measurable, resolvable outcomes like 'Will [event] happen by [date]?'. Example: For a post about a lawyer suing Meta, suggest 'Will the lawyer win the case against Meta? Yes/No' with resolution 'Based on court ruling reported by major news outlets.'"
                    },
                    {
                        "role": "user",
                        "content": f"Context:\n{context}\n\nGenerate a Yes/No market question and resolution criteria."
                    }
                ],
                max_tokens=100,
                temperature=0.7
            )
            
            ai_response = response.choices[0].message.content.strip()
            # Parse response (assume format: Question: ...\nResolution: ...)
            if 'Question:' in ai_response and 'Resolution:' in ai_response:
                question = ai_response.split('Question:')[1].split('Resolution:')[0].strip()
                resolution = ai_response.split('Resolution:')[1].strip()
            else:
                question = ai_response
                resolution = "Based on news reports."
            
            return question, resolution
            
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return None, None
    
    def calculate_confidence_score(self, trend: TrendingTopic) -> float:
        score = 0.0
        sentiment_strength = min(abs(trend.sentiment_score), 1.0) * 0.4
        score += sentiment_strength
        mention_volume = min(trend.mention_count / 100, 1.0) * 0.25
        score += mention_volume
        google_interest = min(trend.google_trend_score / 100, 1.0) * 0.2
        score += google_interest
        source_diversity = len(trend.sources) / 4 * 0.15
        score += source_diversity
        return min(score, 1.0)

class AptosContractIntegrator:
    """Integrates with Aptos prediction market contract"""
    
    def __init__(self):
        self.client = RestClient(Config.APTOS_NODE_URL)
        if Config.ADMIN_PRIVATE_KEY:
            self.admin_account = Account.load_key(Config.ADMIN_PRIVATE_KEY)
        else:
            logger.error("ADMIN_PRIVATE_KEY not provided")
            self.admin_account = None
    
    async def create_market(self, proposal: MarketProposal) -> bool:
        if not self.admin_account:
            return False
        
        try:
            payload = TransactionPayload(EntryFunction.natural(
                f"{Config.CONTRACT_ADDRESS}::pivot_market_stt",
                "create_market",
                [],
                [
                    TransactionArgument(proposal.description, "String"),
                    TransactionArgument(proposal.end_time, "U64"),
                    TransactionArgument(proposal.oracle_address, "String"),
                    TransactionArgument(proposal.resolution_criteria, "String")  # Added
                ]
            ))
            
            signed_txn = await self.client.create_bcs_signed_transaction(
                self.admin_account, payload
            )
            
            result = await self.client.submit_bcs_transaction(signed_txn)
            await self.client.wait_for_transaction(result)
            
            logger.info(f"✅ Market created: {proposal.description}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to create market: {e}")
            return False
    
    async def get_open_markets(self) -> List[Market]:
        """Query open markets from contract (assume view function exists)"""
        try:
            result = await self.client.view(
                function=f"{Config.CONTRACT_ADDRESS}::prediction_markets::get_open_markets",
                type_arguments=[],
                arguments=[]
            )
            # Parse result assuming it's a list of structs
            markets = []
            for item in result:
                markets.append(Market(
                    market_id=item['market_id'],
                    description=item['description'],
                    end_time=item['end_time'],
                    resolved=item['resolved'],
                    outcome=None
                ))
            return markets
        except Exception as e:
            logger.error(f"Error querying open markets: {e}")
            return []
    
    async def resolve_market(self, market_id: int, outcome: bool) -> bool:
        if not self.admin_account:
            return False
        
        try:
            payload = TransactionPayload(EntryFunction.natural(
                f"{Config.CONTRACT_ADDRESS}::prediction_markets",
                "resolve_market",
                [],
                [
                    TransactionArgument(market_id, "U64"),
                    TransactionArgument(outcome, "Bool")
                ]
            ))
            
            signed_txn = await self.client.create_bcs_signed_transaction(
                self.admin_account, payload
            )
            
            result = await self.client.submit_bcs_transaction(signed_txn)
            await self.client.wait_for_transaction(result)
            
            logger.info(f"✅ Market {market_id} resolved to {'Yes' if outcome else 'No'}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to resolve market {market_id}: {e}")
            return False

class MarketResolver:
    """Resolves markets using real-world data"""
    
    def __init__(self, integrator: AptosContractIntegrator):
        self.integrator = integrator
        if Config.OPENAI_API_KEY:
            openai.api_key = Config.OPENAI_API_KEY
    
    async def resolve_pending_markets(self):
        logger.info("Checking for markets to resolve...")
        open_markets = await self.integrator.get_open_markets()
        current_time = int(datetime.now().timestamp())
        
        for market in open_markets:
            if market.end_time <= current_time and not market.resolved:
                outcome = await self.determine_outcome(market)
                if outcome is not None:
                    success = await self.integrator.resolve_market(market.market_id, outcome)
                    if success:
                        logger.info(f"Resolved market: {market.description}")
    
    async def determine_outcome(self, market: Market) -> Optional[bool]:
        """Determine Yes/No outcome based on search results"""
        query = f"{market.description} outcome resolution as of {datetime.fromtimestamp(market.end_time).strftime('%Y-%m-%d')}"
        search_results = search_google(query)
        
        if not search_results:
            return None
        
        texts = [r['title'] + " " + r['snippet'] for r in search_results]
        
        if Config.OPENAI_API_KEY:
            try:
                response = await openai.ChatCompletion.acreate(
                    model="gpt-4",
                    messages=[
                        {"role": "system", "content": "Determine if the outcome of the prediction market question is Yes or No based on provided search results. Respond with 'Yes', 'No', or 'Unclear'."},
                        {"role": "user", "content": f"Question: {market.description}\nSearch results: {'; '.join(texts)}\nOutcome:"}
                    ],
                    max_tokens=10,
                    temperature=0.3
                )
                ai_response = response.choices[0].message.content.strip().lower()
                if 'yes' in ai_response:
                    return True
                elif 'no' in ai_response:
                    return False
                else:
                    return None
            except Exception as e:
                logger.error(f"AI resolution failed: {e}")
        
        # Fallback: simple keyword check
        positive_count = sum(1 for t in texts if any(word in t.lower() for word in ['yes', 'won', 'succeeded', 'true']))
        negative_count = sum(1 for t in texts if any(word in t.lower() for word in ['no', 'lost', 'failed', 'false']))
        if positive_count > negative_count:
            return True
        elif negative_count > positive_count:
            return False
        return None

class FreeAIMarketOrchestrator:
    """Main orchestrator using free data sources"""
    
    def __init__(self):
        self.trend_analyzer = FreeTrendAnalyzer()
        self.market_generator = MarketGenerator()
        self.contract_integrator = AptosContractIntegrator()
        self.market_resolver = MarketResolver(self.contract_integrator)
    
    async def run_market_generation_cycle(self):
        logger.info("🚀 Starting market generation cycle...")
        
        try:
            trends = await self.trend_analyzer.analyze_all_trends()
            logger.info(f"Found {len(trends)} trending topics")
            
            if not trends:
                return
            
            for trend in trends:
                logger.info(f"  {trend.keyword}: sentiment={trend.sentiment_score:.2f}, mentions={trend.mention_count}, google={trend.google_trend_score}")
            
            proposals = await self.market_generator.generate_market_proposals(trends)
            logger.info(f"Generated {len(proposals)} market proposals")
            
            created_count = 0
            for proposal in proposals:
                logger.info(f"Creating: {proposal.description} (confidence: {proposal.confidence_score:.2f})")
                success = await self.contract_integrator.create_market(proposal)
                if success:
                    created_count += 1
                await asyncio.sleep(2)
            
            logger.info(f"✅ Successfully created {created_count}/{len(proposals)} markets")
            
        except Exception as e:
            logger.error(f"❌ Error in market generation cycle: {e}")
    
    async def run_resolution_cycle(self):
        await self.market_resolver.resolve_pending_markets()
    
    def start_scheduler(self):
        # Market generation every 8 hours
        schedule.every(8).hours.do(lambda: asyncio.run(self.run_market_generation_cycle()))
        
        # Resolution every hour
        schedule.every(1).hours.do(lambda: asyncio.run(self.run_resolution_cycle()))
        
        # Initial runs
        asyncio.run(self.run_market_generation_cycle())
        asyncio.run(self.run_resolution_cycle())
        
        logger.info("⏰ Scheduler started")
        while True:
            schedule.run_pending()
            time.sleep(60)

# Main execution
if __name__ == "__main__":
    logger.info("🚀 Starting AI Market Generator Backend...")
    
    required_vars = ["ADMIN_PRIVATE_KEY", "CONTRACT_ADDRESS"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"❌ Missing required environment variables: {missing_vars}")
        exit(1)
    
    if not (Config.REDDIT_CLIENT_ID and Config.REDDIT_CLIENT_SECRET):
        logger.warning("⚠️ Reddit API credentials not provided. Reddit data will be skipped.")
    
    orchestrator = FreeAIMarketOrchestrator()
    orchestrator.start_scheduler()