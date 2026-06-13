// api/callback.js — WordPress.com OAuth Callback
// Code পেয়ে Access Token নেবে এবং দেখাবে

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ success: false, message: "Authorization denied", error });
  }

  if (!code) {
    return res.status(400).json({ success: false, message: "No code received" });
  }

  const CLIENT_ID = process.env.WP_CLIENT_ID || "141804";
  const CLIENT_SECRET = process.env.WP_CLIENT_SECRET || "Fa271EAOgd3LNxy4eJKezfTndUEjZaqjCLd48Crw46lbxHSucvTrCdwLNcTIZ7Ck";
  const REDIRECT_URI = process.env.WP_REDIRECT_URI || "https://indexing-engine-cyan.vercel.app/api/callback";

  try {
    const tokenRes = await fetch("https://public-api.wordpress.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      // Token পাওয়া গেছে — এটা Vercel Environment Variable এ সেট করুন
      return res.status(200).json({
        success: true,
        message: "✅ Access Token পাওয়া গেছে! এটা Vercel এ WP_ACCESS_TOKEN নামে Environment Variable এ সেট করুন।",
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        blog_id: tokenData.blog_id,
        blog_url: tokenData.blog_url,
        instruction: "Vercel Dashboard → Settings → Environment Variables → WP_ACCESS_TOKEN = [উপরের access_token]"
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Token পাওয়া যায়নি",
        details: tokenData,
      });
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
}
