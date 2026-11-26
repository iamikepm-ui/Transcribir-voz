# PerezApp — notas para Claude (breve, para gastar pocos tokens)

PWA de dictado por voz para conductores. Web estática, sin build.

## Archivos
- `index.html` (~3000 líneas): CSS + HTML + todo el JS inline. **No lo leas entero**: busca con grep y lee solo el trozo.
  - Contactos/destinatario: `favs()`, `findFavs()`, `setRecipient()`, `doSend()`, `askWho()`, `deliver()`, `openOut()`.
  - Órdenes de voz: `CMDS_VOICE`, `SENDTO`, `TOONLY`, `matchCmd()`, `splitCommand()`, `runCmd()`.
  - Manos libres: `askToSend()`, `handleAnswer()`, `listenOnce()`; escucha continua: `wakeTick()`.
  - Grabación: `start()`, `stop()`, `startLive()` (Rápido, Web Speech) y `startAI()` (Preciso, Whisper/Groq o Worker).
- `i18n.js`: traducciones. Clave = texto en español → [ca, en, fr, it, de, pt]. Cada texto nuevo de la interfaz necesita su entrada.
- `format.js` (formato del mensaje), `licencia.js` (licencias), `sw.js` (service worker), `manifest.webmanifest`.
- `generador/`: generador de claves. El Worker de Cloudflare está en otro repo (`perezapp-api`).

## Publicar
- Sube la versión `vAAAA.MM.DD-N` en `index.html` (sed sobre todas las apariciones).
- `git push origin HEAD:main` y `git push origin HEAD:gh-pages` → https://iamikepm-ui.github.io/Transcribir-voz/
- Antes de cada commit: `git grep -c "gsk_"` debe dar 0 (nunca subir claves).

## Reglas
- Textos de la app en español de España, frases cortas.
- Sin nombres de modelos de IA en commits ni código.
- Los datos del titular en `privacidad.html` se dejan como `[Nombre o razón social]`, etc., hasta que el dueño los dé.
