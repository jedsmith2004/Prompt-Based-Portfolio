import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const groqKey = process.env.GROQ_API_KEY;
  
  return res.json({
    groqKeyExists: !!groqKey,
    groqKeyLength: groqKey ? groqKey.length : 0,
    groqKeyPrefix: groqKey ? groqKey.substring(0, 8) + '...' : 'Not found',
    allEnvVars: Object.keys(process.env).filter(key => key.includes('GROQ'))
  });
}
