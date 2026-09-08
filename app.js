const $ = (id) => document.getElementById(id);
const video = $('video');
const sample = $('sample');
const keepsake = $('keepsake');
const state = { mode: 'booth', editing: false, aiPhoto: 0, feedbackFrame: 0, feedbackPaused: false, aiStartedAt: null, aiImage: null, aiView: 'result', aiStyle: 'illustrated', aiWorking: false, aiTerminal: false, aiAttempt: null, aiEpoch: 0, aiAvailable: null, recognition: null, voiceTimer: null, stream: null, sample: false, ready: false, busy: false, requesting: false, cameraRequest: 0, photos: [], layout: 'strip', look: 'original', theme: 'cream', controller: null, lastSource: 'camera', capturedAt: null, sampleFrame: 0, facing: 'user' };
const themes = { cream: { paper: '#faf9f5', ink: '#141413', label: 'Warm ivory' }, pink: { paper: '#e8b8a3', ink: '#4d2c20', label: 'Terracotta' }, green: { paper: '#d0d4bd', ink: '#333c2b', label: 'Soft olive' }, ink: { paper: '#262624', ink: '#faf9f5', label: 'Terminal dark' } };
const filters = { original: 'none', mono: 'grayscale(1)', warm: 'sepia(.42) saturate(1.2)' };
const prompts = ['A little smile', 'A little silly', 'All you'];
function say(text, error = false) { for (const id of ['status-message', 'result-status']) { $(id).textContent = text; $(id).classList.toggle('error', error); } }
function setCameraLabel(text, on = false) {
  $('camera-status').replaceChildren();
  const dot = document.createElement('i'); dot.className = `status-dot${on ? ' on' : ''}`;
  $('camera-status').append(dot, document.createTextNode(text));
}
function requiredPhotos() { return 3; }
function canDeliver() { return state.photos.length === requiredPhotos() && !state.busy && (state.mode !== 'ai' || !!state.aiImage); }
function captureHint() { return 'Three photos. Three seconds to pose for each.'; }
function updateControls() {
  const complete = state.photos.length === requiredPhotos() && !state.busy;
  const ai = state.mode === 'ai';
  $('booth-page').dataset.mode = state.mode;
  $('capture').textContent = 'Take three photos';
  $('camera-welcome').querySelector('h2').textContent = 'Everybody in.';
  $('camera-welcome').querySelector('p').textContent = 'Three photos. A moment to keep.';
  $('result-title').textContent = ai ? (state.aiImage ? 'You, reimagined.' : state.aiWorking ? 'A little magic is happening.' : 'Make it unexpected.') : 'A moment worth keeping.';
  $('result-eyebrow').textContent = ai ? 'A LITTLE IMAGINATION' : 'THREE PHOTOS. ALL YOU.';
  $('back-keepsake').hidden = !ai;
  $('remix-invitation').hidden = ai;
  $('open-remix').textContent = state.aiImage ? 'See your remix ✳' : state.aiWorking ? 'Remix in progress…' : state.aiAttempt ? 'Check your remix ✳' : 'Remix a photo ✳';
  $('delivery-label').hidden = !canDeliver();
  $('delivery-label').textContent = ai ? 'Send your remix' : 'Send your keepsake';
  $('ai-photo-options').hidden = !!state.aiImage || !!state.aiAttempt;
  $('ai-photo-options').disabled = state.aiWorking;
  const waiting = ai && state.aiWorking;
  $('waiting-preview').hidden = !waiting;
  keepsake.hidden = waiting;
  $('booth-page').dataset.waiting = String(waiting);
  document.querySelectorAll('.journey span').forEach((el, index) => el.classList.toggle('current', index === ($('send-dialog').open ? 2 : complete ? 1 : 0)));
  syncFeedback();
  $('settings').hidden = ai || (complete && !state.editing);
  $('edit-keepsake').hidden = ai;
  $('edit-keepsake').textContent = state.editing ? 'Done customizing' : 'Customize frame';
  $('reset').hidden = ai;
  $('ai-controls').hidden = !ai || !complete;
  document.querySelector('.result-actions').hidden = !canDeliver();
  $('ai-style-options').hidden = !!state.aiImage || !!state.aiAttempt;
  $('ai-style-options').disabled = state.aiWorking;
  $('ai-remix-options').hidden = !!state.aiImage || !!state.aiAttempt;
  $('ai-remix').disabled = state.aiWorking;
  $('ai-consent-label').hidden = !!state.aiImage || !!state.aiAttempt;
  $('ai-generate').hidden = !!state.aiImage || state.aiTerminal || state.aiWorking;
  $('ai-generate').disabled = state.aiWorking || (!state.aiAttempt && (!$('ai-consent').checked || state.aiAvailable !== true));
  $('ai-compare').hidden = !state.aiImage;
  document.querySelectorAll('[data-mode]').forEach(button => { button.disabled = state.busy || state.requesting; });
  $('booth-page').dataset.step = complete ? 'result' : 'camera';
  $('result').hidden = !complete;
  $('start-options').hidden = complete || ai;
  const settingsParent = complete ? document.querySelector('.result-options') : $('start-options');
  if ($('settings').parentElement !== settingsParent) {
    if (complete) settingsParent.insertBefore($('settings'), document.querySelector('.result-actions'));
    else settingsParent.append($('settings'));
  }
  document.querySelector('.camera-column').hidden = complete;
  $('capture').hidden = !state.ready || state.busy || complete;
  $('shot-tray').hidden = !state.busy;
  $('open-camera-settings').hidden = !state.ready || state.busy || complete;
  $('capture').disabled = !state.ready || state.busy || state.requesting;
  $('cancel').hidden = !state.busy;
  $('settings').disabled = state.busy;
  $('camera-select').disabled = !state.stream || state.busy || state.requesting;
  $('mirror').disabled = state.busy;
  $('flip-camera').hidden = !state.stream;
  $('flip-camera').disabled = state.busy || state.requesting;
  $('enable-camera').disabled = state.requesting;
  $('try-sample').disabled = state.requesting;
  $('stop-camera').hidden = !state.ready && !state.requesting;
  for (const id of ['print', 'send-email', 'send-whatsapp']) $(id).disabled = !canDeliver();
}
function updateTray() {
  $('shot-tray').replaceChildren(...prompts.slice(0, requiredPhotos()).map((prompt, index) => {
    const slot = document.createElement('div'); slot.className = 'shot-slot';
    if (state.photos[index]) { const img = new Image(); img.src = state.photos[index].toDataURL('image/jpeg', .85); img.alt = `Photo ${index + 1}`; img.style.filter = filters[state.look]; slot.append(img); }
    else { const num = document.createElement('span'); num.textContent = `0${index + 1}`; slot.append(num, document.createTextNode(prompt)); }
    return slot;
  }));
}
function cover(ctx, source, x, y, width, height, mirror = false) {
  const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
  if (!sw || !sh) throw new Error('The camera is not ready yet.');
  const scale = Math.max(width / sw, height / sh), cw = width / scale, ch = height / scale;
  ctx.save(); ctx.translate(x + (mirror ? width : 0), y); if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, width, height); ctx.restore();
}
function filteredPhoto(photo) {
  if (state.look === 'original') return photo;
  const canvas = document.createElement('canvas'); canvas.width = photo.width; canvas.height = photo.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(photo, 0, 0);
  // Pixel processing keeps exported effects working even in browsers without Canvas filter.
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height), d = frame.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (state.look === 'mono') { d[i] = d[i + 1] = d[i + 2] = .2126 * r + .7152 * g + .0722 * b; }
    else {
      const sr = r * .58 + (r * .393 + g * .769 + b * .189) * .42;
      const sg = g * .58 + (r * .349 + g * .686 + b * .168) * .42;
      const sb = b * .58 + (r * .272 + g * .534 + b * .131) * .42;
      const gray = .2126 * sr + .7152 * sg + .0722 * sb;
      d[i] = gray + (sr - gray) * 1.2; d[i + 1] = gray + (sg - gray) * 1.2; d[i + 2] = gray + (sb - gray) * 1.2;
    }
  }
  ctx.putImageData(frame, 0, 0); return canvas;
}
function fitText(ctx, text, x, y, maxWidth, size, font = 'Georgia', minSize = 15) {
  ctx.font = `${size}px ${font}`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) { size -= 1; ctx.font = `${size}px ${font}`; }
  ctx.fillText(text, x, y, maxWidth);
}
function renderKeepsake() {
  if (state.mode === 'ai') { renderPortrait(); return; }
  const postcard = state.layout === 'postcard'; keepsake.width = postcard ? 1200 : 600; keepsake.height = 1800;
  keepsake.classList.toggle('postcard', postcard);
  const ctx = keepsake.getContext('2d'), t = themes[state.theme], w = keepsake.width;
  ctx.fillStyle = t.paper; ctx.fillRect(0, 0, w, 1800); ctx.textAlign = 'center'; ctx.fillStyle = t.ink;
  fitText(ctx, 'Community Photobooth ✳', w / 2, 70, w - 80, 32);
  const boxes = postcard ? [[60, 125, 1080, 740], [60, 893, 526, 470], [614, 893, 526, 470]] : [[32, 112, 536, 402], [32, 538, 536, 402], [32, 964, 536, 402]];
  boxes.forEach(([x, y, width, height], i) => {
    if (state.photos[i]) cover(ctx, filteredPhoto(state.photos[i]), x, y, width, height);
    else {
      ctx.fillStyle = state.theme === 'ink' ? '#4c574b' : '#d5dcc7'; ctx.fillRect(x, y, width, height);
      ctx.fillStyle = state.theme === 'ink' ? '#89957f' : '#b1bea0'; ctx.font = '110px Georgia'; ctx.fillText('✳', x + width / 2, y + height / 2 + 23);
      ctx.font = '18px Arial'; ctx.fillText(`0${i + 1}`, x + width / 2, y + height - 30);
    }
  });
  ctx.fillStyle = t.ink;
  const date = state.capturedAt || new Date();
  ctx.font = `${postcard ? 27 : 20}px Arial`; ctx.fillText(date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase(), w / 2, 1513);
  const note = $('guest-note').value.trim();
  if (note) { fitText(ctx, note, w / 2, 1587, w - 65, postcard ? 35 : 25, 'Georgia'); }
  ctx.font = '36px Georgia'; ctx.fillText('♡', w / 2, 1670);
  ctx.font = `${postcard ? 23 : 15}px Arial`; ctx.fillText('GOOD PEOPLE. GREAT MEMORIES.', w / 2, 1740);
}
function stopTracks() { if (state.stream) state.stream.getTracks().forEach(track => track.stop()); state.stream = null; video.srcObject = null; }
function stopCamera(message = 'Camera off. Your captured photos are still here.') {
  state.cameraRequest++; state.requesting = false; state.controller?.abort(); stopTracks();
  $('flash').classList.remove('fire');
  state.sample = false; state.ready = false; cancelAnimationFrame(state.sampleFrame);
  video.hidden = true; sample.hidden = true; $('camera-welcome').hidden = false; $('live-label').hidden = true;
  setCameraLabel('CAMERA OFF'); updateControls(); say(message);
}
async function startCamera(deviceId, facing = state.facing) {
  if (state.busy || state.requesting) return;
  stopCamera('Waiting for camera permission…');
  const request = ++state.cameraRequest; state.requesting = true; updateControls();
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'InsecureContext' });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }), width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    if (request !== state.cameraRequest) { stream.getTracks().forEach(track => track.stop()); return; }
    state.stream = stream; video.srcObject = stream;
    await video.play();
    if (request !== state.cameraRequest) return;
    state.facing = stream.getVideoTracks()[0].getSettings().facingMode || facing;
    state.ready = true; video.hidden = false; $('camera-welcome').hidden = true; $('live-label').hidden = false; $('live-label').textContent = '● LIVE · ' + ($('mirror').checked ? 'MIRRORED' : 'UNMIRRORED');
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (state.stream === stream) stopCamera('The camera disconnected. Reconnect it and enable the camera again.'); });
    setCameraLabel('CAMERA READY', true); say(captureHint());
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
      if (request !== state.cameraRequest) return;
      $('camera-select').replaceChildren(...devices.map((device, index) => new Option(device.label || `Camera ${index + 1}`, device.deviceId)));
      const activeDevice = stream.getVideoTracks()[0].getSettings().deviceId;
      $('camera-select').value = devices.some(d => d.deviceId === activeDevice) ? activeDevice : devices[0]?.deviceId || '';
    } catch { /* Capture remains available when device enumeration is restricted. */ }
  } catch (error) {
    if (request !== state.cameraRequest) return;
    stopTracks(); state.ready = false;
    const errors = { NotAllowedError: 'Camera permission is blocked. Allow the camera in your browser’s site settings, then try again—or try a sample session.', NotFoundError: 'No camera found. Connect a webcam, or try a sample session.', NotReadableError: 'The camera is busy. Close other apps using it and try again.', OverconstrainedError: 'That camera is unavailable. Reconnect it and try again.', InsecureContext: 'Open this booth on localhost or HTTPS to use your camera.' };
    say(errors[error.name] || 'The camera could not start. Try again, or use a sample session.', true);
  } finally { if (request === state.cameraRequest) { state.requesting = false; updateControls(); } }
}
function drawSample(now) {
  if (!state.sample) return;
  const ctx = sample.getContext('2d'), w = sample.width, h = sample.height;
  ctx.fillStyle = '#e6dfd1'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#faf9f5'; ctx.beginPath(); ctx.arc(1100, 60, 430, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d4a27f'; ctx.beginPath(); ctx.arc(50, 850, 300, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(now / 650) * 15;
  [[420, 450 + bob, '#d97757', -.13], [855, 470 - bob, '#c5cbb2', .13]].forEach(([x,y,color,rotation]) => {
    ctx.save(); ctx.translate(x,y); ctx.rotate(rotation); ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-175,-185,350,450,170); ctx.fill();
    ctx.fillStyle = '#3f4937'; ctx.beginPath(); ctx.arc(-57,-10,14,0,Math.PI*2); ctx.arc(57,-10,14,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#3f4937'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0,35,48,0,Math.PI); ctx.stroke(); ctx.restore();
  });
  ctx.fillStyle = '#f7f1d8'; ctx.textAlign = 'center'; ctx.font = '110px Georgia'; ctx.fillText('✳', 640, 200 + bob);
  ctx.fillStyle = '#4c5d3f'; ctx.font = '22px Arial'; ctx.save(); if ($('mirror').checked) { ctx.translate(1280, 0); ctx.scale(-1, 1); } ctx.fillText('SAMPLE SESSION · THE MORE, THE MERRIER', 640, 835); ctx.restore();
  state.sampleFrame = requestAnimationFrame(drawSample);
}
function startSample() {
  if (state.requesting || state.busy) return;
  stopCamera(); state.sample = true; state.ready = true; sample.hidden = false; $('camera-welcome').hidden = true;
  $('live-label').hidden = false; $('live-label').textContent = '● SAMPLE SESSION';
  setCameraLabel('SAMPLE SESSION', true); drawSample(performance.now()); updateControls(); say(captureHint());
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
async function captureSession() {
  if (!state.ready || state.busy) return;
  state.lastSource = state.sample ? 'sample' : 'camera';
  $('camera-dialog').close();
  state.busy = true; state.photos = []; state.capturedAt = new Date(); state.controller = new AbortController();
  const { signal } = state.controller; updateControls(); updateTray(); renderKeepsake();
  try {
    for (let i = 0; i < requiredPhotos(); i++) {
      say(`Photo ${i + 1} of ${requiredPhotos()} — ${prompts[i].toLowerCase()}!`); $('viewfinder-caption').textContent = prompts[i].toUpperCase();
      for (let seconds = 3; seconds >= 1; seconds--) { $('countdown').hidden = false; $('countdown').textContent = String(seconds); await pause(1000, signal); }
      $('countdown').hidden = true;
      const photo = document.createElement('canvas'); photo.width = 1280; photo.height = 960;
      cover(photo.getContext('2d'), state.sample ? sample : video, 0, 0, 1280, 960, $('mirror').checked);
      state.photos.push(photo); $('flash').classList.remove('fire'); void $('flash').offsetWidth; $('flash').classList.add('fire'); updateTray(); renderKeepsake();
      await pause(450, signal);
    }
  } catch (error) {
    state.photos = []; updateTray(); renderKeepsake();
    say(error.name === 'AbortError' ? 'Session cancelled. Take your time, then try again.' : 'Capture interrupted. Check the camera and try again.', error.name !== 'AbortError');
  } finally { state.busy = false; state.controller = null; $('countdown').hidden = true; $('viewfinder-caption').textContent = 'GREAT THINGS START WITH A LITTLE CURIOSITY.'; updateControls();
    if (state.photos.length === requiredPhotos()) {
      focusBooth(false); stopCamera(''); say(''); renderPhotoChoices(); void checkAiAvailability(); $('result-title').focus({ preventScroll: true });
    }
  }
}
function edited() { renderKeepsake(); updateControls(); }
function selectChoice(group, selected) { document.querySelectorAll(group).forEach(button => { const active = button === selected; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); }); }
function resetSession() {
  if (state.busy) return;
  const source = state.lastSource;
  clearAi(); state.mode = 'booth'; state.editing = false; state.aiPhoto = 0;
  deliveryPolling++; deliveryAttempt = null;
  $('send-dialog').close(); $('camera-dialog').close(); $('send-form').reset();
  $('send-status').textContent = ''; $('guest-note').value = ''; $('print-image').removeAttribute('src');
  state.photos = []; state.capturedAt = null; renderPhotoChoices();
  $('feedback-canvas').getContext('2d').clearRect(0, 0, 960, 720);
  updateTray(); renderKeepsake(); updateControls();
  if (source === 'sample') startSample(); else void startCamera();
}
$('reset').addEventListener('click', resetSession);
$('open-camera-settings').addEventListener('click', () => $('camera-dialog').showModal());
$('close-camera-settings').addEventListener('click', () => $('camera-dialog').close());
$('flash').addEventListener('animationend', () => $('flash').classList.remove('fire'));
$('enable-camera').addEventListener('click', () => startCamera());
$('camera-select').addEventListener('change', () => startCamera($('camera-select').value));
$('try-sample').addEventListener('click', startSample);
$('flip-camera').addEventListener('click', () => {
  if (state.busy || state.requesting) return;
  const facing = state.facing === 'user' ? 'environment' : 'user';
  $('mirror').checked = facing === 'user';
  $('mirror').dispatchEvent(new Event('change'));
  startCamera(undefined, facing);
});
$('stop-camera').addEventListener('click', () => stopCamera());
$('capture').addEventListener('click', captureSession);
$('cancel').addEventListener('click', () => state.controller?.abort());
$('mirror').addEventListener('change', () => { [video, sample].forEach(el => el.classList.toggle('mirrored', $('mirror').checked)); if (!state.sample) $('live-label').textContent = '● LIVE · ' + ($('mirror').checked ? 'MIRRORED' : 'UNMIRRORED'); });
document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => { state.layout = button.dataset.layout; selectChoice('[data-layout]', button); edited(); }));
document.querySelectorAll('[data-look]').forEach(button => button.addEventListener('click', () => { state.look = button.dataset.look; [video, sample].forEach(el => el.style.filter = filters[state.look]); selectChoice('[data-look]', button); updateTray(); edited(); }));
document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => { state.theme = button.dataset.theme; selectChoice('[data-theme]', button); $('theme-name').textContent = themes[state.theme].label; edited(); }));
$('guest-note').addEventListener('input', edited);
$('print').addEventListener('click', async () => {
  if (!canDeliver()) return;
  const previousView = state.aiView; state.aiView = 'result'; renderKeepsake();
  const image = $('print-image'); image.src = keepsake.toDataURL('image/png');
  state.aiView = previousView; renderKeepsake(); image.classList.toggle('postcard', state.mode === 'ai' || state.layout === 'postcard');
  try { await image.decode(); say('Choose 4 × 6 inch paper, 100% scale, and turn off headers and footers in the print dialog.'); window.print(); } catch { say('The print preview could not load. Please try Print again.', true); }
});
function focusBooth(enabled) {
  document.body.classList.toggle('is-focused', enabled);
  $('fullscreen').textContent = enabled ? '⛶ Exit fullscreen' : '⛶ Fullscreen';
  if (enabled) $('viewfinder').scrollIntoView({ block: 'center' });
}
$('fullscreen').addEventListener('click', async () => {
  $('camera-dialog').close();
  if (document.body.classList.contains('is-focused')) return focusBooth(false);
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else focusBooth(true);
  } catch { focusBooth(true); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') focusBooth(false); });
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? '⛶ Exit fullscreen' : '⛶ Fullscreen'; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.busy) state.controller?.abort(); });
window.addEventListener('pagehide', () => stopCamera());
[video, sample].forEach(el => el.classList.add('mirrored'));
renderKeepsake(); updateControls();

// Delivery is opt-in; the server owns both provider credentials and the Iris queue.
const clientScript = [...document.scripts].find(script => script.src.includes('/photobooth/app.js'));
const deliveryApi = clientScript ? clientScript.src.replace(/photobooth\/app\.js.*$/, 'api/photobooth/') : new URL('api/photobooth/', location.href).href;
let deliveryChannel = 'email', deliveryAttempt = null, deliveryPolling = 0;
const deliveryMessages = { queued: 'Queued for WhatsApp. Keep this window open to see when it sends.', sending: 'Sending your photo…', accepted: 'Email accepted for delivery. Check your inbox (and spam folder).', sent: 'Photo sent to WhatsApp. Enjoy your keepsake!', failed: 'WhatsApp could not send this photo. Check the number or try email instead.', expired: 'This delivery expired. Close this form and send a fresh copy.' };
function deliveryStatus(result) {
  $('send-status').textContent = deliveryMessages[result.status] || 'Checking delivery…';
  return ['accepted', 'sent', 'failed', 'expired'].includes(result.status);
}
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = libphonenumber.getCountries().map(code => ({ code, name: countryNames.of(code), dial: libphonenumber.getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));
$('phone-country').replaceChildren(...countries.map(country => {
  const option = new Option(`${country.name} (+${country.dial})`, country.code, country.code === 'ES', country.code === 'ES');
  return option;
}));
let keyboardShift = false, keyboardSymbols = false;
function renderRecipientKeyboard() {
  const keyboard = $('recipient-keyboard');
  const phone = deliveryChannel === 'whatsapp';
  keyboard.classList.toggle('numeric', phone);
  keyboard.setAttribute('aria-label', phone ? 'Phone number keypad' : 'Email keyboard');
  let rows;
  if (phone) rows = [['1','2','3'], ['4','5','6'], ['7','8','9'], ['clear','0','backspace']];
  else if (keyboardSymbols) rows = [['1','2','3','4','5','6','7','8','9','0'], ['!','#','$','%','&',"'",'*','+','/','='], ['?','^','_','`','{','|','}','~','-','.'], ['letters','@','.com','.es','.org','backspace','clear']];
  else rows = ['1234567890'.split(''), 'qwertyuiop'.split(''), 'asdfghjkl'.split(''), ['shift', ...'zxcvbnm'.split(''), 'backspace'], ['symbols','@','.','-','_','+','.com','.es','clear']];
  const labels = { clear: 'Clear', backspace: '⌫', shift: keyboardShift ? '⇧ ON' : '⇧', symbols: '#+=', letters: 'ABC' };
  keyboard.replaceChildren(...rows.map(keys => {
    const row = document.createElement('div'); row.className = 'keyboard-row';
    for (let key of keys) {
      if (!phone && keyboardShift && /^[a-z]$/.test(key)) key = key.toUpperCase();
      const button = document.createElement('button'); button.type = 'button'; button.dataset.key = key;
      button.textContent = labels[key] || key;
      if (key === 'backspace') button.setAttribute('aria-label', 'Backspace');
      if (key === 'shift') { button.setAttribute('aria-label', 'Shift'); button.setAttribute('aria-pressed', String(keyboardShift)); }
      if (key.length > 1) button.classList.add('keyboard-wide');
      row.append(button);
    }
    return row;
  }));
}
function insertRecipientKey(key) {
  if (key === 'shift') { keyboardShift = !keyboardShift; renderRecipientKeyboard(); return; }
  if (key === 'symbols' || key === 'letters') { keyboardSymbols = key === 'symbols'; renderRecipientKeyboard(); return; }
  const input = $('send-recipient');
  let start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
  if (key === 'clear') { start = 0; end = input.value.length; key = ''; }
  else if (key === 'backspace') { if (start === end) start = Math.max(0, start - 1); key = ''; }
  const value = input.value.slice(0, start) + key + input.value.slice(end);
  if (value.length > input.maxLength) return;
  input.value = value; input.focus({ preventScroll: true }); input.setSelectionRange(start + key.length, start + key.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
$('recipient-keyboard').addEventListener('pointerdown', event => { if (event.target.closest('button')) event.preventDefault(); });
$('recipient-keyboard').addEventListener('click', event => { const button = event.target.closest('button[data-key]'); if (button) insertRecipientKey(button.dataset.key); });
$('send-recipient').addEventListener('input', () => {
  const input = $('send-recipient'); input.setCustomValidity('');
  if (deliveryChannel === 'whatsapp' && input.value.trim().startsWith('+')) {
    const number = libphonenumber.parsePhoneNumberFromString(input.value.trim());
    if (number?.country && number.isPossible()) { $('phone-country').value = number.country; input.value = number.nationalNumber; }
  }
});
$('phone-country').addEventListener('change', () => { $('send-recipient').setCustomValidity(''); $('send-recipient').placeholder = $('phone-country').value === 'ES' ? '612 345 678' : 'Your phone number'; });
function openSend(channel) {
  if (!canDeliver()) return;
  deliveryChannel = channel; deliveryAttempt = null;
  $('send-form').reset(); $('send-submit').disabled = false; $('send-submit').textContent = 'Send my photo ↗';
  $('send-status').textContent = ''; $('phone-country').value = 'ES';
  const phone = channel === 'whatsapp';
  $('send-dialog').dataset.channel = channel;
  $('country-field').hidden = !phone;
  $('phone-country').disabled = !phone;
  $('recipient-label').textContent = phone ? 'WhatsApp number' : 'Email address';
  $('send-intro').textContent = phone ? "We'll send your finished photo to WhatsApp." : "We'll email your finished photo as an attachment.";
  $('recipient-hint').textContent = phone ? 'Enter your number; the country code is added for you.' : 'Use the keyboard, type, or paste your email address.';
  const input = $('send-recipient'); input.type = 'text'; input.inputMode = 'none'; input.autocomplete = phone ? 'tel-national' : 'email';
  input.maxLength = phone ? 25 : 254; input.removeAttribute('pattern'); input.setCustomValidity('');
  input.placeholder = phone ? '612 345 678' : 'you@example.com';
  keyboardShift = false; keyboardSymbols = false; renderRecipientKeyboard();
  $('send-dialog').showModal(); updateControls(); input.focus({ preventScroll: true });
}
$('send-email').addEventListener('click', () => openSend('email'));
$('send-whatsapp').addEventListener('click', () => openSend('whatsapp'));
$('close-send').addEventListener('click', () => $('send-dialog').close());
$('send-dialog').addEventListener('close', () => { deliveryPolling++; $('send-recipient').value = ''; updateControls(); });
async function watchDelivery(id, generation) {
  for (let i = 0; i < 24 && generation === deliveryPolling && $('send-dialog').open; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (generation !== deliveryPolling || !$('send-dialog').open) return;
    try {
      const response = await fetch(deliveryApi + 'status?id=' + encodeURIComponent(id), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const result = await response.json();
      if (generation === deliveryPolling && deliveryStatus(result)) return;
    } catch { /* The durable delivery continues if this tab loses its connection. */ }
  }
  if (generation === deliveryPolling && $('send-dialog').open) $('send-status').textContent = 'Your WhatsApp delivery is still queued. You can close this window; delivery continues for up to two hours.';
}
$('send-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!$('send-form').reportValidity()) return;
  const raw = $('send-recipient').value.trim();
  let recipient = raw;
  if (deliveryChannel === 'whatsapp') {
    const phone = /^[+\d\s().-]+$/.test(raw) ? libphonenumber.parsePhoneNumberFromString(raw, $('phone-country').value) : null;
    if (!phone?.isPossible()) { $('send-status').textContent = 'Check the number and selected country, then try again.'; return; }
    recipient = phone.number;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    $('send-status').textContent = 'Enter a complete email address, such as you@example.com.'; return;
  }
  const previousView = state.aiView; state.aiView = 'result'; renderKeepsake();
  const png = keepsake.toDataURL('image/png').split(',')[1];
  state.aiView = previousView; renderKeepsake();
  if (png.length > 6990508) { $('send-status').textContent = 'This photo is too large to send. Try the photo strip layout or Print instead.'; return; }
  if (!deliveryAttempt || deliveryAttempt.recipient !== recipient || deliveryAttempt.channel !== deliveryChannel || deliveryAttempt.png !== png)
    deliveryAttempt = { id: crypto.randomUUID(), channel: deliveryChannel, recipient, png, consent: true };
  const attempt = deliveryAttempt, generation = ++deliveryPolling;
  $('send-submit').disabled = true; $('send-status').textContent = 'Sending your photo…';
  try {
    const response = await fetch(deliveryApi + 'send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt), signal: AbortSignal.timeout(32000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Please try again.');
    if (generation !== deliveryPolling) return;
    const finished = deliveryStatus(result);
    $('send-submit').textContent = finished ? 'Photo submitted ✓' : 'Delivery in progress';
    if (!finished && attempt.channel === 'whatsapp') void watchDelivery(attempt.id, generation);
    else if (!finished) { $('send-submit').disabled = false; $('send-submit').textContent = 'Check / retry email'; }
  } catch (error) {
    if (generation !== deliveryPolling) return;
    $('send-status').textContent = error.name === 'TimeoutError' ? 'Delivery could not be confirmed. Tap Send to safely retry.' : error.message;
    $('send-submit').disabled = false;
  }
});


// Separate one-photo experience. A session token prevents old requests painting a new guest's screen.
function renderPortrait() {
  if (!state.aiImage || state.aiView === 'original') {
    keepsake.width = 1280; keepsake.height = 960; keepsake.classList.add('postcard');
    const original = state.photos[state.aiPhoto]; if (original) keepsake.getContext('2d').drawImage(original, 0, 0);
    return;
  }
  keepsake.width = 1200; keepsake.height = 1800; keepsake.classList.add('postcard');
  const ctx = keepsake.getContext('2d'); ctx.fillStyle = '#faf9f5'; ctx.fillRect(0, 0, 1200, 1800);
  ctx.fillStyle = '#262624'; ctx.textAlign = 'center';
  fitText(ctx, 'Community Photobooth ✳', 600, 75, 1080, 32);
  const source = state.aiView === 'original' ? state.photos[state.aiPhoto] : state.aiImage || state.photos[state.aiPhoto];
  if (source) {
    const ratio = Math.min(1080 / source.width, 1440 / source.height);
    const w = source.width * ratio, h = source.height * ratio;
    ctx.drawImage(source, (1200 - w) / 2, 120 + (1440 - h) / 2, w, h);
  }
  ctx.font = '26px Arial'; ctx.fillText(state.aiImage && state.aiView !== 'original' ? 'AI PORTRAIT' : 'YOUR ORIGINAL', 600, 1650);
  ctx.font = '24px Georgia'; ctx.fillText('A little imagination. A memory to keep.', 600, 1720);
}
function clearAi() {
  stopDictation(); stopFeedback(); state.aiStartedAt = null; $('ai-remix').value = '';
  state.aiEpoch++; state.aiTerminal = false; state.aiWorking = false; state.aiImage = null; state.aiAttempt = null; state.aiView = 'result';
  $('ai-consent').checked = false; aiNotice(''); $('ai-generate').textContent = 'Create my remix ✳';
  selectChoice('[data-ai-view]', document.querySelector('[data-ai-view="result"]'));
}
function setResultView(mode) {
  if (state.photos.length !== 3 || state.busy) return;
  stopDictation(); state.mode = mode; state.aiView = 'result';
  selectChoice('[data-ai-view]', document.querySelector('[data-ai-view="result"]'));
  renderKeepsake(); updateControls();
  if (mode === 'ai' && !state.aiAttempt) void checkAiAvailability();
}
$('edit-keepsake').addEventListener('click', () => { state.editing = !state.editing; updateControls(); });
$('open-remix').addEventListener('click', () => setResultView('ai'));
$('back-keepsake').addEventListener('click', () => setResultView('booth'));
function renderPhotoChoices() {
  $('ai-photo-choices').replaceChildren(...state.photos.map((photo, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.photo = String(index);
    button.setAttribute('aria-label', `Remix photo ${index + 1}`); button.setAttribute('aria-pressed', String(index === state.aiPhoto));
    button.classList.toggle('selected', index === state.aiPhoto);
    const image = new Image(); image.src = photo.toDataURL('image/jpeg', .7); image.alt = `Photo ${index + 1}`;
    const label = document.createElement('span'); label.textContent = `0${index + 1}`; button.append(image, label); return button;
  }));
}
$('ai-photo-choices').addEventListener('click', event => {
  const button = event.target.closest('[data-photo]'); if (!button || state.aiAttempt || state.aiWorking) return;
  state.aiPhoto = Number(button.dataset.photo); selectChoice('[data-photo]', button); renderKeepsake();
});
document.querySelectorAll('[data-ai-style]').forEach(button => button.addEventListener('click', () => {
  if (state.aiWorking || state.aiAttempt) return;
  state.aiStyle = button.dataset.aiStyle; selectChoice('[data-ai-style]', button);
}));
document.querySelectorAll('[data-ai-view]').forEach(button => button.addEventListener('click', () => {
  state.aiView = button.dataset.aiView; selectChoice('[data-ai-view]', button); renderKeepsake();
}));
$('ai-consent').addEventListener('change', updateControls);
async function checkAiAvailability() {
  const epoch = state.aiEpoch;
  try {
    const response = await fetch(deliveryApi + 'ai-config', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Unavailable');
    const result = await response.json();
    if (epoch !== state.aiEpoch) return;
    state.aiAvailable = result.available === true;
    if (!state.aiAttempt) $('ai-status').textContent = state.aiAvailable ? 'Choose one photo and a style. Recent remixes took around 30–75 seconds; some take longer.' : 'The AI studio is unavailable right now. Your original keepsake is ready to send.';
  } catch { if (epoch === state.aiEpoch) { state.aiAvailable = false; $('ai-status').textContent = 'The AI studio could not connect. Go back to your keepsake and reopen Remix to try again.'; } }
  if (epoch === state.aiEpoch) updateControls();
}
function aiNotice(message, error = false) {
  $('ai-status').textContent = message;
  $('ai-status').classList.toggle('error', error);
  $('ai-status').setAttribute('role', error ? 'alert' : 'status');
}
async function showAiStatus(result, epoch) {
  if (epoch !== state.aiEpoch) return true;
  if (result.status === 'completed' && /^data:image\/(png|jpeg);base64,/.test(result.image || '')) {
    const image = new Image(); image.src = result.image;
    try { await image.decode(); } catch { throw new Error('Your portrait is ready, but its image could not display. Tap Check portrait status to load it again.'); }
    if (epoch !== state.aiEpoch) return true;
    state.aiImage = image; state.aiView = 'result'; renderKeepsake();
    aiNotice('Your portrait is ready. Have a look, then send it home.');
    return true;
  }
  const messages = { failed: 'This portrait could not be created. Take another photo or switch to Photobooth.', uncertain: 'We could not confirm the creation request. We won’t submit it again automatically.', expired: 'This portrait session expired. Take another photo to begin again.' };
  $('generation-stage').textContent = result.phase === 'pending' ? 'Waiting for the portrait studio' : 'Creating your remix';
  const elapsed = state.aiStartedAt ? Math.floor((Date.now() - state.aiStartedAt) / 1000) : 0;
  aiNotice(messages[result.status] || (elapsed > 90 ? 'This one is taking longer. Your keepsake is ready if you’d like to send it while we wait.' : 'Your remix is on its way. You can return to your keepsake at any time.'), !!messages[result.status]);
  if (messages[result.status]) { state.aiTerminal = ['failed','expired'].includes(result.status); return true; }
  return false;
}
$('ai-generate').addEventListener('click', async () => {
  if (state.aiWorking || state.mode !== 'ai' || state.photos.length !== 3) return;
  if (!state.aiAttempt && (!$('ai-consent').checked || !state.aiAvailable)) return;
  stopDictation();
  const epoch = state.aiEpoch;
  const fresh = !state.aiAttempt;
  state.aiAttempt ||= { id: crypto.randomUUID(), style: state.aiStyle, remix: $('ai-remix').value.trim(), consent: true, png: remixSource() };
  const attempt = state.aiAttempt; state.aiStartedAt ||= Date.now(); state.aiWorking = true; updateControls();
  aiNotice(fresh ? 'Sending your photo to the portrait studio…' : 'Checking your portrait…');
  try {
    let response = await fetch(deliveryApi + (fresh ? 'ai-start' : 'ai-status?id=' + encodeURIComponent(attempt.id)), {
      ...(fresh ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) } : {}),
      cache: 'no-store', signal: AbortSignal.timeout(35000),
    });
    let result = await response.json();
    if (epoch !== state.aiEpoch) return;
    if (!response.ok) { if (fresh && [422,429,503].includes(response.status) && ['ai_limit','ai_not_configured','invalid_photo_delivery'].includes(result.code)) state.aiAttempt = null; throw new Error(result.error || 'The portrait studio is unavailable.'); }
    for (let i = 0; i < 150 && epoch === state.aiEpoch; i++) {
      if (await showAiStatus(result, epoch)) return;
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (epoch !== state.aiEpoch) return;
      response = await fetch(deliveryApi + 'ai-status?id=' + encodeURIComponent(attempt.id), { cache: 'no-store', signal: AbortSignal.timeout(35000) });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || 'We could not check your portrait. Tap Check portrait status to reconnect.');
    }
    if (epoch === state.aiEpoch) aiNotice('Your portrait is taking longer than expected. Tap Check portrait status in a moment.');
  } catch (error) { if (epoch === state.aiEpoch) aiNotice(error.name === 'TimeoutError' || error instanceof TypeError ? 'Connection interrupted. Tap Check portrait status to continue without submitting again.' : error.message, true); }
  finally { if (epoch === state.aiEpoch) { state.aiWorking = false; $('ai-generate').textContent = state.aiAttempt ? 'Check portrait status' : 'Create my remix ✳'; updateControls(); } }
});

const assetBase = clientScript ? clientScript.src.replace(/app\.js.*$/, '') : new URL('assets/', location.href).href;
document.querySelectorAll('[data-style-image]').forEach(img => img.src = assetBase + img.dataset.styleImage + '.png');
function stopDictation() {
  clearTimeout(state.voiceTimer); state.voiceTimer = null;
  const recognition = state.recognition; state.recognition = null;
  if (recognition) { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; recognition.abort(); }
  $('ai-dictate').textContent = 'Describe it aloud'; $('ai-dictate').setAttribute('aria-pressed', 'false');
}
$('ai-dictate').addEventListener('click', () => {
  if (state.recognition) { state.recognition.stop(); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { $('voice-status').textContent = 'Voice input is unavailable in this browser. Type your idea above, or use your keyboard’s microphone.'; $('ai-remix').focus(); return; }
  const recognition = new Recognition(), epoch = state.aiEpoch;
  recognition.lang = $('voice-language').value; recognition.interimResults = true; recognition.continuous = false;
  const prefix = $('ai-remix').value.trim(); state.recognition = recognition;
  recognition.onresult = event => {
    if (epoch !== state.aiEpoch || state.recognition !== recognition) return;
    const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ');
    $('ai-remix').value = [prefix, transcript].filter(Boolean).join(' ').slice(0, 500);
  };
  recognition.onerror = event => {
    if (state.recognition !== recognition) return;
    $('voice-status').textContent = event.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in your browser settings, or type your idea.' : 'Voice input could not finish. You can edit or type your idea above.';
    stopDictation();
  };
  recognition.onend = () => {
    if (state.recognition !== recognition) return;
    stopDictation(); $('voice-status').textContent = 'Check your words above. Edit anything before creating your portrait.';
  };
  try { recognition.start(); $('ai-dictate').textContent = '● Listening… Tap to stop'; $('ai-dictate').setAttribute('aria-pressed', 'true');
    $('voice-status').textContent = 'Describe the style, setting, or mood you imagine.';
    state.voiceTimer = setTimeout(() => { if (state.recognition === recognition) recognition.stop(); }, 30000);
  } catch { stopDictation(); $('voice-status').textContent = 'Voice input could not start. You can type your idea above.'; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopDictation(); });
window.addEventListener('pagehide', stopDictation);


function remixSource() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
  canvas.getContext('2d').drawImage(state.photos[state.aiPhoto], 0, 0, 1024, 768);
  return canvas.toDataURL('image/png').split(',')[1];
}
function stopFeedback() { cancelAnimationFrame(state.feedbackFrame); state.feedbackFrame = 0; }
function syncFeedback() {
  const visible = state.aiWorking && state.mode === 'ai' && !document.hidden;
  if (!visible) { stopFeedback(); return; }
  if (!state.feedbackFrame) state.feedbackFrame = requestAnimationFrame(drawFeedback);
}
function drawFeedback(now) {
  if (!state.aiWorking || state.mode !== 'ai' || document.hidden) { stopFeedback(); return; }
  const canvas = $('feedback-canvas'), ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const index = state.feedbackPaused || reduced ? state.aiPhoto : Math.floor(now / 1800) % 3;
  if (state.photos[index]) cover(ctx, state.photos[index], 0, 0, canvas.width, canvas.height);
  const seconds = Math.max(0, Math.floor((Date.now() - state.aiStartedAt) / 1000));
  $('generation-elapsed').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('generation-detail').textContent = seconds > 90 ? 'Taking longer than usual. Your original keepsake is ready to send.' : 'A replay of your photos while the portrait studio works.';
  state.feedbackFrame = requestAnimationFrame(drawFeedback);
}
$('pause-feedback').addEventListener('click', () => { state.feedbackPaused = !state.feedbackPaused; $('pause-feedback').textContent = state.feedbackPaused ? 'Play replay' : 'Pause replay'; });
document.addEventListener('visibilitychange', syncFeedback);
