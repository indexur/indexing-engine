// api/links.js — Dynamic Content Page
// Supabase থেকে URL নিয়ে সুন্দর Page বানাবে
// Google Bot এসে Real Content দেখবে

export default async function handler(req, res) {

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'indexing-engine-cyan.vercel.app';

  // Single URL Page: /api/links?id=5
  const { id, page } = req.query;
  const currentPage = parseInt(page) || 1;
  const limit = 20;
  const offset = (currentPage - 1) * limit;

  try {
    let posts = [];
    let single = null;

    if (id) {
      // Single URL Page
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/posts?select=id,title,url,created_at&id=eq.${id}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      const data = await response.json();
      single = data[0];
    } else {
      // All URLs Page
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/posts?select=id,title,url,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      posts = await response.json();
    }

    if (single) {
      // Single URL এর জন্য আলাদা Page
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resource: ${escapeHtml(single.title || single.url)}</title>
<meta name="description" content="Fast indexed resource: ${escapeHtml(single.url)}">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "${escapeHtml(single.title || single.url)}",
  "url": "${escapeHtml(single.url)}",
  "datePublished": "${single.created_at}",
  "description": "Web resource submitted for fast indexing"
}
</script>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; }
  h1 { color: #1a1a2e; font-size: 24px; }
  .url-box { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; word-break: break-all; }
  .url-box a { color: #0066cc; text-decoration: none; font-size: 16px; }
  .meta { color: #666; font-size: 14px; margin-top: 10px; }
  .back { margin-top: 30px; }
  .back a { color: #0066cc; }
</style>
</head>
<body>
<h1>Web Resource: ${escapeHtml(single.title || 'Indexed Resource')}</h1>
<div class="url-box">
  <a href="${escapeHtml(single.url)}" target="_blank" rel="noopener">${escapeHtml(single.url)}</a>
</div>
<p class="meta">
  This resource was submitted for fast Google indexing on 
  ${new Date(single.created_at).toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  })}.
</p>
<p>This page contains a curated web resource that has been verified and submitted for search engine indexing. The linked content provides valuable information for readers searching for relevant topics online.</p>
<div class="back">
  <a href="/api/links">← View all indexed resources</a>
</div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    // সব URL এর List Page
    const items = posts.map(post => `
      <div class="item">
        <h2><a href="/api/links?id=${post.id}">${escapeHtml(post.title || post.url)}</a></h2>
        <p class="url"><a href="${escapeHtml(post.url)}" target="_blank" rel="noopener">${escapeHtml(post.url)}</a></p>
        <p class="date">Indexed: ${new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IndexForce — Web Resources Directory</title>
<meta name="description" content="A curated directory of web resources submitted for fast Google indexing.">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "IndexForce Web Resources",
  "description": "Curated web resources for fast indexing",
  "url": "https://${YOUR_DOMAIN}/api/links"
}
</script>
<style>
  body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; color: #333; }
  h1 { color: #1a1a2e; border-bottom: 2px solid #eee; padding-bottom: 10px; }
  .item { padding: 20px 0; border-bottom: 1px solid #eee; }
  .item h2 { font-size: 18px; margin-bottom: 5px; }
  .item h2 a { color: #1a0dab; text-decoration: none; }
  .item h2 a:hover { text-decoration: underline; }
  .url a { color: #006621; font-size: 14px; text-decoration: none; }
  .date { color: #666; font-size: 13px; margin-top: 5px; }
  .pagination { margin-top: 30px; display: flex; gap: 10px; }
  .pagination a { padding: 8px 16px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; }
  .count { color: #666; font-size: 14px; margin-bottom: 20px; }
</style>
</head>
<body>
<h1>🔗 IndexForce — Web Resources Directory</h1>
<p class="count">Showing ${posts.length} resources (Page ${currentPage})</p>
${items}
<div class="pagination">
  ${currentPage > 1 ? `<a href="/api/links?page=${currentPage - 1}">← Previous</a>` : ''}
  ${posts.length === limit ? `<a href="/api/links?page=${currentPage + 1}">Next →</a>` : ''}
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
