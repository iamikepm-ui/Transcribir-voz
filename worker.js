// Motor de IA de Dictado, en un Web Worker para no bloquear la pantalla.
// - Voz a texto: Whisper (OpenAI) o Cohere Transcribe, modelos abiertos de Hugging Face, con Transformers.js.
// - Traducción español <-> catalán: Opus-MT (Universidad de Helsinki), versión ONNX de Chortan.
// Los modelos se descargan la primera vez y quedan guardados en el navegador.

// A los modelos de traducción de Chortan les falta tokenizer_config.json: se lo damos nosotros.
const realFetch = self.fetch.bind(self);
const MARIAN_CFG = JSON.stringify({ tokenizer_class: 'MarianTokenizer', model_max_length: 512, pad_token: '<pad>', eos_token: '</s>', unk_token: '<unk>' });
self.fetch = (url, opts) => /Chortan\/opus-mt-[a-z-]+\/resolve\/[^/]+\/tokenizer_config\.json/.test(String(url))
  ? Promise.resolve(new Response(MARIAN_CFG, { headers: { 'content-type': 'application/json' } }))
  : realFetch(url, opts);

let T = null;
const lib = async () => (T ??= await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2'));

let asr = null, asrKey = '';
const translators = {};
let gpuPromise = null;
const hasWebGPU = () => (gpuPromise ??= (async () => { try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { return false; } })());

function progressReporter(kind) {
  const files = {};
  return (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let l = 0, t = 0; for (const f in files) { l += files[f][0]; t += files[f][1]; }
      postMessage({ type: 'progress', kind, pct: Math.round(l / t * 100), mb: Math.round(t / 1048576) });
    }
  };
}

let loading = null, loadingKey = '';
async function loadAsr(model, mobile, allowGpu = true) {
  const k = model + '|' + mobile + '|' + allowGpu;
  if (loading && loadingKey === k) return loading;          // ya se está cargando: esperar a esa carga
  if (loading) { try { await loading; } catch {} }
  loadingKey = k; loading = loadAsrNow(model, mobile, allowGpu);
  try { return await loading; } finally { loading = null; }
}
async function loadAsrNow(model, mobile, allowGpu) {
  const { pipeline } = await lib();
  const gpu = allowGpu && await hasWebGPU();
  const key = model + (gpu ? ':gpu' : ':wasm');
  if (asr && asrKey === key) return;
  const cohere = /cohere/.test(model), big = /large|turbo/.test(model);
  const progress_callback = progressReporter('asr');
  const name = cohere ? 'Cohere Transcribe' : 'Whisper';
  if (asr && asr.dispose) { try { await asr.dispose(); } catch {} }
  asr = null;
  if (gpu) {
    postMessage({ type: 'status', key: 'Cargando {0} (aceleración GPU)…', args: [name] });
    try {
      asr = await pipeline('automatic-speech-recognition', model, {
        device: 'webgpu', progress_callback,
        // en móvil, Turbo comprimido (q4, ~760 MB): la versión fp16 (~1,6 GB) hace que Chrome se quede sin memoria
        dtype: cohere ? 'q4f16' : { encoder_model: big ? (mobile ? 'q4' : 'fp16') : 'fp32', decoder_model_merged: 'q4' },
      });
    } catch { asr = null; }
  }
  if (!asr) {
    postMessage({ type: 'status', key: 'Cargando {0} (CPU)…', args: [name] });
    asr = await pipeline('automatic-speech-recognition', model, {
      device: 'wasm', progress_callback,
      // en CPU el decodificador cuantizado de Cohere no funciona (GatherBlockQuantized): fp16
      dtype: cohere ? { encoder_model: 'q4', decoder_model_merged: 'fp16' } : (big && mobile ? { encoder_model: 'q4', decoder_model_merged: 'q4' } : 'q8'),
    });
  }
  asrKey = key;
  postMessage({ type: 'ready', gpu });
}

async function translate(dir, text) {
  const { pipeline } = await lib();
  if (!translators[dir]) {
    postMessage({ type: 'status', key: 'Cargando el traductor (solo la primera vez)…' });
    translators[dir] = await pipeline('translation', 'Chortan/opus-mt-' + dir, { dtype: 'q8', progress_callback: progressReporter('tr') });
  }
  // frase a frase (de golpe, el modelo a veces se salta frases); se conservan los saltos de línea
  const out = [];
  for (const line of text.split('\n')) {
    const parts = (line.match(/[^.!?…]+[.!?…]*/g) || []).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) { out.push(''); continue; }
    const res = await translators[dir](parts, { max_new_tokens: 256 });
    out.push(res.map((r) => r.translation_text).join(' '));
  }
  return out.join('\n');
}

onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') await loadAsr(data.model, data.mobile, data.gpu !== false);
    if (data.type === 'transcribe') {
      await loadAsr(data.model, data.mobile, data.gpu !== false);
      postMessage({ type: 'status', key: 'Transcribiendo…' });
      const out = /cohere/.test(data.model)
        ? await asr(data.audio, { language: data.clang || 'es', max_new_tokens: 1024 })
        : await asr(data.audio, { ...(data.wlang ? { language: data.wlang } : {}), task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      postMessage({ type: 'result', text: (out.text || '').trim() });
    }
    if (data.type === 'translate') {
      postMessage({ type: 'translated', text: await translate(data.dir, data.text) });
    }
  } catch (e) {
    postMessage({ type: 'error', text: String((e && e.message) || e) });
  }
};
