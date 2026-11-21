# Servidor de PerezApp (Cloudflare Worker)

Da la transcripción (Whisper Large v3) y la IA de texto a las apps con licencia válida, con la clave de Groq del titular.

- Comprueba la firma de la licencia (ECDSA P-256), el móvil, la caducidad y las anuladas.
- Límite de usos por licencia y día (KV `PZ_KV`).
- Solo hace las tareas de la app (corregir, retocar, traducir): no sirve como chat libre.
- Solo acepta peticiones desde los orígenes de `ALLOWED_ORIGINS`.

Configuración: `wrangler.toml` (variables) y el secreto `GROQ_API_KEY` en Cloudflare.
Anular una licencia sin redesplegar: en el KV `PZ_KV`, crear la clave `revoked:<número de serie>` con cualquier valor.
