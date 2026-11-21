// Licencias de Perezapp.
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
  const PUBLIC_KEY = '';
  // Números de serie anulados (en hexadecimal), p. ej. ['a1b2c3d4'].
  const REVOKED = [];
  // Contacto para comprar (opcional): número de WhatsApp con prefijo, p. ej. '34600000000'.
  const SELLER_WHATSAPP = '';
  // Servidor de Perezapp (Cloudflare Worker) que da la transcripción y la IA a los clientes con licencia.
  const API_BASE = '';

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
      const i = ALPHA.indexOf(ch); if (i < 0) throw new Error('carácter no válido');
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

  async function verify(key) {
    if (!PUBLIC_KEY) return { ok: true, disabled: true };
    let raw;
    try { raw = b32decode(key); } catch { return { ok: false, reason: 'La clave tiene caracteres que no son válidos.' }; }
    if (raw.length < 17 + 64) return { ok: false, reason: 'La clave está incompleta.' };
    const payload = raw.slice(0, raw.length - 64), sig = raw.slice(raw.length - 64);
    let good = false;
    try {
      const pub = await crypto.subtle.importKey('raw', b64u(PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, payload);
    } catch { good = false; }
    if (!good) return { ok: false, reason: 'La clave no es válida.' };
    if (payload[0] !== 1) return { ok: false, reason: 'Versión de clave no compatible.' };
    const flags = payload[1], dev = payload.slice(2, 10), days = (payload[10] << 8) | payload[11], serial = hex(payload.slice(12, 16));
    const n = payload[16], name = new TextDecoder().decode(payload.slice(17, 17 + n));
    if (REVOKED.includes(serial)) return { ok: false, reason: 'Esta licencia ha sido anulada.' };
    if (flags & 1) {
      const mine = await deviceId();
      if (hex(mine) !== hex(dev)) return { ok: false, reason: 'Esta clave es para otro móvil.' };
    }
    const expires = (flags & 2) && days ? new Date(EPOCH + (days + 1) * DAY) : null;
    if (expires && Date.now() > expires.getTime()) return { ok: false, reason: 'La licencia caducó el {0}.', args: [new Date(expires - DAY).toLocaleDateString((root.I18N && root.I18N.locale()) || 'es-ES')], name };
    return { ok: true, name, expires: expires ? new Date(expires - DAY) : null, device: !!(flags & 1), serial };
  }

  // Comprueba la licencia guardada (se vuelve a verificar la firma cada vez que se abre la app).
  async function check() {
    let key = '';
    try { key = localStorage.getItem('perezapp.license') || ''; } catch {}
    if (!PUBLIC_KEY) return { ok: true, disabled: true };
    if (!key) return { ok: false, reason: '' };
    return verify(key);
  }
  async function activate(key) {
    const r = await verify(key);
    if (r.ok) try { localStorage.setItem('perezapp.license', String(key).trim().toUpperCase()); } catch {}
    return r;
  }
  function deactivate() { try { localStorage.removeItem('perezapp.license'); } catch {} }

  // cabeceras para el servidor: la licencia guardada y el código de este móvil
  async function headers() {
    let key = ''; try { key = localStorage.getItem('perezapp.license') || ''; } catch {}
    return { 'X-Perezapp-License': key, 'X-Perezapp-Device': await deviceCode() };
  }

  root.PerezappLicense = { enabled: !!PUBLIC_KEY, check, activate, deactivate, deviceCode, verify, headers, SELLER_WHATSAPP, API_BASE, _b32: { b32encode, b32decode } };
})(typeof window !== 'undefined' ? window : globalThis);
