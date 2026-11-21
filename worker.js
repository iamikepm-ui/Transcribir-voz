// Whisper (OpenAI) o Cohere Transcribe (código abierto) ejecutándose en el propio navegador con Transformers.js (Hugging Face).
// Los modelos se descargan la primera vez desde huggingface.co y quedan guardados en el móvil.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

env.allowLocalModels = false;
let asr = null, loadedKey = '';

async function hasWebGPU() {
  try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { return false; }
}

async function load(model) {
  const gpu = await hasWebGPU();
  const key = model + (gpu ? ':gpu' : ':wasm');
  if (asr && loadedKey === key) return;
  const files = {};
  const progress = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let l = 0, t = 0; for (const f in files) { l += files[f][0]; t += files[f][1]; }
      postMessage({ type: 'progress', pct: Math.round(l / t * 100), mb: Math.round(t / 1048576) });
    }
  };
  const cohere = /cohere/.test(model), big = /large|turbo/.test(model);
  const gpuOpts = { device: 'webgpu', progress_callback: progress,
    dtype: cohere ? 'q4f16' : { encoder_model: big ? 'fp16' : 'fp32', decoder_model_merged: 'q4' } };
  const cpuOpts = { device: 'wasm', dtype: cohere ? { encoder_model: 'q4', decoder_model_merged: 'fp16' } : 'q8', progress_callback: progress };
  const name = cohere ? 'Cohere Transcribe' : 'Whisper';
  asr = null;
  if (gpu) {
    postMessage({ type: 'status', text: 'Cargando ' + name + ' (aceleración GPU)…' });
    try { asr = await pipeline('automatic-speech-recognition', model, gpuOpts); }
    catch (e) { asr = null; }
  }
  if (!asr) {
    postMessage({ type: 'status', text: 'Cargando ' + name + ' (CPU)…' });
    asr = await pipeline('automatic-speech-recognition', model, cpuOpts);
  }
  loadedKey = key;
  postMessage({ type: 'ready', gpu });
}

onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') await load(data.model);
    if (data.type === 'transcribe') {
      await load(data.model);
      postMessage({ type: 'status', text: 'Transcribiendo…' });
      const out = /cohere/.test(data.model)
        ? await asr(data.audio, { language: 'es', max_new_tokens: 1024 })
        : await asr(data.audio, { language: 'spanish', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      postMessage({ type: 'result', text: (out.text || '').trim() });
    }
  } catch (e) {
    postMessage({ type: 'error', text: String(e && e.message || e) });
  }
};
