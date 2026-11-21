// Licencias de PerezApp.
// Cada clave de activación está firmada con ECDSA P-256 (SHA-256) por el generador de licencias del titular,
// que guarda la clave PRIVADA en su ordenador. Aquí solo está la clave PÚBLICA: sirve para comprobar firmas,
// no para crearlas, así que no se pueden fabricar claves válidas a partir de este código.
//
// Formato de la clave (antes de firmar), en bytes:
//   [0] versión (1) · [1] opciones (bit0 = atada a un móvil, bit1 = caduca)
//   [2..9] código del móvil (8 bytes; ceros si sirve en cualquiera)
//   [10..11] caducidad: días desde el 1-1-2025 (0 = no caduca)
//   [12..15] número de serie (para poder anular una licencia)
//   [16] longitud del nombre del cliente · [17..] nombre (UTF-8)
//   + 64 bytes de firma. Todo se escribe en base32 Crockford, en grupos de 5, con el prefijo «PZ-».
(function (root) {
  // Clave pública del titular (65 bytes, base64url). Vacía = licencias desactivadas (la app funciona sin clave).
  const PUBLIC_KEY = 'BI6d7Tsc7Cn7uNwK5eaQlA3qsY3sWczwEKedbHGpMLwD2q6lZ15bB4rJ9H1Mruui9-tDQ697ec4tqszus-JmJFc';
  // Números de serie anulados (en hexadecimal), p. ej. ['a1b2c3d4'].
  const REVOKED = [];
  // Contacto para comprar (opcional): número de WhatsApp con prefijo, p. ej. '34600000000'.
  const SELLER_WHATSAPP = '34601902046';
  // Servidor de PerezApp (Cloudflare Worker) que da la transcripción y la IA a los clientes con licencia.
  const API_BASE = '';
  // Tarifas que ve quien pide su clave (las mismas que en el generador). m = meses (0 = de por vida).
  const PLANS = [{ n: 'Mensual', p: 2.99, m: 1 }, { n: 'Trimestral', p: 7.99, m: 3 }, { n: 'Anual', p: 24.99, m: 12, best: true }, { n: 'De por vida', p: 49.99, m: 0 }];

  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const EPOCH = Date.UTC(2025, 0, 1), DAY = 86400000;

  function b32encode(bytes) {
    let bits = 0, val = 0, out = '';
    for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; } }
    if (bits > 0) out += ALPHA[(val << (5 - bits)) & 31];
    return out;
  }
  function b32decode(str) {
    const clean = String(str).toUpperCase().replace(/^PZ-?/, '').replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    let bits = 0, val = 0; const out = [];
    for (const ch of clean) {
      const i = ALPHA.indexOf(ch); if (i < 0) { const e = new Error('carácter no válido'); e.ch = ch; throw e; }
      val = ((val << 5) | i) & 0xffff; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  const group = (s, n = 5) => s.match(new RegExp('.{1,' + n + '}', 'g')).join('-');
  const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Código del móvil: 7 bytes al azar + 1 de control. Se crea una vez y se guarda en el navegador.
  async function deviceId() {
    let id = null;
    try { id = localStorage.getItem('perezapp.device'); } catch {}
    if (id) { try { const u = b32decode(id); if (u.length === 8 && await checkByte(u) === u[7]) return u; } catch {} }
    const u = new Uint8Array(8); crypto.getRandomValues(u.subarray(0, 7)); u[7] = await checkByte(u);
    try { localStorage.setItem('perezapp.device', b32encode(u)); } catch {}
    return u;
  }
  async function checkByte(u) { return new Uint8Array(await crypto.subtle.digest('SHA-256', u.slice(0, 7)))[0]; }
  async function deviceCode() { return group(b32encode(await deviceId()), 4); }

  // Saca la licencia «PZ-…» de lo que se pegue: la clave sola, el enlace de activación o el mensaje de WhatsApp entero.
  // Acepta minúsculas, espacios y los guiones «raros» que ponen algunos teclados (‐ – —).
  function cleanKey(input) {
    let s = String(input || '');
    try { s = decodeURIComponent(s); } catch {}
    s = s.replace(/[\u2010-\u2015\u2212\u00ad]/g, '-').toUpperCase();
    // puede haber varias (p. ej. un intento anterior que se quedó en el cuadro): se separan por «PZ-»
    const keys = s.split(/(?=PZ-)/).map((part) => (part.match(/^PZ-?[0-9A-Z]{5}(?:-?[0-9A-Z]{1,5})+/) || [])[0]).filter(Boolean);
    if (keys.length) return { key: keys[0], keys };
    // la clave pública del generador (87 caracteres con _ o -) no es una licencia
    if (/^[A-Za-z0-9_-]{80,95}$/.test(String(input || '').trim())) return { error: 'Eso es la clave pública del generador, no una licencia. Pega la licencia, que empieza por PZ-.' };
    return { error: 'No encuentro ninguna licencia (PZ-…) en lo que has pegado.' };
  }

  async function verify(input) {
    if (!PUBLIC_KEY) return { ok: true, disabled: true };
    const c = cleanKey(input);
    if (c.error) return { ok: false, reason: c.error };
    // si se pegaron varias, vale la primera que sea correcta
    let first = null;
    for (const k of c.keys) { const r = await verifyOne(k); if (r.ok) return r; first = first || r; }
    return first;
  }
  async function verifyOne(key) {
    let raw;
    try { raw = b32decode(key); } catch (e) { return { ok: false, reason: 'La clave tiene un carácter que no es válido: «{0}».', args: [e.ch || '?'] }; }
    if (raw.length < 17 + 64) return { ok: false, reason: 'La clave está incompleta.' };
    const payload = raw.slice(0, raw.length - 64), sig = raw.slice(raw.length - 64);
    let good = false;
    try {
      const pub = await crypto.subtle.importKey('raw', b64u(PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, payload);
    } catch { good = false; }
    if (!good) return { ok: false, reason: 'La clave no es válida: no la ha creado el generador de esta app o está mal copiada.' };
    if (payload[0] !== 1) return { ok: false, reason: 'Versión de clave no compatible.' };
    const flags = payload[1], dev = payload.slice(2, 10), days = (payload[10] << 8) | payload[11], serial = hex(payload.slice(12, 16));
    const n = payload[16], name = new TextDecoder().decode(payload.slice(17, 17 + n));
    if (REVOKED.includes(serial) || localRevoked().includes(serial)) return { ok: false, reason: 'Esta licencia ha sido anulada.' };
    if (flags & 1) {
      const mine = await deviceId();
      if (hex(mine) !== hex(dev)) return { ok: false, reason: 'Esta clave es para otro móvil.' };
    }
    const expires = (flags & 2) && days ? new Date(EPOCH + (days + 1) * DAY) : null;
    if (expires && Date.now() > expires.getTime()) return { ok: false, reason: 'La licencia caducó el {0}.', args: [new Date(expires - DAY).toLocaleDateString((root.I18N && root.I18N.locale()) || 'es-ES')], name };
    return { ok: true, name, expires: expires ? new Date(expires - DAY) : null, device: !!(flags & 1), serial, key };
  }

  // Comprueba la licencia guardada (se vuelve a verificar la firma cada vez que se abre la app).
  async function check() {
    let key = '';
    try { key = localStorage.getItem('perezapp.license') || ''; } catch {}
    if (!PUBLIC_KEY) return { ok: true, disabled: true };
    if (!key) return { ok: false, reason: '' };
    return verify(key);
  }
  async function activate(input) {
    const r = await verify(input);
    if (r.ok && r.key) try { localStorage.setItem('perezapp.license', r.key); } catch {}
    return r;
  }
  function deactivate() { try { localStorage.removeItem('perezapp.license'); } catch {} }

  // licencias que el servidor ha dicho que están anuladas: se recuerdan aunque luego no haya internet
  function localRevoked() { try { return JSON.parse(localStorage.getItem('perezapp.revoked') || '[]'); } catch { return []; } }
  function markRevoked(serial) {
    if (!/^[0-9a-f]{8}$/.test(serial || '')) return;
    const l = localRevoked(); if (!l.includes(serial)) l.push(serial);
    try { localStorage.setItem('perezapp.revoked', JSON.stringify(l.slice(-50))); } catch {}
  }

  // Comprobación en el servidor (si hay internet): anulada, caducada (con la fecha del servidor, no la del móvil)…
  // Devuelve null si no se pudo preguntar (sin cobertura, servidor caído): la app sigue funcionando.
  async function serverCheck() {
    if (!API_BASE || !PUBLIC_KEY) return null;
    let key = ''; try { key = localStorage.getItem('perezapp.license') || ''; } catch {}
    if (!key) return null;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(API_BASE + '/v1/license', { method: 'POST', headers: await headers(), signal: ctl.signal });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) { try { localStorage.setItem('perezapp.checked', String(Date.now())); } catch {} return { ok: true }; }
      if (res.status === 401 && d.error && d.error.code === 'license') {
        const why = d.error.reason;
        if (why === 'revoked') { const r = await verify(key); if (r.serial) markRevoked(r.serial); deactivate(); }
        return { ok: false, reason: why, expires: d.error.expires, max: d.error.max };
      }
      return null;
    } catch { return null; } finally { clearTimeout(to); }
  }

  // Solicitud de clave desde la pantalla de activación: le llega al titular en el generador.
  async function requestKey(data) {
    if (!API_BASE) return { ok: false, code: 'no_server' };
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(API_BASE + '/v1/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ ...data, device: await deviceCode() }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) return { ok: true };
      return { ok: false, code: (d.error && d.error.code) || String(res.status) };
    } catch { return { ok: false, code: 'network' }; } finally { clearTimeout(to); }
  }

  // cabeceras para el servidor: la licencia guardada y el código de este móvil
  async function headers() {
    let key = ''; try { key = localStorage.getItem('perezapp.license') || ''; } catch {}
    return { 'X-Perezapp-License': key, 'X-Perezapp-Device': await deviceCode() };
  }

  root.PerezappLicense = { enabled: !!PUBLIC_KEY, check, activate, deactivate, deviceCode, verify, headers, cleanKey, serverCheck, requestKey, PLANS, SELLER_WHATSAPP, API_BASE, _b32: { b32encode, b32decode } };
})(typeof window !== 'undefined' ? window : globalThis);
