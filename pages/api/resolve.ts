import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

const backendUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://terastream-backend-production-dd26.up.railway.app';
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${backendUrl}/api/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY || '',
      },
      body: JSON.stringify({ url: url.trim() }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || 'Request failed',
        message: data.message || 'Unable to process this link.',
      });
    }

    return res.status(200).json(data);

  } catch (error: any) {
    console.error('Resolve proxy error:', error?.message);

    if (
      error?.name === 'AbortError' ||
      error?.code === 'ECONNREFUSED' ||
      error?.cause?.code === 'ECONNREFUSED'
    ) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'The streaming service is temporarily unavailable. Please try again in a moment.',
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong. Please try again.',
    });
  }
}