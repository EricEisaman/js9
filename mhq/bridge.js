// js9/mhq/bridge.js — JS9 hijack, ~20 lines of wiring + helpers
// This is the ONLY code change to the forked JS9 repo (plus mhq-bridge.json + overlay.html).
// It does NOT import JS9 app code. JS9 code optionally calls window.mhq.js9 helpers.
// Single namespace: window.mhq only. No other window props.
// Flow: JS9 emits -> bridge emits objective:attempt -> HQ engine validates -> state patched.

import { MissionBridge } from 'https://ericeisaman.github.io/mission-hq/sdk/bridge.js';

const HQ_BASE = 'https://ericeisaman.github.io/mission-hq/';
let mhq = null;
let engine = null;
let lastRegionsJSON = '';
let lastDisplayJSON = '';

// Wait for JS9 global without blocking page load
function waitForJS9(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (window.JS9) return resolve(window.JS9);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

function safeRegions() {
  try {
    const regs = window.JS9?.GetRegions?.();
    if (!regs) return [];
    return Array.isArray(regs) ? regs : [regs];
  } catch { return []; }
}

function diameterFromRegions(regs) {
  for (const r of regs) {
    // DS9 region shapes: circle x y r, box x y w h, ellipse x y rx ry
    // JS9 GetRegions returns objects or strings — handle both
    const s = typeof r === 'string' ? r : (r?.shape ? `${r.shape} ${r.x || ''} ${r.y || ''} ${r.radius || r.width || ''}` : JSON.stringify(r));
    const mCircle = s.match(/circle.*?([\d.]+)\s*$/i);
    if (/circle/i.test(s) && mCircle) return { shape: 'circle', diameterPixels: parseFloat(mCircle[1]) * 2, raw: s };
    const mBox = s.match(/box.*?([\d.]+)\s+([\d.]+)\s*$/i);
    if (/box/i.test(s) && mBox) return { shape: 'box', diameterPixels: Math.max(parseFloat(mBox[1]), parseFloat(mBox[2])), raw: s };
  }
  return null;
}

async function validateAttempt(objectiveId, payload) {
  // HQ validates. Load engine lazily from HQ (uses cached mission.json in IndexedDB).
  try {
    if (!engine) {
      const mod = await import(HQ_BASE + 'sdk/hq-engine.js');
      engine = await mod.HQEngine.init('js9-olympiad-v1');
    }
    return await engine.handleAttempt(objectiveId, payload);
  } catch (e) {
    // Fallback: log event only. HQ will validate on return.
    console.warn('[mhq-js9] engine unavailable, event logged only', e);
    return { ok: false, reason: 'engine-unavailable' };
  }
}

async function recordMeasurement(id, extra = {}) {
  if (!mhq) return { ok: false, reason: 'not-connected' };
  const measurement = { id, ts: Date.now(), repo: 'js9', ...extra };
  await mhq.emit('objective:attempt', { objectiveId: 'obj-' + id.replace(/^obj-/, ''), payload: { measurements: [measurement] } });
  // Map measurement id -> objective id
  const map = {
    'casa-diameter': 'obj-casa-diameter',
    'casa-rgb': 'obj-three-color',
    'casa-expansion': 'obj-expansion',
    'light-curve': 'obj-light-curve',
    spectrum: 'obj-spectrum',
  };
  const objectiveId = map[id] || ('obj-' + id);
  const result = await validateAttempt(objectiveId, { measurements: [measurement] });
  return result;
}

async function recordRGB(filters) {
  // filters: [{ band: 'low', range: '600:1650', color: 'red' }, ...]
  return recordMeasurement('casa-rgb', { filters });
}

async function snapshot(label = 'snapshot') {
  if (!mhq) return null;
  try {
    // Find JS9 canvas — first canvas inside .JS9Display or document
    const canvas = document.querySelector('.JS9Display canvas') || document.querySelector('canvas');
    if (!canvas) return null;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return null;
    const assetId = `${label}-${Date.now()}`;
    await mhq.assets.put(assetId, blob, 'image/png');
    return assetId;
  } catch (e) { console.warn('[mhq-js9] snapshot failed', e); return null; }
}

async function init() {
  try {
    mhq = await MissionBridge.connect('js9-olympiad-v1', { repoId: 'js9' });
  } catch (e) {
    console.warn('[mhq-js9] not in a mission, JS9 standalone mode', e);
    return;
  }
  // Expose JS9 helpers under single namespace — JS9 code calls these, nothing else
  window.mhq.js9 = { recordMeasurement, recordRGB, snapshot, getRegions: safeRegions, diameterFromRegions };
  window.mhq.onMount(async ({ state }) => {
    console.log('[mhq-js9] mounted, progress', state?.progress);
  });
  await mhq.onMount(() => {});

  const JS9 = await waitForJS9();
  if (!JS9) return;

  // Hook JS9 events if available — no polling if callbacks exist
  try {
    if (typeof JS9.AddEventCallback === 'function') {
      JS9.AddEventCallback('onregionschange', async () => {
        const regs = safeRegions();
        const d = diameterFromRegions(regs);
        if (d) {
          // Do not auto-commit — student clicks "Record Measurement" in overlay.
          // We only cache latest for overlay to read.
          window.mhq.js9._latestDiameter = d;
        }
      });
    }
  } catch {}

  // Light polling for display changes (colormap/scale) — 1s, cheap, no state writes
  setInterval(() => {
    try {
      const cur = JSON.stringify({ regions: safeRegions().length, cmap: window.JS9?.GetColormap?.(), scale: window.JS9?.GetScale?.() });
      if (cur !== lastDisplayJSON) { lastDisplayJSON = cur; }
      const regsJSON = JSON.stringify(safeRegions());
      if (regsJSON !== lastRegionsJSON) {
        lastRegionsJSON = regsJSON;
        const d = diameterFromRegions(safeRegions());
        if (d) window.mhq.js9._latestDiameter = d;
      }
    } catch {}
  }, 1000);
}

// Auto-init when loaded as module
init();
export { recordMeasurement, recordRGB, snapshot };
