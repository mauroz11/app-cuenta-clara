const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const storageKey = 'cuenta-clara-draft-v1';
const profileKey = 'cuenta-clara-profile-v1';
const state = {
  step: 1,
  signature: null,
  rawSourceCanvas: null,
  contrastMode: 'normal',
  pdfBlob: null,
  fileName: null
};

const welcome = $('#welcomeScreen');
const wizard = $('#wizardScreen');
const done = $('#doneScreen');
const form = $('#billingForm');
const nextButton = $('#nextButton');
const backButton = $('#backButton');
const steps = $$('.step');
const stepTitles = ['Tu información', 'El destinatario', 'Detalle del cobro', 'Tu firma', 'Revisa y genera'];

const moneyValue = (value) => Number(String(value || '').replace(/\D/g, '') || 0);
const currency = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(moneyValue(value));
const compactCurrency = (value) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(moneyValue(value));
const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const getData = () => Object.fromEntries(new FormData(form).entries());

function dateLong(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m, d));
    }
    const d = new Date(`${dateStr}T12:00:00`);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    }
  } catch (e) {}
  return String(dateStr || '—');
}

const profileFields = ['issuerName', 'issuerDocType', 'issuerDoc', 'issuerCity', 'issuerPhone', 'issuerEmail'];
function applyValues(values = {}) {
  Object.entries(values).forEach(([key, value]) => {
    const input = form.elements[key];
    if (input && typeof value === 'string') input.value = value;
  });
}

function saveDraft() {
  const data = getData();
  localStorage.setItem(storageKey, JSON.stringify({ ...data, signature: state.signature }));
  const profile = Object.fromEntries(profileFields.map(key => [key, data[key] || '']));
  profile.signature = state.signature;
  localStorage.setItem(profileKey, JSON.stringify(profile));
}

function loadDraft() {
  try {
    const profile = JSON.parse(localStorage.getItem(profileKey));
    if (profile) {
      applyValues(profile);
      state.signature = profile.signature || null;
    }
    const draft = JSON.parse(localStorage.getItem(storageKey));
    if (draft) {
      applyValues(draft);
      state.signature = draft.signature || state.signature;
    }
    if (state.signature) {
      showSignature(state.signature);
    }
  } catch (e) {
    console.warn('No se pudo cargar el borrador anterior', e);
  }
}

function showStep(step) {
  if (step !== 4 && typeof stopCamera === 'function') stopCamera();
  state.step = step;
  steps.forEach(el => el.classList.toggle('active', Number(el.dataset.step) === step));
  $('#stepTitle').textContent = stepTitles[step - 1];
  $('#stepCount').textContent = `${step} de 5`;
  $('#progressBar').style.width = `${step * 20}%`;
  backButton.disabled = step === 1;
  nextButton.innerHTML = step === 5 ? 'Generar PDF <span>✓</span>' : 'Continuar <span>→</span>';
  if (step === 5) renderReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep() {
  const current = $(`.step[data-step="${state.step}"]`);
  let good = true;
  $$('[required]', current).forEach(input => {
    const valid = input.value.trim();
    input.classList.toggle('invalid', !valid);
    if (!valid) good = false;
  });
  if (state.step === 4 && !state.signature) {
    alert('Por favor dibuja, toma una foto o sube tu firma antes de continuar.');
    good = false;
  }
  return good;
}

function renderReview() {
  const d = getData();
  $('#reviewCard').innerHTML = `
    <div class="review-header">
      <strong>CUENTA DE COBRO</strong>
      <span>${escapeHtml(d.invoiceNumber || 'Sin número')}</span>
    </div>
    <div class="review-section">
      <h3>QUIEN REALIZA EL COBRO</h3>
      <div class="review-row"><label>Nombre</label><b>${escapeHtml(d.issuerName || '—')}</b></div>
      <div class="review-row"><label>Documento</label><b>${escapeHtml(d.issuerDocType || '')} · ${escapeHtml(d.issuerDoc || '—')}</b></div>
      <div class="review-row"><label>Ciudad</label><b>${escapeHtml(d.issuerCity || '—')}</b></div>
      ${d.issuerEmail ? `<div class="review-row"><label>Correo</label><b>${escapeHtml(d.issuerEmail)}</b></div>` : ''}
      ${d.issuerPhone ? `<div class="review-row"><label>Teléfono</label><b>${escapeHtml(d.issuerPhone)}</b></div>` : ''}
    </div>
    <div class="review-section">
      <h3>A QUIEN SE LE COBRA</h3>
      <div class="review-row"><label>Nombre / razón social</label><b>${escapeHtml(d.clientName || '—')}</b></div>
      <div class="review-row"><label>Documento</label><b>${escapeHtml(d.clientDocType || '')} · ${escapeHtml(d.clientDoc || '—')}</b></div>
      ${d.clientAddress ? `<div class="review-row"><label>Dirección</label><b>${escapeHtml(d.clientAddress)}</b></div>` : ''}
      ${d.clientEmail ? `<div class="review-row"><label>Correo</label><b>${escapeHtml(d.clientEmail)}</b></div>` : ''}
    </div>
    <div class="review-section">
      <h3>DETALLE DEL SERVICIO</h3>
      <div class="review-row"><label>Concepto</label><b>${escapeHtml(d.concept || '—')}</b></div>
      <div class="review-row"><label>Fecha</label><b>${d.issueDate ? dateLong(d.issueDate) : '—'}</b></div>
      <div class="review-row review-total"><label>Total a cobrar</label><b>${currency(d.amount)}</b></div>
    </div>
    <div class="review-section">
      <h3>FIRMA REGISTRADA</h3>
      ${state.signature ? `
        <div class="review-signature-card">
          <img src="${state.signature}" alt="Firma del emisor" class="review-signature-img" />
          <div class="review-signer-name">${escapeHtml(d.issuerName || 'Emisor')}</div>
          <div class="review-signer-doc">${escapeHtml(d.issuerDocType || 'Documento')}: ${escapeHtml(d.issuerDoc || '—')}</div>
          <div class="review-signature-badge">✓ Vista previa: así aparecerá en tu PDF</div>
        </div>
      ` : `
        <div class="review-no-signature">⚠️ No has adjuntado una firma aún. Regresa al paso 4 para añadirla.</div>
      `}
    </div>
  `;
}

$('#startButton').addEventListener('click', () => {
  welcome.classList.add('hidden');
  wizard.classList.remove('hidden');
  showStep(1);
});
$('#resetButton').addEventListener('click', resetApp);
$('#newAccountButton').addEventListener('click', resetApp);
$('#editReview').addEventListener('click', () => showStep(1));
backButton.addEventListener('click', () => showStep(Math.max(1, state.step - 1)));
nextButton.addEventListener('click', async () => {
  if (!validateStep()) return;
  saveDraft();
  if (state.step < 5) showStep(state.step + 1);
  else await generateDocument();
});
form.addEventListener('input', saveDraft);

// Initial form values
form.elements.issueDate.value = new Date().toISOString().slice(0, 10);
form.elements.invoiceNumber.value = `CC-${String(new Date().getFullYear()).slice(-2)}-001`;
form.elements.amount.addEventListener('input', (event) => {
  const raw = event.target.value.replace(/\D/g, '');
  event.target.value = compactCurrency(raw);
  $('#amountWords').textContent = raw ? `Total: ${currency(raw)}` : 'Ingresa el valor en pesos colombianos.';
});

// Signature drawing
const canvas = $('#signatureCanvas');
const ctx = canvas.getContext('2d');
let drawing = false;
let last = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const saved = canvas.toDataURL();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#16332b';
  if (saved && saved.length > 100) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = saved;
  }
}
function point(e) {
  const r = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - r.left, y: p.clientY - r.top };
}
canvas.addEventListener('pointerdown', e => {
  drawing = true;
  last = point(e);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  const current = point(e);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(current.x, current.y);
  ctx.stroke();
  last = current;
  state.signature = canvas.toDataURL('image/png');
});
canvas.addEventListener('pointerup', () => {
  drawing = false;
  if (state.signature) saveDraft();
});
$('#clearSignature').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.signature = null;
  saveDraft();
});
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 100);

// Camera handling
let cameraStream = null;
function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  $('#cameraVideo').srcObject = null;
  $('#cameraStage').classList.add('hidden');
}

$$('[data-signature-tab]').forEach(tab => tab.addEventListener('click', () => {
  const photoMode = tab.dataset.signatureTab === 'photo';
  $$('[data-signature-tab]').forEach(t => t.classList.toggle('active', t === tab));
  $('#drawPanel').classList.toggle('hidden', photoMode);
  $('#photoPanel').classList.toggle('hidden', !photoMode);
  if (!photoMode) stopCamera();
}));

/**
 * Robust Adaptive Background Normalization and Content-Aware Signature Extractor
 * Eliminates paper shadows, gradients, yellowish tint, and enhances pen strokes.
 */
function applyAutomaticCorrection(sourceCanvas, contrastMode = 'normal') {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  if (!srcW || !srcH) return;

  // Scale to optimal processing resolution (max 1000px wide for speed and smoothness)
  const maxDim = 1000;
  let procW = srcW;
  let procH = srcH;
  if (procW > maxDim || procH > maxDim) {
    if (procW >= procH) {
      procH = Math.round((procH * maxDim) / procW);
      procW = maxDim;
    } else {
      procW = Math.round((procW * maxDim) / procH);
      procH = maxDim;
    }
  }

  const procCanvas = document.createElement('canvas');
  procCanvas.width = procW;
  procCanvas.height = procH;
  const pctx = procCanvas.getContext('2d', { willReadFrequently: true });
  pctx.fillStyle = '#ffffff';
  pctx.fillRect(0, 0, procW, procH);
  pctx.drawImage(sourceCanvas, 0, 0, procW, procH);

  const imgData = pctx.getImageData(0, 0, procW, procH);
  const data = imgData.data;

  // Convert to grayscale
  const gray = new Uint8Array(procW * procH);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Standard perceptual luminance
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Estimate local background illumination surface using 32x32 blocks
  const blockSize = 32;
  const gridW = Math.ceil(procW / blockSize);
  const gridH = Math.ceil(procH / blockSize);
  const bgGrid = new Float32Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    const startY = gy * blockSize;
    const endY = Math.min(procH, startY + blockSize);
    for (let gx = 0; gx < gridW; gx++) {
      const startX = gx * blockSize;
      const endX = Math.min(procW, startX + blockSize);

      // Collect sample luminosities in block
      const samples = [];
      for (let py = startY; py < endY; py += 2) {
        const row = py * procW;
        for (let px = startX; px < endX; px += 2) {
          samples.push(gray[row + px]);
        }
      }
      samples.sort((a, b) => a - b);
      // 90th percentile represents the local paper brightness
      const p90 = samples[Math.floor(samples.length * 0.90)] || 255;
      bgGrid[gy * gridW + gx] = p90;
    }
  }

  // Bilinear interpolation of paper background brightness
  function getBgLuminance(x, y) {
    const gx = (x / blockSize) - 0.5;
    const gy = (y / blockSize) - 0.5;
    const x0 = Math.max(0, Math.min(gridW - 1, Math.floor(gx)));
    const x1 = Math.max(0, Math.min(gridW - 1, x0 + 1));
    const y0 = Math.max(0, Math.min(gridH - 1, Math.floor(gy)));
    const y1 = Math.max(0, Math.min(gridH - 1, y0 + 1));
    const fx = Math.max(0, Math.min(1, gx - x0));
    const fy = Math.max(0, Math.min(1, gy - y0));
    const v00 = bgGrid[y0 * gridW + x0];
    const v10 = bgGrid[y0 * gridW + x1];
    const v01 = bgGrid[y1 * gridW + x0];
    const v11 = bgGrid[y1 * gridW + x1];
    return (1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10 + (1 - fx) * fy * v01 + fx * fy * v11;
  }

  // Threshold settings based on contrastMode
  let thresholdRatio = 0.82;
  if (contrastMode === 'dark') thresholdRatio = 0.88;
  if (contrastMode === 'high') thresholdRatio = 0.77;

  let minX = procW, maxX = 0, minY = procH, maxY = 0;
  let inkCount = 0;

  // Process pixels: background removal & ink contrast enhancement
  for (let y = 0; y < procH; y++) {
    const row = y * procW;
    for (let x = 0; x < procW; x++) {
      const idx = row + x;
      const pixelIdx = idx * 4;
      const g = gray[idx];
      const bg = Math.max(15, getBgLuminance(x, y));
      const ratio = g / bg;

      if (ratio >= thresholdRatio) {
        // Pure crisp white paper
        data[pixelIdx] = 255;
        data[pixelIdx + 1] = 255;
        data[pixelIdx + 2] = 255;
        data[pixelIdx + 3] = 255;
      } else {
        // Ink detected!
        inkCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // Smooth contrast ramp with anti-aliasing preservation
        const t = Math.max(0, Math.min(1, ratio / thresholdRatio));
        const inkVal = Math.round(t * 36); // Deep charcoal/dark-green ink
        data[pixelIdx] = inkVal;
        data[pixelIdx + 1] = Math.min(255, inkVal + 6);
        data[pixelIdx + 2] = Math.min(255, inkVal + 4);
        data[pixelIdx + 3] = 255;
      }
    }
  }

  pctx.putImageData(imgData, 0, 0);

  // Content-aware framing and auto-cropping
  const targetW = 960;
  const targetH = 300;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const octx = outCanvas.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, targetW, targetH);

  if (inkCount > 40 && maxX > minX && maxY > minY) {
    // Add 12% padding around the detected ink
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    const padX = Math.round(boxW * 0.12);
    const padY = Math.round(boxH * 0.12);

    const cropX = Math.max(0, minX - padX);
    const cropY = Math.max(0, minY - padY);
    const cropW = Math.min(procW - cropX, boxW + padX * 2);
    const cropH = Math.min(procH - cropY, boxH + padY * 2);

    // Calculate scale to fit nicely in 960x300 while keeping aspect ratio
    const scale = Math.min((targetW * 0.88) / cropW, (targetH * 0.82) / cropH);
    const drawW = cropW * scale;
    const drawH = cropH * scale;
    const drawX = (targetW - drawW) / 2;
    const drawY = (targetH - drawH) / 2;

    octx.drawImage(procCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
  } else {
    // If very sparse ink, center the whole processed image
    const scale = Math.min((targetW * 0.88) / procW, (targetH * 0.82) / procH);
    const drawW = procW * scale;
    const drawH = procH * scale;
    const drawX = (targetW - drawW) / 2;
    const drawY = (targetH - drawH) / 2;
    octx.drawImage(procCanvas, 0, 0, procW, procH, drawX, drawY, drawW, drawH);
  }

  state.signature = outCanvas.toDataURL('image/png');
  showSignature(state.signature);
  saveDraft();
}

function cleanSignature(source, crop = null) {
  const temp = document.createElement('canvas');
  const fullW = source.videoWidth || source.naturalWidth || source.width;
  const fullH = source.videoHeight || source.naturalHeight || source.height;

  let sx = 0, sy = 0, sw = fullW, sh = fullH;
  if (crop) {
    sx = crop.x;
    sy = crop.y;
    sw = crop.w;
    sh = crop.h;
  }

  temp.width = sw;
  temp.height = sh;
  const tctx = temp.getContext('2d');
  tctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  // Save raw canvas so contrast adjustments can be re-run instantly
  state.rawSourceCanvas = temp;
  applyAutomaticCorrection(temp, state.contrastMode);
}

function processImage(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      cleanSignature(img);
      $('#cameraStatus').textContent = '✓ Firma corregida automáticamente: fondo blanco y trazos oscuros.';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function showSignature(src) {
  $('#photoPreview').src = src;
  $('#photoPreviewWrap').classList.remove('hidden');
}

async function openCamera() {
  const status = $('#cameraStatus');
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Tu navegador no admite cámara directa. Puedes subir una foto de la firma.';
    return;
  }
  try {
    status.textContent = 'Iniciando cámara…';
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    const video = $('#cameraVideo');
    video.srcObject = cameraStream;
    $('#cameraStage').classList.remove('hidden');
    status.textContent = 'Encuadra la firma dentro de la guía y presiona "Tomar foto".';
  } catch (error) {
    console.error('Error al abrir la cámara:', error);
    status.textContent = 'No se pudo abrir la cámara. Revisa los permisos o sube una imagen de la firma.';
  }
}

function captureCameraPhoto() {
  const video = $('#cameraVideo');
  const stage = $('#cameraStage');
  if (!cameraStream || !video.videoWidth) return;

  // Accurate mapping between the visual guide overlay and the camera stream
  const stageW = stage.clientWidth || 640;
  const stageH = stage.clientHeight || 360;
  const vW = video.videoWidth;
  const vH = video.videoHeight;

  // Object-fit: cover coordinate transformation
  const scale = Math.max(stageW / vW, stageH / vH);
  const renderW = vW * scale;
  const renderH = vH * scale;
  const offsetX = (renderW - stageW) / 2;
  const offsetY = (renderH - stageH) / 2;

  // Visual guide in CSS is: left: 6%, top: 27%, width: 88%, height: 46%
  const guideX = stageW * 0.06;
  const guideY = stageH * 0.27;
  const guideW = stageW * 0.88;
  const guideH = stageH * 0.46;

  const cropX = Math.max(0, Math.round((guideX + offsetX) / scale));
  const cropY = Math.max(0, Math.round((guideY + offsetY) / scale));
  const cropW = Math.min(vW - cropX, Math.round(guideW / scale));
  const cropH = Math.min(vH - cropY, Math.round(guideH / scale));

  cleanSignature(video, { x: cropX, y: cropY, w: cropW, h: cropH });
  stopCamera();
  $('#cameraStatus').textContent = '✓ Firma corregida automáticamente: fondo blanco y trazos oscuros.';
}

$('#openCamera').addEventListener('click', openCamera);
$('#capturePhoto').addEventListener('click', captureCameraPhoto);
$('#closeCamera').addEventListener('click', () => {
  stopCamera();
  $('#cameraStatus').textContent = '';
});
$('#fileInput').addEventListener('change', e => {
  processImage(e.target.files[0]);
});
$('#removePhoto').addEventListener('click', () => {
  state.signature = null;
  state.rawSourceCanvas = null;
  $('#photoPreviewWrap').classList.add('hidden');
  $('#fileInput').value = '';
  $('#cameraStatus').textContent = '';
  saveDraft();
});
$('#retryPhoto')?.addEventListener('click', () => {
  $('#fileInput').click();
});

// Contrast mode buttons
$$('.contrast-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.contrast-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.contrastMode = btn.dataset.contrast;
    if (state.rawSourceCanvas) {
      applyAutomaticCorrection(state.rawSourceCanvas, state.contrastMode);
    }
  });
});

/**
 * PDF Generation using jsPDF
 */
function generatePdfBlob() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    throw new Error('La librería de PDF no se cargó correctamente. Por favor recarga la página o inténtalo de nuevo.');
  }

  const d = getData();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;

  // Header Banner
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, W, 31, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('CUENTA DE COBRO', 15, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`No. ${d.invoiceNumber || '—'}`, 15, 24);

  doc.setFontSize(8.5);
  doc.text(`Fecha de emisión: ${dateLong(d.issueDate)}`, 195, 17, { align: 'right' });

  // DE y PARA
  let y = 43;
  doc.setTextColor(15, 118, 110);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('DE (QUIEN PRESTA EL SERVICIO)', 15, y);
  doc.text('PARA (QUIEN RECIBE Y PAGA)', 112, y);
  y += 5;

  doc.setTextColor(25, 44, 37);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const issuerLines = [
    d.issuerName,
    `${d.issuerDocType}: ${d.issuerDoc}`,
    d.issuerCity + (d.issuerPhone ? ` · ${d.issuerPhone}` : ''),
    d.issuerEmail || ''
  ].filter(Boolean).join('\n');

  const clientLines = [
    d.clientName,
    `${d.clientDocType}: ${d.clientDoc}`,
    d.clientAddress || '',
    d.clientEmail || ''
  ].filter(Boolean).join('\n');

  doc.text(doc.splitTextToSize(issuerLines, 85), 15, y);
  doc.text(doc.splitTextToSize(clientLines, 85), 112, y);
  y += 28;

  // Table header
  doc.setFillColor(239, 247, 244);
  doc.roundedRect(15, y, 180, 10, 2, 2, 'F');
  doc.setTextColor(86, 105, 97);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CONCEPTO DEL SERVICIO', 20, y + 6.5);
  doc.text('VALOR', 190, y + 6.5, { align: 'right' });
  y += 15;

  // Concept & Amount
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(25, 44, 37);
  doc.setFontSize(9.5);
  const conceptLines = doc.splitTextToSize(d.concept || 'Servicios prestados', 125);
  doc.text(conceptLines, 20, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(currency(d.amount), 190, y, { align: 'right' });

  // Dynamic spacing
  const conceptH = Math.max(conceptLines.length * 4.8, 10);
  y += conceptH + 8;

  // Total divider & total line
  doc.setDrawColor(220, 231, 227);
  doc.line(15, y, 195, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(25, 44, 37);
  doc.text('TOTAL A COBRAR', 125, y);
  doc.setTextColor(15, 118, 110);
  doc.setFontSize(14);
  doc.text(currency(d.amount), 190, y, { align: 'right' });
  y += 12;

  // Legal note
  const legal = `La presente cuenta de cobro corresponde al servicio descrito y se expide por ${d.issuerName || 'el prestador del servicio'}. ${form.elements.includeWithholding?.checked ? 'Las retenciones que resulten aplicables serán practicadas conforme a la normativa vigente y la calidad tributaria de las partes. ' : ''}Este documento no constituye factura de venta ni documento equivalente conforme a la normatividad tributaria colombiana.`;
  doc.setFillColor(250, 252, 251);
  doc.roundedRect(15, y, 180, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(86, 105, 97);
  doc.setFontSize(7.5);
  doc.text(doc.splitTextToSize(legal, 168), 20, y + 5.5);
  y += 24;

  // Signature section
  const sigY = Math.max(y, 215);
  if (state.signature) {
    try {
      doc.addImage(state.signature, 'PNG', 15, sigY - 14, 60, 18, undefined, 'FAST');
    } catch (e1) {
      try {
        doc.addImage(state.signature, 15, sigY - 14, 60, 18);
      } catch (e2) {
        console.error('Error insertando firma en el PDF:', e2);
      }
    }
  }

  doc.setDrawColor(25, 44, 37);
  doc.line(15, sigY + 5, 85, sigY + 5);
  doc.setTextColor(25, 44, 37);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(d.issuerName || 'Firma', 15, sigY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${d.issuerDocType || 'Documento'}: ${d.issuerDoc || ''}`, 15, sigY + 14.5);

  // Footer
  doc.setDrawColor(220, 231, 227);
  doc.line(15, 282, 195, 282);
  doc.setTextColor(117, 133, 126);
  doc.setFontSize(7.5);
  doc.text('Generado con Cuenta Clara · Colombia. Verifica tu obligación de facturar ante la DIAN.', 15, 288);
  doc.text('Este formato no reemplaza la asesoría contable o tributaria.', 195, 288, { align: 'right' });

  return doc.output('blob');
}

async function generateDocument() {
  try {
    nextButton.disabled = true;
    nextButton.textContent = 'Generando…';
    state.pdfBlob = generatePdfBlob();
    const d = getData();
    state.fileName = `Cuenta-de-cobro-${(d.invoiceNumber || 'sin-numero').replace(/[^a-z0-9-]/gi, '_')}.pdf`;
    $('#doneSummary').innerHTML = `<strong>${escapeHtml(d.invoiceNumber || 'Cuenta de cobro')}</strong><span>Para ${escapeHtml(d.clientName || 'Cliente')} · ${currency(d.amount)}</span>`;
    wizard.classList.add('hidden');
    done.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error generando el documento:', error);
    alert(error.message || 'No pudimos generar el PDF. Inténtalo de nuevo.');
  } finally {
    nextButton.disabled = false;
    nextButton.innerHTML = 'Generar PDF <span>✓</span>';
  }
}

function downloadPdf() {
  if (!state.pdfBlob) return;
  const url = URL.createObjectURL(state.pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = state.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function viewPdf() {
  if (!state.pdfBlob) return;
  const url = URL.createObjectURL(state.pdfBlob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

$('#downloadButton').addEventListener('click', downloadPdf);
$('#viewPdfButton')?.addEventListener('click', viewPdf);

$('#whatsappButton').addEventListener('click', async () => {
  const d = getData();
  const text = `Hola, te comparto mi cuenta de cobro ${d.invoiceNumber || ''} por ${currency(d.amount)}. Gracias.`;
  const file = new File([state.pdfBlob], state.fileName, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: 'Cuenta de cobro', text, files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  downloadPdf();
  window.open(`https://wa.me/?text=${encodeURIComponent(text + ' Descargué el PDF para adjuntarlo a este mensaje.')}`, '_blank', 'noopener');
});

function resetApp() {
  if (!confirm('¿Quieres empezar una cuenta nueva? Conservaremos tus datos personales y firma en este navegador.')) return;
  stopCamera();
  localStorage.removeItem(storageKey);
  form.reset();
  const profile = JSON.parse(localStorage.getItem(profileKey) || 'null');
  if (profile) applyValues(profile);
  form.elements.issueDate.value = new Date().toISOString().slice(0, 10);
  form.elements.invoiceNumber.value = `CC-${String(new Date().getFullYear()).slice(-2)}-001`;
  state.step = 1;
  state.signature = profile?.signature || null;
  state.rawSourceCanvas = null;
  state.pdfBlob = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.signature) {
    showSignature(state.signature);
  } else {
    $('#photoPreviewWrap').classList.add('hidden');
  }
  done.classList.add('hidden');
  wizard.classList.add('hidden');
  welcome.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

loadDraft();
