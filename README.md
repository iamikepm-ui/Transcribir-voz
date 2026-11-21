# Dictado

App web para dictar por voz en **español o catalán**, pensada para usar en el coche: el texto sale bien escrito y listo para copiar o enviar por WhatsApp.

**Abrir:** https://iamikepm-ui.github.io/Transcribir-voz/

- **⚡ Rápido**: reconocimiento de voz de Google integrado en Chrome (texto mientras hablas, necesita conexión). Puntuación por voz: «coma», «punto», «punto y aparte»… / «coma», «punt», «punt i a part»…
- **🎯 Preciso**: Whisper Large v3 Turbo (OpenAI) o Cohere Transcribe, modelos gratuitos de código abierto que se ejecutan en el propio móvil con [Transformers.js](https://huggingface.co/docs/transformers.js). La primera vez descargan el modelo; después funcionan sin cobertura.
- **🌐 Traducir** español ↔ catalán: traductor integrado de Chrome; si no está disponible, Opus-MT (Universidad de Helsinki) dentro del navegador.
- **🚗 Modo conducción**: pantalla simple con un botón enorme.
- Opciones: parar solo al dejar de hablar, leer el texto en voz alta, abrir WhatsApp al terminar, contacto favorito, compartir, tema claro/oscuro, 6 colores, tamaño de letra, historial.
- En móvil, Whisper Turbo se carga comprimido (q4, ~760 MB); si aun así Chrome se queda sin memoria, la app pasa sola a un modelo más pequeño.
