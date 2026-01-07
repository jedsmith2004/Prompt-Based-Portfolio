import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing Instagram URL' });
  }

  try {
    // For now, let's try the legacy Instagram oEmbed endpoint
    const oembedUrl = new URL('https://www.instagram.com/oembed/');
    oembedUrl.searchParams.set('url', url);
    oembedUrl.searchParams.set('omitscript', 'true');

    const response = await fetch(oembedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
      },
    });

    if (!response.ok) {
      // If oEmbed fails, return a fallback response that will trigger direct embedding
      return res.status(200).json({
        html: null,
        thumbnail_url: null,
        title: 'Instagram Reel',
        author_name: '5001km.sidequest',
        provider_name: 'Instagram',
        type: 'rich',
        version: '1.0',
        fallback: true,
        original_url: url
      });
    }

    const data = await response.json();
    
    // Cache the response briefly
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    return res.status(200).json(data);

  } catch (error: any) {
    console.error('Error fetching Instagram oEmbed:', error);
    
    // Return fallback response for direct embedding
    return res.status(200).json({
      html: null,
      thumbnail_url: null,
      title: 'Instagram Reel',
      author_name: '5001km.sidequest',
      provider_name: 'Instagram',
      type: 'rich',
      version: '1.0',
      fallback: true,
      original_url: url as string,
      error: error.message
    });
  }
}