// Vercel serverless function: secure proxy to the Anthropic API.
// The API key lives ONLY here, as a Vercel environment variable (ANTHROPIC_API_KEY).
// It is never sent to the browser. The front-end calls /api/grade instead of Anthropic directly.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY. Set it in Vercel project settings.' });
  }

  try {
    const { system, userPrompt, maxTokens } = req.body || {};
    if (!userPrompt) return res.status(400).json({ error: 'Missing userPrompt' });

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens || 1000,
        system: system || '',
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return res.status(upstream.status).json({ error: `Anthropic API ${upstream.status}`, detail });
    }

    const data = await upstream.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Proxy failure', detail: String(e) });
  }
}
