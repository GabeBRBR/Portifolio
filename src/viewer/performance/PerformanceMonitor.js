const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

/** Development-only telemetry. Three.js exposes renderer.info for this exact use. */
export class PerformanceMonitor {
  constructor({ enabled, onUpdate }) {
    this.enabled = enabled;
    this.onUpdate = onUpdate;
    this.frameTimes = [];
    this.walkTimes = [];
    this.operations = new Map();
    this.resourceCycles = [];
    this.lastPublish = 0;
    this.firstUsableStartedAt = 0;
    this.firstUsableMs = null;
  }

  start() { return performance.now(); }
  end(name, startedAt) {
    const elapsed = performance.now() - startedAt;
    if (this.enabled) this.operations.set(name, elapsed);
    return elapsed;
  }
  beginFirstUsableFrame() {
    this.firstUsableStartedAt = performance.now();
    this.firstUsableMs = null;
  }
  recordWalkPhysics(milliseconds) { if (this.enabled) this.push(this.walkTimes, milliseconds); }
  recordResourceCycle(name, before, after, disposed) {
    if (!this.enabled) return;
    this.resourceCycles.push({ name, before, after, disposed });
    if (this.resourceCycles.length > 4) this.resourceCycles.shift();
  }
  recordFrame({ now, deltaMs, renderer, meshCount, materialCount }) {
    if (!this.enabled) return;
    this.push(this.frameTimes, deltaMs);
    if (meshCount && this.firstUsableStartedAt && this.firstUsableMs === null) this.firstUsableMs = now - this.firstUsableStartedAt;
    if (now - this.lastPublish < 400) return;
    this.lastPublish = now;
    const info = renderer.info;
    this.onUpdate?.({
      fps: Math.round(1000 / Math.max(mean(this.frameTimes), 0.001)), frameMs: mean(this.frameTimes), frameP95: percentile(this.frameTimes, .95), walkMs: mean(this.walkTimes),
      calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
      meshes: meshCount, materials: materialCount, firstUsableMs: this.firstUsableMs, operations: Object.fromEntries(this.operations), resourceCycle: this.resourceCycles.at(-1)
    });
  }
  push(values, value) { values.push(value); if (values.length > 120) values.shift(); }
}
