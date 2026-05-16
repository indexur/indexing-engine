// api/submit.js — With Same-Submission Duplicate Check

import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // ================================
  // Single URL অথবা Multiple URLs
  // ================================
  const urls = body?.urls || (body?.url ? [body.url] : []);

  if (urls.length === 0) {
    return res.status(400).json({ error: 'URL required' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const results = [];
  const processedUrls = new Set(); // Same Submission Duplicate Check

  for (const url of urls) {

    // URL Format Check
    try { new URL(url); } catch {
      results.push({ url, status: 'error', message: 'Invalid URL format' });
      continue;
    }

    // Same Submission এ Duplicate Check
    if (processedUrls.has(url)) {
      results.push({ url, status: 'duplicate', message: 'Duplicate in same submission' });
      continue;
    }
    processedUrls.add(url);

    try {

      // Supabase এ Duplicate Check
      const { data: existing } = await supabase
        .from('posts')
        .select('id, url, indexed, created_at')
        .eq('url', url)
        .maybeSingle();

      if (existing) {
        results.push({
          url,
          status: 'duplicate',
          message: 'Already submitted before',
          submitted_at: existing.created_at
        });
        continue;
      }

      // Supabase এ Save
      const { data: newPost, error: insertError } = await supabase
        .from('posts')
        .insert({
          title: new URL(url).hostname,
          url: url,
          indexed: false,
        })
        .select()
        .single();

      if (insertError) {
        results.push({ url, status: 'error', message: insertError.message });
        continue;
      }

      // n8n Webhook Trigger
      let n8nTriggered = false;
      if (process.env.N8N_WEBHOOK_URL) {
        try {
          await fetch(process.env.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: url,
              post_id: newPost.id,
              submitted_at: new Date().toISOString()
            })
          });
          n8nTriggered = true;
        } catch (e) {
          console.error('n8n error:', e.message);
        }
      }

      results.push({
        url,
        status: 'success',
        id: newPost.id,
        n8n_triggered: n8nTriggered
      });

    } catch (error) {
      results.push({ url, status: 'error', message: error.message });
    }
  }

  // Summary
  const submitted = results.filter(r => r.status === 'success').length;
  const duplicates = results.filter(r => r.status === 'duplicate').length;
  const errors = results.filter(r => r.status === 'error').length;

  return res.status(200).json({
    success: true,
    message: `${submitted} submitted, ${duplicates} duplicates, ${errors} errors`,
    summary: { submitted, duplicates, errors },
    results
  });
}
