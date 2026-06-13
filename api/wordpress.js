const WORDPRESS_SITE = "indextrej.wordpress.com";
const WP_USERNAME = "ummay3011";
const WP_APP_PASSWORD = "vfl5phdilqjlas5q";

const BASE_URL = `https://public-api.wordpress.com/wp/v2/sites/${WORDPRESS_SITE}`;

const authHeader =
  "Basic " +
  Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");

async function wpFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      ...(options.headers || {}),
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw { status: res.status, message: data.message || "WordPress API error", data };
  }

  return data;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    // ───────────────────────────────
    // GET /api/wordpress?action=posts
    // ───────────────────────────────
    if (req.method === "GET" && action === "posts") {
      const { page = 1, per_page = 10, search = "", status = "publish" } = req.query;
      const query = new URLSearchParams({ page, per_page, search, status });
      const posts = await wpFetch(`/posts?${query}`);
      return res.status(200).json({ success: true, posts });
    }

    // ──────────────────────────────────────
    // GET /api/wordpress?action=post&id=123
    // ──────────────────────────────────────
    if (req.method === "GET" && action === "post") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: "id প্রয়োজন" });
      const post = await wpFetch(`/posts/${id}`);
      return res.status(200).json({ success: true, post });
    }

    // ───────────────────────────────────
    // POST /api/wordpress?action=create
    // Body: { title, content, status, categories, tags }
    // ───────────────────────────────────
    if (req.method === "POST" && action === "create") {
      const { title, content, status = "draft", categories, tags, excerpt } = req.body;
      if (!title || !content)
        return res.status(400).json({ success: false, message: "title ও content প্রয়োজন" });

      const post = await wpFetch("/posts", {
        method: "POST",
        body: JSON.stringify({ title, content, status, categories, tags, excerpt }),
      });
      return res.status(201).json({ success: true, post });
    }

    // ──────────────────────────────────────
    // PUT /api/wordpress?action=update&id=123
    // Body: { title, content, status, ... }
    // ──────────────────────────────────────
    if (req.method === "PUT" && action === "update") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: "id প্রয়োজন" });

      const post = await wpFetch(`/posts/${id}`, {
        method: "PUT",
        body: JSON.stringify(req.body),
      });
      return res.status(200).json({ success: true, post });
    }

    // ────────────────────────────────────────
    // DELETE /api/wordpress?action=delete&id=123
    // ────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: "id প্রয়োজন" });

      const result = await wpFetch(`/posts/${id}?force=true`, { method: "DELETE" });
      return res.status(200).json({ success: true, result });
    }

    // ─────────────────────────────────────────
    // GET /api/wordpress?action=categories
    // ─────────────────────────────────────────
    if (req.method === "GET" && action === "categories") {
      const categories = await wpFetch("/categories?per_page=100");
      return res.status(200).json({ success: true, categories });
    }

    // ─────────────────────────────────────────
    // GET /api/wordpress?action=tags
    // ─────────────────────────────────────────
    if (req.method === "GET" && action === "tags") {
      const tags = await wpFetch("/tags?per_page=100");
      return res.status(200).json({ success: true, tags });
    }

    // ─────────────────────────────────────────
    // GET /api/wordpress?action=media
    // ─────────────────────────────────────────
    if (req.method === "GET" && action === "media") {
      const { per_page = 20, page = 1 } = req.query;
      const media = await wpFetch(`/media?per_page=${per_page}&page=${page}`);
      return res.status(200).json({ success: true, media });
    }

    // ─────────────────────────────────────────
    // Fallback
    // ─────────────────────────────────────────
    return res.status(404).json({
      success: false,
      message: "অজানা action। available: posts, post, create, update, delete, categories, tags, media",
    });

  } catch (err) {
    console.error("WordPress API Error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Server error",
      details: err.data || null,
    });
  }
}
