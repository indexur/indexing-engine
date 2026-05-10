// api/index.js — Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

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

  // Access Token নেওয়া
  async function getAccessToken() {
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
    if (data.access_token) return data.access_token;
    throw new Error('Token refresh failed: ' + JSON.stringify(data));
  }

  try {

    // ================================
    // STEP 1: Gemini 1.5 Flash দিয়ে Content
    // ================================
    let generatedContent = '';
    let generatedTitle = '';

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Write a unique 150-word SEO article about the following URL.
Write naturally as if describing what the page is about.
Do not use markdown symbols like # or **.
Do not mention that you are an AI.

Format:
Line 1: Article title (plain text only)
Line 2: blank
Line 3 onwards: Article body (minimum 100 words)
Last line: Reference - ${url}

URL to write about: ${url}`
              }]
            }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 500,
            }
          })
        }
      );

      const geminiData = await geminiRes.json();
      const fullText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (fullText) {
        const lines = fullText.split('\n').filter(l => l.trim());
        generatedTitle = lines[0] || `Resource: ${new URL(url).hostname}`;
        const bodyLines = lines.slice(1).join('<br><br>');
        generatedContent = `<p>${bodyLines}</p><br><p><a href="${url}">${url}</a></p>`;
        results.push({ step: 'gemini', status: 'success', message: 'Content generated' });
      } else {
        throw new Error('Empty response from Gemini');
      }

    } catch (e) {
      // Fallback Content
      const hostname = new URL(url).hostname;
      generatedTitle = `Discover ${hostname} — New Resource`;
      generatedContent = `<p>Looking for reliable and up-to-date information? ${hostname} is a valuable online resource that provides useful content for readers. Whether you are searching for the latest updates, guides, or insights, this website offers a wide range of topics to explore.</p><p>The page linked below contains important information that is worth reading. Make sure to check it out for the most recent updates and detailed content available on this topic.</p><p>Visit the resource here: <a href="${url}">${url}</a></p>`;
      results.push({ step: 'gemini', status: 'error', message: e.message });
    }


    // ================================
    // STEP 2: Access Token নিন
    // ================================
    let accessToken = '';
    try {
      accessToken = await getAccessToken();
      results.push({ step: 'token_refresh', status: 'success' });
    } catch (e) {
      results.push({ step: 'token_refresh', status: 'error', message: e.message });
    }


    // ================================
    // STEP 3: Blogger এ Post
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
    // STEP 6: IndexNow
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
    // Result পাঠান
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
