// api/feed.js — RSS Feed Generator
// Supabase থেকে URL নেবে এবং RSS XML বানাবে

export default async function handler(req, res) {

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'indexing-engine-cyan.vercel.app';

  try {
    // Supabase থেকে সর্বশেষ ৫০টা URL নিন
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=id,title,url,created_at&order=created_at.desc&limit=50`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const posts = await response.json();

    // RSS XML বানান
    const items = posts.map(post => `
    <item>
      <title>${escapeXml(post.title || post.url)}</title>
      <link>${escapeXml(post.url)}</link>
      <guid isPermaLink="true">${escapeXml(post.url)}</guid>
      <pubDate>${new Date(post.created_at).toUTCString()}</pubDate>
      <description>Fast indexing signal for: ${escapeXml(post.url)}</description>
    </item>`).join('');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>IndexForce — Fast URL Indexing Feed</title>
    <link>https://${YOUR_DOMAIN}</link>
    <description>Latest URLs submitted for Google indexing</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://${YOUR_DOMAIN}/api/feed" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).send(rss);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
