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

  // OAuth 1.0a Signature বানানো
  function generateOAuthSignature(method, endpoint, params, secrets) {
    const crypto = require('crypto');

    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');

    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(endpoint),
      encodeURIComponent(sortedParams)
    ].join('&');

    const signingKey = `${encodeURIComponent(secrets.api_secret)}&${encodeURIComponent(secrets.access_secret)}`;

    return crypto
      .createHmac('sha1', signingKey)
      .update(baseString)
      .digest('base64');
  }

  const CONFIG = {
    API_KEY: process.env.TWITTER_API_KEY,
    API_SECRET: process.env.TWITTER_API_SECRET,
    ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
    ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET,
  };

  const tweetText = `🔗 New Resource: ${hostname}\n\n${url}\n\n#web #resource #${hostname.replace(/\./g, '')}`;

  const endpoint = 'https://api.twitter.com/2/tweets';
  const oauth_timestamp = Math.floor(Date.now() / 1000).toString();
  const oauth_nonce = Math.random().toString(36).substring(2);

  const oauthParams = {
    oauth_consumer_key: CONFIG.API_KEY,
    oauth_nonce: oauth_nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: oauth_timestamp,
    oauth_token: CONFIG.ACCESS_TOKEN,
    oauth_version: '1.0',
  };

  const signature = generateOAuthSignature(
    'POST',
    endpoint,
    oauthParams,
    { api_secret: CONFIG.API_SECRET, access_secret: CONFIG.ACCESS_SECRET }
  );

  oauthParams.oauth_signature = signature;

  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  try {
    const tweetRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: tweetText })
    });

    const tweetData = await tweetRes.json();

    if (tweetData.data?.id) {
      const tweetUrl = `https://twitter.com/i/web/status/${tweetData.data.id}`;

      // Twitter RSS Ping
      await fetch('https://pubsubhubbub.appspot.com/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `hub.mode=publish&hub.url=${encodeURIComponent(
          `https://twitterrss.com/user/${process.env.TWITTER_USERNAME}`
        )}`
      });

      return res.status(200).json({
        success: true,
        tweet_url: tweetUrl,
        message: 'Tweet posted! Google Bot expected within 30-60 minutes.'
      });
    } else {
      return res.status(200).json({
        success: false,
        error: JSON.stringify(tweetData)
      });
    }
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message
    });
  }
}
