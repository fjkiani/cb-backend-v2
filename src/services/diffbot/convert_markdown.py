import json
import os
from datetime import datetime
import glob
import mistune
from typing import List, Dict, Any

class TEArticleRenderer(mistune.HTMLRenderer):
    """Custom renderer for Trading Economics articles"""
    
    def __init__(self):
        super().__init__()
        self.current_article = None
        self.articles = []
        
    def link(self, text: str, url: str, title: str = None) -> str:
        """Handle links which often indicate article titles or categories"""
        if text.startswith('**') and text.endswith('**'):
            # This is an article title
            if self.current_article:
                self.articles.append(self.current_article)
            
            self.current_article = {
                'title': text.strip('*'),
                'url': f"https://tradingeconomics.com{url}",
                'content': '',
                'category': 'Market News',
                'published_at': '',
                'source': 'Trading Economics',
                'author': 'Trading Economics',
                'summary': ''
            }
        elif 'stream?i=' in url:
            # This is a category
            if self.current_article:
                self.current_article['category'] = text.strip('[]').replace('+', ' ')
        
        return ''
    
    def paragraph(self, text: str) -> str:
        """Handle paragraphs which contain the main content"""
        if self.current_article:
            if text.endswith('ago'):
                self.current_article['published_at'] = text.strip()
            elif not text.startswith('[United States]'):
                if self.current_article['content']:
                    self.current_article['content'] += '\n\n'
                self.current_article['content'] += text
        return ''
    
    def get_articles(self) -> List[Dict[str, Any]]:
        """Get all processed articles"""
        if self.current_article:
            self.articles.append(self.current_article)
            
        # Process summaries and clean up
        for article in self.articles:
            article['summary'] = article['content'][:200] if article['content'] else ''
            article['content'] = article['content'].strip()
            
        return self.articles

def convert_markdown_to_articles(markdown_text: str) -> List[Dict[str, Any]]:
    """Convert markdown text to structured articles"""
    # Skip navigation section
    if '- united states\n\n' in markdown_text:
        markdown_text = markdown_text.split('- united states\n\n')[1]
    
    # Create renderer and markdown parser
    renderer = TEArticleRenderer()
    markdown = mistune.create_markdown(renderer=renderer)
    
    # Parse markdown
    markdown(markdown_text)
    
    # Get processed articles
    return renderer.get_articles()

def convert_file(input_file: str) -> bool:
    """Convert a single FireCrawl markdown file to JSON"""
    try:
        print(f"\nProcessing: {input_file}")
        
        # Read the original file
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        if not data.get('success') or 'data' not in data:
            print(f"Invalid file format: {input_file}")
            return False
            
        # Convert markdown to articles
        articles = convert_markdown_to_articles(data['data']['markdown'])
        
        if not articles:
            print(f"No articles found in {input_file}")
            return False
            
        # Create output filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f'processed_articles_{timestamp}.json'
        
        # Save processed articles
        output = {
            "success": True,
            "articles": articles,
            "metadata": {
                "total_articles": len(articles),
                "timestamp": datetime.now().isoformat(),
                "source": "Trading Economics",
                "original_file": os.path.basename(input_file)
            }
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2)
            
        print(f"\n✨ Processed {len(articles)} articles")
        for article in articles[:2]:  # Show first 2 articles
            print(f"\n📰 {article['title']}")
            print(f"   Category: {article['category']}")
            print(f"   Published: {article['published_at']}")
            print(f"   Content: {article['content'][:100]}...")
            
        print(f"\n📝 Saved to: {output_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error processing {input_file}: {e}")
        return False

def main():
    """Process all economic news files in the directory"""
    print("🔍 Looking for economic news files...")
    
    # Find all economic news files
    files = glob.glob('economic_news_*.json')
    files = [f for f in files if not f.endswith('_processed.json')]
    
    if not files:
        print("No economic news files found!")
        return
    
    print(f"Found {len(files)} files to process")
    
    # Process each file
    success_count = 0
    for file in files:
        if convert_file(file):
            success_count += 1
    
    print(f"\n✨ Successfully processed {success_count} of {len(files)} files")

if __name__ == "__main__":
    main()