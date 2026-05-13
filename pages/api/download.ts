import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, inline } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing download ID' });

  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const inlineParam = inline ? '&inline=true' : '';
    const redirectUrl = `${backendUrl}/api/download?id=${encodeURIComponent(id as string)}${inlineParam}`;
    res.redirect(302, redirectUrl);
  } catch (error) {
    console.error('Download redirect error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
}
