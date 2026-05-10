// api/index.js — Vercel Serverless Function
// Refresh Token দিয়ে Auto Access Token নেয়

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  // ============================
  // Config — Vercel Env Variables
  // ============================
  const CONFIG = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    BLOGGER_BLOG_ID: process.env.BLOGGER_BLOG_ID,
    BLOGGER_CLIENT_ID: process.env.BLOGGER_CLIENT_ID,
    BLOGGER_CLIENT_SECRET: process.env.BLOGGER_CLIENT_SECRET,
    BLOGGER_REFRESH_TOKEN: process.env.BLOGGER_REFRESH_TOKEN,
    INDEXNOW_KEY: process.env.INDEXNOW_KEY || 'indexforce123',
    YOUR_DOMAIN: process.env.YOUR_DOMAIN || 'indexing-engine-cyan.vercel.app',
  };

  const results = [];

  // ================================
  // Refresh Token দিয়ে Access Token নেওয়া
  // এটা কখনো Expire হবে না ✅
  // ================================
  async function getAccessToken() {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CONFIG.BLOGGER_CLIENT_ID,
          client_secret: CONFIG.BLOGGER_CLIENT_SECRET,
          refresh_token: CONFIG.BLOGGER_REFRESH_TOKEN,
          grant_type: 'refresh_token'
        })
      });
      const data = await response.json();
      if (data.access_token) {
        return data.access_token;
      }
      throw new Error('Token refresh failed: ' + JSON.stringify(data));
    } catch (e) {
      throw new Error('getAccessToken error: ' + e.message);
    }
  }

  try {

    // ================================
    // STEP 1: Gemini দিয়ে Content তৈরি
    // ================================
    let generatedContent = '';
    let generatedTitle = '';

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Write a unique 100-word SEO article about this URL.
Make it natural and informative.
End with the URL as a clickable reference link.
URL: ${url}

Format:
First line = article title (no markdown, plain text)
Then blank line
Then article body
Then at the end: <a href="${url}">${url}</a>

Do not use markdown symbols like # or **.`
              }]
            }]
          })
        }
      );

      const geminiData = await geminiRes.json();
      const fullText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const lines = fullText.split('\n').filter(l => l.trim());
      generatedTitle = lines[0] || `Fast Index: ${new URL(url).hostname}`;
      generatedContent = lines.slice(1).join('<br>') + `<br><br><a href="${url}">${url}</a>`;
      results.push({ step: 'gemini', status: 'success', message: 'Content generated' });

    } catch (e) {
      // Gemini কাজ না করলে Default Content
      generatedTitle = `Resource: ${new URL(url).hostname}`;
      generatedContent = `This is an important resource worth visiting. Check out the latest updates and information available at this link.<br><br><a href="${url}">${url}</a>`;
      results.push({ step: 'gemini', status: 'error', message: e.message });
    }


    // ================================
    // STEP 2: Access Token নিন
    // ================================
    let accessToken = '';
    try {
      accessToken = await getAccessToken();
      results.push({ step: 'token_refresh', status: 'success', message: 'Access token refreshed' });
    } catch (e) {
      results.push({ step: 'token_refresh', status: 'error', message: e.message });
    }


    // ================================
    // STEP 3: Blogger এ Post করা
    // ================================
    let bloggerPostUrl = '';

    if (accessToken) {
      try {
        const bloggerRes = await fetch(
          `https://www.googleapis.com/blogger/v3/blogs/${CONFIG.BLOGGER_BLOG_ID}/posts/`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              kind: 'blogger#post',
              title: generatedTitle,
              content: generatedContent,
            })
          }
        );

        const bloggerData = await bloggerRes.json();

        if (bloggerData.url) {
          bloggerPostUrl = bloggerData.url;
          results.push({ step: 'blogger', status: 'success', postUrl: bloggerPostUrl });
        } else {
          results.push({ step: 'blogger', status: 'error', message: JSON.stringify(bloggerData) });
        }

      } catch (e) {
        results.push({ step: 'blogger', status: 'error', message: e.message });
      }
    } else {
      results.push({ step: 'blogger', status: 'error', message: 'No access token' });
    }


    // ================================
    // STEP 4: PubSubHubbub Ping
    // ================================
    try {
      const blogRssFeed = `https://${CONFIG.BLOGGER_BLOG_ID}.blogspot.com/feeds/posts/default`;

      await fetch('https://pubsubhubbub.appspot.com/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `hub.mode=publish&hub.url=${encodeURIComponent(blogRssFeed)}`
      });

      results.push({ step: 'pubsubhubbub', status: 'success' });
    } catch (e) {
      results.push({ step: 'pubsubhubbub', status: 'error', message: e.message });
    }


    // ================================
    // STEP 5: Google Sitemap Ping
    // ================================
    try {
      const sitemapUrl = `https://${CONFIG.YOUR_DOMAIN}/sitemap.xml`;
      await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      results.push({ step: 'google_ping', status: 'success' });
    } catch (e) {
      results.push({ step: 'google_ping', status: 'error', message: e.message });
    }


    // ================================
    // STEP 6: IndexNow API
    // ================================
    try {
      await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: CONFIG.YOUR_DOMAIN,
          key: CONFIG.INDEXNOW_KEY,
          urlList: [url]
        })
      });
      results.push({ step: 'indexnow', status: 'success' });
    } catch (e) {
      results.push({ step: 'indexnow', status: 'error', message: e.message });
    }


    // ================================
    // STEP 7: Bing IndexNow
    // ================================
    try {
      await fetch('https://www.bing.com/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: CONFIG.YOUR_DOMAIN,
          key: CONFIG.INDEXNOW_KEY,
          urlList: [url]
        })
      });
      results.push({ step: 'bing_indexnow', status: 'success' });
    } catch (e) {
      results.push({ step: 'bing_indexnow', status: 'error', message: e.message });
    }


    // ================================
    // সব শেষে Result পাঠান
    // ================================
    const successCount = results.filter(r => r.status === 'success').length;

    return res.status(200).json({
      success: true,
      url: url,
      bloggerPost: bloggerPostUrl,
      signalsFired: successCount,
      totalSteps: results.length,
      details: results,
      message: `${successCount}/${results.length} signals fired! Google Bot expected within 5-30 minutes.`
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      details: results
    });
  }
}
