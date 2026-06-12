// api/wordpress.js — Enhanced WordPress.com Multi-Site Auto Post
// Customer URL এর Real Title/Description Fetch করে
// ৩টা WordPress.com সাইটে Auto Post করে
// Google প্রতিটা সাইট থেকে Customer URL দেখে

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ message: 'Method Not Allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const url = body?.url;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const hostname = new URL(url).hostname;
  const results = [];

  // ================================
  // STEP 0: Customer URL এর Real Title/Description Fetch করুন
  // ================================
  let pageTitle = `Resource: ${hostname}`;
  let pageDescription = `This page contains valuable and regularly updated information from ${hostname}.`;

  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IndexForceBot/1.0)' },
      signal: AbortSignal.timeout(8000)
    });
    const html = await pageRes.text();

    // <title> ট্যাগ থেকে Title নিন
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      pageTitle = titleMatch[1].trim().slice(0, 100);
    }

    // meta description থেকে Description নিন
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (descMatch && descMatch[1]) {
      pageDescription = descMatch[1].trim().slice(0, 300);
    }

    // og:description ফলব্যাক
    if (!descMatch) {
      const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      if (ogDescMatch && ogDescMatch[1]) {
        pageDescription = ogDescMatch[1].trim().slice(0, 300);
      }
    }

    results.push({ step: 'fetch_meta', status: 'success', title: pageTitle });
  } catch (e) {
    results.push({ step: 'fetch_meta', status: 'fallback', message: 'Using generic title/description' });
  }


  // ================================
  // WordPress Sites Configuration
  // প্রতিটা সাইটের জন্য আলাদা Username/Password দিতে পারবেন
  // (একই Account হলে একই Username/Password ব্যবহার হবে)
  // ================================
  const SITES = [
    {
      site: process.env.WP_SITE_1 || 'newslinebd45.wordpress.com',
      username: process.env.WP_USERNAME_1 || process.env.WP_USERNAME || 'ummay3011',
      password: process.env.WP_APP_PASSWORD_1 || process.env.WP_APP_PASSWORD || 'vfl5phdilqjlas5q',
    },
    {
      site: process.env.WP_SITE_2 || 'indextrej.wordpress.com',
      username: process.env.WP_USERNAME_2 || process.env.WP_USERNAME || 'ummay3011',
      password: process.env.WP_APP_PASSWORD_2 || process.env.WP_APP_PASSWORD || 'vfl5phdilqjlas5q',
    },
    {
      site: process.env.WP_SITE_3 || 'newslinebd0.wordpress.com',
      username: process.env.WP_USERNAME_3 || process.env.WP_USERNAME || 'ummay3011',
      password: process.env.WP_APP_PASSWORD_3 || process.env.WP_APP_PASSWORD || 'vfl5phdilqjlas5q',
    },
  ];

  const postUrls = [];

  // ================================
  // প্রতিটা WordPress সাইটে Post করুন
  // ================================
  for (const siteConfig of SITES) {
    try {
      const authString = Buffer.from(
        `${siteConfig.username}:${siteConfig.password}`
      ).toString('base64');

      const postRes = await fetch(
        `https://public-api.wordpress.com/rest/v1.1/sites/${siteConfig.site}/posts/new`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: pageTitle,
            content: `
<h2>${pageTitle}</h2>
<p>${pageDescription}</p>

<h3>Read Full Article / Visit Resource</h3>
<p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>

<h3>About This Source</h3>
<p>Source: <strong>${hostname}</strong></p>
<p>Published: ${new Date().toUTCString()}</p>

<p>For more details, visit: ${url}</p>
`,
            status: 'publish',
            tags: 'web,resource,news,technology',
            format: 'standard'
          })
        }
      );

      const postData = await postRes.json();

      if (postData.URL) {
        postUrls.push(postData.URL);
        results.push({
          step: `wordpress_post_${siteConfig.site}`,
          status: 'success',
          post_url: postData.URL
        });

        // RSS Feed Ping প্রতিটা সাইটের জন্য
        await fetch('https://pubsubhubbub.appspot.com/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `hub.mode=publish&hub.url=${encodeURIComponent(`https://${siteConfig.site}/feed/`)}`
        });

      } else {
        results.push({
          step: `wordpress_post_${siteConfig.site}`,
          status: 'error',
          message: JSON.stringify(postData).slice(0, 200)
        });
      }
    } catch (e) {
      results.push({
        step: `wordpress_post_${siteConfig.site}`,
        status: 'error',
        message: e.message
      });
    }
  }


  // ================================
  // IndexNow + Bing — সব Post URL একসাথে
  // ================================
  if (postUrls.length > 0) {
    try {
      await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: 'wordpress.com',
          key: process.env.INDEXNOW_KEY || 'indexforce123',
          urlList: postUrls
        })
      });
      results.push({ step: 'indexnow_all', status: 'success' });
    } catch (e) {
      results.push({ step: 'indexnow_all', status: 'error', message: e.message });
    }
  }


  const successCount = results.filter(r => r.status === 'success' && r.step?.startsWith('wordpress_post')).length;

  return res.status(200).json({
    success: postUrls.length > 0,
    url: url,
    title_used: pageTitle,
    sites_posted: successCount,
    total_sites: SITES.length,
    post_urls: postUrls,
    details: results,
    message: postUrls.length > 0
      ? `Posted to ${successCount}/${SITES.length} WordPress sites with real content! Google Bot expected within 30-60 minutes.`
      : 'WordPress posts failed. Check credentials.'
  });
}
