(() => {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

const descFields = [
  ['physicalTraits', 'Rasgos físicos', 'area'],
  ['outfit', 'Vestuario / outfit', 'area'],
  ['distinguishingFeatures', 'Rasgos distintivos', 'area'],
  ['freeformNotes', 'Notas libres', 'area']
];
const techFields = [
  ['lighting', 'Iluminación'],
  ['cameraLens', 'Cámara / lente'],
  ['mood', 'Mood / atmósfera'],
  ['colorPalette', 'Paleta de color']
];
const TECH_FIELD_OPTIONS = {
  lighting: ['Luz natural', 'Hora dorada', 'Luz de estudio', 'Contraluz', 'Luz dura', 'Luz difusa', 'Neón', 'Luz de vela', 'Claroscuro', 'Luz de mediodía'],
  cameraLens: ['35mm', '50mm', '85mm retrato', 'Gran angular 24mm', 'Teleobjetivo', 'Ojo de pez', 'Macro', 'Anamórfico cinematográfico', 'Cámara en mano'],
  mood: ['Misterioso', 'Melancólico', 'Épico', 'Romántico', 'Tenso', 'Sereno', 'Nostálgico', 'Onírico', 'Oscuro', 'Alegre'],
  colorPalette: ['Cálida', 'Fría', 'Monocromática', 'Alto contraste', 'Pastel', 'Saturada', 'Desaturada', 'Tonos tierra', 'Blanco y negro', 'Neón vibrante'],
  setting: ['Ciudad nocturna', 'Bosque', 'Interior minimalista', 'Playa', 'Desierto', 'Estudio fotográfico', 'Calle urbana', 'Montaña', 'Espacio futurista', 'Café']
};

const state = { fichas: [], fichaId: null, tab: 'ficha', availableTags: [], glossary: [] };

const DEFAULT_TAGS = [
  'cinematic', 'photorealistic', 'anime', 'fantasy', '8k detail', 'film grain',
  'shallow depth of field', 'moody atmosphere', 'volumetric light', 'concept art',
  'epic scale', 'studio lighting', 'golden hour', 'high contrast'
];

function emptyFicha() {
  const t = now();
  return {
    id: uid(), createdAt: t, updatedAt: t, name: 'Nueva ficha', locked: false,
    referenceImages: [],
    description: { physicalTraits: '', outfit: '', distinguishingFeatures: '', freeformNotes: '' },
    style: 'photoreal-cinematic', customStyle: '',
    technical: { lighting: '', cameraLens: '', mood: '', colorPalette: '', setting: '' },
    tags: [],
    generationMode: 'single',
    duoScene: { secondFichaId: '', scene: '', interaction: '', positionA: '', positionB: '', outfitA: '', outfitB: '', additionalInstructions: '', translations: {} },
    promptHistory: [],
    generations: []
  };
}

function ficha() { return state.fichas.find(f => f.id === state.fichaId); }

async function persist(f) {
  f.updatedAt = now();
  await DB.put('fichas', f);
  await refresh();
}

async function load() {
  state.fichas = await DB.all('fichas');
  state.availableTags = await DB.all('tags');
  if (!state.availableTags.length) {
    for (const label of DEFAULT_TAGS) await DB.put('tags', { id: uid(), label });
    state.availableTags = await DB.all('tags');
  }
  state.glossary = (await DB.get('settings', 'glossary'))?.entries || [];
  renderAll();
  repairMeigenResults().then(refresh).catch(() => { /* se reintenta en la próxima carga */ });
}
async function refresh() {
  state.fichas = await DB.all('fichas');
  state.availableTags = await DB.all('tags');
  renderAll();
}

function styleLabel(f) {
  if (f.style === 'custom') return f.customStyle || 'Personalizado';
  return PromptBuilder.STYLE_PRESETS[f.style]?.label || f.style || 'Sin estilo';
}

const buildPrompt = (f, platform) => PromptBuilder.build(f, { platform, glossary: state.glossary });
const pendingFor = f => PromptBuilder.pendingTranslations(f, state.glossary);
const generationMode = f => f.generationMode === 'duo' ? 'duo' : 'single';
const duoData = f => f.duoScene || (f.duoScene = { secondFichaId: '', scene: '', interaction: '', positionA: '', positionB: '', outfitA: '', outfitB: '', additionalInstructions: '', translations: {} });
const secondFicha = f => state.fichas.find(item => item.id === duoData(f).secondFichaId && item.id !== f.id);
const activePromptDraft = f => generationMode(f) === 'duo' ? f.duoPromptDraft : f.promptDraft;
const setActivePromptDraft = (f, draft) => { if (generationMode(f) === 'duo') f.duoPromptDraft = draft; else f.promptDraft = draft; };
const activePendingFor = f => generationMode(f) === 'duo'
  ? PromptBuilder.pendingDuoTranslations(f, secondFicha(f), duoData(f), state.glossary)
  : pendingFor(f);
const buildActivePrompt = (f, platform) => generationMode(f) === 'duo'
  ? PromptBuilder.buildDuo(f, secondFicha(f), duoData(f), { platform, glossary: state.glossary })
  : buildPrompt(f, platform);

function renderAll() { renderFichaList(); renderWorkspace(); }

function renderFichaList() {
  const q = $('#fichaSearch').value?.toLowerCase() || '';
  const list = state.fichas.filter(f => f.name.toLowerCase().includes(q)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('#fichaList').innerHTML = list.map(f => {
    const img = f.referenceImages.find(r => r.isPrimary) || f.referenceImages[0];
    return `<div class="ficha-card ${f.id === state.fichaId ? 'active' : ''}" data-ficha="${f.id}">
      ${img ? `<img src="${img.dataUrl}">` : `<div style="width:40px;height:40px;border-radius:6px;background:var(--panel2);flex:none"></div>`}
      <div class="meta"><b>${esc(f.name)}</b><small>${esc(styleLabel(f))}${f.locked ? ' · <span class="lock-badge">bloqueada</span>' : ''}</small></div>
    </div>`;
  }).join('') || '<p style="color:var(--muted)">Sin fichas aún</p>';
  $$('[data-ficha]').forEach(el => el.onclick = () => { state.fichaId = el.dataset.ficha; state.tab = 'ficha'; renderAll(); });
}

function renderWorkspace() {
  const f = ficha();
  if (!f) {
    $('#workspace').innerHTML = `<div class="empty"><h1>Ficha de Referencia</h1><p>Crea o selecciona una ficha para comenzar.</p></div>`;
    return;
  }
  $('#workspace').innerHTML = `
    <div class="hero">
      <div>
        <h1>${esc(f.name)}${f.locked ? ' <span class="lock-badge">🔒 Bloqueada</span>' : ''}</h1>
        <p>${esc(styleLabel(f))} · ${f.referenceImages.length} imagen(es) de referencia</p>
      </div>
      <div class="toolbar">
        <button data-action="toggle-lock">${f.locked ? 'Desbloquear' : 'Bloquear'}</button>
        <button class="danger" data-action="delete-ficha">Eliminar ficha</button>
      </div>
    </div>
    <nav class="tabs">${[['ficha', 'Ficha'], ['imagenes', 'Imágenes'], ['generar', 'Generar'], ['exportar', 'Exportar']].map(([id, label]) => `<button class="${state.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</nav>
    <div id="tabBody"></div>
  `;
  renderTab();
  bindWorkspaceGlobal();
}

function renderTab() {
  const f = ficha();
  const body = $('#tabBody');
  if (state.tab === 'ficha') body.innerHTML = tabFicha(f);
  if (state.tab === 'imagenes') body.innerHTML = tabImagenes(f);
  if (state.tab === 'generar') body.innerHTML = tabGenerar(f);
  if (state.tab === 'exportar') body.innerHTML = tabExportar(f);
  bindTab();
}

function bindWorkspaceGlobal() {
  $$('[data-tab]').forEach(b => b.onclick = () => { if ($('#fichaForm')?.dataset.dirty === 'true' && !confirm('Hay cambios sin guardar. ¿Salir y descartarlos?')) return; state.tab = b.dataset.tab; renderWorkspace(); });
  document.querySelector('[data-action="toggle-lock"]').onclick = async () => {
    const f = ficha();
    f.locked = !f.locked;
    await persist(f);
    toast(f.locked ? 'Ficha bloqueada' : 'Ficha desbloqueada');
  };
  document.querySelector('[data-action="delete-ficha"]').onclick = async () => {
    const f = ficha();
    if (!confirm(`¿Eliminar la ficha "${f.name}"? Esta acción no se puede deshacer.`)) return;
    await DB.del('fichas', f.id);
    state.fichaId = null;
    await refresh();
    toast('Ficha eliminada');
  };
}

function bindTab() {
  const f = ficha();
  if (state.tab === 'ficha') bindFichaTab(f);
  if (state.tab === 'imagenes') bindImagenesTab(f);
  if (state.tab === 'generar') bindGenerarTab(f);
  if (state.tab === 'exportar') bindExportarTab(f);
}

// ---- Tab: Ficha ----
function tabFicha(f) {
  return `<form id="fichaForm">
    <div class="card">
      <h2>Datos básicos</h2>
      <div class="form-grid">
        <label class="field"><span>Nombre</span><input name="name" value="${esc(f.name)}" required></label>
        <label class="field"><span>Estilo</span><select name="style">${Object.entries(PromptBuilder.STYLE_PRESETS).map(([k, v]) => `<option value="${k}" ${f.style === k ? 'selected' : ''}>${v.label}</option>`).join('')}<option value="custom" ${f.style === 'custom' ? 'selected' : ''}>Personalizado...</option></select></label>
        ${f.style === 'custom' ? `<label class="field full"><span>Descripción de estilo personalizado</span><input name="customStyle" value="${esc(f.customStyle || '')}"></label>` : ''}
        <div class="field full">
          <span>Tags</span>
          <div class="tag-picker" id="tagPicker"></div>
          <div class="tag-add-row">
            <input id="newTagInput" placeholder="Agregar tag nuevo...">
            <button type="button" id="addTagBtn">+ Agregar</button>
          </div>
          <input type="hidden" name="tags" id="tagsHidden" value="${esc((f.tags || []).join(','))}">
        </div>
      </div>
    </div>
    <div class="card">
      <h2>Descripción</h2><p class="hint">Escribe en español. Describe el resultado deseado e indica explícitamente qué quieres cambiar. Guarda antes de abrir Generar.</p>
      <div class="form-grid">
        ${descFields.map(([k, label, type]) => `<label class="field ${type ? 'full' : ''}"><span>${label}</span><textarea name="desc_${k}">${esc(f.description?.[k] || '')}</textarea></label>`).join('')}
        <label class="field full"><span>Escenario y acción</span><textarea name="tech_setting" placeholder="Dónde está, qué hace y con qué o quién interactúa">${esc(f.technical?.setting || '')}</textarea></label>
      </div>
    </div>
    <div class="card">
      <h2>Detalles técnicos</h2>
      <div class="form-grid">
        ${techFields.map(([k, label]) => `<label class="field"><span>${label}</span>
          <input name="tech_${k}" list="techlist_${k}" value="${esc(f.technical?.[k] || '')}" placeholder="Elegí de la lista o escribí el tuyo" autocomplete="off">
          <datalist id="techlist_${k}">${(TECH_FIELD_OPTIONS[k] || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>
        </label>`).join('')}
      </div>
    </div>
    <div class="toolbar"><button type="submit" class="primary">Guardar cambios</button></div>
  </form>`;
}

function bindTagPicker() {
  const hidden = $('#tagsHidden');
  const getSelected = () => new Set((hidden.value || '').split(',').map(s => s.trim()).filter(Boolean));
  function renderChips() {
    const selected = getSelected();
    $('#tagPicker').innerHTML = state.availableTags.map(t =>
      `<button type="button" class="tag-chip ${selected.has(t.label) ? 'selected' : ''}" data-tag="${esc(t.label)}">${esc(t.label)}</button>`
    ).join('') || '<span style="color:var(--muted);font-size:12px">Sin tags todavía, agrega el primero abajo</span>';
    $$('.tag-chip').forEach(chip => chip.onclick = () => {
      const sel = getSelected();
      const tag = chip.dataset.tag;
      if (sel.has(tag)) sel.delete(tag); else sel.add(tag);
      hidden.value = [...sel].join(',');
      renderChips();
    });
  }
  renderChips();
  $('#addTagBtn').onclick = async () => {
    const input = $('#newTagInput');
    const label = input.value.trim();
    if (!label) return;
    if (!state.availableTags.some(t => t.label.toLowerCase() === label.toLowerCase())) {
      await DB.put('tags', { id: uid(), label });
      state.availableTags = await DB.all('tags');
    }
    const sel = getSelected();
    sel.add(label);
    hidden.value = [...sel].join(',');
    input.value = '';
    renderChips();
  };
}

function bindFichaTab(f) {
  const form = $('#fichaForm');
  form.oninput = () => { form.dataset.dirty = 'true'; };
  bindTagPicker();
  const styleSelect = form.querySelector('[name=style]');
  styleSelect.onchange = () => {
    const existing = form.querySelector('[name=customStyle]');
    if (styleSelect.value === 'custom' && !existing) {
      const label = document.createElement('label');
      label.className = 'field full';
      label.innerHTML = `<span>Descripción de estilo personalizado</span><input name="customStyle" value="">`;
      styleSelect.closest('.form-grid').appendChild(label);
    } else if (styleSelect.value !== 'custom' && existing) {
      existing.closest('label').remove();
    }
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    f.name = fd.get('name') || 'Sin nombre';
    f.style = fd.get('style');
    f.customStyle = fd.get('customStyle') || '';
    f.tags = (fd.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
    f.description = {
      physicalTraits: fd.get('desc_physicalTraits') || '', outfit: fd.get('desc_outfit') || '',
      distinguishingFeatures: fd.get('desc_distinguishingFeatures') || '', freeformNotes: fd.get('desc_freeformNotes') || ''
    };
    f.technical = {
      lighting: fd.get('tech_lighting') || '', cameraLens: fd.get('tech_cameraLens') || '', mood: fd.get('tech_mood') || '',
      colorPalette: fd.get('tech_colorPalette') || '', setting: fd.get('tech_setting') || ''
    };
    await persist(f);
    toast('Ficha guardada');
  };
}

// ---- Tab: Imágenes ----
function tabImagenes(f) {
  return `
    <div class="card">
      <h2>Imágenes de referencia</h2>
      <label class="dropzone" id="dropzone"><input type="file" id="imgInput" accept="image/*" multiple>Arrastra imágenes aquí o haz clic para subir</label>
      <div class="images">${f.referenceImages.map(img => `
        <div class="imgcard">
          ${img.isPrimary ? '<span class="primary-badge">Principal</span>' : ''}
          <img src="${img.dataUrl}">
          <div class="body">
            <input data-note="${img.id}" value="${esc(img.note || '')}" placeholder="Nota (opcional)">
            <div class="row">
              <button data-primary="${img.id}" ${img.isPrimary ? 'disabled' : ''}>Marcar principal</button>
              <button class="danger" data-delimg="${img.id}">Eliminar</button>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Las APIs de generación viajan como JSON con la imagen en base64, y Vercel
// rechaza requests de más de ~4.5MB (Error 413) — fotos de celular sin
// redimensionar lo superan fácil. Bajamos a un tamaño razonable antes de
// guardar Y de nuevo justo antes de enviar (por si la imagen ya estaba
// guardada de antes de este fix, o vino de una ficha importada).
const MAX_REFERENCE_BYTES = 1_200_000;
// Pasadas progresivas: si tras redimensionar sigue pesando de más (fotos muy
// detalladas, o el primer intento no alcanzó), se aprieta más en cada vuelta.
const RESIZE_STEPS = [[1600, 0.85], [1280, 0.75], [960, 0.65], [720, 0.55]];

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo procesar esa imagen (formato no soportado por el navegador).'));
    img.src = dataUrl;
  });
}

async function resizeDataUrl(dataUrl, maxDim, quality) {
  const img = await loadImageElement(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function ensureSendableDataUrl(dataUrl) {
  if (dataUrl.startsWith('data:image/svg+xml') || dataUrl.length * 0.75 < MAX_REFERENCE_BYTES) return dataUrl;
  let current = dataUrl;
  for (const [dim, quality] of RESIZE_STEPS) {
    current = await resizeDataUrl(current, dim, quality);
    if (current.length * 0.75 < MAX_REFERENCE_BYTES) break;
  }
  return current;
}

// Mantiene el JSON por debajo del límite práctico de las funciones de Vercel.
// Siempre conserva la primera referencia, que es la identidad principal.
async function prepareReferencePayload(references, maxRefs, maxChars = 3_600_000) {
  const prepared = [];
  let usedChars = 0;
  for (const reference of references.slice(0, maxRefs)) {
    const dataUrl = await ensureSendableDataUrl(reference.dataUrl);
    if (prepared.length && usedChars + dataUrl.length > maxChars) break;
    prepared.push(dataUrl);
    usedChars += dataUrl.length;
  }
  return prepared;
}

async function fileToDataUrl(file) {
  return ensureSendableDataUrl(await readAsDataUrl(file));
}

async function importImages(files) {
  const f = ficha();
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    f.referenceImages.push({ id: uid(), dataUrl, note: '', isPrimary: f.referenceImages.length === 0 });
  }
  await persist(f);
  toast('Imágenes agregadas');
}

function bindImagenesTab(f) {
  const dz = $('#dropzone');
  $('#imgInput').onchange = e => importImages([...e.target.files]);
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    importImages([...e.dataTransfer.files].filter(file => file.type.startsWith('image/')));
  });
  $$('[data-note]').forEach(inp => inp.onchange = async () => {
    const img = f.referenceImages.find(x => x.id === inp.dataset.note);
    if (img) { img.note = inp.value; await persist(f); }
  });
  $$('[data-primary]').forEach(btn => btn.onclick = async () => {
    f.referenceImages.forEach(img => img.isPrimary = (img.id === btn.dataset.primary));
    await persist(f);
  });
  $$('[data-delimg]').forEach(btn => btn.onclick = async () => {
    f.referenceImages = f.referenceImages.filter(x => x.id !== btn.dataset.delimg);
    if (!f.referenceImages.some(x => x.isPrimary) && f.referenceImages.length) f.referenceImages[0].isPrimary = true;
    await persist(f);
  });
}

// ---- Tab: Generar ----
const FAL_IMAGE_MODELS = [
  { id: 'flux-kontext', label: 'Flux Kontext', maxRefs: 1 },
  { id: 'seedream-5-lite', label: 'Seedream 5.0 Lite', maxRefs: 10 },
  { id: 'seedream-5-pro', label: 'Seedream 5.0 Pro', maxRefs: 10 }
];
const FAL_VIDEO_MODELS = [
  { id: 'kling-3-pro', label: 'Kling 3.0 Pro', minDuration: 3, maxDuration: 15, resolutions: [] },
  { id: 'seedance-2', label: 'Seedance 2.0', minDuration: 4, maxDuration: 15, resolutions: ['480p', '720p', '1080p', '4k'] },
  { id: 'seedance-2-5', label: 'Seedance 2.5', minDuration: 4, maxDuration: 30, resolutions: ['480p', '720p', '1080p'] }
];

function generationOptions(f) {
  const saved = f.generationOptions || {};
  const duo = generationMode(f) === 'duo';
  return {
    falImageModel: saved.falImageModel || (duo ? 'seedream-5-pro' : 'flux-kontext'),
    falVideoModel: saved.falVideoModel || (duo ? 'seedance-2-5' : 'kling-3-pro'),
    videoDuration: Number(saved.videoDuration) || 5,
    videoResolution: saved.videoResolution || '720p',
    videoAudio: !!saved.videoAudio
  };
}

function latestPromptFor(f, platform) {
  const items = (f.promptHistory || []).filter(p => p.platform === platform);
  return items.length ? items[items.length - 1].prompt : null;
}

function genCard(g) {
  const statusClass = g.status === 'working' ? 'working' : g.status === 'error' ? 'error' : 'done';
  const statusLabel = g.status === 'working' ? 'Generando…' : g.status === 'error' ? 'Error' : 'Listo';
  let media;
  if (g.status === 'done') {
    media = g.kind === 'video'
      ? `<video src="${g.resultUrl}" controls></video>`
      : `<img src="${g.resultUrl}" class="previewable" data-preview-gen="${g.id}" title="Ver en grande">`;
  } else if (g.status === 'error') {
    media = `<div style="height:140px;display:flex;align-items:center;justify-content:center;color:var(--danger);padding:10px;text-align:center;font-size:12px">${esc(g.error || 'Error')}</div>`;
  } else {
    media = `<div style="height:140px;display:flex;align-items:center;justify-content:center;color:var(--muted)">Generando…</div>`;
  }
  return `<div class="gen-card">
    ${media}
    <div class="body">
      <span class="status-pill ${statusClass}">${statusLabel}</span>
      <small>${esc(providerLabel(g))} · ${new Date(g.createdAt).toLocaleString()}</small>
      ${g.mode === 'duo' ? `<small>Dos personajes${g.secondFichaName ? ` · ${esc(g.secondFichaName)}` : ''}</small>` : ''}
      <div class="row">
        ${g.status === 'done' && g.kind === 'image' ? `<button data-use-ref="${g.id}">Usar como referencia</button>` : ''}
        ${g.status === 'done' ? `<button data-preview-gen="${g.id}">Ver</button>` : ''}
        ${g.status === 'done' ? `<button data-download-gen="${g.id}">Descargar</button>` : ''}
        <button class="danger" data-delete-gen="${g.id}">Eliminar</button>
      </div>
    </div>
  </div>`;
}

function tabGenerar(f) {
  const mode = generationMode(f);
  const duo = duoData(f);
  const second = secondFicha(f);
  const draft = activePromptDraft(f);
  const initialPrompt = draft?.text ?? buildActivePrompt(f, 'nano-banana');
  const noRefs = !f.referenceImages.length;
  const secondOptions = state.fichas.filter(item => item.id !== f.id).map(item =>
    `<option value="${item.id}" ${duo.secondFichaId === item.id ? 'selected' : ''}>${esc(item.name)}${item.referenceImages?.length ? '' : ' · sin imagen'}</option>`).join('');
  const duoIncomplete = mode === 'duo' && (!second || !f.referenceImages.length || !second.referenceImages?.length);
  const options = generationOptions(f);
  const falImage = FAL_IMAGE_MODELS.find(model => model.id === options.falImageModel) || FAL_IMAGE_MODELS[0];
  const falVideo = FAL_VIDEO_MODELS.find(model => model.id === options.falVideoModel) || FAL_VIDEO_MODELS[0];
  const videoDuration = Math.min(falVideo.maxDuration, Math.max(falVideo.minDuration, options.videoDuration));
  const videoResolutions = falVideo.resolutions.length ? falVideo.resolutions : ['default'];
  const selectedResolution = videoResolutions.includes(options.videoResolution) ? options.videoResolution : videoResolutions[0];
  const falImageUnsupported = mode === 'duo' && falImage.maxRefs < 2;
  const falVideoUnsupported = mode === 'duo' && falVideo.id === 'kling-3-pro';
  const duoFields = mode === 'duo' ? `
    <div class="card duo-card">
      <h2>Escena con dos personajes</h2>
      <p class="hint">La ficha actual será el Personaje A. Elige otra ficha como Personaje B. Se usará la imagen principal de cada ficha para separar mejor sus identidades.</p>
      <div class="duo-characters">
        ${characterSelectorCard('A', f, true)}
        <div class="duo-plus" aria-hidden="true">+</div>
        <div class="character-card">
          <span class="character-label">Personaje B</span>
          <label class="field"><span>Elegir ficha</span><select id="duoSecondFicha"><option value="">Selecciona una ficha…</option>${secondOptions}</select></label>
          ${second ? characterSelectorCard('B', second, false, true) : '<div class="character-empty">Elige la segunda ficha.</div>'}
        </div>
      </div>
      ${state.fichas.length < 2 ? '<p class="validation-note">Necesitas al menos dos fichas guardadas.</p>' : ''}
      <div class="form-grid duo-form">
        <label class="field full"><span>Escenario</span><textarea data-duo-field="scene" placeholder="Ej. Frente a la Estatua de la Libertad durante un día despejado">${esc(duo.scene)}</textarea></label>
        <label class="field full"><span>Acción e interacción</span><textarea data-duo-field="interaction" placeholder="Ej. Están juntos, sonriendo y tomándose una fotografía">${esc(duo.interaction)}</textarea></label>
        <label class="field"><span>Posición del Personaje A</span><input data-duo-field="positionA" value="${esc(duo.positionA)}" placeholder="Ej. a la izquierda"></label>
        <label class="field"><span>Posición del Personaje B</span><input data-duo-field="positionB" value="${esc(duo.positionB)}" placeholder="Ej. a la derecha"></label>
        <label class="field"><span>Vestuario de A para esta escena (opcional)</span><input data-duo-field="outfitA" value="${esc(duo.outfitA)}" placeholder="Vacío conserva el de su ficha"></label>
        <label class="field"><span>Vestuario de B para esta escena (opcional)</span><input data-duo-field="outfitB" value="${esc(duo.outfitB)}" placeholder="Vacío conserva el de su ficha"></label>
        <label class="field full"><span>Indicaciones adicionales</span><textarea data-duo-field="additionalInstructions" placeholder="Encuadre, objetos, expresión o detalles que no deben cambiar">${esc(duo.additionalInstructions)}</textarea></label>
      </div>
    </div>` : '';
  return `
    <div class="card generation-mode-card">
      <h2>Tipo de generación</h2>
      <div class="mode-switch" role="group" aria-label="Tipo de generación">
        <button type="button" data-generation-mode="single" class="${mode === 'single' ? 'active' : ''}">Un personaje</button>
        <button type="button" data-generation-mode="duo" class="${mode === 'duo' ? 'active' : ''}">Dos personajes</button>
      </div>
      <p class="hint">${mode === 'duo' ? 'Cada ficha mantiene su propia identidad dentro de una misma escena.' : 'Generación individual con la ficha seleccionada.'}</p>
    </div>
    ${duoFields}
    <div class="card promptbox">
      <h2>Prompt</h2>
      <div class="form-grid">
        <label class="field"><span>Plantilla para plataforma</span><select id="promptPlatform">
          ${[['nano-banana', 'Nano Banana'], ['fal-image', 'Fal.ai (imagen)'], ['openai-image', 'ChatGPT (imagen)'], ['meigen-image', 'MeiGen (imagen)'], ['fal-video', 'Fal.ai (video)'], ['higgsfield', 'Higgsfield'], ['veo', 'Veo'], ['other', 'Otra plataforma']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}
        </select></label>
        <div class="field" style="align-self:end"><button type="button" id="regenPrompt">↻ Actualizar y traducir prompt</button></div>
      </div>
      <label class="field full"><span>Prompt (editable, en inglés)</span><textarea id="promptText">${esc(initialPrompt)}</textarea></label>
      <p id="translateStatus" role="status" aria-live="polite"></p>
    </div>

    <div class="card">
      <h2>Generar imagen / video</h2>
      ${f.locked ? '<p style="color:var(--muted)">Ficha bloqueada — desbloquéala para generar nuevas imágenes.</p>' : ''}
      ${noRefs ? '<p style="color:var(--muted)">Agrega al menos una imagen de referencia en la pestaña "Imágenes" antes de generar.</p>' : ''}
      ${duoIncomplete ? '<p class="validation-note">Para generar con dos personajes, ambas fichas deben estar seleccionadas y tener una imagen principal.</p>' : ''}
      <div class="gen-providers">
        <button class="provider-btn" data-generate="nano-banana" ${f.locked || noRefs ? 'disabled' : ''}><b>Nano Banana</b><small>Imagen · Gemini</small></button>
        <div class="provider-btn provider-config" style="gap:8px">
          <b>Fal.ai</b><small>Imagen · Flux o Seedream</small>
          <label class="field"><span>Modelo</span><select id="falImageModel">
            ${FAL_IMAGE_MODELS.map(model => `<option value="${model.id}" ${model.id === falImage.id ? 'selected' : ''}>${model.label}</option>`).join('')}
          </select></label>
          <small id="falImageNote">${falImageUnsupported ? 'Para dos personajes elige Seedream.' : falImage.id.startsWith('seedream') ? 'Seedream admite hasta 10 referencias.' : 'Flux usa una sola referencia.'}</small>
          <button data-generate="fal-image" ${f.locked || noRefs || falImageUnsupported ? 'disabled' : ''}>Generar imagen</button>
        </div>
        <button class="provider-btn" data-generate="openai-image" ${f.locked || noRefs ? 'disabled' : ''}><b>OpenAI</b><small>Imagen · GPT Image 2.5</small></button>
        <div class="provider-btn" style="gap:8px">
          <b>MeiGen</b><small>Imagen · varios modelos</small>
          <label class="field" style="margin-top:4px"><span>Modelo</span><select id="meigenModel">
            ${MEIGEN_MODELS.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
          </select></label>
          <button data-generate="meigen-image" ${f.locked || noRefs ? 'disabled' : ''}>Generar imagen</button>
        </div>
        <div class="provider-btn provider-config" style="gap:8px">
          <b>Fal.ai</b><small>Video · Kling o Seedance</small>
          <label class="field"><span>Modelo</span><select id="falVideoModel">
            ${FAL_VIDEO_MODELS.map(model => `<option value="${model.id}" ${model.id === falVideo.id ? 'selected' : ''}>${model.label}</option>`).join('')}
          </select></label>
          <div class="provider-options-row">
            <label class="field"><span>Duración (seg)</span><input id="videoDuration" type="number" min="${falVideo.minDuration}" max="${falVideo.maxDuration}" value="${videoDuration}"></label>
            <label class="field"><span>Resolución</span><select id="videoResolution">
              ${videoResolutions.map(value => `<option value="${value}" ${value === selectedResolution ? 'selected' : ''}>${value === 'default' ? 'Del modelo' : value}</option>`).join('')}
            </select></label>
          </div>
          <label class="provider-check"><input id="videoAudio" type="checkbox" ${options.videoAudio ? 'checked' : ''}> Generar audio</label>
          <small id="falVideoNote">${falVideoUnsupported ? 'Para dos personajes elige Seedance.' : falVideo.id.startsWith('seedance') ? 'Seedance puede usar las dos fichas.' : 'Kling usa una sola imagen inicial.'}</small>
          <button data-generate="fal-video" ${f.locked || noRefs || falVideoUnsupported ? 'disabled' : ''}>Generar video</button>
          <small>Se descuenta de tus créditos de Fal.ai según el modelo, la duración y la resolución.</small>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Resultados</h2>
      <div class="generations">${(f.generations || []).slice().reverse().map(genCard).join('') || '<p style="color:var(--muted)">Sin generaciones todavía</p>'}</div>
    </div>
  `;
}

function primaryReference(f) {
  return f?.referenceImages?.find(r => r.isPrimary) || f?.referenceImages?.[0];
}

function characterSelectorCard(label, f, compact = false, nested = false) {
  const ref = primaryReference(f);
  const content = `${ref ? `<img src="${ref.dataUrl}" alt="Referencia principal de ${esc(f.name)}">` : '<div class="character-placeholder">Sin imagen principal</div>'}
    <div class="character-meta"><b>${esc(f.name)}</b><small>${f.referenceImages?.length || 0} referencia(s)</small></div>`;
  if (nested) return `<div class="character-summary">${content}</div>`;
  return `<div class="character-card ${compact ? 'current' : ''}"><span class="character-label">Personaje ${label}</span>${content}</div>`;
}

// Traduce con IA los campos de texto libre que aún no tienen traducción guardada.
// Guarda sin re-renderizar para no pisar lo que el usuario tenga en la casilla del prompt.
async function ensureTranslations(f) {
  const pending = pendingFor(f);
  const keys = Object.keys(pending);
  if (!keys.length) return;
  const gl = PromptBuilder.glossaryKey(state.glossary);
  for (let offset = 0; offset < keys.length; offset += 20) {
    const batch = keys.slice(offset, offset + 20);
    const { translations, untranslated = [] } = await callApi('/api/translate-prompt', {
      method: 'POST', signal: AbortSignal.timeout(45000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: Object.fromEntries(batch.map(k => [k, pending[k]])), glossary: PromptBuilder.cleanGlossary(state.glossary) })
    });
    const fresh = Object.fromEntries(batch.filter(k => !untranslated.includes(k) && translations?.[k]).map(k => [k, { src: pending[k], en: translations[k], gl }]));
    f.translations = { ...(f.translations || {}), ...fresh };
    f.updatedAt = now();
    await DB.put('fichas', f);
  }
}

async function ensureDuoTranslations(f) {
  const second = secondFicha(f);
  if (!second) throw new Error('Selecciona la ficha del Personaje B.');
  await ensureTranslations(f);
  await ensureTranslations(second);
  const duo = duoData(f);
  const pending = PromptBuilder.pendingDuoTranslations(f, second, duo, state.glossary);
  const duoEntries = Object.entries(pending).filter(([key]) => key.startsWith('duo:'));
  if (!duoEntries.length) return;
  const gl = PromptBuilder.glossaryKey(state.glossary);
  for (let offset = 0; offset < duoEntries.length; offset += 20) {
    const batch = duoEntries.slice(offset, offset + 20);
    const fields = Object.fromEntries(batch.map(([key, value]) => [key.slice(4), value]));
    const { translations, untranslated = [] } = await callApi('/api/translate-prompt', {
      method: 'POST', signal: AbortSignal.timeout(45000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields, glossary: PromptBuilder.cleanGlossary(state.glossary) })
    });
    const fresh = Object.fromEntries(Object.keys(fields)
      .filter(key => !untranslated.includes(key) && translations?.[key])
      .map(key => [key, { src: fields[key], en: translations[key], gl }]));
    duo.translations = { ...(duo.translations || {}), ...fresh };
    f.updatedAt = now();
    await DB.put('fichas', f);
  }
}

function promptSignature(f) {
  // Cambiar esta versión cuando cambie la estructura o las reglas del prompt.
  if (generationMode(f) === 'duo') {
    const second = secondFicha(f);
    return JSON.stringify(['v2.2-duo', f.description, second?.id, second?.description, duoData(f), f.technical, f.style, f.customStyle, f.tags, state.glossary]);
  }
  return JSON.stringify(['v2.1-identity', f.description, f.technical, f.style, f.customStyle, f.tags, state.glossary]);
}
let translating = false;
function updatePromptStatus(f, message) {
  const pending = Object.keys(activePendingFor(f)).length > 0;
  const draft = activePromptDraft(f);
  const stale = !draft || draft.signature !== promptSignature(f);
  const second = secondFicha(f);
  const missingRefs = !f.referenceImages.length || (generationMode(f) === 'duo' && (!second || !second.referenceImages?.length));
  const status = $('#translateStatus');
  if (status) status.textContent = message || (translating ? 'Traduciendo al inglés…' : stale || pending
    ? 'Prompt pendiente de actualizar. Pulsa «Actualizar y traducir prompt».'
    : 'Prompt actualizado en inglés. Puedes revisarlo y editarlo antes de generar.');
  $$('[data-generate]').forEach(btn => {
    const unsupportedDuo = generationMode(f) === 'duo' && (
      (btn.dataset.generate === 'fal-image' && ($('#falImageModel')?.value || generationOptions(f).falImageModel) === 'flux-kontext') ||
      (btn.dataset.generate === 'fal-video' && ($('#falVideoModel')?.value || generationOptions(f).falVideoModel) === 'kling-3-pro')
    );
    btn.disabled = translating || pending || stale || f.locked || missingRefs || unsupportedDuo;
  });
}
async function regeneratePrompt(f, { automatic = false } = {}) {
  if (translating) return;
  const currentDraft = activePromptDraft(f);
  if (!automatic && currentDraft?.manual && !confirm('Actualizar reemplazará tus cambios manuales del prompt por los datos de la ficha. ¿Continuar?')) return;
  const textarea = $('#promptText');
  const platform = $('#promptPlatform').value;
  const before = textarea.value;
  translating = true;
  $('#regenPrompt').disabled = true;
  updatePromptStatus(f);
  try {
    if (generationMode(f) === 'duo') await ensureDuoTranslations(f); else await ensureTranslations(f);
    if (Object.keys(activePendingFor(f)).length) throw new Error('Quedan campos sin traducir. Intenta de nuevo.');
    if (!document.body.contains(textarea)) return;
    if (textarea.value !== before) throw new Error('El prompt fue editado durante la traducción. Se conservó tu texto; pulsa actualizar cuando estés listo.');
    textarea.value = buildActivePrompt(f, platform);
    setActivePromptDraft(f, { text: textarea.value, signature: promptSignature(f), manual: false, platform });
    await DB.put('fichas', f);
    updatePromptStatus(f, 'Prompt actualizado en inglés.');
  } catch (err) {
    updatePromptStatus(f, `No se pudo actualizar: ${err.message}`);
  } finally {
    translating = false;
    if (document.body.contains(textarea)) {
      $('#regenPrompt').disabled = false;
      const message = $('#translateStatus').textContent;
      updatePromptStatus(f, message);
    }
  }
}

function bindGenerarTab(f) {
  const draft = activePromptDraft(f);
  if (draft?.platform) $('#promptPlatform').value = draft.platform;
  $$('[data-generation-mode]').forEach(btn => btn.onclick = async () => {
    const next = btn.dataset.generationMode;
    if (next === generationMode(f)) return;
    f.generationMode = next;
    f.updatedAt = now();
    await DB.put('fichas', f);
    renderWorkspace();
  });
  const secondSelect = $('#duoSecondFicha');
  if (secondSelect) secondSelect.onchange = async e => {
    duoData(f).secondFichaId = e.target.value;
    f.updatedAt = now();
    await DB.put('fichas', f);
    renderWorkspace();
  };
  $$('[data-duo-field]').forEach(input => input.oninput = e => {
    duoData(f)[e.target.dataset.duoField] = e.target.value;
    f.updatedAt = now();
    DB.put('fichas', f).catch(err => toast(`No se pudo guardar la escena: ${err.message}`));
    updatePromptStatus(f);
  });
  $('#regenPrompt').onclick = () => regeneratePrompt(f);
  $('#promptText').oninput = e => {
    setActivePromptDraft(f, { ...activePromptDraft(f), text: e.target.value, manual: true });
    DB.put('fichas', f).catch(err => toast(`No se pudo guardar el prompt: ${err.message}`));
  };
  $('#promptPlatform').onchange = e => {
    const active = activePromptDraft(f);
    if (active) { active.platform = e.target.value; DB.put('fichas', f); }
  };
  const saveGenerationOption = (key, value) => {
    f.generationOptions = { ...(f.generationOptions || {}), [key]: value };
    f.updatedAt = now();
    return DB.put('fichas', f);
  };
  const falImageSelect = $('#falImageModel');
  if (falImageSelect) falImageSelect.onchange = async e => {
    await saveGenerationOption('falImageModel', e.target.value);
    renderWorkspace();
  };
  const falVideoSelect = $('#falVideoModel');
  if (falVideoSelect) falVideoSelect.onchange = async e => {
    await saveGenerationOption('falVideoModel', e.target.value);
    renderWorkspace();
  };
  const videoDuration = $('#videoDuration');
  if (videoDuration) videoDuration.onchange = e => saveGenerationOption('videoDuration', Number(e.target.value));
  const videoResolution = $('#videoResolution');
  if (videoResolution) videoResolution.onchange = e => saveGenerationOption('videoResolution', e.target.value);
  const videoAudio = $('#videoAudio');
  if (videoAudio) videoAudio.onchange = e => saveGenerationOption('videoAudio', e.target.checked);
  updatePromptStatus(f);
  if (!activePromptDraft(f) && (generationMode(f) === 'single' || secondFicha(f))) regeneratePrompt(f, { automatic: true });
  $$('[data-generate]').forEach(btn => btn.onclick = () => startGeneration(f, btn.dataset.generate));
  $$('[data-use-ref]').forEach(btn => btn.onclick = () => useGenerationAsReference(f, btn.dataset.useRef));
  $$('[data-download-gen]').forEach(btn => btn.onclick = () => downloadGeneration(f, btn.dataset.downloadGen));
  $$('[data-preview-gen]').forEach(el => el.onclick = () => openGenerationPreview(f, el.dataset.previewGen));
  $$('[data-delete-gen]').forEach(btn => btn.onclick = async () => {
    f.generations = f.generations.filter(x => x.id !== btn.dataset.deleteGen);
    await persist(f);
  });
}

async function callApi(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (res.status === 413) {
    const sentMB = typeof opts?.body === 'string' ? (opts.body.length / 1024 / 1024).toFixed(2) : '?';
    throw new Error(`La imagen de referencia sigue siendo muy grande (se enviaron ${sentMB}MB). Probá con otra foto.`);
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
function mimeFromDataUrl(dataUrl) { return (dataUrl.match(/^data:(.*?);base64,/) || [])[1] || 'image/png'; }
function base64FromDataUrl(dataUrl) { return dataUrl.split(',')[1] || ''; }

function generationSource(f) {
  if (generationMode(f) !== 'duo') return f;
  const second = secondFicha(f);
  const refs = [primaryReference(f), primaryReference(second)].filter(Boolean);
  return { ...f, referenceImages: refs };
}

async function apiNanoBanana(f, prompt) {
  const referenceImages = await Promise.all(f.referenceImages.map(async r => {
    const dataUrl = await ensureSendableDataUrl(r.dataUrl);
    return { data: base64FromDataUrl(dataUrl), mimeType: mimeFromDataUrl(dataUrl) };
  }));
  const data = await callApi('/api/generate-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, referenceImages }) });
  return `data:${data.mimeType};base64,${data.imageBase64}`;
}
async function apiFalImage(f, prompt, modelId) {
  const model = FAL_IMAGE_MODELS.find(item => item.id === modelId) || FAL_IMAGE_MODELS[0];
  const ordered = [...f.referenceImages].sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary));
  const imageDataUrls = await prepareReferencePayload(ordered, model.maxRefs);
  const data = await callApi('/api/generate-fal-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, imageDataUrls, modelId: model.id }) });
  return toLocalDataUrl(data.imageUrl);
}
async function apiFalVideoSubmit(f, prompt, { modelId, durationSeconds, generateAudio, resolution, referenceNames = [] }) {
  const ordered = [...f.referenceImages].sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary));
  const references = generationMode(f) === 'duo' ? ordered.slice(0, 2) : ordered.slice(0, 1);
  const imageDataUrls = await Promise.all(references.map(r => ensureSendableDataUrl(r.dataUrl)));
  const mappedPrompt = imageDataUrls.length > 1 && modelId.startsWith('seedance')
    ? `Reference mapping: @Image1 is Character A${referenceNames[0] ? ` (${referenceNames[0]})` : ''}; @Image2 is Character B${referenceNames[1] ? ` (${referenceNames[1]})` : ''}.\n\n${prompt}`
    : prompt;
  return callApi('/api/generate-fal-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: mappedPrompt, imageDataUrls, modelId, durationSeconds, generateAudio, resolution })
  });
}
async function apiOpenAiImage(f, prompt) {
  // La referencia principal se envía primero: es la identidad autoritativa.
  const ordered = [...f.referenceImages].sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary));
  const referenceImages = await Promise.all(ordered.map(r => ensureSendableDataUrl(r.dataUrl)));
  const data = await callApi('/api/generate-openai-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, referenceImages }) });
  return `data:${data.mimeType};base64,${data.imageBase64}`;
}

// maxRefs: límite de imágenes de referencia por modelo según la API de MeiGen.
const MEIGEN_MODELS = [
  { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro', maxRefs: 10 },
  { id: 'gpt-image-2.5', label: 'GPT Image 2.5', maxRefs: 16 },
  { id: 'gemini-3-pro-image-preview', label: 'Nanobanana Pro', maxRefs: 14 },
  { id: 'nanobanana-2', label: 'Nanobanana 2', maxRefs: 14 },
  { id: 'midjourney-v8.1', label: 'Midjourney V8.2', maxRefs: 1 },
  { id: 'grok-image', label: 'Grok Imagine 2.0', maxRefs: 3 }
];
const MEIGEN_POLL_MS = 3000;

async function apiMeigenSubmit(f, prompt, modelId) {
  const model = MEIGEN_MODELS.find(m => m.id === modelId) || MEIGEN_MODELS[0];
  // La principal va primero para que sobreviva al recorte en modelos con pocas referencias.
  const ordered = [...f.referenceImages].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  const referenceImages = await Promise.all(ordered.slice(0, model.maxRefs).map(r => ensureSendableDataUrl(r.dataUrl)));
  const data = await callApi('/api/generate-meigen-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, referenceImages, modelId: model.id }) });
  return data.generationId;
}

// images.meigen.ai bloquea peticiones con Referer de otro sitio: se descarga vía nuestro servidor.
function meigenProxyUrl(url) { return `/api/meigen-image?url=${encodeURIComponent(url)}`; }
function isMeigenCdnUrl(url) { return typeof url === 'string' && url.startsWith('https://images.meigen.ai/'); }

// Resultados de MeiGen guardados antes del proxy quedaron con la URL directa del CDN (no carga).
async function repairMeigenResults() {
  for (const f of state.fichas) {
    const broken = (f.generations || []).filter(g => g.status === 'done' && isMeigenCdnUrl(g.resultUrl));
    if (!broken.length) continue;
    for (const g of broken) g.resultUrl = await toLocalDataUrl(meigenProxyUrl(g.resultUrl));
    f.updatedAt = now();
    await DB.put('fichas', f);
  }
}

async function pollMeigen(fichaId, genId, generationId) {
  try {
    const data = await callApi(`/api/meigen-status?id=${encodeURIComponent(generationId)}`);
    if (data.status === 'completed' && data.imageUrl) {
      const resultUrl = await toLocalDataUrl(meigenProxyUrl(data.imageUrl));
      await finishGeneration(fichaId, genId, { status: 'done', resultUrl });
      return;
    }
    if (data.status === 'failed' || data.status === 'completed') {
      await finishGeneration(fichaId, genId, { status: 'error', error: data.error || 'La generación falló en MeiGen.' });
      return;
    }
    setTimeout(() => pollMeigen(fichaId, genId, generationId), MEIGEN_POLL_MS);
  } catch (err) {
    await finishGeneration(fichaId, genId, { status: 'error', error: err.message });
  }
}

async function finishGeneration(fichaId, genId, patch) {
  const fresh = await DB.get('fichas', fichaId);
  if (!fresh) return;
  const g = fresh.generations.find(x => x.id === genId);
  if (!g) return;
  Object.assign(g, patch);
  fresh.updatedAt = now();
  await DB.put('fichas', fresh);
  if (state.fichaId === fichaId) await refresh();
}

async function pollFalVideo(fichaId, genId, requestId, routeKey) {
  try {
    const routeQuery = routeKey ? `&routeKey=${encodeURIComponent(routeKey)}` : '';
    const statusData = await callApi(`/api/fal-video-status?requestId=${encodeURIComponent(requestId)}${routeQuery}`);
    if (statusData.status === 'COMPLETED') {
      const resultData = await callApi(`/api/fal-video-result?requestId=${encodeURIComponent(requestId)}${routeQuery}`);
      const resultUrl = await toLocalDataUrl(resultData.videoUrl);
      await finishGeneration(fichaId, genId, { status: 'done', resultUrl });
      return;
    }
    if (statusData.status === 'ERROR') {
      await finishGeneration(fichaId, genId, { status: 'error', error: 'La generación de video falló en Fal.ai.' });
      return;
    }
    setTimeout(() => pollFalVideo(fichaId, genId, requestId, routeKey), 5000);
  } catch (err) {
    await finishGeneration(fichaId, genId, { status: 'error', error: err.message });
  }
}

async function startGeneration(f, provider) {
  const draft = activePromptDraft(f);
  const second = secondFicha(f);
  if (generationMode(f) === 'duo' && (!second || !primaryReference(f) || !primaryReference(second))) {
    updatePromptStatus(f, 'Selecciona dos fichas que tengan una imagen principal.');
    return;
  }
  const falImageModelId = $('#falImageModel')?.value || generationOptions(f).falImageModel;
  const falVideoModelId = $('#falVideoModel')?.value || generationOptions(f).falVideoModel;
  if (generationMode(f) === 'duo' && provider === 'fal-image' && falImageModelId === 'flux-kontext') return toast('Para dos personajes elige Seedream en Fal.ai.');
  if (generationMode(f) === 'duo' && provider === 'fal-video' && falVideoModelId === 'kling-3-pro') return toast('Para dos personajes elige Seedance en Fal.ai.');
  if (translating || Object.keys(activePendingFor(f)).length || draft?.signature !== promptSignature(f)) {
    updatePromptStatus(f, 'Actualiza y traduce el prompt antes de generar.');
    return;
  }
  const modelId = $('#meigenModel')?.value;
  const selectedMeigen = MEIGEN_MODELS.find(m => m.id === modelId);
  if (generationMode(f) === 'duo' && provider === 'meigen-image' && selectedMeigen?.maxRefs < 2) {
    toast('El modelo elegido de MeiGen admite una sola referencia. Elige otro modelo para dos personajes.');
    return;
  }
  const duration = +($('#videoDuration')?.value || 5);
  const audio = !!$('#videoAudio')?.checked;
  const resolution = $('#videoResolution')?.value || '720p';
  const prompt = $('#promptText').value.trim();
  if (!prompt) return toast('Escribe un prompt primero');
  const platformTag = provider === 'fal-video' ? 'fal-video' : provider;
  f.promptHistory.push({ id: uid(), platform: platformTag, prompt, createdAt: now() });
  const selectedModel = provider === 'fal-image' ? falImageModelId : provider === 'fal-video' ? falVideoModelId : provider === 'meigen-image' ? modelId : undefined;
  const gen = { id: uid(), provider, model: selectedModel, prompt, mode: generationMode(f), secondFichaId: second?.id, secondFichaName: second?.name, kind: provider === 'fal-video' ? 'video' : 'image', status: 'working', createdAt: now() };
  f.generations.push(gen);
  await persist(f);

  const fichaId = f.id, genId = gen.id;
  const source = generationSource(f);
  try {
    if (provider === 'nano-banana') {
      const resultUrl = await apiNanoBanana(source, prompt);
      await finishGeneration(fichaId, genId, { status: 'done', resultUrl });
    } else if (provider === 'fal-image') {
      const resultUrl = await apiFalImage(source, prompt, falImageModelId);
      await finishGeneration(fichaId, genId, { status: 'done', resultUrl });
    } else if (provider === 'openai-image') {
      const resultUrl = await apiOpenAiImage(source, prompt);
      await finishGeneration(fichaId, genId, { status: 'done', resultUrl });
    } else if (provider === 'meigen-image') {
      const generationId = await apiMeigenSubmit(source, prompt, modelId);
      await finishGeneration(fichaId, genId, { generationId, model: modelId });
      pollMeigen(fichaId, genId, generationId);
    } else if (provider === 'fal-video') {
      const submission = await apiFalVideoSubmit(source, prompt, {
        modelId: falVideoModelId,
        durationSeconds: duration,
        generateAudio: audio,
        resolution,
        referenceNames: [f.name, second?.name]
      });
      await finishGeneration(fichaId, genId, { requestId: submission.requestId, routeKey: submission.routeKey });
      pollFalVideo(fichaId, genId, submission.requestId, submission.routeKey);
    }
  } catch (err) {
    await finishGeneration(fichaId, genId, { status: 'error', error: err.message });
  }
}

async function urlToDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Fal.ai devuelve URLs remotas (expiran y no cachean bien offline); las
// bajamos como data URL apenas terminan para que queden disponibles sin conexión.
async function toLocalDataUrl(url) {
  try { return await urlToDataUrl(url); }
  catch { return url; }
}

async function useGenerationAsReference(f, genId) {
  const g = f.generations.find(x => x.id === genId);
  if (!g || g.kind !== 'image') return;
  let dataUrl = g.resultUrl;
  if (!dataUrl.startsWith('data:')) {
    try { dataUrl = await urlToDataUrl(dataUrl); }
    catch { return toast('No se pudo descargar la imagen generada'); }
  }
  f.referenceImages.push({ id: uid(), dataUrl, note: `Generada: ${g.provider}`, isPrimary: false });
  await persist(f);
  toast('Imagen añadida como referencia');
}

function providerLabel(g) {
  if (g.provider === 'meigen-image') {
    const model = MEIGEN_MODELS.find(m => m.id === g.model);
    return `MeiGen · ${model ? model.label : g.model || 'modelo por defecto'}`;
  }
  if (g.provider === 'fal-image') {
    const model = FAL_IMAGE_MODELS.find(m => m.id === g.model);
    return `Fal.ai · ${model ? model.label : g.model || 'Imagen'}`;
  }
  if (g.provider === 'fal-video') {
    const model = FAL_VIDEO_MODELS.find(m => m.id === g.model);
    return `Fal.ai · ${model ? model.label : g.model || 'Video'}`;
  }
  return g.provider;
}

// Visor a tamaño completo (la miniatura de la tarjeta va recortada con object-fit:cover).
function openGenerationPreview(f, genId) {
  const g = f.generations.find(x => x.id === genId);
  if (!g || g.status !== 'done') return;
  const dialog = document.createElement('dialog');
  dialog.className = 'gen-preview';
  const media = g.kind === 'video'
    ? `<video src="${g.resultUrl}" controls autoplay></video>`
    : `<img src="${g.resultUrl}" alt="Imagen generada">`;
  dialog.innerHTML = `
    <div class="gen-preview-media">${media}</div>
    <div class="gen-preview-info">
      <small>${esc(providerLabel(g))} · ${new Date(g.createdAt).toLocaleString()}<span data-dims></span></small>
      <details><summary>Prompt usado</summary><p>${esc(g.prompt || '')}</p></details>
      <div class="row">
        ${g.kind === 'image' ? '<button data-preview-action="use-ref">Usar como referencia</button>' : ''}
        <button class="primary" data-preview-action="download">Descargar</button>
        <button data-preview-action="close">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);

  const img = dialog.querySelector('img');
  if (img) img.onload = () => { dialog.querySelector('[data-dims]').textContent = ` · ${img.naturalWidth}×${img.naturalHeight}px`; };
  const closePreview = () => { if (dialog.open) dialog.close(); dialog.remove(); };
  dialog.addEventListener('close', closePreview); // Esc
  // Clic fuera del contenido (sobre el fondo) cierra el visor.
  dialog.addEventListener('click', e => { if (e.target === dialog) closePreview(); });
  dialog.querySelector('[data-preview-action="close"]').onclick = closePreview;
  dialog.querySelector('[data-preview-action="download"]').onclick = () => downloadGeneration(f, genId);
  const useRef = dialog.querySelector('[data-preview-action="use-ref"]');
  if (useRef) useRef.onclick = async () => { closePreview(); await useGenerationAsReference(f, genId); };
  dialog.showModal();
}

async function downloadGeneration(f, genId) {
  const g = f.generations.find(x => x.id === genId);
  if (!g) return;
  const ext = g.kind === 'video' ? 'mp4' : 'png';
  const filename = `${ExportImport.slug(f.name)}-${g.provider}.${ext}`;
  if (g.resultUrl.startsWith('data:')) {
    await ExportImport.downloadImage(g.resultUrl, filename);
    return;
  }
  try {
    const res = await fetch(g.resultUrl);
    const blob = await res.blob();
    await ExportImport.saveBlob(blob, filename);
  } catch {
    window.open(g.resultUrl, '_blank');
  }
}

// ---- Tab: Exportar ----
function tabExportar(f) {
  const grouped = {};
  (f.promptHistory || []).slice().reverse().forEach(p => { (grouped[p.platform] ||= []).push(p); });
  return `
    <div class="card">
      <h2>Exportar / mover esta ficha</h2>
      <p style="color:var(--muted)">Descarga esta ficha (datos + imágenes) como archivo para reimportarla en otro dispositivo o navegador.</p>
      <div class="toolbar"><button class="primary" data-action="export-ficha">Descargar ficha (.json)</button></div>
    </div>
    <div class="card">
      <h2>Usar en otras plataformas</h2>
      <p style="color:var(--muted)">Para plataformas sin integración directa (Higgsfield, Veo, Kling web, etc.), copia el prompt y descarga las imágenes de referencia para subirlas manualmente.</p>
      <div class="toolbar">
        <button data-action="copy-current-prompt">Copiar último prompt</button>
        <button data-action="download-all-refs" ${f.referenceImages.length ? '' : 'disabled'}>Descargar imágenes de referencia</button>
      </div>
      ${Object.keys(grouped).length ? `<h3 style="margin-top:18px">Historial de prompts por plataforma</h3><div class="export-list">${Object.entries(grouped).map(([platform, items]) => items.slice(0, 5).map(p => `
        <div class="row"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">[${esc(platform)}] ${esc(p.prompt)}</span><button data-copy-prompt="${p.id}">Copiar</button></div>
      `).join('')).join('')}</div>` : ''}
    </div>
  `;
}

function bindExportarTab(f) {
  document.querySelector('[data-action="export-ficha"]').onclick = () => ExportImport.exportFicha(f);
  document.querySelector('[data-action="copy-current-prompt"]').onclick = async () => {
    const last = f.promptHistory[f.promptHistory.length - 1];
    const text = last?.prompt || buildPrompt(f, 'nano-banana');
    await ExportImport.copyPromptToClipboard(text);
    toast('Prompt copiado');
  };
  const dlAll = document.querySelector('[data-action="download-all-refs"]');
  if (dlAll) dlAll.onclick = () => f.referenceImages.forEach((img, i) => ExportImport.downloadImage(img.dataUrl, `${ExportImport.slug(f.name)}-ref-${i + 1}.png`));
  $$('[data-copy-prompt]').forEach(btn => btn.onclick = async () => {
    const p = f.promptHistory.find(x => x.id === btn.dataset.copyPrompt);
    if (p) { await ExportImport.copyPromptToClipboard(p.prompt); toast('Prompt copiado'); }
  });
}

// ---- Global wiring ----
$('#fichaSearch').oninput = renderFichaList;
// ---- Glosario de traducción ----
async function saveGlossary(entries) {
  state.glossary = PromptBuilder.cleanGlossary(entries);
  await DB.put('settings', { id: 'glossary', entries: state.glossary });
}

// Al importar una librería se agregan solo los términos que todavía no existen.
async function mergeGlossary(entries) {
  const existing = new Set(state.glossary.map(g => g.es.toLowerCase()));
  const fresh = PromptBuilder.cleanGlossary(entries).filter(g => !existing.has(g.es.toLowerCase()));
  if (fresh.length) await saveGlossary([...state.glossary, ...fresh]);
}

function glossaryRow(entry = { es: '', en: '' }) {
  return `<div class="glossary-row">
    <input data-gl="es" value="${esc(entry.es)}" placeholder="Español (ej. plano secuencia)" maxlength="100">
    <input data-gl="en" value="${esc(entry.en === entry.es ? '' : entry.en)}" placeholder="Inglés (vacío = no traducir)" maxlength="100">
    <button type="button" class="danger" data-gl-remove title="Quitar término">✕</button>
  </div>`;
}

function openGlossaryDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'glossary-dialog';
  dialog.innerHTML = `
    <h2>Glosario de traducción</h2>
    <p class="hint">Cuando escribas estos términos en la ficha, el prompt en inglés usará exactamente tu versión. Deja el inglés vacío para términos que no deben traducirse (gaffer, bounce, flag...).</p>
    <div class="glossary-rows">${(state.glossary.length ? state.glossary : [undefined]).map(glossaryRow).join('')}</div>
    <div class="row">
      <button type="button" data-gl-add>+ Agregar término</button>
      <span style="flex:1"></span>
      <button type="button" data-gl-cancel>Cancelar</button>
      <button type="button" class="primary" data-gl-save>Guardar</button>
    </div>`;
  document.body.appendChild(dialog);

  const rows = dialog.querySelector('.glossary-rows');
  const bindRemove = () => dialog.querySelectorAll('[data-gl-remove]').forEach(b => b.onclick = () => b.closest('.glossary-row').remove());
  const close = () => { if (dialog.open) dialog.close(); dialog.remove(); };
  dialog.addEventListener('close', close);
  dialog.querySelector('[data-gl-cancel]').onclick = close;
  dialog.querySelector('[data-gl-add]').onclick = () => {
    rows.insertAdjacentHTML('beforeend', glossaryRow());
    bindRemove();
    rows.lastElementChild.querySelector('input').focus();
  };
  dialog.querySelector('[data-gl-save]').onclick = async () => {
    const entries = [...rows.querySelectorAll('.glossary-row')].map(r => ({
      es: r.querySelector('[data-gl=es]').value, en: r.querySelector('[data-gl=en]').value
    }));
    try {
      await saveGlossary(entries);
      close();
      toast(`Glosario guardado (${state.glossary.length} término(s))`);
      if (state.tab === 'generar') updatePromptStatus(ficha());
    } catch (err) { toast(`No se pudo guardar el glosario: ${err.message}`); }
  };
  bindRemove();
  dialog.showModal();
}

$('#glossaryBtn').onclick = openGlossaryDialog;

$('#newFichaBtn').onclick = async () => {
  const f = emptyFicha();
  await DB.put('fichas', f);
  state.fichaId = f.id;
  state.tab = 'ficha';
  await refresh();
};
$('#exportLibraryBtn').onclick = () => {
  if (!state.fichas.length) return toast('No hay fichas para exportar');
  ExportImport.exportLibrary(state.fichas, state.glossary);
};
$('#importLibraryInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { fichas: imported, glossary } = await ExportImport.importFile(file);
    for (const f of imported) await DB.put('fichas', f);
    await mergeGlossary(glossary);
    state.fichaId = imported[0]?.id || state.fichaId;
    await refresh();
    toast(`${imported.length} ficha(s) importada(s)`);
  } catch (err) { toast(err.message); }
  e.target.value = '';
};

let installPrompt;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { await installPrompt?.prompt(); $('#installBtn').hidden = true; };
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));

const SPLASH_MIN_MS = 1800;
const hideSplash = () => {
  const splash = $('#splash');
  splash.classList.add('hide');
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
};
const splashDelay = new Promise(resolve => setTimeout(resolve, SPLASH_MIN_MS));

Promise.all([load().catch(err => {
  console.error(err);
  $('#workspace').innerHTML = `<div class="empty"><h1>Error de almacenamiento</h1><p>${esc(err.message)}</p></div>`;
}), splashDelay]).then(hideSplash);
})();
