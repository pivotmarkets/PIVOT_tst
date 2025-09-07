import os
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, asdict
import re
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score
import joblib
import sqlite3
from pathlib import Path
import certifi
import requests
import praw
from pytrends.request import TrendReq
import feedparser
from bs4 import BeautifulSoup
import openai
from transformers import pipeline
import yfinance as yf
from fredapi import Fred
from aptos_sdk.account import Account
from aptos_sdk.async_client import RestClient
from aptos_sdk.transactions import EntryFunction, TransactionArgument, TransactionPayload
import schedule
import time
import subprocess
import ssl
import urllib.request
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
from flask import Flask, request, jsonify
from flask_cors import CORS

from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
class Config:
    REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
    REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
    REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "AI_Predictive_Oracle/2.0")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    FRED_API_KEY = os.getenv("FRED_API_KEY")
    APTOS_NODE_URL = os.getenv("APTOS_NODE_URL", "https://fullnode.mainnet.aptoslabs.com/v1")
    ADMIN_PRIVATE_KEY = os.getenv("ADMIN_PRIVATE_KEY")
    CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
    MIN_HISTORICAL_DATA_POINTS = 50
    PREDICTION_CONFIDENCE_THRESHOLD = 0.65
    MARKET_DURATION_DAYS = 30
    MODEL_UPDATE_INTERVAL_HOURS = 24
    SUBREDDITS = ["worldnews", "technology", "politics", "economics", "sports", "cryptocurrency", "stocks"]
    NEWS_SOURCES = [
        'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
        'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
        'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
        'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
        'https://feeds.bbci.co.uk/news/world/rss.xml',
        'https://feeds.bbci.co.uk/news/technology/rss.xml',
        'https://feeds.bbci.co.uk/news/business/rss.xml',
        'https://www.reuters.com/business/finance/rss',
    ]

@dataclass
class TrendingTopic:
    id: str
    title: str
    summary: str
    category: str
    source: str
    engagement_score: float
    created_at: datetime
    keywords: List[str]
    related_articles: List[Dict]
    ai_analysis: Dict[str, Any]

@dataclass
class MarketCreationStep:
    step_number: int
    step_name: str
    prompt: str
    user_input: Optional[str] = None
    ai_suggestion: Optional[str] = None
    validation_result: Optional[Dict] = None

@dataclass
class MarketProposal:
    id: str
    description: str
    end_date: datetime
    category: str
    resolution_criteria: str
    ai_probability: float
    ai_confidence: float
    key_factors: List[str]
    risk_factors: List[str]
    data_quality_score: float
    creation_steps: List[MarketCreationStep]
    status: str = "draft"  # draft, ready, created
    user_id: Optional[str] = None

class AIMarketAssistant:
    """Enhanced AI assistant for natural language market creation"""
    
    def __init__(self):
        self.openai_client = None
        if Config.OPENAI_API_KEY:
            openai.api_key = Config.OPENAI_API_KEY
            self.openai_client = openai
        
    async def analyze_user_intent(self, user_message: str, context: Dict = None) -> Dict[str, Any]:
        """Analyze user's natural language message to determine intent and extract market details"""
        
        if not self.openai_client:
            return self._fallback_intent_analysis(user_message)
            
        try:
            system_prompt = """You are an AI assistant that helps users create prediction markets from natural language.
            
Analyze the user's message and determine:
1. Intent: Is this a market creation request, question about odds, or general inquiry?
2. Market details if applicable: What event, timeframe, resolution criteria
3. Confidence: How clear and specific is the request?
4. Next steps: What information is needed to proceed

Respond in JSON format:
{
    "intent": "create_market|analyze_odds|general_inquiry|unclear",
    "confidence": 0.0-1.0,
    "extracted_event": "string or null",
    "suggested_question": "Will X happen by Y?",
    "category": "politics|economics|sports|technology|general",
    "timeframe": "extracted or suggested timeframe",
    "missing_info": ["list of missing information"],
    "next_step": "what to ask user next",
    "reasoning": "explanation of analysis"
}"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"User message: {user_message}\nContext: {json.dumps(context or {})}"}
            ]
            
            response = await self.openai_client.ChatCompletion.acreate(
                model="gpt-4",
                messages=messages,
                max_tokens=400,
                temperature=0.3
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            logger.error(f"OpenAI analysis failed: {e}")
            return self._fallback_intent_analysis(user_message)
    
    def _fallback_intent_analysis(self, user_message: str) -> Dict[str, Any]:
        """Simple rule-based analysis when OpenAI is not available"""
        message_lower = user_message.lower()
        
        # Check for market creation intent
        creation_keywords = ['will', 'bet', 'predict', 'market', 'odds', 'happen', 'occur']
        has_creation_intent = any(keyword in message_lower for keyword in creation_keywords)
        
        # Extract potential event
        question_match = re.search(r'will\s+([^?]+?)(\?|$)', message_lower)
        event = question_match.group(1).strip() if question_match else None
        
        # Categorize
        category = self._categorize_simple(message_lower)
        
        return {
            "intent": "create_market" if has_creation_intent else "general_inquiry",
            "confidence": 0.7 if has_creation_intent else 0.3,
            "extracted_event": event,
            "suggested_question": f"Will {event}?" if event else None,
            "category": category,
            "timeframe": None,
            "missing_info": ["resolution_criteria", "timeframe"] if event else ["event_description"],
            "next_step": "Please provide more details about the event and when it should be resolved.",
            "reasoning": "Simple keyword-based analysis"
        }
    
    def _categorize_simple(self, text: str) -> str:
        """Simple categorization based on keywords"""
        if any(word in text for word in ['election', 'vote', 'president', 'congress', 'senate', 'doj', 'republican', 'democrat']):
            return 'politics'
        elif any(word in text for word in ['stock', 'market', 'economy', 'inflation', 'fed', 'gdp', 'bitcoin', 'crypto']):
            return 'economics'
        elif any(word in text for word in ['game', 'sport', 'team', 'championship', 'player']):
            return 'sports'
        elif any(word in text for word in ['tech', 'ai', 'software', 'app', 'startup']):
            return 'technology'
        else:
            return 'general'
    
    async def generate_resolution_criteria(self, event_description: str, category: str) -> Dict[str, Any]:
        """Generate suggested resolution criteria for an event"""
        
        if not self.openai_client:
            return self._fallback_resolution_criteria(event_description, category)
            
        try:
            prompt = f"""Generate clear, objective resolution criteria for this prediction market:
Event: {event_description}
Category: {category}

The criteria should be:
1. Objective and verifiable
2. Based on reliable sources
3. Clear about edge cases
4. Include specific sources to check

Respond in JSON:
{{
    "criteria": "How exactly the market will be resolved",
    "sources": ["list of authoritative sources to check"],
    "edge_cases": ["potential ambiguous situations and how to handle them"],
    "confidence": 0.0-1.0
}}"""

            response = await self.openai_client.ChatCompletion.acreate(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
                temperature=0.3
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            logger.error(f"Resolution criteria generation failed: {e}")
            return self._fallback_resolution_criteria(event_description, category)
    
    def _fallback_resolution_criteria(self, event_description: str, category: str) -> Dict[str, Any]:
        """Simple fallback resolution criteria"""
        return {
            "criteria": f"Will be resolved based on official announcements and major news sources regarding: {event_description}",
            "sources": ["Reuters", "Associated Press", "Official government announcements"],
            "edge_cases": ["If no clear resolution by deadline, market resolves to NO"],
            "confidence": 0.6
        }

class TrendAnalyzer:
    """Enhanced trend analysis for better topic discovery"""
    
    def __init__(self):
        self.reddit_scraper = RedditScraper() if Config.REDDIT_CLIENT_ID else None
        self.news_scraper = NewsRSSFeedScraper()
        self.ai_assistant = AIMarketAssistant()
    
    async def get_trending_topics(self, limit: int = 20) -> List[TrendingTopic]:
        """Get trending topics with AI analysis for market potential"""
        topics = []
        
        # Get Reddit trends
        if self.reddit_scraper:
            reddit_posts = await self.reddit_scraper.get_trending_posts(limit_per_sub=5)
            for post in reddit_posts[:10]:
                if post['score'] > 1000:  # High engagement threshold
                    topic = await self._create_trending_topic_from_reddit(post)
                    if topic:
                        topics.append(topic)
        
        # Get news trends
        news_articles = await self.news_scraper.get_recent_news_batch(hours=24)
        for article in news_articles[:10]:
            topic = await self._create_trending_topic_from_news(article)
            if topic:
                topics.append(topic)
        
        # Sort by engagement and AI market potential
        topics.sort(key=lambda t: t.engagement_score + t.ai_analysis.get('market_potential', 0), reverse=True)
        
        return topics[:limit]
    
    async def _create_trending_topic_from_reddit(self, post: Dict) -> Optional[TrendingTopic]:
        """Convert Reddit post to TrendingTopic"""
        try:
            # AI analysis of market potential
            ai_analysis = await self._analyze_market_potential(post['title'], post.get('text', ''))
            
            return TrendingTopic(
                id=f"reddit_{post['id']}",
                title=post['title'],
                summary=post.get('text', '')[:200] + "..." if post.get('text', '') else "",
                category=self._categorize_topic(post['title']),
                source=f"r/{post['subreddit']}",
                engagement_score=float(post['score']),
                created_at=datetime.fromtimestamp(post['created']),
                keywords=self._extract_keywords(post['title']),
                related_articles=[],
                ai_analysis=ai_analysis
            )
        except Exception as e:
            logger.error(f"Error creating topic from Reddit post: {e}")
            return None
    
    async def _create_trending_topic_from_news(self, article: Dict) -> Optional[TrendingTopic]:
        """Convert news article to TrendingTopic"""
        try:
            ai_analysis = await self._analyze_market_potential(article['title'], article['summary'])
            
            return TrendingTopic(
                id=f"news_{hash(article['title']) % 1000000}",
                title=article['title'],
                summary=article['summary'],
                category=self._categorize_topic(article['title']),
                source=article.get('source', 'News'),
                engagement_score=article.get('relevance_score', 1.0),
                created_at=article.get('published') or datetime.now(),
                keywords=self._extract_keywords(article['title']),
                related_articles=[article],
                ai_analysis=ai_analysis
            )
        except Exception as e:
            logger.error(f"Error creating topic from news: {e}")
            return None
    
    async def _analyze_market_potential(self, title: str, content: str) -> Dict[str, Any]:
        """Analyze how good this topic would be for a prediction market"""
        analysis = {
            'market_potential': 0.5,
            'predictability': 0.5,
            'interest_level': 0.5,
            'time_sensitivity': 0.5,
            'suggested_questions': [],
            'concerns': []
        }
        
        try:
            # Simple scoring based on content analysis
            text = (title + " " + content).lower()
            
            # Market potential indicators
            if any(word in text for word in ['will', 'expected', 'predict', 'forecast', 'likely']):
                analysis['market_potential'] += 0.2
            
            # Predictability indicators
            if any(word in text for word in ['election', 'release', 'announcement', 'decision']):
                analysis['predictability'] += 0.2
            
            # Interest level indicators
            if any(word in text for word in ['breaking', 'major', 'significant', 'historic']):
                analysis['interest_level'] += 0.3
            
            # Time sensitivity
            if any(word in text for word in ['today', 'tomorrow', 'soon', 'urgent', 'immediate']):
                analysis['time_sensitivity'] += 0.3
            
            # Generate suggested questions
            if 'will' in title.lower():
                analysis['suggested_questions'].append(title + "?")
            else:
                analysis['suggested_questions'].append(f"{title[:50]}...")
            
            # Clamp values
            for key in ['market_potential', 'predictability', 'interest_level', 'time_sensitivity']:
                analysis[key] = min(1.0, analysis[key])
                
        except Exception as e:
            logger.error(f"Error in market potential analysis: {e}")
        
        return analysis
    
    def _categorize_topic(self, title: str) -> str:
        """Categorize topic based on title"""
        title_lower = title.lower()
        if any(word in title_lower for word in ['election', 'vote', 'president', 'congress', 'senate', 'doj', 'republican', 'democrat']):
            return 'politics'
        elif any(word in title_lower for word in ['stock', 'market', 'economy', 'inflation', 'fed', 'gdp']):
            return 'economics'
        elif any(word in title_lower for word in ['game', 'sport', 'team', 'championship', 'player']):
            return 'sports'
        elif any(word in title_lower for word in ['tech', 'ai', 'software', 'app', 'startup']):
            return 'technology'
        elif any(word in title_lower for word in ['crypto', 'bitcoin', 'ethereum', 'blockchain']):
            return 'cryptocurrency'
        else:
            return 'general'
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text"""
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
        # Remove common words
        stop_words = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'}
        keywords = [word for word in words if word not in stop_words]
        return list(set(keywords))[:10]

class MarketCreationWorkflow:
    """Handles the step-by-step market creation process"""
    
    def __init__(self, db_manager, ai_assistant, predictive_model):
        self.db_manager = db_manager
        self.ai_assistant = ai_assistant
        self.predictive_model = predictive_model
        self.active_sessions = {}  # session_id -> MarketProposal
    
    async def start_market_creation(self, user_message: str, user_id: str = None) -> Dict[str, Any]:
        """Start the market creation process"""
        session_id = f"session_{hash(user_message + str(datetime.now())) % 1000000}"
        
        # Analyze user intent
        intent_analysis = await self.ai_assistant.analyze_user_intent(user_message)
        
        if intent_analysis['intent'] != 'create_market':
            return {
                'success': False,
                'message': "I don't see a market creation request in your message. Try asking something like 'Will X happen by Y date?'",
                'suggestions': [
                    "Will Bitcoin reach $200,000 by end of 2026?",
                    "Will the next election have over 70% turnout?",
                    "Will OpenAI release GPT-5 this year?"
                ]
            }
        
        # Create initial proposal
        proposal = MarketProposal(
            id=session_id,
            description=intent_analysis.get('suggested_question', ''),
            end_date=datetime.now() + timedelta(days=30),  # Default
            category=intent_analysis.get('category', 'general'),
            resolution_criteria='',
            ai_probability=0.5,
            ai_confidence=0.0,
            key_factors=[],
            risk_factors=[],
            data_quality_score=0.0,
            creation_steps=[],
            user_id=user_id
        )
        
        # Determine next step
        next_step = await self._determine_next_step(proposal, intent_analysis)
        proposal.creation_steps.append(next_step)
        
        self.active_sessions[session_id] = proposal
        
        return {
            'success': True,
            'session_id': session_id,
            'current_step': next_step.step_number,
            'prompt': next_step.prompt,
            'ai_suggestion': next_step.ai_suggestion,
            'progress': f"Step {next_step.step_number} of 4"
        }
    
    async def continue_market_creation(self, session_id: str, user_response: str) -> Dict[str, Any]:
        """Continue the market creation process with user response"""
        if session_id not in self.active_sessions:
            return {'success': False, 'message': 'Session not found. Please start a new market creation.'}
        
        proposal = self.active_sessions[session_id]
        current_step = proposal.creation_steps[-1]
        
        # Validate and process user response
        validation = await self._validate_step_response(current_step, user_response)
        current_step.user_input = user_response
        current_step.validation_result = validation
        
        if not validation['valid']:
            return {
                'success': False,
                'message': validation['message'],
                'retry_prompt': current_step.prompt,
                'session_id': session_id
            }
        
        # Update proposal with validated data
        await self._update_proposal_from_step(proposal, current_step, user_response)
        
        # Determine if we need more steps
        if current_step.step_number < 4:  # Assuming 4 steps total
            next_step = await self._determine_next_step(proposal, {})
            proposal.creation_steps.append(next_step)
            
            return {
                'success': True,
                'session_id': session_id,
                'current_step': next_step.step_number,
                'prompt': next_step.prompt,
                'ai_suggestion': next_step.ai_suggestion,
                'progress': f"Step {next_step.step_number} of 4"
            }
        else:
            # Final step - generate AI analysis and prepare market
            final_result = await self._finalize_market_proposal(proposal)
            proposal.status = "ready"
            
            return final_result
    
    async def _determine_next_step(self, proposal: MarketProposal, context: Dict) -> MarketCreationStep:
        """Determine what the next step should be"""
        current_step_num = len(proposal.creation_steps) + 1
        
        if current_step_num == 1:
            # Step 1: Clarify the question
            return MarketCreationStep(
                step_number=1,
                step_name="question_clarification",
                prompt="Let's refine your prediction question. Please provide a clear Yes/No question about a future event.",
                ai_suggestion=proposal.description if proposal.description else "Will [specific event] happen by [specific date]?"
            )
        elif current_step_num == 2:
            # Step 2: Set timeframe
            return MarketCreationStep(
                step_number=2,
                step_name="timeframe",
                prompt="When should this market resolve? Please provide a specific date or timeframe.",
                ai_suggestion="30 days from now" if not context.get('timeframe') else context['timeframe']
            )
        elif current_step_num == 3:
            # Step 3: Resolution criteria
            criteria_suggestion = await self.ai_assistant.generate_resolution_criteria(
                proposal.description, proposal.category
            )
            return MarketCreationStep(
                step_number=3,
                step_name="resolution_criteria",
                prompt="How should this market be resolved? What sources should we check to determine the outcome?",
                ai_suggestion=criteria_suggestion.get('criteria', 'Based on official announcements and major news sources')
            )
        else:
            # Step 4: Final review
            return MarketCreationStep(
                step_number=4,
                step_name="final_review",
                prompt="Please review the market details. Type 'confirm' to proceed with creation, or suggest any changes.",
                ai_suggestion="Everything looks good! Ready to create your market."
            )
    
    async def _validate_step_response(self, step: MarketCreationStep, response: str) -> Dict[str, Any]:
        """Validate user response for current step"""
        if step.step_name == "question_clarification":
            if not response.strip():
                return {'valid': False, 'message': 'Please provide a question for your market.'}
            if '?' not in response:
                return {'valid': False, 'message': 'Please format as a Yes/No question ending with ?'}
            return {'valid': True, 'message': 'Question looks good!'}
        
        elif step.step_name == "timeframe":
            # Try to parse timeframe
            try:
                # Simple date parsing
                if any(word in response.lower() for word in ['day', 'week', 'month', 'year']):
                    return {'valid': True, 'message': 'Timeframe accepted.'}
                # Try to parse specific date formats
                parsed_date = self._parse_date(response)
                if parsed_date:
                    return {'valid': True, 'message': f'Market will resolve on {parsed_date.strftime("%B %d, %Y")}'}
                return {'valid': False, 'message': 'Please provide a clearer timeframe (e.g., "in 30 days", "by December 2026", "January 15, 2025")'}
            except:
                return {'valid': False, 'message': 'Please provide a valid timeframe.'}
        
        elif step.step_name == "resolution_criteria":
            if len(response.strip()) < 10:
                return {'valid': False, 'message': 'Please provide more detailed resolution criteria.'}
            return {'valid': True, 'message': 'Resolution criteria accepted.'}
        
        elif step.step_name == "final_review":
            if response.lower().strip() in ['confirm', 'yes', 'proceed', 'create']:
                return {'valid': True, 'message': 'Confirmed! Creating your market...'}
            return {'valid': True, 'message': 'Please specify changes or type "confirm" to proceed.'}
        
        return {'valid': True, 'message': 'Input accepted.'}
    
    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse various date formats"""
        date_str = date_str.strip()
        
        # Try various formats
        formats = [
            "%Y-%m-%d",
            "%B %d, %Y",
            "%b %d, %Y",
            "%m/%d/%Y",
            "%d/%m/%Y"
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        
        # Try relative dates
        if "day" in date_str.lower():
            days = re.search(r'(\d+)', date_str)
            if days:
                return datetime.now() + timedelta(days=int(days.group(1)))
        
        if "week" in date_str.lower():
            weeks = re.search(r'(\d+)', date_str)
            if weeks:
                return datetime.now() + timedelta(weeks=int(weeks.group(1)))
        
        if "month" in date_str.lower():
            months = re.search(r'(\d+)', date_str)
            if months:
                return datetime.now() + timedelta(days=int(months.group(1)) * 30)
        
        return None
    
    async def _update_proposal_from_step(self, proposal: MarketProposal, step: MarketCreationStep, response: str):
        """Update proposal with data from completed step"""
        if step.step_name == "question_clarification":
            proposal.description = response.strip()
        elif step.step_name == "timeframe":
            parsed_date = self._parse_date(response)
            if parsed_date:
                proposal.end_date = parsed_date
        elif step.step_name == "resolution_criteria":
            proposal.resolution_criteria = response.strip()
    
    async def _finalize_market_proposal(self, proposal: MarketProposal) -> Dict[str, Any]:
        """Generate final AI analysis and prepare market for creation"""
        try:
            # Get AI probability analysis
            # This would use your existing predictive model
            # For now, simplified version:
            
            analysis_result = {
                'probability': 0.65,  # This should come from your ML model
                'confidence': 0.75,
                'key_factors': ['Historical precedent', 'Current trends', 'Expert opinions'],
                'risk_factors': ['Unexpected events', 'Policy changes'],
                'data_quality_score': 0.8
            }
            
            proposal.ai_probability = analysis_result['probability']
            proposal.ai_confidence = analysis_result['confidence']
            proposal.key_factors = analysis_result['key_factors']
            proposal.risk_factors = analysis_result['risk_factors']
            proposal.data_quality_score = analysis_result['data_quality_score']
            
            return {
                'success': True,
                'message': 'Market proposal ready for creation!',
                'proposal': {
                    'id': proposal.id,
                    'description': proposal.description,
                    'end_date': proposal.end_date.strftime('%Y-%m-%d'),
                    'resolution_criteria': proposal.resolution_criteria,
                    'category': proposal.category,
                    'ai_analysis': {
                        'probability': f"{proposal.ai_probability:.1%}",
                        'confidence': f"{proposal.ai_confidence:.1%}",
                        'key_factors': proposal.key_factors,
                        'risk_factors': proposal.risk_factors,
                        'recommendation': self._generate_recommendation(proposal)
                    }
                },
                'ready_to_create': True,
                'session_id': proposal.id
            }
            
        except Exception as e:
            logger.error(f"Error finalizing market proposal: {e}")
            return {
                'success': False,
                'message': f'Error analyzing market: {str(e)}',
                'session_id': proposal.id
            }
    
    def _generate_recommendation(self, proposal: MarketProposal) -> str:
        """Generate AI recommendation for the market"""
        if proposal.ai_confidence < 0.6:
            return f"⚠️ Moderate confidence prediction. Consider additional research before betting."
        elif proposal.ai_probability > 0.7:
            return f"📈 AI predicts high likelihood of YES ({proposal.ai_probability:.1%})"
        elif proposal.ai_probability < 0.3:
            return f"📉 AI predicts high likelihood of NO ({1-proposal.ai_probability:.1%})"
        else:
            return f"⚖️ Balanced prediction - genuine uncertainty makes this interesting"

class NewsRSSFeedScraper:
    def __init__(self):
        self.news_feeds = Config.NEWS_SOURCES
    
    async def get_recent_news_batch(self, hours: int = 24) -> List[Dict]:
        """Get recent news from all feeds"""
        articles = []
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        for feed_url in self.news_feeds:
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries:
                    pub_date = None
                    try:
                        if hasattr(entry, 'published_parsed') and entry.published_parsed:
                            pub_date = datetime(*entry.published_parsed[:6])
                    except:
                        pass
                    
                    if not pub_date or pub_date > cutoff_time:
                        articles.append({
                            'title': getattr(entry, 'title', ''),
                            'summary': getattr(entry, 'summary', ''),
                            'link': getattr(entry, 'link', ''),
                            'published': pub_date,
                            'source': feed_url,
                            'relevance_score': 1.0
                        })
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.warning(f"Error parsing RSS feed {feed_url}: {e}")
        
        return articles[:50]

class RedditScraper:
    def __init__(self):
        if Config.REDDIT_CLIENT_ID and Config.REDDIT_CLIENT_SECRET:
            try:
                self.reddit = praw.Reddit(
                    client_id=Config.REDDIT_CLIENT_ID,
                    client_secret=Config.REDDIT_CLIENT_SECRET,
                    user_agent=Config.REDDIT_USER_AGENT
                )
                self.reddit.user.me()
            except Exception as e:
                logger.warning(f"Reddit API connection failed: {e}")
                self.reddit = None
        else:
            self.reddit = None
            logger.warning("Reddit API credentials not provided")
    
    async def get_trending_posts(self, limit_per_sub: int = 10) -> List[Dict]:
        if not self.reddit:
            return []
        
        trending_posts = []
        for subreddit_name in Config.SUBREDDITS:
            try:
                subreddit = self.reddit.subreddit(subreddit_name)
                hot_posts = subreddit.hot(limit=limit_per_sub)
                
                for post in hot_posts:
                    if not post.stickied and post.score > 500:
                        trending_posts.append({
                            'id': post.id,
                            'title': post.title,
                            'text': getattr(post, 'selftext', '') or '',
                            'score': post.score,
                            'num_comments': post.num_comments,
                            'created': post.created_utc,
                            'subreddit': subreddit_name,
                            'upvote_ratio': getattr(post, 'upvote_ratio', 0.5)
                        })
                
                await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"Error accessing subreddit {subreddit_name}: {e}")
        
        return sorted(trending_posts, key=lambda p: p['score'], reverse=True)

class DatabaseManager:
    def __init__(self, db_path: str = "prediction_oracle.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS trending_topics (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    summary TEXT,
                    category TEXT,
                    source TEXT,
                    engagement_score REAL,
                    created_at TEXT,
                    keywords TEXT,
                    ai_analysis TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS market_proposals (
                    id TEXT PRIMARY KEY,
                    description TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    category TEXT,
                    resolution_criteria TEXT,
                    ai_probability REAL,
                    ai_confidence REAL,
                    key_factors TEXT,
                    risk_factors TEXT,
                    data_quality_score REAL,
                    status TEXT DEFAULT 'draft',
                    user_id TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS market_sessions (
                    session_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    current_step INTEGER,
                    proposal_data TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
    
    def store_trending_topic(self, topic: TrendingTopic):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO trending_topics 
                (id, title, summary, category, source, engagement_score, created_at, keywords, ai_analysis)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                topic.id,
                topic.title,
                topic.summary,
                topic.category,
                topic.source,
                topic.engagement_score,
                topic.created_at.isoformat(),
                json.dumps(topic.keywords),
                json.dumps(topic.ai_analysis)
            ))
    
    def get_trending_topics(self, limit: int = 20, category: str = None) -> List[TrendingTopic]:
        with sqlite3.connect(self.db_path) as conn:
            query = "SELECT * FROM trending_topics"
            params = []
            if category:
                query += " WHERE category = ?"
                params.append(category)
            query += " ORDER BY engagement_score DESC"
            if limit:
                query += " LIMIT ?"
                params.append(limit)
            
            cursor = conn.execute(query, params)
            topics = []
            for row in cursor.fetchall():
                topics.append(TrendingTopic(
                    id=row[0],
                    title=row[1],
                    summary=row[2] or '',
                    category=row[3] or 'general',
                    source=row[4] or '',
                    engagement_score=row[5] or 0.0,
                    created_at=datetime.fromisoformat(row[6]),
                    keywords=json.loads(row[7]) if row[7] else [],
                    related_articles=[],
                    ai_analysis=json.loads(row[8]) if row[8] else {}
                ))
            return topics

# Simple predictive model for demonstration
class SimplePredictiveModel:
    def __init__(self):
        self.model_ready = False
    
    async def predict_probability(self, description: str, category: str, features: Dict = None) -> Dict[str, Any]:
        """Predict probability and confidence for a market"""
        # This is a simplified version - you'd integrate your ML model here
        
        # Simple rule-based prediction for demo
        desc_lower = description.lower()
        
        # Base probability
        probability = 0.5
        confidence = 0.6
        
        # Adjust based on keywords and patterns
        if any(word in desc_lower for word in ['will', 'likely', 'expected']):
            probability += 0.1
            confidence += 0.1
        
        if any(word in desc_lower for word in ['bitcoin', 'crypto']):
            # Crypto is volatile
            probability = 0.4
            confidence = 0.5
        
        if category == 'politics':
            # Political events often have more uncertainty
            confidence = max(0.4, confidence - 0.1)
        
        # Generate factors
        key_factors = [
            "Historical precedent analysis",
            "Current market sentiment",
            "Expert opinion trends"
        ]
        
        risk_factors = [
            "Unexpected events could change outcome",
            "Limited historical data for this type of event",
            "High volatility in this category"
        ]
        
        return {
            'probability': min(0.95, max(0.05, probability)),
            'confidence': min(0.9, max(0.3, confidence)),
            'key_factors': key_factors[:3],
            'risk_factors': risk_factors[:2],
            'data_quality_score': confidence
        }

class PredictionMarketAPI:
    """Flask API server for the prediction market system"""
    
    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)
        
        # Initialize components
        self.db_manager = DatabaseManager()
        self.ai_assistant = AIMarketAssistant()
        self.trend_analyzer = TrendAnalyzer()
        self.predictive_model = SimplePredictiveModel()
        self.market_workflow = MarketCreationWorkflow(
            self.db_manager, self.ai_assistant, self.predictive_model
        )
        
        # Background task for updating trends
        self.setup_background_tasks()
        
        # Register routes
        self.register_routes()
    
    def setup_background_tasks(self):
        """Setup background tasks for trend analysis"""
        async def update_trends():
            try:
                topics = await self.trend_analyzer.get_trending_topics()
                for topic in topics:
                    self.db_manager.store_trending_topic(topic)
                logger.info(f"Updated {len(topics)} trending topics")
            except Exception as e:
                logger.error(f"Error updating trends: {e}")
        
        # Run trend update every hour
        schedule.every().hour.do(lambda: asyncio.run(update_trends()))
    
    def register_routes(self):
        """Register all API routes"""
        
        @self.app.route('/api/trends', methods=['GET'])
        def get_trends():
            """Get trending topics for market creation"""
            try:
                category = request.args.get('category')
                limit = int(request.args.get('limit', 20))
                
                topics = self.db_manager.get_trending_topics(limit=limit, category=category)
                
                return jsonify({
                    'success': True,
                    'trends': [{
                        'id': topic.id,
                        'title': topic.title,
                        'summary': topic.summary,
                        'category': topic.category,
                        'source': topic.source,
                        'engagement_score': topic.engagement_score,
                        'created_at': topic.created_at.isoformat(),
                        'keywords': topic.keywords,
                        'market_potential': topic.ai_analysis.get('market_potential', 0.5),
                        'suggested_questions': topic.ai_analysis.get('suggested_questions', [])
                    } for topic in topics]
                })
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/market/start', methods=['POST'])
        def start_market_creation():
            """Start market creation workflow"""
            try:
                data = request.json
                user_message = data.get('message', '')
                user_id = data.get('user_id')
                
                result = asyncio.run(
                    self.market_workflow.start_market_creation(user_message, user_id)
                )
                
                return jsonify(result)
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/market/continue', methods=['POST'])
        def continue_market_creation():
            """Continue market creation workflow"""
            try:
                data = request.json
                session_id = data.get('session_id')
                user_response = data.get('response', '')
                
                result = asyncio.run(
                    self.market_workflow.continue_market_creation(session_id, user_response)
                )
                
                return jsonify(result)
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/market/create', methods=['POST'])
        def create_market():
            """Create the final market on blockchain"""
            try:
                data = request.json
                session_id = data.get('session_id')
                
                if session_id not in self.market_workflow.active_sessions:
                    return jsonify({'success': False, 'error': 'Session not found'}), 404
                
                proposal = self.market_workflow.active_sessions[session_id]
                
                # Here you would integrate with your Aptos contract
                # For now, just simulate success
                market_id = f"market_{hash(proposal.description) % 1000000}"
                
                return jsonify({
                    'success': True,
                    'market_id': market_id,
                    'message': 'Market created successfully!',
                    'blockchain_tx': f"0x{hash(proposal.id) % 10**16:016x}"
                })
                
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/market/analyze', methods=['POST'])
        def analyze_market():
            """Get AI analysis for a market description"""
            try:
                data = request.json
                description = data.get('description', '')
                category = data.get('category', 'general')
                
                result = asyncio.run(
                    self.predictive_model.predict_probability(description, category)
                )
                
                return jsonify({
                    'success': True,
                    'analysis': result
                })
                
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/api/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'services': {
                    'database': True,
                    'ai_assistant': Config.OPENAI_API_KEY is not None,
                    'reddit': Config.REDDIT_CLIENT_ID is not None,
                    'news_feeds': len(Config.NEWS_SOURCES) > 0
                }
            })
    
    def run(self, host='0.0.0.0', port=8000, debug=False):
        """Run the Flask server"""
        logger.info(f"Starting Prediction Market API server on {host}:{port}")
        
        # Start background scheduler in a separate thread
        import threading
        def run_scheduler():
            while True:
                schedule.run_pending()
                time.sleep(60)
        
        scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
        scheduler_thread.start()
        
        # Initial trend update
        asyncio.run(self.trend_analyzer.get_trending_topics())
        
        self.app.run(host=host, port=port, debug=debug)

# Main execution
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='AI Prediction Market Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    
    args = parser.parse_args()
    
    # Check required environment variables
    required_vars = ["ADMIN_PRIVATE_KEY", "CONTRACT_ADDRESS"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        exit(1)
    
    # Optional but recommended variables
    if not Config.OPENAI_API_KEY:
        logger.warning("OpenAI API key not provided. Using simpler analysis methods.")
    
    if not (Config.REDDIT_CLIENT_ID and Config.REDDIT_CLIENT_SECRET):
        logger.warning("Reddit API credentials not provided. Reddit trends will be limited.")
    
    # Start the server
    api_server = PredictionMarketAPI()
    api_server.run(host=args.host, port=args.port, debug=args.debug)