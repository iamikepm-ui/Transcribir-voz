# Dictado

App web para dictar por voz en **español o catalán**, pensada para usar en el coche: el texto sale bien escrito y listo para copiar o enviar por WhatsApp.

**Abrir:** https://iamikepm-ui.github.io/Transcribir-voz/

- **⚡ Rápido**: reconocimiento de voz de Google integrado en Chrome (texto mientras hablas, necesita conexión). Puntuación por voz: «coma», «punto», «punto y aparte»… / «coma», «punt», «punt i a part»…
- **🎯 Preciso**: Whisper Large v3 Turbo (OpenAI) o Cohere Transcribe, modelos gratuitos de código abierto que se ejecutan en el propio móvil con [Transformers.js](https://huggingface.co/docs/transformers.js). La primera vez descargan el modelo; después funcionan sin cobertura.
- **🌐 Traducir** español ↔ catalán: traductor integrado de Chrome; si no está disponible, Opus-MT (Universidad de Helsinki) dentro del navegador.
- Botón grande para hablar, pitido y vibración, indicador de nivel de voz, cronómetro, copia automática, botón de WhatsApp e historial de mensajes recientes.
