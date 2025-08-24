import axios from 'axios';
import logger from '../../logger.js';

export class CohereService {
  constructor() {
    this.apiKey = process.env.COHERE_API_KEY;
    if (!this.apiKey) {
      logger.error('No Cohere API key found');
      throw new Error('Cohere API key is required');
    }
    logger.info('CohereService initialized with API key');
    this.cohereApiUrl = 'https://api.cohere.ai/v1/generate';
    this.cohereVersion = '2022-12-06';
    this.model = 'command'; // Or choose another appropriate model
  }

  async analyzeArticle({ title, content, classification }) {
    try {
      logger.info('Analyzing article with Cohere:', { title });

      const response = await axios.post(this.cohereApiUrl, {
        model: this.model,
        prompt: this.buildAnalysisPrompt(title, content, classification),
        max_tokens: 1000,
        temperature: 0.2,
        k: 0,
        stop_sequences: [],
        return_likelihoods: 'NONE'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Cohere-Version': this.cohereVersion
        }
      });

      const rawText = response.data.generations[0].text.trim();
      
      // Clean up common JSON issues
      const cleanedText = rawText
        .replace(/,(\s*})/g, '$1')  // Remove trailing commas
        .replace(/,(\s*])/g, '$1')  // Remove trailing commas in arrays
        .replace(/\n/g, '')         // Remove newlines
        .match(/\{.*\}/s)?.[0];     // Extract JSON object
      
      if (!cleanedText) {
        logger.error('No valid JSON found in analysis response:', { rawText });
        throw new Error('No valid JSON found in Cohere analysis response');
      }

      try {
        const analysis = JSON.parse(cleanedText);
        
        // Validate required fields
        if (!analysis.summary || !analysis.marketImpact) {
          throw new Error('Missing required fields in analysis');
        }

        logger.info('Cohere analysis completed:', { 
          title,
          summary: analysis.summary?.substring(0, 100)
        });
        
        return analysis;
      } catch (parseError) {
        logger.error('Failed to parse Cohere analysis response:', {
          error: parseError.message,
          rawText: cleanedText
        });
        throw new Error('Invalid JSON response from Cohere');
      }
    } catch (error) {
      // Log concise error info
      logger.error('Cohere analysis failed:', {
        message: error.message,
        status: error.response?.status,
        title: title // Keep title for context
      });
      throw error; // Re-throw original error
    }
  }

  buildAnalysisPrompt(title, content, classification) {
    return `You are a financial news analyst. Analyze this article and provide a structured analysis.

      Article Title: ${title}
      Article Content: ${content}
      Classification: ${JSON.stringify(classification)}

      Provide a concise analysis in this exact JSON format without any additional text or explanation:
      {
        "summary": "2-3 sentence summary",
        "marketImpact": {
          "immediate": "1 sentence on immediate impact",
          "longTerm": "1 sentence on long-term view",
          "affectedSectors": ["sector1", "sector2"]
        },
        "keyPoints": [
          "key point 1",
          "key point 2"
        ],
        "relatedIndicators": [
          "indicator1",
          "indicator2"
        ]
      }`;
  }

  async triageArticleTitles(articles) {
    if (!articles || articles.length === 0) {
      logger.warn('Triage requested with empty article list.');
      return { keyArticleUrls: [], initialThemes: 'No articles provided for triage.' };
    }
    
    logger.info(`Performing title triage with Cohere for ${articles.length} articles.`);

    let prompt; // Declare prompt outside try block
    try {
      prompt = this.buildTriagePrompt(articles);
      // Log the prompt before sending to Cohere
      logger.debug('Built Cohere Triage Prompt:', { promptStart: prompt.substring(0, 200) + '...', promptLength: prompt.length });
      
      const response = await axios.post(this.cohereApiUrl, {
        model: this.model,
        prompt: prompt,
        max_tokens: 500, // Adjusted max_tokens for triage task
        temperature: 0.3, // Slightly higher temp for broader theme identification
        k: 0,
        stop_sequences: [],
        return_likelihoods: 'NONE'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Cohere-Version': this.cohereVersion
        }
      });

      const rawText = response.data.generations[0].text.trim();
      logger.debug('Raw Cohere triage response:', { rawText });

      // Attempt to parse the expected JSON structure
      const cleanedText = rawText.match(/\{.*\}/s)?.[0];
      if (!cleanedText) {
        logger.error('No valid JSON found in triage response:', { rawText });
        throw new Error('No valid JSON found in Cohere triage response');
      }

      try {
        const triageResult = JSON.parse(cleanedText);
        
        // Basic validation
        if (!Array.isArray(triageResult.keyArticleUrls) || typeof triageResult.initialThemes !== 'string') {
           throw new Error('Invalid structure in triage JSON response');
        }

        logger.info('Cohere title triage successful.', {
           keyUrlCount: triageResult.keyArticleUrls.length,
           themeSnippet: triageResult.initialThemes.substring(0, 100)
        });

        // Return the structured result
        return {
           keyArticleUrls: triageResult.keyArticleUrls,
           initialThemes: triageResult.initialThemes
        };
      } catch (parseError) {
        logger.error('Failed to parse Cohere triage response:', {
          error: parseError.message,
          cleanedText: cleanedText
        });
        throw new Error('Invalid JSON response from Cohere triage');
      }

    } catch (error) {
      // Log concise error info
      logger.error('Cohere title triage failed:', {
        message: error.message || 'Unknown error during triage',
        status: error.response?.status,
        // Log prompt length for context, but not the full prompt
        failedPromptLength: prompt?.length,
        // Attempt to log specific error data if available
        cohereErrorMessage: error.response?.data?.message || error.response?.data 
      });
      // Return a default structure on failure to avoid crashing the overview process
      return { keyArticleUrls: [], initialThemes: 'Error during title triage.' };
    }
  }

  buildTriagePrompt(articles) {
    // Create a numbered list of titles and URLs
    const articleListText = articles.map((article, index) => 
      `${index + 1}. Title: ${article.title}\n   URL: ${article.url}`
    ).join('\n\n');

    return `You are a financial news analyst assistant. Review the following list of recent news article titles and their URLs.

Article List:
${articleListText}

Instructions:
1. Identify the top 3-5 most significant articles based *only* on their titles that are most likely to have a notable impact on the financial markets (e.g., major economic reports, significant company news, geopolitical events affecting markets).
2. Provide a brief (1-2 sentence) high-level summary of the overall themes or topics covered by the entire list of headlines.

Provide your response in this exact JSON format, ensuring the URLs are extracted correctly from the list above. Do not include any explanations outside the JSON structure:
{
  "keyArticleUrls": [
    "URL of first key article",
    "URL of second key article",
    // ... up to 5 URLs
  ],
  "initialThemes": "Your 1-2 sentence summary of overall themes here."
}`;
  }

  // --- New Method for Synthesis ---
  async synthesizeOverview(initialThemes, detailedSummaries) {
    logger.info('Synthesizing market overview with Cohere.');
    
    // Check if there are any summaries to synthesize
    const summaryEntries = Object.entries(detailedSummaries).filter(([url, summary]) => 
        summary && !summary.startsWith('Summary unavailable') && !summary.startsWith('Error'));

    if (summaryEntries.length === 0 && !initialThemes) {
        logger.warn('No themes or summaries available for synthesis.');
        return 'Unable to generate market overview: No input data provided.';
    }
    
    try {
      const prompt = this.buildSynthesisPrompt(initialThemes, detailedSummaries);
      
      const response = await axios.post(this.cohereApiUrl, {
        model: this.model,
        prompt: prompt,
        max_tokens: 750, // Allow more tokens for the final overview
        temperature: 0.4, // Slightly more creative temperature
        k: 0,
        stop_sequences: [],
        return_likelihoods: 'NONE'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Cohere-Version': this.cohereVersion
        }
      });

      // Extract the generated text directly
      const synthesis = response.data.generations[0].text.trim();
      logger.info('Cohere market overview synthesis successful.');
      return synthesis;

    } catch (error) {
      // Log concise error info
      logger.error('Cohere synthesis failed:', {
        message: error.message,
        status: error.response?.status,
        // Attempt to log specific error data if available
        cohereErrorMessage: error.response?.data?.message || error.response?.data
      });
      return 'Error generating market overview.'; // Return error message
    }
  }

  buildSynthesisPrompt(initialThemes, detailedSummaries) {
    let summaryContext = 'No detailed summaries available.';
    
    // Filter for valid summaries (already done in the route handler, but good practice)
    const validSummaries = Object.entries(detailedSummaries).filter(([url, summary]) => 
        summary && !summary.startsWith('Summary unavailable') && !summary.startsWith('Error'));

    if (validSummaries.length > 0) {
      summaryContext = validSummaries.map(([url, summary], index) => 
        // Use a more descriptive title, maybe remove URL for cleaner context?
        `Summary ${index + 1}:\n${summary}`
      ).join('\n\n---\n\n');
    }

    // Updated Prompt
    return `You are a financial news analyst writing a concise market overview based *only* on the provided context.

Provided Context:
1. Initial Themes from Headlines: ${initialThemes || 'Not available.'}
2. Collection of Article Summaries:
---
${summaryContext}
---

Task: Synthesize the information from the initial themes and the collection of article summaries into a coherent market overview (approx. 5-7 sentences). 
Focus on:
- Key economic data releases and figures mentioned (e.g., PPI, inflation expectations, percentages).
- Major market movements or events discussed.
- Overall sentiment trends (e.g., recession fears, trade tensions, earnings outlook).
- Any significant upcoming events mentioned.

Do not introduce outside knowledge. Present the overview as a single block of text.

Market Overview:`;
  }
  // --- End New Method ---
}

export default CohereService; 