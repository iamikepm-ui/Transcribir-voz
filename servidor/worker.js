// Servidor de PerezApp (Cloudflare Worker).
// Guarda la clave de Groq del titular y solo atiende a apps con una licencia válida (firma ECDSA P-256).
//
//   POST /v1/transcribe   (multipart: file, language?, prompt?)  → { text }
//   POST /v1/chat         (JSON: task, lang, tgt?, text, vocab?)  → { text }
//   POST /v1/license      (sin cuerpo)                            → { ok, serial, expires }   comprobación al abrir la app
//   POST /v1/admin        (JSON firmado por el generador)         → anular / reactivar / consultar una licencia
//   GET  /v1/health                                               → { ok: true, configured }
//
// Cabeceras de la app: X-Perezapp-License (clave PZ-…) y X-Perezapp-Device (código del móvil).
//
// Seguridad:
//   · Las licencias se comprueban con la clave PÚBLICA: el servidor no puede crear licencias ni guarda nada secreto salvo la clave de Groq.
//   · Las órdenes de administración (anular una licencia) van firmadas con la clave PRIVADA del generador, caducan a los 5 minutos
//     y no se pueden repetir: no hace falta ninguna contraseña en el servidor.
//   · Solo se aceptan peticiones de la web de la app (ALLOWED_ORIGINS), con tamaño máximo, límite por minuto y límite diario por licencia.
//   · Las licencias que sirven en cualquier móvil se limitan a MAX_DEVICES móviles distintos.
//
// Configuración (Cloudflare → Workers → perezapp-api → Settings → Variables):
//   GROQ_API_KEY     (secreto)  clave de Groq del titular
//   PUBLIC_KEY       clave pública del generador de licencias (87 caracteres)
//   ALLOWED_ORIGINS  orígenes permitidos, separados por comas (p. ej. https://iamikepm-ui.github.io)
//   LIMIT_STT_DAY / LIMIT_LLM_DAY  usos diarios por licencia (por defecto 300 y 600)
//   MAX_DEVICES      móviles distintos por licencia no atada a un móvil (por defecto 2)
//   REVOKED          números de serie anulados, separados por comas
//   PZ_KV            (KV) cuenta los usos y guarda las licencias anuladas desde el generador

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const EPOCH = Date.UTC(2025, 0, 1), DAY = 86400000;
const LANGNAME = { es: 'español', ca: 'catalán', en: 'inglés', fr: 'francés', it: 'italiano', de: 'alemán', pt: 'portugués' };
const LLMS = [['openai/gpt-oss-120b', 'low'], ['qwen/qwen3.8-27b', 'none']];
const MAX_AUDIO = 24 * 1024 * 1024, MAX_JSON = 64 * 1024;
const PER_MINUTE = { stt: 20, llm: 40, ip: 120, admin: 20 };   // por licencia (stt, llm) o por IP (ip, admin)
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
const b64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const today = () => new Date().toISOString().slice(0, 10);

// KV: si falla (p. ej. límite del plan gratuito), el servicio sigue funcionando
const kvGet = async (env, k) => { if (!env.PZ_KV) return null; try { return await env.PZ_KV.get(k); } catch { return null; } };
const kvPut = async (env, k, v, opt) => { if (!env.PZ_KV) return false; try { await env.PZ_KV.put(k, v, opt); return true; } catch { return false; } };
const kvDel = async (env, k) => { if (!env.PZ_KV) return false; try { await env.PZ_KV.delete(k); return true; } catch { return false; } };

// límite por minuto (en la memoria de cada servidor de Cloudflare: frena ráfagas y abusos)
const burst = new Map();
function tooFast(key, kind) {
  const min = Math.floor(Date.now() / 60000), k = kind + ':' + key + ':' + min;
  const n = (burst.get(k) || 0) + 1; burst.set(k, n);
  if (burst.size > 5000) for (const old of burst.keys()) { if (!old.endsWith(':' + min)) burst.delete(old); }
  return n > PER_MINUTE[kind];
}

let pubKeyCache = null, pubKeySrc = '';
async function publicKey(env) {
  if (!pubKeyCache || pubKeySrc !== env.PUBLIC_KEY) {
    pubKeyCache = await crypto.subtle.importKey('raw', b64u(env.PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    pubKeySrc = env.PUBLIC_KEY;
  }
  return pubKeyCache;
}

async function checkLicense(key, device, env) {
  if (!env.PUBLIC_KEY) return { ok: false, reason: 'server-not-configured' };
  let raw;
  try { raw = b32decode(key); } catch { return { ok: false, reason: 'invalid' }; }
  if (raw.length < 17 + 64 || raw.length > 17 + 255 + 64) return { ok: false, reason: 'invalid' };
  const payload = raw.slice(0, raw.length - 64), sig = raw.slice(raw.length - 64);
  try {
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(env), sig, payload))) return { ok: false, reason: 'invalid' };
  } catch { return { ok: false, reason: 'invalid' }; }
  if (payload[0] !== 1) return { ok: false, reason: 'invalid' };
  const flags = payload[1], dev = payload.slice(2, 10), days = (payload[10] << 8) | payload[11], serial = hex(payload.slice(12, 16));
  const expires = (flags & 2) && days ? new Date(EPOCH + days * DAY).toISOString().slice(0, 10) : null;
  const revoked = String(env.REVOKED || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (revoked.includes(serial) || (await kvGet(env, 'revoked:' + serial))) return { ok: false, reason: 'revoked', serial };
  let mine; try { mine = b32decode(device); } catch { mine = new Uint8Array(); }
  if (mine.length !== 8) return { ok: false, reason: 'device', serial };
  if (flags & 1) {
    if (hex(mine) !== hex(dev)) return { ok: false, reason: 'device', serial };
  } else {
    // licencia para cualquier móvil: como mucho MAX_DEVICES móviles distintos (cada 30 días)
    const max = +env.MAX_DEVICES || 2, k = 'd:' + serial, code = hex(mine);
    let list = []; try { list = JSON.parse((await kvGet(env, k)) || '[]'); } catch {}
    if (!list.includes(code)) {
      if (list.length >= max) return { ok: false, reason: 'devices', serial, max };
      list.push(code); await kvPut(env, k, JSON.stringify(list), { expirationTtl: 30 * 86400 });
    }
  }
  if ((flags & 2) && days && Date.now() >= EPOCH + (days + 1) * DAY) return { ok: false, reason: 'expired', serial, expires };
  return { ok: true, serial, expires };
}

async function useQuota(env, serial, kind) {
  if (!env.PZ_KV) return { ok: true };
  const limit = +(kind === 'stt' ? env.LIMIT_STT_DAY || 300 : env.LIMIT_LLM_DAY || 600);
  const k = `q:${serial}:${kind}:${today()}`;
  const n = +(await kvGet(env, k)) || 0;
  if (n >= limit) return { ok: false, used: n, limit };
  await kvPut(env, k, String(n + 1), { expirationTtl: 172800 });
  return { ok: true, used: n + 1, limit };
}

// Órdenes del generador: firma ECDSA de «PZADMIN|acción|serie|hora» con la clave privada del titular
async function admin(env, body) {
  const action = String(body.action || ''), serial = String(body.serial || '').toLowerCase(), ts = +body.ts || 0, sig = String(body.sig || '');
  if (!['revoke', 'restore', 'status'].includes(action) || !/^[0-9a-f]{8}$/.test(serial) || !/^[A-Za-z0-9_-]{80,90}$/.test(sig)) return { status: 400, body: { error: { code: 'bad_request' } } };
  if (Math.abs(Date.now() - ts) > 5 * 60000) return { status: 401, body: { error: { code: 'clock', now: Date.now() } } };
  let good = false;
  try { good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(env), b64u(sig), new TextEncoder().encode(`PZADMIN|${action}|${serial}|${ts}`)); } catch {}
  if (!good) return { status: 401, body: { error: { code: 'signature' } } };
  if (!env.PZ_KV) return { status: 503, body: { error: { code: 'no_storage' } } };
  const nonce = 'n:' + sig.slice(0, 32);
  if (action !== 'status') {
    if (await kvGet(env, nonce)) return { status: 409, body: { error: { code: 'replay' } } };
    await kvPut(env, nonce, '1', { expirationTtl: 900 });
  }
  if (action === 'revoke' && !(await kvPut(env, 'revoked:' + serial, new Date().toISOString()))) return { status: 503, body: { error: { code: 'storage' } } };
  if (action === 'restore' && !(await kvDel(env, 'revoked:' + serial))) return { status: 503, body: { error: { code: 'storage' } } };
  const d = today();
  let devices = []; try { devices = JSON.parse((await kvGet(env, 'd:' + serial)) || '[]'); } catch {}
  return { status: 200, body: {
    ok: true, serial,
    revoked: !!(await kvGet(env, 'revoked:' + serial)) || String(env.REVOKED || '').toLowerCase().split(',').map((s) => s.trim()).includes(serial),
    today: { stt: +(await kvGet(env, `q:${serial}:stt:${d}`)) || 0, llm: +(await kvGet(env, `q:${serial}:llm:${d}`)) || 0 },
    devices: devices.length,
  } };
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

const AUDIO_NAME = /^[\w.-]{1,60}\.(webm|ogg|oga|opus|mp4|m4a|wav|mp3|mpeg|mpga|flac)$/i;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const anyOrigin = !allowed.length || allowed.includes('*');
    const cors = {
      'Access-Control-Allow-Origin': anyOrigin ? '*' : (allowed.includes(origin) ? origin : allowed[0]),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Perezapp-License, X-Perezapp-Device',
      'Access-Control-Max-Age': '86400', Vary: 'Origin',
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: {
      ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/v1/health' && req.method === 'GET') return json({ ok: true, configured: !!(env.PUBLIC_KEY && env.GROQ_API_KEY), storage: !!env.PZ_KV });
    const routes = ['/v1/transcribe', '/v1/chat', '/v1/license', '/v1/admin'];
    if (req.method !== 'POST' || !routes.includes(url.pathname)) return json({ error: { code: 'not_found' } }, 404);
    // solo la web de la app (los navegadores siempre envían «Origin» en estas peticiones)
    if (!anyOrigin && !allowed.includes(origin)) return json({ error: { code: 'origin' } }, 403);
    const ip = req.headers.get('CF-Connecting-IP') || 'ip';

    if (url.pathname === '/v1/admin') {
      if (tooFast(ip, 'admin')) return json({ error: { code: 'slow_down' } }, 429);
      if (!env.PUBLIC_KEY) return json({ error: { code: 'server_not_configured' } }, 503);
      if (+(req.headers.get('Content-Length') || 0) > MAX_JSON) return json({ error: { code: 'too_large' } }, 413);
      let body; try { body = await req.json(); } catch { return json({ error: { code: 'bad_request' } }, 400); }
      const r = await admin(env, body || {});
      return json(r.body, r.status);
    }

    if (tooFast(ip, 'ip')) return json({ error: { code: 'slow_down' } }, 429);
    const lic = await checkLicense(req.headers.get('X-Perezapp-License') || '', req.headers.get('X-Perezapp-Device') || '', env);
    if (url.pathname === '/v1/license') return lic.ok ? json({ ok: true, serial: lic.serial, expires: lic.expires }) : json({ error: { code: 'license', reason: lic.reason, expires: lic.expires, max: lic.max } }, lic.reason === 'server-not-configured' ? 503 : 401);
    if (!lic.ok) return json({ error: { code: 'license', reason: lic.reason, expires: lic.expires, max: lic.max } }, lic.reason === 'server-not-configured' ? 503 : 401);
    if (!env.GROQ_API_KEY) return json({ error: { code: 'server_not_configured' } }, 503);
    const kind = url.pathname === '/v1/transcribe' ? 'stt' : 'llm';
    if (tooFast(lic.serial, kind)) return json({ error: { code: 'slow_down' } }, 429);
    const size = +(req.headers.get('Content-Length') || 0);
    if (size > (kind === 'stt' ? MAX_AUDIO : MAX_JSON)) return json({ error: { code: 'too_large' } }, 413);
    const quota = async () => { const q = await useQuota(env, lic.serial, kind); return q.ok ? null : json({ error: { code: 'quota', limit: q.limit } }, 429); };

    if (kind === 'stt') {
      let form; try { form = await req.formData(); } catch { return json({ error: { code: 'bad_request' } }, 400); }
      const file = form.get('file');
      if (!file || typeof file === 'string' || !file.size) return json({ error: { code: 'bad_request' } }, 400);
      if (file.size > MAX_AUDIO) return json({ error: { code: 'too_large' } }, 413);
      const fd = new FormData();
      fd.append('file', file, AUDIO_NAME.test(file.name || '') ? file.name : 'audio.webm');
      fd.append('model', env.STT_MODEL || 'whisper-large-v3');
      const lang = String(form.get('language') || ''); if (/^[a-z]{2}$/.test(lang)) fd.append('language', lang);
      const pr = String(form.get('prompt') || '').slice(0, 600); if (pr) fd.append('prompt', pr);
      fd.append('response_format', 'json'); fd.append('temperature', '0');
      const over = await quota(); if (over) return over;
      let res;
      try { res = await fetch(groqBase(env) + '/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY }, body: fd }); }
      catch { return json({ error: { code: 'upstream', status: 502 } }, 502); }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: { code: 'upstream', status: res.status } }, res.status === 429 ? 503 : 502);
      return json({ text: String(d.text || '') });
    }

    let body; try { body = await req.json(); } catch { return json({ error: { code: 'bad_request' } }, 400); }
    body = body || {};
    const text = String(body.text || '').slice(0, 6000), vocab = String(body.vocab || '').slice(0, 400);
    const system = prompt(String(body.task || ''), String(body.lang || ''), String(body.tgt || ''), vocab);
    if (!system || !text.trim()) return json({ error: { code: 'bad_request' } }, 400);
    const over = await quota(); if (over) return over;
    const r = await groqChat(env, system, text);
    if (r.error) return json({ error: { code: 'upstream', status: r.error.status } }, r.error.status === 429 ? 503 : 502);
    return json({ text: r.text });
  },
};
