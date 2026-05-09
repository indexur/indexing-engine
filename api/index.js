// api/index.js — Vercel Serverless Function
// এই ফাইলটা Vercel এ Deploy করুন

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
  // আপনার Config এখানে বসান
  // ============================
  const CONFIG = {
    GEMINI_API_KEY: process.env.AIzaSyDriARpvQ1Db00jML-HjbkLvE8JI_npono,
    BLOGGER_BLOG_ID: process.env.9006642951505624918,
    BLOGGER_ACCESS_TOKEN: process.env.BLOGGER_ACCESS_TOKEN,
    INDEXNOW_KEY: process.env.INDEXNOW_KEY || 'your-indexnow-key',
    YOUR_DOMAIN: process.env.YOUR_DOMAIN || 'indexing-master.vercel.app',
  };

  const results = [];

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
                End with the URL as a reference link.
                URL: ${url}
                
                Format: First line = title, then article content.
                Do not use markdown.`
              }]
            }]
          })
        }
      );

      const geminiData = await geminiRes.json();
      const fullText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const lines = fullText.split('\n').filter(l => l.trim());
      generatedTitle = lines[0] || `Indexing: ${url}`;
      generatedContent = lines.slice(1).join('\n') + `\n\n<a href="${url}">${url}</a>`;
      results.push({ step: 'gemini', status: 'success', message: 'Content generated' });
    } catch (e) {
      generatedTitle = `Fast Index: ${new URL(url).hostname}`;
      generatedContent = `Visit this resource: <a href="${url}">${url}</a>`;
      results.push({ step: 'gemini', status: 'error', message: e.message });
    }


    // ================================
    // STEP 2: Blogger এ Post করা
    // ================================
    let bloggerPostUrl = '';

    try {
      const bloggerRes = await fetch(
        `https://www.googleapis.com/blogger/v3/blogs/${CONFIG.BLOGGER_BLOG_ID}/posts/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CONFIG.BLOGGER_ACCESS_TOKEN}`,
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
      bloggerPostUrl = bloggerData?.url || '';
      results.push({ step: 'blogger', status: 'success', postUrl: bloggerPostUrl });
    } catch (e) {
      results.push({ step: 'blogger', status: 'error', message: e.message });
    }


    // ================================
    // STEP 3: PubSubHubbub Ping
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
    // STEP 4: Google Sitemap Ping
    // ================================
    try {
      const sitemapUrl = `https://${CONFIG.YOUR_DOMAIN}/sitemap.xml`;
      await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      results.push({ step: 'google_ping', status: 'success' });
    } catch (e) {
      results.push({ step: 'google_ping', status: 'error', message: e.message });
    }


    // ================================
    // STEP 5: IndexNow (Bing/Yandex)
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
    // STEP 6: Bing IndexNow Direct
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
    return res.status(200).json({
      success: true,
      url: url,
      bloggerPost: bloggerPostUrl,
      signalsFired: results.filter(r => r.status === 'success').length,
      totalSteps: results.length,
      details: results,
      message: 'All signals fired! Google Bot expected within 5-30 minutes.'
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      details: results
    });
  }
}
