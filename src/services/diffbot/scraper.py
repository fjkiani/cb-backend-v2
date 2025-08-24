import requests
from bs4 import BeautifulSoup
import json
import os
from datetime import datetime
import redis
import time
import sys

# Load environment variables from system environment (works in all environments)
# No need to load from specific .env file path - environment variables should be set in deployment
DIFFBOT_TOKEN = os.getenv('DIFFBOT_TOKEN') or os.getenv('VITE_DIFFBOT_TOKEN')

# Constants
NEWS_URL = "https://tradingeconomics.com/stream?c=united+states"
# Use Redis for state management instead of local files
DATA_KEY = "trading_economics_last_news"
DIFFBOT_URL = f"https://api.diffbot.com/v3/analyze?token={DIFFBOT_TOKEN}"

# Add token check
if not DIFFBOT_TOKEN:
    print(json.dumps({
        'success': False,
        'error': 'DIFFBOT_TOKEN not found in environment variables'
    }))
    sys.exit(1)

print(json.dumps({
    'status': 'startup',
    'diffbot_token_present': bool(DIFFBOT_TOKEN),
    'token_prefix': DIFFBOT_TOKEN[:10] if DIFFBOT_TOKEN else None
}))

def get_top_news_item():
    """
    Fetches the page using Selenium and returns the top news item title and URL.
    """
    driver = None
    try:
        print(json.dumps({'status': 'selenium_setup_start'}))
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        print(json.dumps({'status': 'fetching_page', 'url': NEWS_URL}))
        driver.get(NEWS_URL)
        
        wait = WebDriverWait(driver, 20)
        news_items = wait.until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".te-stream-title"))
        )
        
        if news_items:
            first_news = news_items[0]
            title = first_news.text.strip()
            url = first_news.get_attribute("href")
            
            print(json.dumps({
                'status': 'found_news',
                'title': title,
                'url': url
            }))
            return title, url
                
        print(json.dumps({'status': 'no_news_found'}))
        return None, None
        
    except Exception as e:
        print(json.dumps({
            'status': 'selenium_error',
            'error': str(e)
        }))
        return None, None
        
    finally:
        if driver:
            driver.quit()

def get_redis_client():
    """Get Redis client for state management"""
    redis_url = os.getenv('REDIS_URL')
    if not redis_url:
        print(json.dumps({
            'status': 'redis_error',
            'error': 'REDIS_URL not found in environment variables'
        }))
        return None

    try:
        # Parse Redis URL
        if redis_url.startswith('redis://'):
            # Extract host, port, password from URL
            # Format: redis://default:password@host:port
            parts = redis_url.replace('redis://', '').split('@')
            if len(parts) == 2:
                auth_part = parts[0]
                host_part = parts[1]

                if ':' in auth_part:
                    password = auth_part.split(':')[1]
                else:
                    password = auth_part

                if ':' in host_part:
                    host, port = host_part.split(':')
                    port = int(port)
                else:
                    host = host_part
                    port = 6379

                return redis.Redis(host=host, port=port, password=password, decode_responses=True)
            else:
                return redis.from_url(redis_url, decode_responses=True)
        else:
            return redis.from_url(redis_url, decode_responses=True)
    except Exception as e:
        print(json.dumps({
            'status': 'redis_connection_error',
            'error': str(e)
        }))
        return None

def load_last_news():
    """
    Loads the previously saved news item from Redis
    """
    try:
        r = get_redis_client()
        if not r:
            return None, None

        data = r.get(DATA_KEY)
        if not data:
            print(json.dumps({
                'status': 'no_previous_data_redis',
                'key': DATA_KEY
            }))
            return None, None

        news_data = json.loads(data)
        print(json.dumps({
            'status': 'loaded_last_news_redis',
            'title': news_data.get('title'),
            'timestamp': news_data.get('last_checked')
        }))
        return news_data.get('title'), news_data.get('url')
    except Exception as e:
        print(json.dumps({
            'status': 'load_error_redis',
            'error': str(e)
        }))
        return None, None

def save_last_news(title, url):
    """
    Saves the current news item to Redis
    """
    try:
        r = get_redis_client()
        if not r:
            return

        data = {
            'title': title,
            'url': url,
            'last_checked': datetime.now().isoformat()
        }

        r.set(DATA_KEY, json.dumps(data))
        print(json.dumps({
            'status': 'saved_news_redis',
            'data': data
        }))
    except Exception as e:
        print(json.dumps({
            'status': 'save_error',
            'error': str(e)
        }))

def process_with_diffbot(url, title):
    print(json.dumps({
        'status': 'diffbot_start',
        'url': url,
        'title': title
    }))
    
    try:
        # For index URLs, create an article from the title and market data
        if 'indu:ind' in url or 'spx:ind' in url:
            current_time = datetime.now()
            # Ensure we don't use future dates
            if current_time.year > 2024:
                current_time = current_time.replace(year=2024)
            processed_article = [{
                'date': current_time.isoformat(),
                'sentiment': 0,
                'author': 'Trading Economics',
                'text': f"Market Update: {title}. For detailed data, visit: {url}",
                'title': title,
                'url': url
            }]
            
            print(json.dumps({
                'status': 'processed_market_update',
                'article': processed_article[0]
            }))
            return processed_article
            
        # For other URLs, process with Diffbot
        diffbot_url = f"{DIFFBOT_URL}&url={url}"
        print(json.dumps({
            'status': 'calling_diffbot',
            'api_url': diffbot_url
        }))
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        
        diffbot_response = requests.get(diffbot_url, headers=headers, timeout=30)
        diffbot_response.raise_for_status()
        
        structured_data = diffbot_response.json()
        print(json.dumps({
            'status': 'diffbot_response',
            'has_objects': bool(structured_data.get('objects')),
            'object_count': len(structured_data.get('objects', []))
        }))
        
        if structured_data.get('objects'):
            article = structured_data['objects'][0]
            
            processed_article = [{
                'date': article.get('estimatedDate') or article.get('date') or datetime.now().isoformat(),
                'sentiment': article.get('sentiment', 0),
                'author': article.get('author') or 'Trading Economics',
                'text': article.get('text') or title,
                'title': article.get('title') or title,
                'url': url
            }]
            
            print(json.dumps({
                'status': 'processed_article',
                'article': processed_article[0]
            }))
            return processed_article
            
        print(json.dumps({'status': 'no_article_data'}))
        return None
            
    except Exception as e:
        print(json.dumps({
            'status': 'diffbot_error',
            'error': str(e),
            'response_status': getattr(diffbot_response, 'status_code', None) if 'diffbot_response' in locals() else None
        }))
        return None

def main():
    try:
        print(json.dumps({'status': 'process_start'}))
        
        # Load last processed news
        last_title, last_url = load_last_news()
        
        # Get current news
        current_title, current_url = get_top_news_item()
        
        if not current_title or not current_url:
            print(json.dumps({
                'success': False,
                'error': 'Failed to fetch current news'
            }))
            return

        # Compare with last processed
        if last_title == current_title:
            print(json.dumps({
                'success': True,
                'status': 'no_new_content',
                'last_title': last_title,
                'current_title': current_title
            }))
            return

        # Process new content with Diffbot
        articles = process_with_diffbot(current_url, current_title)
        if articles:
            # Save as last processed
            save_last_news(current_title, current_url)
            
            result = {
                'success': True,
                'articles': articles,
                'metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'source_url': current_url,
                    'title': current_title,
                    'previous_title': last_title
                }
            }
            print(json.dumps(result))
        else:
            print(json.dumps({
                'success': False,
                'error': 'Failed to process articles'
            }))

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))

if __name__ == "__main__":
    main()