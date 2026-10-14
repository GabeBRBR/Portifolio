import { IfcAPI, LogLevel } from 'web-ifc';
import { buildBimIndex } from './ifc-index-builder.js';

/**
 * Builds the BIM index of an IFC opened by the user, off the main thread.
 * Message in:  { id, buffer: ArrayBuffer, wasmPath: string }
 * Messages out: { id, type: 'progress', fraction, label } | { id, type: 'done', index } | { id, type: 'error', message }
 */
let apiPromise = null;

function getApi(wasmPath) {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = new IfcAPI();
      api.SetWasmPath(wasmPath, true);
      await api.Init();
      api.SetLogLevel?.(LogLevel.LOG_LEVEL_OFF);
      return api;
    })();
  }
  return apiPromise;
}

self.onmessage = async (event) => {
  const { id, buffer, wasmPath } = event.data || {};
  try {
    const api = await getApi(wasmPath);
    const modelID = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: false });
    try {
      const index = buildBimIndex(api, modelID, {
        onProgress: (fraction, label) => self.postMessage({ id, type: 'progress', fraction, label })
      });
      self.postMessage({ id, type: 'done', index });
    } finally {
      api.CloseModel(modelID);
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || String(error) });
  }
};
