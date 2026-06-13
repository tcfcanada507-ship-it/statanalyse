// ═══════════════════════════════════════════════
// StatAnalyse Pro — Proxy IA sécurisé (Vercel)
// Modifie la CASCADE ici pour changer l'ordre
// ═══════════════════════════════════════════════

export const config = { runtime: 'edge' };

// ── CASCADE : modifie l'ordre ici ──────────────
const CASCADE = ['groq', 'cerebras', 'gemini', 'claude'];

export default async function handler(req) {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), { status: 400, headers }); }

  const { prompt, provider } = body;
  if (!prompt) return new Response(JSON.stringify({ error: 'Prompt manquant' }), { status: 400, headers });

  const order = provider && CASCADE.includes(provider)
    ? [provider, ...CASCADE.filter(p => p !== provider)]
    : CASCADE;

  let lastError = '';
  for (const p of order) {
    try {
      const text = await callProvider(p, prompt);
      return new Response(JSON.stringify({ text, provider: p }), { status: 200, headers });
    } catch (e) {
      lastError = e.message;
      console.warn(`[CASCADE] ${p} échoué :`, e.message);
    }
  }

  return new Response(JSON.stringify({ error: `Tous les providers ont échoué. Dernier : ${lastError}` }), { status: 502, headers });
}

// ── Appels providers ────────────────────────────
async function callProvider(provider, prompt) {
  switch (provider) {

    case 'groq': {
      // Rotation automatique : clé 1 → clé 2 → clé 3
      const keys = [
        process.env.GROQ_API_KEY,
        process.env.GROQ_API_KEY_2,
        process.env.GROQ_API_KEY_3,
      ].filter(Boolean);
      if (!keys.length) throw new Error('Aucune clé Groq configurée');
      let lastErr = '';
      for (const key of keys) {
        try {
          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] })
          });
          const j = await r.json();
          if (!j.choices?.[0]) throw new Error(j.error?.message || 'Réponse invalide');
          return j.choices[0].message.content;
        } catch (e) { lastErr = e.message; }
      }
      throw new Error(`Groq — toutes les clés épuisées : ${lastErr}`);
    }

    case 'cerebras': {
      const key = process.env.CEREBRAS_API_KEY;
      if (!key) throw new Error('Clé Cerebras non configurée');
      const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'llama3.1-70b', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] })
      });
      const j = await r.json();
      if (!j.choices?.[0]) throw new Error(j.error?.message || 'Réponse invalide');
      return j.choices[0].message.content;
    }

    case 'gemini': {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('Clé Gemini non configurée');
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const j = await r.json();
      if (!j.candidates?.[0]?.content) throw new Error(j.error?.message || 'Réponse invalide');
      return j.candidates[0].content.parts[0].text;
    }

    case 'claude': {
      const key = process.env.CLAUDE_API_KEY;
      if (!key) throw new Error('Clé Claude non configurée');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-3-5-sonnet-20240620', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] })
      });
      const j = await r.json();
      if (!j.content?.[0]) throw new Error(j.error?.message || 'Réponse invalide');
      return j.content[0].text;
    }

    default: throw new Error(`Provider inconnu : ${provider}`);
  }
          }
