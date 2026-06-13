// api/auth.js — WordPress.com OAuth শুরু করবে
export default function handler(req, res) {
  const CLIENT_ID = process.env.WP_CLIENT_ID || "141804";
  const REDIRECT_URI = process.env.WP_REDIRECT_URI || "https://indexing-engine-cyan.vercel.app/api/callback";

  const authUrl = new URL("https://public-api.wordpress.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "global");

  return res.redirect(authUrl.toString());
}
