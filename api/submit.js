// api/submit.js — Main Site এর Submit API
// URL নেবে, Duplicate Check করবে, n8n Trigger করবে

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  // URL Format Check
  try { new URL(url); } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {

    // ================================
    // STEP 1: Duplicate Check
    // ================================
    const { data: existing } = await supabase
      .from('posts')
      .select('id, url, indexed, created_at')
      .eq('url', url)
      .single();

    if (existing) {
      return res.status(200).json({
        success: false,
        duplicate: true,
        message: 'URL already submitted before',
        data: {
          url: existing.url,
          indexed: existing.indexed,
          submitted_at: existing.created_at
        }
      });
    }

    // ================================
    // STEP 2: Supabase এ Save করুন
    // ================================
    const { data: newPost, error: insertError } = await supabase
      .from('posts')
      .insert({
        title: new URL(url).hostname,
        url: url,
        indexed: false,
      })
      .select()
      .single();

    if (insertError) throw new Error('Database error: ' + insertError.message);

    // ================================
    // STEP 3: n8n Webhook Trigger
    // ================================
    const n8nResponse = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        post_id: newPost.id,
        submitted_at: new Date().toISOString()
      })
    });

    const n8nData = await n8nResponse.json().catch(() => ({}));

    // ================================
    // STEP 4: Status Update
    // ================================
    return res.status(200).json({
      success: true,
      message: 'URL submitted successfully! Indexing started.',
      data: {
        id: newPost.id,
        url: url,
        status: 'processing',
        n8n_triggered: n8nResponse.ok
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
