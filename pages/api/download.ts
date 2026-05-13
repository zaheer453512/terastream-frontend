import type { NextApiRequest, NextApiResponse } from 'next';

// Disable default body parser — we are streaming
export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, inline } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing download ID' });
  }

  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    'https://terastream-backend-production-dd26.up.railway.app';

  // Forward range header from browser so seeking / partial content works
  const rangeHeader = req.headers['range'];

  const upstreamHeaders: Record<string, string> = {
    'x-internal-key': process.env.INTERNAL_API_KEY || '',
  };
  if (rangeHeader) {
    upstreamHeaders['range'] = rangeHeader;
  }

  try {
    const inlineParam = inline === 'true' || inline === '1' ? '&inline=true' : '';
    const upstreamUrl = `${backendUrl}/api/download?id=${encodeURIComponent(id)}${inlineParam}`;

    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => 'upstream error');
      return res.status(upstream.status).json({ error: text });
    }

    // Forward essential headers back to the browser
    res.status(upstream.status);

    const forwardHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'content-disposition',
      'cache-control',
      'etag',
      'last-modified',
    ];

    for (const h of forwardHeaders) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    // Always advertise range support so the browser can seek
    if (!upstream.headers.get('accept-ranges')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    // Pipe the upstream body to the browser
    const reader = upstream.body?.getReader();
    if (!reader) return res.status(500).json({ error: 'No response body' });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: any) {
    console.error('Download proxy error:', err?.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', message: err?.message });
    }
  }
}
