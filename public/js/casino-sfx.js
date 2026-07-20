// ── Sonidos del casino ───────────────────────────────────────────────────
// Sintetizados con Web Audio API (sin archivos externos). Expone
// window.ccSfx con métodos simples que cada juego puede llamar.
(function () {
  let ctx = null;
  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tono(freq, duracion, tipo, volumen, delay) {
    const c = getCtx();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = tipo || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volumen || 0.12, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duracion + 0.02);
  }

  function ruido(duracion, volumen, delay) {
    const c = getCtx();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const bufferSize = Math.floor(c.sampleRate * duracion);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volumen || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
    const filtro = c.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(1200, t0);
    src.connect(filtro).connect(gain).connect(c.destination);
    src.start(t0);
  }

  window.ccSfx = {
    click() { tono(520, 0.06, 'triangle', 0.08); },
    seleccion() { tono(660, 0.08, 'triangle', 0.09); },
    girarTick() { tono(300 + Math.random() * 120, 0.04, 'square', 0.05); },
    reveladaSegura() { tono(880, 0.12, 'sine', 0.12); tono(1180, 0.1, 'sine', 0.08, 0.06); },
    explosion() {
      ruido(0.5, 0.35);
      tono(90, 0.4, 'sawtooth', 0.22);
      tono(55, 0.5, 'square', 0.18, 0.03);
    },
    gano() {
      [523, 659, 784, 1046].forEach((f, i) => tono(f, 0.22, 'triangle', 0.14, i * 0.09));
    },
    perdio() {
      tono(220, 0.35, 'sawtooth', 0.12);
      tono(160, 0.4, 'sine', 0.1, 0.08);
    },
    retiro() {
      [659, 784, 988].forEach((f, i) => tono(f, 0.18, 'sine', 0.13, i * 0.07));
    },
  };
})();
