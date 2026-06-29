// Vercel serverless function: fetch + parse a Calico Tab "motions/statistics" page.
// Runs server-side so it isn't subject to browser CORS limits (Calico sends none).
// Returns a clean array of motion objects for the front-end to tag and store.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let { url } = req.body || {};
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' });

    // Only allow calicotab.com / tabbycat-style hosts, and normalise toward the
    // motions statistics page which is the one that lists motion text.
    if (!/calicotab\.com/i.test(url) && !/\/motions\//i.test(url)) {
      return res.status(400).json({ error: 'That doesn\'t look like a Calico/Tabbycat motions URL.' });
    }
    if (!/\/motions\//i.test(url)) {
      url = url.replace(/\/+$/, '') + '/motions/statistics/';
    }

    const r = await fetch(url, { headers: { 'User-Agent': 'debate-drill/1.0' } });
    if (!r.ok) return res.status(r.status).json({ error: `Couldn't fetch that page (${r.status}).` });
    const html = await r.text();

    const motions = parseMotions(html);
    if (!motions.length) {
      return res.status(422).json({ error: 'Fetched the page but found no motions on it. Make sure it\'s the Motions tab of a completed/released tournament.' });
    }

    // tournament name from <title>
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const tournament = titleMatch ? titleMatch[1].replace(/\s*\|.*$/, '').trim() : 'Imported tournament';

    return res.status(200).json({ tournament, motions });
  } catch (e) {
    return res.status(500).json({ error: 'Parse failure', detail: String(e) });
  }
}

function decode(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201c').replace(/&rdquo;/g, '\u201d').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// The motions-statistics page renders each round as:
//   <h3|h4 ...>Round N</h3>  (round label, sometimes a banner)
//   <h4|h5 ...>MOTION TEXT (tag)</h4>  (motion as a heading)
//   ... optional info-slide text ...
// We extract every heading that looks like a motion (starts with a debate prefix
// like TH*, This House*, etc.), then attach the nearest preceding round label and
// the following info-slide paragraph when present.
function parseMotions(html) {
  // Pull all heading-ish chunks with their text, in document order.
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const items = [];
  let m;
  while ((m = headingRe.exec(html))) {
    const text = decode(m[2]);
    if (text) items.push({ level: parseInt(m[1]), text, index: m.index, raw: m[0] });
  }

  const roundRe = /^(round\s+\d+|quarterfinals?|semifinals?|finals?|grand\s+final|novice\s+final|octofinals?|double\s+octofinals?|partial\s+double\s+octofinals?|ef|qf|sf|gf)\b/i;
  const motionRe = /^(th[wbrosipx]\b|this house|thbt|thw|thr|ths|thp|tho|thi|thx|tho\b|that this house|info slide)/i;

  const motions = [];
  let currentRound = null;
  let seq = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (roundRe.test(it.text)) { currentRound = it.text; continue; }
    if (/^info slide$/i.test(it.text)) continue;

    // A motion heading: starts with a debate prefix.
    if (/^(th[wbrospix]|this house|thbt|that this house)/i.test(it.text)) {
      // split trailing "(tag)" slang
      let motion = it.text;
      let tag = null;
      const tagMatch = motion.match(/\(([^()]*)\)\s*$/);
      if (tagMatch) { tag = tagMatch[1].trim(); motion = motion.replace(/\([^()]*\)\s*$/, '').trim(); }

      // Find an info-slide paragraph after this heading and before the next heading.
      const sliceStart = it.index + it.raw.length;
      const sliceEnd = items[i + 1] ? items[i + 1].index : html.length;
      const slice = html.slice(sliceStart, sliceEnd);
      let infoSlide = null;
      const pMatches = [...slice.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(x => decode(x[1])).filter(Boolean);
      const meaningful = pMatches.filter(p => p.length > 40);
      if (meaningful.length) infoSlide = meaningful.join(' ');

      motions.push({
        round: currentRound || `Motion ${seq + 1}`,
        motion,
        tag,
        infoSlide,
      });
      seq++;
    }
  }
  return motions;
}
