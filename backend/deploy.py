import os
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
import asyncio

from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
class Config:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

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

class AIMarketAssistant:
    """AI assistant for natural language market creation using Gemini AI"""
    
    def __init__(self):
        self.gemini_client = None
        if Config.GEMINI_API_KEY:
            try:
                genai.configure(api_key=Config.GEMINI_API_KEY)
                self.gemini_client = genai.GenerativeModel('gemini-1.5-pro')
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
                self.gemini_client = None
    
    async def generate_prediction_markets(self, query: str, num_suggestions: int = 3) -> List[MarketSuggestion]:
        """Generate prediction market suggestions based on user query"""
        if not self.gemini_client:
            return self._fallback_suggestions(query)
        
        try:
            current_date = datetime.now().strftime('%Y-%m-%d')
            prompt = f"""
Based on the query: "{query}"
Current date: {current_date}

Generate {num_suggestions} relevant yes/no prediction market suggestions related to this query.
Each market should be specific, measurable, and have a clear resolution timeframe.

For each suggestion, provide:
- title: Concise, engaging title for the market
- question: Clear yes/no question
- description: 1-2 sentence explanation of what the market is about
- context: 2-3 sentences of background context
- resolution_criteria: Detailed criteria for how the market will be resolved, including specific sources
- sources: List of 2-3 reliable source URLs or types (e.g., "Official company announcements", "CoinMarketCap")
- end_date: Future date in DD/MM/YYYY format (1-6 months from now)
- category: Appropriate category (cryptocurrency, stocks, politics, technology, sports, economics, general)
- ai_probability: Estimated probability as float between 0.1-0.9 for YES outcome
- confidence: Confidence in the estimate as float between 0.3-0.8
- sentiment_score: Market sentiment as float between 0-1 (0.5 = neutral)
- key_factors: List of 3-4 key factors that could influence the outcome

Make the markets interesting, specific, and verifiable. Focus on events that will have clear outcomes.

Return as valid JSON array of objects with exactly these keys.
"""
            
            response = await self.gemini_client.generate_content_async(
                prompt,
                generation_config={
                    "temperature": 0.7,
                    "max_output_tokens": 2000,
                    "response_mime_type": "application/json"
                }
            )
            
            content = response.text
            # Clean up the response to ensure it's valid JSON
            content = content.strip()
            if content.startswith('```json'):
                content = content[7:]
            if content.endswith('```'):
                content = content[:-3]
            content = content.strip()
            
            suggestions_data = json.loads(content)
            return [MarketSuggestion(**data) for data in suggestions_data]
            
        except Exception as e:
            logger.error(f"Gemini generation failed: {e}")
            return self._fallback_suggestions(query)
    
    def _fallback_suggestions(self, query: str) -> List[MarketSuggestion]:
        """Fallback suggestions when Gemini fails"""
        end_date = (datetime.now() + timedelta(days=60)).strftime('%d/%m/%Y')
        
        suggestion = MarketSuggestion(
            title=f"Prediction market: {query}",
            question=f"Will {query} happen by {end_date}?",
            description=f"A prediction market about whether {query} will occur.",
            context=f"This market allows users to predict the likelihood of {query} happening within the specified timeframe.",
            resolution_criteria=f"This market will resolve to YES if {query} occurs as described, based on reliable news sources and official announcements.",
            sources=["Major news outlets", "Official announcements"],
            end_date=end_date,
            category="general",
            ai_probability=0.5,
            confidence=0.4,
            sentiment_score=0.5,
            key_factors=["Market conditions", "Public interest", "External factors"]
        )
        
        return [suggestion]

class SimplifiedPredictionAPI:
    """Simplified Flask API server that forwards queries to Gemini AI"""
    
    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)
        self.ai_assistant = AIMarketAssistant()
        self.register_routes()
    
    def register_routes(self):
        """Register all API routes"""
        
        @self.app.route('/api/predict', methods=['POST'])
        def generate_prediction_markets():
            """Main endpoint: forward query to Gemini and return prediction markets"""
            try:
                data = request.json
                query = data.get('query', '')
                num_suggestions = data.get('num_suggestions', 3)
                
                if not query:
                    return jsonify({
                        'success': False, 
                        'error': 'Query is required'
                    }), 400
                
                # Forward to Gemini and get suggestions
                suggestions = asyncio.run(
                    self.ai_assistant.generate_prediction_markets(query, num_suggestions)
                )
                
                return jsonify({
                    'success': True,
                    'query': query,
                    'prediction_markets': [asdict(s) for s in suggestions],
                    'count': len(suggestions)
                })
                
            except Exception as e:
                logger.error(f"Error generating prediction markets: {e}")
                return jsonify({
                    'success': False, 
                    'error': f'Server error: {str(e)}'
                }), 500
        
        @self.app.route('/api/market/search-suggestions', methods=['POST'])
        def get_market_suggestions():
            """Alternative endpoint name for market suggestions"""
            return generate_prediction_markets()
        
        @self.app.route('/api/market/analyze', methods=['POST'])
        def analyze_market():
            """Analyze a specific market description"""
            try:
                data = request.json
                description = data.get('description', '')
                
                if not description:
                    return jsonify({
                        'success': False, 
                        'error': 'Description is required'
                    }), 400
                
                # Get analysis from Gemini
                suggestions = asyncio.run(
                    self.ai_assistant.generate_prediction_markets(f"Analyze this prediction: {description}", 1)
                )
                
                if suggestions:
                    suggestion = suggestions[0]
                    return jsonify({
                        'success': True,
                        'analysis': {
                            'probability': f"{suggestion.ai_probability:.1%}",
                            'confidence': f"{suggestion.confidence:.1%}",
                            'sentiment_score': suggestion.sentiment_score,
                            'key_factors': suggestion.key_factors,
                            'resolution_criteria': suggestion.resolution_criteria
                        }
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Failed to analyze market'
                    }), 500
                    
            except Exception as e:
                return jsonify({
                    'success': False, 
                    'error': str(e)
                }), 500
        
        @self.app.route('/api/market/quick-prediction', methods=['POST'])
        def quick_prediction():
            """Get a quick yes/no prediction for a query"""
            try:
                data = request.json
                query = data.get('query', '')
                
                if not query:
                    return jsonify({
                        'success': False, 
                        'error': 'Query is required'
                    }), 400
                
                suggestions = asyncio.run(
                    self.ai_assistant.generate_prediction_markets(query, 1)
                )
                
                if suggestions:
                    suggestion = suggestions[0]
                    probability = suggestion.ai_probability
                    
                    if probability > 0.7:
                        answer = f"Likely YES ({probability:.1%} probability)"
                    elif probability < 0.3:
                        answer = f"Likely NO ({(1-probability):.1%} probability against)"
                    else:
                        answer = f"Uncertain ({probability:.1%} probability)"
                    
                    return jsonify({
                        'success': True,
                        'query': query,
                        'answer': answer,
                        'probability': f"{probability:.1%}",
                        'confidence': f"{suggestion.confidence:.1%}",
                        'factors': suggestion.key_factors,
                        'market_suggestion': asdict(suggestion)
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Failed to generate prediction'
                    }), 500
                    
            except Exception as e:
                return jsonify({
                    'success': False, 
                    'error': str(e)
                }), 500
        
        @self.app.route('/api/trends', methods=['GET'])
        def get_trends():
            """Get some example trending topics (simplified version)"""
            try:
                # Simple hardcoded trending topics for demo
                trends = [
                    {
                        'id': 'trend_1',
                        'title': 'Bitcoin price movements',
                        'summary': 'Recent discussions about Bitcoin reaching new price targets',
                        'category': 'cryptocurrency',
                        'source': 'General',
                        'engagement_score': 85.0,
                        'market_potential': 0.8,
                        'suggested_questions': ['Will Bitcoin reach $150,000 by end of 2025?']
                    },
                    {
                        'id': 'trend_2', 
                        'title': 'AI technology developments',
                        'summary': 'Latest developments in artificial intelligence',
                        'category': 'technology',
                        'source': 'General',
                        'engagement_score': 75.0,
                        'market_potential': 0.7,
                        'suggested_questions': ['Will AGI be achieved by 2030?']
                    }
                ]
                
                return jsonify({
                    'success': True,
                    'trends': trends
                })
                
            except Exception as e:
                return jsonify({
                    'success': False, 
                    'error': str(e)
                }), 500
        
        @self.app.route('/api/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'services': {
                    'gemini': Config.GEMINI_API_KEY is not None,
                    'api': True
                },
                'message': 'Prediction Markets Server - Forward queries to Gemini AI'
            })
        
        @self.app.route('/api/debug/gemini', methods=['GET'])
        def debug_gemini():
            """Debug endpoint to test Gemini connection"""
            try:
                if not self.ai_assistant.gemini_client:
                    return jsonify({
                        'success': False,
                        'error': 'Gemini client not initialized',
                        'api_key_set': bool(Config.GEMINI_API_KEY),
                        'api_key_length': len(Config.GEMINI_API_KEY) if Config.GEMINI_API_KEY else 0
                    })
                
                # Test simple Gemini call
                test_response = asyncio.run(
                    self.ai_assistant.gemini_client.generate_content_async(
                        "Say 'Gemini connection working'",
                        generation_config={"max_output_tokens": 10}
                    )
                )
                
                return jsonify({
                    'success': True,
                    'message': 'Gemini connection working',
                    'response': test_response.text,
                    'model': 'gemini-1.5-pro'
                })
                
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': str(e),
                    'error_type': type(e).__name__
                })
        
        @self.app.route('/', methods=['GET'])
        def home():
            """Home endpoint with usage instructions"""
            return jsonify({
                'message': 'Prediction Markets Server',
                'description': 'Forward queries to Gemini AI for yes/no prediction markets',
                'endpoints': {
                    '/api/predict': 'POST - Main endpoint for generating prediction markets',
                    '/api/market/quick-prediction': 'POST - Get quick yes/no prediction',
                    '/api/market/analyze': 'POST - Analyze market description', 
                    '/api/health': 'GET - Health check',
                    '/api/debug/gemini': 'GET - Test Gemini connection'
                },
                'usage': {
                    'url': '/api/predict',
                    'method': 'POST',
                    'body': {
                        'query': 'your prediction query here',
                        'num_suggestions': 3
                    }
                },
                'example_queries': [
                    'Will Bitcoin reach $200,000 by end of 2025?',
                    'artificial intelligence developments',
                    'Will the next US election have record turnout?'
                ]
            })
    
    def run(self, host='0.0.0.0', port=8000, debug=False):
        """Run the Flask server"""
        logger.info(f"Starting Prediction Markets Server on {host}:{port}")
        logger.info(f"Gemini Integration: {'✓' if Config.GEMINI_API_KEY else '✗'}")
        
        if not Config.GEMINI_API_KEY:
            logger.warning("Gemini API key not found! Set GEMINI_API_KEY environment variable")
        
        self.app.run(host=host, port=port, debug=debug)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Simplified Prediction Markets Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind to')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    
    args = parser.parse_args()
    
    if not Config.GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY environment variable is required!")
        logger.info("Set it with: export GEMINI_API_KEY='your-gemini-api-key'")
        exit(1)
    
    api_server = SimplifiedPredictionAPI()
    api_server.run(host=args.host, port=args.port, debug=args.debug)