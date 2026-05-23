export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?select=url,created_at&order=created_at.desc&limit=100`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const posts = await response.json();

    const urls = posts.map(p => `
  <url>
    <loc>${p.url}</loc>
    <lastmod>${new Date(p.created_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.status(200).send(xml);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
