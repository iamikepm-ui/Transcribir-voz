// Servidor de Perezapp (Cloudflare Worker).
// Guarda la clave de Groq del titular y solo atiende a apps con una licencia válida (firma ECDSA P-256).
//
//   POST /v1/transcribe   (multipart: file, language?, prompt?)  → { text }
//   POST /v1/chat         (JSON: task, lang, tgt?, text, vocab?)  → { text }
//   GET  /v1/health                                               → { ok: true }
//
// Cabeceras de la app: X-Perezapp-License (clave PZ-…) y X-Perezapp-Device (código del móvil).
//
// Configuración (Cloudflare → Workers → perezapp-api → Settings → Variables):
//   GROQ_API_KEY     (secreto)  clave de Groq del titular
//   PUBLIC_KEY       clave pública del generador de licencias (87 caracteres)
//   ALLOWED_ORIGINS  orígenes permitidos, separados por comas (p. ej. https://iamikepm-ui.github.io)
//   LIMIT_STT_DAY / LIMIT_LLM_DAY  usos diarios por licencia (por defecto 300 y 600)
//   REVOKED          números de serie anulados, separados por comas
//   PZ_KV            (KV, opcional) para contar usos y anular licencias sin redesplegar (clave «revoked:<serie>»)

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const EPOCH = Date.UTC(2025, 0, 1), DAY = 86400000;
const LANGNAME = { es: 'español', ca: 'catalán', en: 'inglés', fr: 'francés', it: 'italiano', de: 'alemán', pt: 'portugués' };
const LLMS = [['openai/gpt-oss-120b', 'low'], ['qwen/qwen3.8-27b', 'none']];
const groqBase = (env) => env.GROQ_BASE || 'https://api.groq.com';

function b32decode(str) {
  const clean = String(str).toUpperCase().replace(/^PZ-?/, '').replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  let bits = 0, val = 0; const out = [];
  for (const ch of clean) {
    const i = ALPHA.indexOf(ch); if (i < 0) throw new Error('bad');
    val = ((val << 5) | i) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

let pubKeyCache = null;
async function checkLicense(key, device, env) {
  if (!env.PUBLIC_KEY) return { ok: false, reason: 'server-not-configured' };
  let raw;
  try { raw = b32decode(key); } catch { return { ok: false, reason: 'invalid' }; }
  if (raw.length < 17 + 64) return { ok: false, reason: 'invalid' };
  const payload = raw.slice(0, raw.length - 64), sig = raw.slice(raw.length - 64);
  try {
    pubKeyCache ??= await crypto.subtle.importKey('raw', b64u(env.PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKeyCache, sig, payload))) return { ok: false, reason: 'invalid' };
  } catch { return { ok: false, reason: 'invalid' }; }
  if (payload[0] !== 1) return { ok: false, reason: 'invalid' };
  const flags = payload[1], dev = payload.slice(2, 10), days = (payload[10] << 8) | payload[11], serial = hex(payload.slice(12, 16));
  const revoked = String(env.REVOKED || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (revoked.includes(serial) || (env.PZ_KV && (await env.PZ_KV.get('revoked:' + serial)))) return { ok: false, reason: 'revoked', serial };
  if (flags & 1) {
    let mine; try { mine = b32decode(device); } catch { mine = new Uint8Array(); }
    if (hex(mine) !== hex(dev)) return { ok: false, reason: 'device', serial };
  }
  if ((flags & 2) && days && Date.now() >= EPOCH + (days + 1) * DAY) return { ok: false, reason: 'expired', serial };
  return { ok: true, serial };
}

async function useQuota(env, serial, kind) {
  if (!env.PZ_KV) return { ok: true };
  const limit = +(kind === 'stt' ? env.LIMIT_STT_DAY || 300 : env.LIMIT_LLM_DAY || 600);
  const k = `q:${serial}:${kind}:${new Date().toISOString().slice(0, 10)}`;
  const n = +(await env.PZ_KV.get(k)) || 0;
  if (n >= limit) return { ok: false, used: n, limit };
  await env.PZ_KV.put(k, String(n + 1), { expirationTtl: 172800 });
  return { ok: true, used: n + 1, limit };
}

const KEEP = 'Mantén el saludo, el mensaje y la despedida en líneas separadas si las hay. No respondas al mensaje: devuelve SOLO el texto, sin comillas ni explicaciones.';
function prompt(task, l, t, vocab) {
  const L = LANGNAME[l] || 'su idioma', T = LANGNAME[t] || 'el idioma pedido';
  const V = vocab ? ` IMPORTANTE — nombres y palabras del usuario: ${vocab}. Cualquier nombre o palabra del texto que no sea habitual y se parezca a uno de la lista (una o dos letras distintas, o separado en dos palabras) es un error del reconocedor: escríbelo exactamente como en la lista.` : '';
  switch (task) {
    case 'fix': return `Eres un corrector de mensajes dictados por voz en ${L}. El texto viene de un reconocedor de voz y puede tener palabras mal oídas, faltas de ortografía, tildes o puntuación incorrectas. Corrígelo usando el contexto y la fonética: si una palabra no tiene sentido, sustitúyela por la que suena parecido y sí encaja (p. ej. «tengo cita en el médico el lunes ha las diez» → «… el lunes a las diez»). Respeta el significado, el tono y las palabras del usuario; no añadas ni quites información; no lo traduzcas. ${KEEP}${V}`;
    case 'formal': return `Reescribe este mensaje de WhatsApp en ${L} con un tono más formal y educado, sin cambiar la información. ${KEEP}`;
    case 'warm': return `Reescribe este mensaje de WhatsApp en ${L} con un tono más cercano y cariñoso, natural, sin cambiar la información. ${KEEP}`;
    case 'short': return `Acorta este mensaje de WhatsApp en ${L}: lo más breve posible sin perder información importante. ${KEEP}`;
    case 'emoji': return `Añade algunos emojis adecuados (pocos, con gusto) a este mensaje de WhatsApp en ${L}, sin cambiar el texto. ${KEEP}`;
    case 'clear': return `Reescribe este mensaje de WhatsApp en ${L} para que se entienda mejor: frases claras y ordenadas, sin cambiar la información ni el tono. ${KEEP}`;
    case 'tr': return `Traduce este mensaje de WhatsApp del ${L} al ${T}, de forma natural, como lo escribiría una persona nativa. Respeta los nombres propios (${vocab || 'sin lista'}). ${KEEP}`;
    default: return null;
  }
}

async function groqChat(env, system, user) {
  let last = null;
  for (const [model, effort] of LLMS) {
    let res;
    try {
      res = await fetch(groqBase(env) + '/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, temperature: 0.2, reasoning_effort: effort, max_tokens: Math.min(1800, 400 + user.length * 2), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
    } catch { last = { status: 502, message: 'network' }; continue; }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { last = { status: res.status, message: (d.error && d.error.message) || 'groq ' + res.status }; continue; }
    const out = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["«“]([\s\S]*)["»”]$/, '$1');
    if (out) return { text: out };
  }
  return { error: last || { status: 502, message: 'no response' } };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : (allowed[0] || '')),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Perezapp-License, X-Perezapp-Device',
      'Access-Control-Max-Age': '86400', Vary: 'Origin',
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/v1/health') return json({ ok: true, configured: !!(env.PUBLIC_KEY && env.GROQ_API_KEY) });
    if (req.method !== 'POST' || !['/v1/transcribe', '/v1/chat'].includes(url.pathname)) return json({ error: { code: 'not_found' } }, 404);
    if (allowed.length && !allowed.includes('*') && origin && !allowed.includes(origin)) return json({ error: { code: 'origin' } }, 403);
    if (!env.GROQ_API_KEY) return json({ error: { code: 'server_not_configured' } }, 503);

    const lic = await checkLicense(req.headers.get('X-Perezapp-License') || '', req.headers.get('X-Perezapp-Device') || '', env);
    if (!lic.ok) return json({ error: { code: 'license', reason: lic.reason } }, 401);
    const kind = url.pathname === '/v1/transcribe' ? 'stt' : 'llm';
    const q = await useQuota(env, lic.serial, kind);
    if (!q.ok) return json({ error: { code: 'quota', limit: q.limit } }, 429);

    if (kind === 'stt') {
      if (+(req.headers.get('Content-Length') || 0) > 24 * 1024 * 1024) return json({ error: { code: 'too_large' } }, 413);
      let form; try { form = await req.formData(); } catch { return json({ error: { code: 'bad_request' } }, 400); }
      const file = form.get('file');
      if (!file || typeof file === 'string') return json({ error: { code: 'bad_request' } }, 400);
      const fd = new FormData();
      fd.append('file', file, file.name || 'audio.webm');
      fd.append('model', env.STT_MODEL || 'whisper-large-v3');
      const lang = String(form.get('language') || ''); if (/^[a-z]{2}$/.test(lang)) fd.append('language', lang);
      const pr = String(form.get('prompt') || '').slice(0, 600); if (pr) fd.append('prompt', pr);
      fd.append('response_format', 'json'); fd.append('temperature', '0');
      let res;
      try { res = await fetch(groqBase(env) + '/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY }, body: fd }); }
      catch { return json({ error: { code: 'upstream', status: 502 } }, 502); }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: { code: 'upstream', status: res.status } }, res.status === 429 ? 503 : 502);
      return json({ text: d.text || '' });
    }

    let body; try { body = await req.json(); } catch { return json({ error: { code: 'bad_request' } }, 400); }
    const text = String(body.text || '').slice(0, 6000), vocab = String(body.vocab || '').slice(0, 400);
    const system = prompt(String(body.task || ''), String(body.lang || ''), String(body.tgt || ''), vocab);
    if (!system || !text.trim()) return json({ error: { code: 'bad_request' } }, 400);
    const r = await groqChat(env, system, text);
    if (r.error) return json({ error: { code: 'upstream', status: r.error.status } }, r.error.status === 429 ? 503 : 502);
    return json({ text: r.text });
  },
};
