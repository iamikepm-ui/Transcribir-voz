# Servidor de PerezApp (Cloudflare Worker)

Da la transcripción (Whisper Large v3) y la IA de texto a las apps con licencia válida, con la clave de Groq del titular.

## Publicarlo

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iamikepm-ui/Transcribir-voz/tree/main/servidor)

Pide la clave de Groq (`GROQ_API_KEY`), que se guarda cifrada como secreto en Cloudflare. El almacenamiento `PZ_KV` se crea solo.
Al terminar, comprueba `https://<tu-worker>.workers.dev/v1/health` → `{"ok":true,"configured":true,"storage":true}`
y pon esa dirección en `API_BASE` de `licencia.js`.

## Seguridad

- **Licencias**: firma ECDSA P-256 comprobada con la clave pública. El servidor no puede crear licencias y no guarda ningún secreto salvo la clave de Groq.
- **Móvil**: las licencias atadas a un móvil solo valen en ese móvil; las que valen «en cualquiera», como mucho en `MAX_DEVICES` móviles distintos (2 por defecto).
- **Caducidad** con la fecha del servidor (cambiar la fecha del móvil no sirve).
- **Anular licencias** desde el generador (botón «Anular»): la orden va firmada con la clave privada del titular, caduca a los 5 minutos y no se puede repetir. No hay contraseñas de administración que robar.
- **Límites**: usos por licencia y día (`LIMIT_STT_DAY`, `LIMIT_LLM_DAY`), ráfagas por minuto, tamaño máximo de audio (24 MB) y de texto.
- Solo hace las tareas de la app (corregir, retocar, traducir): no sirve como chat libre.
- Solo acepta peticiones desde la web de la app (`ALLOWED_ORIGINS`).
- Si el almacenamiento falla (p. ej. límite del plan gratuito: 1.000 escrituras al día), el servicio sigue funcionando; con muchos clientes conviene el plan Workers Paid (5 $/mes).

## Rutas

| Ruta | Qué hace |
|---|---|
| `GET /v1/health` | Estado del servidor |
| `POST /v1/license` | La app comprueba su licencia al abrirse (anulada, caducada…) |
| `POST /v1/transcribe` | Audio → texto |
| `POST /v1/chat` | Corregir, retocar o traducir |
| `POST /v1/admin` | Anular, reactivar o consultar una licencia (firmado por el generador) |
