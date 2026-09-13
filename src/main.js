const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const storageKey = 'cuenta-clara-draft-v1';
const profileKey = 'cuenta-clara-profile-v1';
const state = { step: 1, signature: null, pdfBlob: null, fileName: null };

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
const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c]));
const getData = () => Object.fromEntries(new FormData(form).entries());
const dateLong = (date) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));

const profileFields = ['issuerName', 'issuerDocType', 'issuerDoc', 'issuerCity', 'issuerPhone', 'issuerEmail'];
function applyValues(values = {}) { Object.entries(values).forEach(([key, value]) => { const input = form.elements[key]; if (input && typeof value === 'string') input.value = value; }); }
function saveDraft() { const data = getData(); localStorage.setItem(storageKey, JSON.stringify({ ...data, signature: state.signature })); const profile = Object.fromEntries(profileFields.map(key => [key, data[key] || ''])); profile.signature = state.signature; localStorage.setItem(profileKey, JSON.stringify(profile)); }
function loadDraft() { try { const profile = JSON.parse(localStorage.getItem(profileKey)); if (profile) { applyValues(profile); state.signature = profile.signature || null; } const draft = JSON.parse(localStorage.getItem(storageKey)); if (draft) { applyValues(draft); state.signature = draft.signature || state.signature; } if (state.signature) showSignature(state.signature); } catch {} }
function showStep(step) {
  if (step !== 4 && typeof stopCamera === 'function') stopCamera();
  state.step = step; steps.forEach(el => el.classList.toggle('active', Number(el.dataset.step) === step));
  $('#stepTitle').textContent = stepTitles[step - 1]; $('#stepCount').textContent = `${step} de 5`; $('#progressBar').style.width = `${step * 20}%`;
  backButton.disabled = step === 1; nextButton.innerHTML = step === 5 ? 'Generar PDF <span>✓</span>' : 'Continuar <span>→</span>';
  if (step === 5) renderReview(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function validateStep() {
  const current = $(`.step[data-step="${state.step}"]`); let good = true;
  $$('[required]', current).forEach(input => { const valid = input.value.trim(); input.classList.toggle('invalid', !valid); if (!valid) good = false; });
  if (state.step === 4 && !state.signature) { alert('Por favor dibuja, toma una foto o sube tu firma antes de continuar.'); good = false; }
  return good;
}
function renderReview() { const d = getData(); $('#reviewCard').innerHTML = `<div class="review-header"><strong>CUENTA DE COBRO</strong><span>${escapeHtml(d.invoiceNumber || 'Sin número')}</span></div><div class="review-section"><h3>QUIEN REALIZA EL COBRO</h3><div class="review-row"><label>Nombre</label><b>${escapeHtml(d.issuerName)}</b></div><div class="review-row"><label>Documento</label><b>${escapeHtml(d.issuerDocType)} · ${escapeHtml(d.issuerDoc)}</b></div><div class="review-row"><label>Ciudad</label><b>${escapeHtml(d.issuerCity)}</b></div>${d.issuerEmail ? `<div class="review-row"><label>Correo</label><b>${escapeHtml(d.issuerEmail)}</b></div>` : ''}</div><div class="review-section"><h3>A QUIEN SE LE COBRA</h3><div class="review-row"><label>Nombre / razón social</label><b>${escapeHtml(d.clientName)}</b></div><div class="review-row"><label>Documento</label><b>${escapeHtml(d.clientDocType)} · ${escapeHtml(d.clientDoc)}</b></div>${d.clientAddress ? `<div class="review-row"><label>Dirección</label><b>${escapeHtml(d.clientAddress)}</b></div>` : ''}${d.clientEmail ? `<div class="review-row"><label>Correo</label><b>${escapeHtml(d.clientEmail)}</b></div>` : ''}</div><div class="review-section"><h3>DETALLE</h3><div class="review-row"><label>Concepto</label><b>${escapeHtml(d.concept)}</b></div><div class="review-row"><label>Fecha</label><b>${d.issueDate ? dateLong(d.issueDate) : '—'}</b></div><div class="review-row review-total"><label>Total a cobrar</label><b>${currency(d.amount)}</b></div></div>`; }

$('#startButton').addEventListener('click', () => { welcome.classList.add('hidden'); wizard.classList.remove('hidden'); showStep(1); });
$('#resetButton').addEventListener('click', resetApp);
$('#newAccountButton').addEventListener('click', resetApp);
$('#editReview').addEventListener('click', () => showStep(1));
backButton.addEventListener('click', () => showStep(Math.max(1, state.step - 1)));
nextButton.addEventListener('click', async () => { if (!validateStep()) return; saveDraft(); if (state.step < 5) showStep(state.step + 1); else await generateDocument(); });
form.addEventListener('input', saveDraft);
form.elements.issueDate.value = new Date().toISOString().slice(0, 10);
form.elements.invoiceNumber.value = `CC-${String(new Date().getFullYear()).slice(-2)}-001`;
form.elements.amount.addEventListener('input', (event) => { const raw = event.target.value.replace(/\D/g, ''); event.target.value = compactCurrency(raw); $('#amountWords').textContent = raw ? `Total: ${currency(raw)}` : 'Ingresa el valor en pesos colombianos.'; });

// Signature drawing
const canvas = $('#signatureCanvas'); const ctx = canvas.getContext('2d'); let drawing = false; let last = null;
function resizeCanvas() { const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; const saved = canvas.toDataURL(); canvas.width = rect.width * ratio; canvas.height = rect.height * ratio; ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#16332b'; if (saved && saved.length > 100) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = saved; } }
function point(e) { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; }
canvas.addEventListener('pointerdown', e => { drawing = true; last = point(e); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drawing) return; const current = point(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(current.x, current.y); ctx.stroke(); last = current; state.signature = canvas.toDataURL('image/png'); });
canvas.addEventListener('pointerup', () => { drawing = false; if (state.signature) saveDraft(); });
$('#clearSignature').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); state.signature = null; saveDraft(); });
window.addEventListener('resize', resizeCanvas); setTimeout(resizeCanvas, 100);

// The camera guide is the crop area. Photo cleaning is automatic: white background + dark ink, with no manual controls.
let cameraStream = null;
function stopCamera() { if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; $('#cameraVideo').srcObject = null; $('#cameraStage').classList.add('hidden'); }
$$('[data-signature-tab]').forEach(tab => tab.addEventListener('click', () => { const photoMode = tab.dataset.signatureTab === 'photo'; $$('[data-signature-tab]').forEach(t => t.classList.toggle('active', t === tab)); $('#drawPanel').classList.toggle('hidden', photoMode); $('#photoPanel').classList.toggle('hidden', !photoMode); if (!photoMode) stopCamera(); }));
function cleanSignature(source, crop = null) { const w = 1000, h = 290; const out = document.createElement('canvas'); out.width = w; out.height = h; const octx = out.getContext('2d', { willReadFrequently: true }); octx.fillStyle = '#fff'; octx.fillRect(0, 0, w, h); const fullW = source.width || source.videoWidth, fullH = source.height || source.videoHeight; let sx = 0, sy = 0, sw = fullW, sh = fullH; if (crop) { sx = sw * crop.x; sy = sh * crop.y; sw *= crop.w; sh *= crop.h; } else { const targetRatio = w / h; const sourceRatio = sw / sh; if (sourceRatio > targetRatio) { sw = sh * targetRatio; sx = (fullW - sw) / 2; } else { sh = sw / targetRatio; sy = (fullH - sh) / 2; } } octx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h); const pixels = octx.getImageData(0, 0, w, h); for (let i = 0; i < pixels.data.length; i += 4) { const gray = .299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2]; const ink = gray < 188 ? Math.round(Math.max(0, gray / 188 * 82)) : 255; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = ink; pixels.data[i + 3] = 255; } octx.putImageData(pixels, 0, 0); state.signature = out.toDataURL('image/png'); showSignature(state.signature); saveDraft(); }
function processImage(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => { const img = new Image(); img.onload = () => cleanSignature(img); img.src = reader.result; }; reader.readAsDataURL(file); }
function showSignature(src) { $('#photoPreview').src = src; $('#photoPreviewWrap').classList.remove('hidden'); }
async function openCamera() { const status = $('#cameraStatus'); if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Tu navegador no puede abrir la cámara. Puedes subir una imagen de la firma.'; return; } try { status.textContent = 'Solicitando permiso para usar la cámara…'; cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); $('#cameraVideo').srcObject = cameraStream; $('#cameraStage').classList.remove('hidden'); status.textContent = 'La foto se recortará automáticamente dentro de la guía.'; } catch (error) { status.textContent = 'No fue posible abrir la cámara. Revisa el permiso del navegador o sube una imagen.'; } }
function captureCameraPhoto() { const video = $('#cameraVideo'); if (!cameraStream || !video.videoWidth) return; cleanSignature(video, { x: .06, y: .27, w: .88, h: .46 }); stopCamera(); $('#cameraStatus').textContent = 'Firma ajustada automáticamente: fondo blanco y trazos oscuros.'; }
$('#openCamera').addEventListener('click', openCamera); $('#capturePhoto').addEventListener('click', captureCameraPhoto); $('#closeCamera').addEventListener('click', () => { stopCamera(); $('#cameraStatus').textContent = ''; }); $('#fileInput').addEventListener('change', e => { processImage(e.target.files[0]); $('#cameraStatus').textContent = 'Firma ajustada automáticamente: fondo blanco y trazos oscuros.'; });
$('#removePhoto').addEventListener('click', () => { state.signature = null; $('#photoPreviewWrap').classList.add('hidden'); $('#fileInput').value=''; $('#cameraStatus').textContent = ''; saveDraft(); });

function addPdfLine(doc, label, value, x, y, max = 115) { doc.setFont('helvetica','bold'); doc.setTextColor(86,105,97); doc.setFontSize(8); doc.text(label.toUpperCase(), x, y); doc.setFont('helvetica','normal'); doc.setTextColor(25,44,37); doc.setFontSize(10); const lines = doc.splitTextToSize(value || '—', max); doc.text(lines, x, y + 6); return y + 6 + lines.length * 5; }
function generatePdfBlob() {
  const { jsPDF } = window.jspdf || {}; if (!jsPDF) throw new Error('La librería de PDF no se cargó. Revisa tu conexión e inténtalo de nuevo.');
  const d = getData(); const doc = new jsPDF({ unit:'mm', format:'a4' }); const W=210;
  doc.setFillColor(15,118,110); doc.rect(0,0,W,31,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(19); doc.text('CUENTA DE COBRO', 15, 17); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(`No. ${d.invoiceNumber || '—'}`, 15, 24);
  doc.setFontSize(8); doc.text(`Fecha de emisión: ${dateLong(d.issueDate)}`, 145, 17, {align:'right'}); doc.setTextColor(25,44,37);
  let y=45; doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('DE',15,y); doc.text('PARA',112,y); y+=6;
  const issuer = `${d.issuerName}\n${d.issuerDocType}: ${d.issuerDoc}\n${d.issuerCity}${d.issuerPhone ? ` · ${d.issuerPhone}` : ''}${d.issuerEmail ? `\n${d.issuerEmail}` : ''}`;
  const client = `${d.clientName}\n${d.clientDocType}: ${d.clientDoc}${d.clientAddress ? `\n${d.clientAddress}` : ''}${d.clientEmail ? `\n${d.clientEmail}` : ''}`;
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.text(doc.splitTextToSize(issuer,82),15,y); doc.text(doc.splitTextToSize(client,82),112,y); y+=34;
  doc.setFillColor(239,247,244); doc.roundedRect(15,y,180,12,2,2,'F'); doc.setTextColor(86,105,97); doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.text('CONCEPTO DEL COBRO',20,y+5); doc.setTextColor(25,44,37); doc.setFontSize(8); doc.text('VALOR',190,y+5,{align:'right'}); y+=19;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); const conceptLines=doc.splitTextToSize(d.concept,125); doc.text(conceptLines,20,y); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(currency(d.amount),190,y,{align:'right'}); y += Math.max(conceptLines.length*5, 12)+13;
  doc.setDrawColor(220,231,227); doc.line(15,y,195,y); y+=13; doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('TOTAL A COBRAR',125,y); doc.setTextColor(15,118,110); doc.setFontSize(15); doc.text(currency(d.amount),195,y,{align:'right'}); doc.setTextColor(25,44,37); y+=19;
  const legal = `La presente cuenta de cobro corresponde al servicio descrito y se expide por ${d.issuerName}. ${form.elements.includeWithholding.checked ? 'Las retenciones que resulten aplicables serán practicadas conforme a la normativa vigente y la calidad tributaria de las partes. ' : ''}Este documento no constituye factura de venta ni documento equivalente.`;
  doc.setFillColor(250,252,251); doc.roundedRect(15,y,180,23,2,2,'F'); doc.setFont('helvetica','normal'); doc.setTextColor(86,105,97); doc.setFontSize(8); doc.text(doc.splitTextToSize(legal,168),21,y+7); doc.setTextColor(25,44,37); y+=40;
  if (state.signature) { doc.addImage(state.signature,'PNG',15,y,62,18,undefined,'FAST'); } doc.setDrawColor(25,44,37); doc.line(15,y+21,83,y+21); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(d.issuerName,15,y+27); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(`${d.issuerDocType}: ${d.issuerDoc}`,15,y+32);
  doc.setDrawColor(220,231,227); doc.line(15,282,195,282); doc.setTextColor(117,133,126); doc.setFontSize(7.5); doc.text('Generado con Cuenta Clara · Colombia. Verifica tu obligación de facturar ante la DIAN.',15,288); doc.text('Este formato no reemplaza la asesoría contable o jurídica.',195,288,{align:'right'});
  return doc.output('blob');
}
async function generateDocument() { try { nextButton.disabled=true; nextButton.textContent='Generando…'; state.pdfBlob=generatePdfBlob(); const d=getData(); state.fileName=`Cuenta-de-cobro-${(d.invoiceNumber || 'sin-numero').replace(/[^a-z0-9-]/gi,'_')}.pdf`; $('#doneSummary').innerHTML=`<strong>${escapeHtml(d.invoiceNumber || 'Cuenta de cobro')}</strong><span>Para ${escapeHtml(d.clientName)} · ${currency(d.amount)}</span>`; wizard.classList.add('hidden'); done.classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'}); } catch(error) { alert(error.message || 'No pudimos generar el PDF. Inténtalo de nuevo.'); } finally { nextButton.disabled=false; nextButton.innerHTML='Generar PDF <span>✓</span>'; } }
function downloadPdf() { if (!state.pdfBlob) return; const url=URL.createObjectURL(state.pdfBlob); const a=document.createElement('a'); a.href=url; a.download=state.fileName; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
$('#downloadButton').addEventListener('click', downloadPdf);
$('#whatsappButton').addEventListener('click', async () => { const d=getData(); const text=`Hola, te comparto mi cuenta de cobro ${d.invoiceNumber || ''} por ${currency(d.amount)}. Gracias.`; const file = new File([state.pdfBlob], state.fileName, { type:'application/pdf' }); if (navigator.canShare?.({files:[file]})) { try { await navigator.share({ title:'Cuenta de cobro', text, files:[file] }); return; } catch(e) { if(e.name==='AbortError') return; } } downloadPdf(); window.open(`https://wa.me/?text=${encodeURIComponent(text + ' Descargué el PDF para adjuntarlo a este mensaje.')}`, '_blank', 'noopener'); });
function resetApp() { if (!confirm('¿Quieres empezar una cuenta nueva? Conservaremos tus datos personales y firma en este navegador.')) return; stopCamera(); localStorage.removeItem(storageKey); form.reset(); const profile = JSON.parse(localStorage.getItem(profileKey) || 'null'); if (profile) applyValues(profile); form.elements.issueDate.value = new Date().toISOString().slice(0,10); form.elements.invoiceNumber.value = `CC-${String(new Date().getFullYear()).slice(-2)}-001`; state.step=1; state.signature=profile?.signature || null; state.pdfBlob=null; ctx.clearRect(0,0,canvas.width,canvas.height); if (state.signature) showSignature(state.signature); else $('#photoPreviewWrap').classList.add('hidden'); done.classList.add('hidden'); wizard.classList.add('hidden'); welcome.classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'}); }
loadDraft();
