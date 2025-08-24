import requests
from bs4 import BeautifulSoup
import json
import os
from datetime import datetime
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Load environment variables
load_dotenv()

# Constants
NEWS_URL = "https://tradingeconomics.com/stream?c=united+states"
DATA_FILE = "last_news.json"
FIRECRAWL_KEY = "fc-81208c70fa434b9bb10973f99c7e3115"
# FIRECRAWL_ID is no longer needed as per new FireCrawl endpoint
# FIRECRAWL_ID = "ca05f10b-a4d5-4266-b858-85ae971a4778"

# According to the documentation example, use this endpoint:
FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1"
FIRECRAWL_SCRAPE_URL = f"{FIRECRAWL_BASE_URL}/scrape"

def get_top_news_item():
    """
    Fetches the page using Selenium and returns the top news item title and URL.
    """
    driver = None
    try:
        print("Setting up Chrome driver...")
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # Use the main news feed URL instead of specific news item
        news_feed_url = "https://tradingeconomics.com/stream?c=united+states"
        print(f"Fetching news feed page: {news_feed_url}")
        driver.get(news_feed_url)
        
        print("Waiting for content to load...")
        wait = WebDriverWait(driver, 20)
        
        news_items = wait.until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, ".te-stream-title"))
        )
        
        if news_items:
            first_news = news_items[0]
            title = first_news.text.strip()
            # Use the news feed URL instead of specific news item URL
            url = news_feed_url
            
            print(f"\nFound news feed with first item: '{title}'")
            print(f"URL: {url}\n")
            return title, url
                
        print("No news items found!")
        return None, None
        
    except Exception as e:
        print(f"Error with Selenium: {e}")
        return None, None
        
    finally:
        if driver:
            driver.quit()

def load_last_news():
    """
    Loads the previously saved news item
    """
    if not os.path.exists(DATA_FILE):
        print(f"No previous data file found ({DATA_FILE})")
        return None, None
        
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            print(f"Last saved news: '{data.get('title')}'")
            return data.get('title'), data.get('url')
    except Exception as e:
        print(f"Error loading last news: {e}")
        return None, None

def save_last_news(title, url):
    """
    Saves the current news item
    """
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            data = {
                'title': title, 
                'url': url,
                'last_checked': datetime.now().isoformat()
            }
            json.dump(data, f, indent=2)
            print("News saved successfully")
    except Exception as e:
        print(f"Error saving news: {e}")

def extract_with_firecrawl(url):
    """
    Extract content using FireCrawl with minimal schema to get raw markdown
    """
    print("\nExtracting content with FireCrawl...")
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_KEY}",
        "Content-Type": "application/json"
    }

    # Simplified payload without schema to get raw content
    payload = {
        "url": url,
        "formats": ["markdown"],  # Get markdown format like in playground
        "waitFor": 2000,
        "timeout": 30000
    }
    
    try:
        print(f"Calling FireCrawl API for URL: {url}")
        print(f"Full API URL: {FIRECRAWL_SCRAPE_URL}")
        
        response = requests.post(FIRECRAWL_SCRAPE_URL, headers=headers, json=payload)
        response.raise_for_status()
        
        structured_data = response.json()
        
        if not structured_data.get('success', False):
            raise Exception(f"FireCrawl API error: {structured_data.get('error', 'Unknown error')}")
        
        print("\n📊 FireCrawl Response Preview:")
        print(json.dumps(structured_data, indent=2)[:500] + "...")
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'economic_news_{timestamp}.json'
        
        with open(filename, 'w') as f:
            json.dump(structured_data, f, indent=2)
            
        print(f"\nExtracted data saved to {filename}")
        return structured_data
        
    except Exception as e:
        print(f"\n❌ Error with FireCrawl extraction: {e}")
        if hasattr(e, 'response'):
            print(f"Response: {e.response.text}")
        return None

def convert_and_save_articles(markdown_data, output_file=None):
    """
    Convert markdown to structured articles and save to JSON file
    """
    try:
        # Parse articles from markdown
        articles = parse_articles_from_markdown(markdown_data)
        
        # Create output structure
        output = {
            "success": True,
            "articles": articles,
            "metadata": {
                "total_articles": len(articles),
                "timestamp": datetime.now().isoformat(),
                "source": "Trading Economics"
            }
        }
        
        # Generate filename with timestamp if not provided
        if not output_file:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_file = f'processed_articles_{timestamp}.json'
        
        # Save to JSON file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2)
            
        print(f"\n✨ Processed {len(articles)} articles")
        print(f"📝 Saved to: {output_file}")
        
        return output
        
    except Exception as e:
        print(f"\n❌ Error converting articles: {e}")
        return None

if __name__ == "__main__":
    print("Initialization:")
    # FIRECRAWL_ID is no longer used but you can keep this print statement or remove it
    print(f"- Data will be stored in: {DATA_FILE}")
    print(f"- Monitoring URL: {NEWS_URL}\n")
    
    print("Starting monitoring process...")
    current_title, current_url = get_top_news_item()
    
    if current_title:
        last_title, last_url = load_last_news()
        if current_title != last_title:
            print("\n🔔 New news item detected!")
            print(f"Previous: {last_title}")
            print(f"Current:  {current_title}")
            
            # Extract content using FireCrawl
            structured_data = extract_with_firecrawl(current_url)
            
            if structured_data:
                save_last_news(current_title, current_url)
                print("\n✅ Successfully processed new economic news")
            else:
                print("\n❌ Failed to extract content")
        else:
            print("\n😴 No new news item detected.")
    else:
        print("\n❌ Failed to fetch current news.")
