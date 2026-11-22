# PerezApp 🦥

*Tú habla, que yo escribo.*

App web para dictar por voz en **7 idiomas** (español, catalán, inglés, francés, italiano, alemán y portugués; la app se pone sola en el idioma del móvil y detecta el idioma de cada mensaje), pensada para usar en el coche: el texto sale como un mensaje de chat, bien escrito y listo para enviar por **WhatsApp, Telegram, SMS, correo** o cualquier otra app. Todo cabe en una sola pantalla.

**Abrir:** https://iamikepm-ui.github.io/Transcribir-voz/

- **⚡ Rápido**: reconocimiento de voz de Google integrado en Chrome (texto mientras hablas, necesita conexión). Puntuación por voz: «coma», «punto», «punto y aparte»… / «coma», «punt», «punt i a part»…
- **🎯 Preciso**: Whisper Large v3 Turbo (OpenAI) o Cohere Transcribe, modelos gratuitos de código abierto que se ejecutan en el propio móvil con [Transformers.js](https://huggingface.co/docs/transformers.js). La primera vez descargan el modelo; después funcionan sin cobertura.
- **✨ IA de texto (con la misma clave de Groq)**: corrige ortografía, tildes y palabras mal oídas al terminar, y retoca el mensaje con un toque (más formal, más cercano, más corto, con emojis, más claro). Modelo gpt-oss-120b, con Qwen de reserva.
- **Mis palabras**: lista de nombres y lugares (Vilafranca, Jordi…) que la app escribe bien siempre; se usa en Whisper, en la IA y en una corrección propia que funciona sin internet.
- **🌐 Traducir** español ↔ catalán: con la IA de Groq si hay clave; si no, traductor integrado de Chrome u Opus-MT (Universidad de Helsinki) dentro del navegador.
- **🚗 Modo conducción**: pantalla simple con un botón enorme.
- **🗣️ Manos libres**: «Dile a Marta que llego en diez minutos», «Envíaselo a Jordi por Telegram», «Llama a Marta», «Más formal», «Tradúcelo al inglés», «Mi ubicación»… y responde a «¿Lo envío?» con «sí», «no», «léelo» o «sigue».
- **Modo conducción automático** (opcional): se activa al pasar de 20 km/h, con el GPS y solo mientras la app está abierta.
- **Accesos directos**: mantén pulsado el icono → «Dictar ahora» (abre escuchando) o «Modo conducción».
- **Listo para el siguiente**: al volver de WhatsApp, Telegram o SMS la pantalla queda vacía para dictar otro mensaje («Recuperar» por si no llegaste a enviarlo).
- **Estadísticas** en Ajustes: palabras dictadas, mensajes enviados y tiempo ahorrado sin teclear.
- **Formato de mensaje**: el saludo («Hola Marta,») en la primera línea, el mensaje debajo empezando en mayúscula y la despedida («Un abrazo.») en la última. En español y catalán.
- Opciones: parar solo al dejar de hablar, leer el texto en voz alta, abrir WhatsApp al terminar, contacto favorito, compartir, tema claro/oscuro, 6 colores, tamaño de letra, historial.
- En móvil se usa por defecto Whisper Small sin aceleración gráfica. Si Chrome se cierra al cargar un modelo, la app desactiva la aceleración y después baja de modelo.
- **☁️ Whisper Large v3 en la nube (Groq)**: la mejor calidad sin descargar nada; necesita una clave gratuita de console.groq.com, que se guarda solo en el móvil.
