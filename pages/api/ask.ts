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

    for (const m of candidateModels) {
      tried.push(m);
      try {
        const attempt = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: m,
            messages: chatMessages,
            stream: true,
            max_tokens: 220,
            temperature: 0.8,
          }),
        });
        if (attempt.ok && attempt.body) {
          response = attempt;
          chosenModel = m;
          break;
        } else {
          lastError = new Error(`Model ${m} failed: ${attempt.status} ${attempt.statusText}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!response || !chosenModel) {
      console.error('All model attempts failed', { tried, lastError });
      return res.status(502).json({ error: 'Upstream model failure', tried, detail: lastError instanceof Error ? lastError.message : String(lastError) });
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
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
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