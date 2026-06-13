// api/wordpress.js — WordPress.com OAuth দিয়ে Auto Post
// Customer URL Submit → Title Fetch → 3 সাইটে Post → PubSubHubbub Ping

const SITES = [
  process.env.WP_SITE_1 || "newslinebd45.wordpress.com",
  process.env.WP_SITE_2 || "indextrej.wordpress.com",
  process.env.WP_SITE_3 || "newslinebd0.wordpress.com",
];

// ─────────────────────────────────────────
// PubSubHubbub Ping
// ─────────────────────────────────────────
async function pingFeed(site) {
  try {
    await fetch("https://pubsubhubbub.appspot.com/publish", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `hub.mode=publish&hub.url=${encodeURIComponent(`https://${site}/feed/`)}`,
    });
  } catch (e) {
    console.error(`Ping failed for ${site}:`, e.message);
  }
}

// ─────────────────────────────────────────
// Customer URL এর Title ও Description Fetch
// ─────────────────────────────────────────
async function fetchMeta(url) {
  const hostname = new URL(url).hostname;
  let title = `Resource: ${hostname}`;
  let description = `Valuable and regularly updated information from ${hostname}.`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IndexForceBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) title = titleMatch[1].trim().slice(0, 100);

    const descMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch?.[1]) description = descMatch[1].trim().slice(0, 300);
  } catch (e) {
    console.error("Meta fetch failed:", e.message);
  }

  return { title, description };
}

// ─────────────────────────────────────────
// WordPress.com এ Post করা (OAuth Token)
// ─────────────────────────────────────────
async function postToWordPress(site, title, content, accessToken) {
  const res = await fetch(
    `https://public-api.wordpress.com/rest/v1.1/sites/${site}/posts/new`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        content,
        status: "publish",
        tags: "web,resource,news,technology",
        format: "standard",
      }),
    }
  );
  return await res.json();
}

// ─────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method Not Allowed" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const customerUrl = body?.url;
  if (!customerUrl)
    return res.status(400).json({ success: false, error: "url প্রয়োজন" });

  // URL Validate
  try { new URL(customerUrl); } catch {
    return res.status(400).json({ success: false, error: "Invalid URL" });
  }

  const ACCESS_TOKEN = process.env.WP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return res.status(500).json({
      success: false,
      error: "WP_ACCESS_TOKEN নেই। প্রথমে /api/auth এ গিয়ে token নিন।",
      auth_url: "https://indexing-engine-cyan.vercel.app/api/auth",
    });
  }

  const results = [];
  const hostname = new URL(customerUrl).hostname;

  // Step 1: Title & Description Fetch
  const { title, description } = await fetchMeta(customerUrl);
  results.push({ step: "fetch_meta", status: "success", title });

  // Post Content
  const content = `
<h2>${title}</h2>
<p>${description}</p>

<h3>Visit Resource</h3>
<p><a href="${customerUrl}" target="_blank" rel="noopener">${customerUrl}</a></p>

<h3>About This Source</h3>
<p>Source: <strong>${hostname}</strong></p>
<p>Published: ${new Date().toUTCString()}</p>
`.trim();

  // Step 2: তিনটা সাইটে Post
  const postUrls = [];

  for (const site of SITES) {
    try {
      const postData = await postToWordPress(site, title, content, ACCESS_TOKEN);

      if (postData.URL) {
        postUrls.push(postData.URL);
        results.push({
          step: `wordpress_post_${site}`,
          status: "success",
          post_url: postData.URL,
        });
        // Ping
        await pingFeed(site);
      } else {
        results.push({
          step: `wordpress_post_${site}`,
          status: "error",
          message: JSON.stringify(postData).slice(0, 200),
        });
      }
    } catch (e) {
      results.push({
        step: `wordpress_post_${site}`,
        status: "error",
        message: e.message,
      });
    }
  }

  // Step 3: IndexNow Ping
  if (postUrls.length > 0) {
    try {
      await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: "wordpress.com",
          key: process.env.INDEXNOW_KEY || "indexforce123",
          urlList: postUrls,
        }),
      });
      results.push({ step: "indexnow_ping", status: "success" });
    } catch (e) {
      results.push({ step: "indexnow_ping", status: "error", message: e.message });
    }
  }

  const successCount = results.filter(
    (r) => r.status === "success" && r.step?.startsWith("wordpress_post")
  ).length;

  return res.status(200).json({
    success: postUrls.length > 0,
    url: customerUrl,
    title_used: title,
    sites_posted: successCount,
    total_sites: SITES.length,
    post_urls: postUrls,
    details: results,
    message:
      postUrls.length > 0
        ? `✅ ${successCount}/${SITES.length} সাইটে post হয়েছে! Google Bot ৩০-৬০ মিনিটে আসবে।`
        : "❌ Post হয়নি। Token check করুন।",
  });
}
