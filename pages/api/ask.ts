import { NextApiRequest, NextApiResponse } from 'next';
import { loadContext, createSystemPrompt } from '../../lib/ai-utils';

// Using Node.js runtime to support file system operations

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const context = loadContext();
    const systemPrompt = createSystemPrompt(context);

    // Normalize & trim history (optional)
    const MAX_HISTORY_MESSAGES = 14; // slight increase for better continuity
    let normalizedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(history)) {
      normalizedHistory = history
        .filter(h => h && typeof h.role === 'string' && typeof h.content === 'string' && h.content.trim().length > 0)
        .map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content.slice(0, 6000) }));
      if (normalizedHistory.length > MAX_HISTORY_MESSAGES) {
        normalizedHistory = normalizedHistory.slice(-MAX_HISTORY_MESSAGES);
      }
    }

    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Groq API key not configured' });
    }

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...normalizedHistory,
      { role: 'user', content: message }
    ];

    // Model fallback chain (prefer OSS ~20B-class effective model first)
    const fallbackChain = [
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
      'llama-3.1-8b-instant'
    ];
    const explicit = process.env.GROQ_MODEL ? [process.env.GROQ_MODEL] : [];
    const dedup: Record<string, true> = {};
    const candidateModels: string[] = [];
    [...explicit, ...fallbackChain].forEach(m => { if (!dedup[m]) { dedup[m] = true; candidateModels.push(m); } });

    const tried: string[] = [];
    let chosenModel: string | null = null;
    let response: Response | null = null;
    let lastError: any = null;

    // Helper to wait with exponential backoff
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (const m of candidateModels) {
      tried.push(m);
      
      // Only retry once for rate limits, then move to next model quickly
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // Build request body - different params for reasoning models
          const isReasoningModel = m.includes('gpt-oss') || m.includes('deepseek-r1');
          const requestBody: Record<string, unknown> = {
            model: m,
            messages: chatMessages,
            stream: true,
          };

          if (isReasoningModel) {
            // Reasoning models use max_completion_tokens and reasoning_effort
            requestBody.max_completion_tokens = 2048;
            requestBody.temperature = 1;
            requestBody.top_p = 1;
            requestBody.reasoning_effort = 'medium';
          } else {
            // Standard models use max_tokens
            requestBody.max_tokens = 1024;
            requestBody.temperature = 0.7;
          }

          const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          
          if (apiResponse.ok && apiResponse.body) {
            response = apiResponse;
            chosenModel = m;
            break;
          } else if (apiResponse.status === 429) {
            // Rate limited - short wait then try next model (don't hang)
            const waitTime = attempt === 0 ? 1500 : 0; // Only wait 1.5s on first attempt, then skip
            if (waitTime > 0) {
              console.log(`Rate limited on ${m}, waiting ${waitTime}ms then trying next model`);
              await wait(waitTime);
            }
            lastError = new Error(`Model ${m} rate limited: 429 Too Many Requests`);
            break; // Move to next model quickly
          } else {
            lastError = new Error(`Model ${m} failed: ${apiResponse.status} ${apiResponse.statusText}`);
            break; // Try next model
          }
        } catch (err) {
          lastError = err;
          break; // Try next model on network errors
        }
      }
      
      if (response && chosenModel) break; // Success, exit model loop
    }

    if (!response || !chosenModel) {
      console.error('All model attempts failed', { tried, lastError });
      const isRateLimit = lastError?.message?.includes('429') || lastError?.message?.includes('rate limit');
      return res.status(isRateLimit ? 429 : 502).json({ 
        error: isRateLimit ? 'Rate limit reached - please wait a moment and try again' : 'Upstream model failure', 
        tried, 
        detail: lastError instanceof Error ? lastError.message : String(lastError) 
      });
    }

    res.setHeader('X-Model-Used', chosenModel);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    // Helper to decode HTML entities that models sometimes output
    const decodeHtmlEntities = (text: string): string => {
      return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&nbsp;/g, ' ');
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.end();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              let content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                // Clean HTML entities from model output
                content = decodeHtmlEntities(content);
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
    }

    res.end();

  } catch (error) {
    console.error('API Error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      apiKey: process.env.GROQ_API_KEY ? 'Present' : 'Missing'
    });
    
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}