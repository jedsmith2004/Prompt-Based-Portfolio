import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing Instagram URL' });
  }

  const results = {
    url,
    legacy: null as any,
    graph: null as any,
    recommendation: ''
  };

  // Test 1: Legacy Instagram oEmbed (no auth required)
  try {
    const legacyUrl = new URL('https://www.instagram.com/oembed/');
    legacyUrl.searchParams.set('url', url);
    legacyUrl.searchParams.set('omitscript', 'true');

    const legacyResponse = await fetch(legacyUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const legacyText = await legacyResponse.text();
    let legacyJson = null;
    
    if (legacyResponse.headers.get('content-type')?.includes('application/json')) {
      try {
        legacyJson = JSON.parse(legacyText);
      } catch (e) {
        // Could not parse JSON
      }
    }

    results.legacy = {
      endpoint: legacyUrl.toString(),
      status: legacyResponse.status,
      contentType: legacyResponse.headers.get('content-type'),
      response: legacyJson,
      rawResponse: legacyText.substring(0, 500),
      hasThumbail: legacyJson?.thumbnail_url ? true : false,
      thumbnailUrl: legacyJson?.thumbnail_url || null
    };
  } catch (e: any) {
    results.legacy = { error: e.message };
  }

  // Test 2: Graph API (requires app ID)
  try {
    const graphUrl = new URL('https://graph.facebook.com/v17.0/instagram_oembed');
    graphUrl.searchParams.set('url', url);
    graphUrl.searchParams.set('omitscript', 'true');

    const graphResponse = await fetch(graphUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    const graphText = await graphResponse.text();
    let graphJson = null;
    
    try {
      graphJson = JSON.parse(graphText);
    } catch (e) {
      // Could not parse JSON
    }

    results.graph = {
      endpoint: graphUrl.toString(),
      status: graphResponse.status,
      contentType: graphResponse.headers.get('content-type'),
      response: graphJson,
      needsAuth: graphJson?.error?.code === 200,
      errorMessage: graphJson?.error?.message || null
    };
  } catch (e: any) {
    results.graph = { error: e.message };
  }

  // Recommendation
  if (results.legacy?.hasThumbail) {
    results.recommendation = "✅ Use legacy oEmbed API - no auth needed, thumbnail available!";
  } else if (results.legacy?.status === 200) {
    results.recommendation = "⚠️ Legacy API works but no thumbnail - might need to scrape Instagram page";
  } else if (results.graph?.needsAuth) {
    results.recommendation = "❌ Graph API needs Facebook App ID - legacy API failed too";
  } else {
    results.recommendation = "❌ Both APIs failed - might need different approach";
  }

  return res.status(200).json(results);
}