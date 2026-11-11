import {html, useState, useEffect, useRef, cx, api, t, blobToBase64, toast, language, plural} from './lib.js';
import {IconButton, Button} from './ui.js';
import {Icon} from './icons.js';
import {BotFace} from './messages.js';
import {plainText} from './markdown.js';

// Speech-to-text needs a local server that offers /audio/transcriptions (whisper.cpp,
// LocalAI, Speaches…). The microphone button only appears when one answers.
let speechCheck = null, speechKey = '';
export function useSpeechAvailable(state) {
  const key = state.config.endpoint + '|' + state.config.speech;
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setAvailable(false); return; }
    if (speechKey !== key) { speechKey = key; speechCheck = api('speech').then(r => !!r.available).catch(() => false); }
    let alive = true;
    speechCheck.then(v => { if (alive) setAvailable(v); });
    return () => { alive = false; };
  }, [key]);
  return available;
}

const mimeType = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported?.(type)) || '';

/** Records the microphone. onSilence fires once after speech followed by a pause (hands-free mode). */
export async function startRecording({onLevel, onSilence} = {}) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); }
  catch (e) { throw Error(e.name === 'NotAllowedError' ? t('Microphone access is off. Allow it for LocalBot in System Settings.') : t('No microphone found. Connect one and try again.')); }
  const recorder = new MediaRecorder(stream, mimeType() ? {mimeType: mimeType()} : undefined), chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const context = new (window.AudioContext || window.webkitAudioContext)(), analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let spoke = false, quietSince = 0, frame, done = false;
  const started = Date.now();
  const watch = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0; for (const v of data) sum += (v - 128) ** 2;
    const level = Math.sqrt(sum / data.length) / 128;
    onLevel?.(Math.min(1, level * 6));
    if (level > .045) { spoke = true; quietSince = 0; } else if (spoke && !quietSince) quietSince = Date.now();
    if (onSilence && !done && ((spoke && quietSince && Date.now() - quietSince > 1300) || Date.now() - started > 60000)) { done = true; onSilence(); return; }
    frame = requestAnimationFrame(watch);
  };
  recorder.start(); watch();
  const cleanup = () => { cancelAnimationFrame(frame); stream.getTracks().forEach(track => track.stop()); context.close().catch(() => {}); };
  return {
    stop: () => new Promise(resolve => { recorder.onstop = () => { cleanup(); resolve({blob: new Blob(chunks, {type: recorder.mimeType || 'audio/webm'}), spoke, seconds: Math.round((Date.now() - started) / 1000)}); }; recorder.stop(); }),
    cancel: () => { recorder.onstop = cleanup; try { recorder.stop(); } catch { cleanup(); } },
  };
}

export async function transcribeBlob(blob) {
  const {text} = await api('transcribe', {data: await blobToBase64(blob), type: blob.type});
  return text;
}

function speak(text, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd(); return () => {}; }
  const u = new SpeechSynthesisUtterance(plainText(text).slice(0, 1200));
  u.lang = language() === 'tr' ? 'tr-TR' : 'en-US';
  const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith(language()));
  if (voice) u.voice = voice;
  u.onend = u.onerror = onEnd;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
  return () => { u.onend = u.onerror = null; speechSynthesis.cancel(); };
}

/** Hands-free conversation: listen → transcribe → send → read the reply aloud → listen again. */
export function VoiceChat({bot, data, run, onClose}) {
  const [phase, setPhase] = useState('listening');   // listening | transcribing | thinking | speaking | muted
  const [lines, setLines] = useState([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const recording = useRef(null), stopSpeaking = useRef(() => {}), alive = useRef(true), spokenUpTo = useRef(Date.now()), phaseRef = useRef(phase);
  phaseRef.current = phase;
  const add = (who, text) => setLines(list => [...list.slice(-30), {who, text, id: Math.random()}]);

  const listen = async () => {
    if (!alive.current) return;
    setPhase('listening'); setError('');
    try {
      const rec = await startRecording({onLevel: setLevel, onSilence: async () => {
        const {blob, spoke} = await rec.stop(); recording.current = null;
        if (!alive.current) return;
        if (!spoke) { listen(); return; }
        setPhase('transcribing');
        try {
          const text = (await transcribeBlob(blob)).trim();
          if (!alive.current) return;
          if (!text) { listen(); return; }
          add('you', text); spokenUpTo.current = Date.now(); setPhase('thinking');
          await api('send', {bot: bot.id, prompt: text});
        } catch (e) { setError(e.message); setPhase('muted'); }
      }});
      if (!alive.current) { rec.cancel(); return; }
      recording.current = rec;
    } catch (e) { setError(e.message); setPhase('muted'); }
  };
  useEffect(() => { listen(); return () => { alive.current = false; recording.current?.cancel(); stopSpeaking.current(); }; }, []);

  // When the bot's turn ends, read its new messages aloud, then listen again.
  useEffect(() => {
    if (phaseRef.current !== 'thinking' || run || !data) return;
    const fresh = data.messages.filter(m => m.role === 'assistant' && !m.thread && m.content && m.created > spokenUpTo.current);
    if (!fresh.length) return;
    spokenUpTo.current = fresh.at(-1).created;
    const text = fresh.map(m => m.content).join('\n\n');
    add('bot', plainText(text)); setPhase('speaking');
    stopSpeaking.current = speak(text, () => { if (alive.current) listen(); });
  }, [run?.id, data?.messages.length]);

  const toggleMute = () => {
    if (phase === 'muted') { listen(); return; }
    recording.current?.cancel(); recording.current = null; stopSpeaking.current(); setPhase('muted'); setLevel(0);
  };
  const interrupt = () => { stopSpeaking.current(); listen(); };
  const label = {listening: t('Listening…'), transcribing: t('Transcribing…'), thinking: t('Thinking…'), speaking: t('Speaking…'), muted: t('Muted')}[phase];
  return html`<div class="voice-chat" role="dialog" aria-label=${t('Voice chat with {name}', {name: bot.name})}>
    <div class="voice-stage">
      <div class=${cx('voice-figure', 'is-' + phase)} style=${`--level:${level.toFixed(2)}`}><${BotFace} bot=${bot} size=${120} amplitude=${phase === 'listening' ? level : 0} state=${phase === 'thinking' || phase === 'transcribing' ? 'thinking' : phase === 'speaking' ? 'speaking' : phase === 'muted' ? 'sleeping' : 'listening'}/></div>
      <strong>${bot.name}</strong>
      <span class="voice-phase" role="status">${error || label}</span>
    </div>
    <div class="voice-lines" aria-live="polite">${lines.map(line => html`<p key=${line.id} class=${'is-' + line.who}>${line.text}</p>`)}</div>
    <div class="voice-controls">
      <${Button} onClick=${toggleMute}><${Icon} name=${phase === 'muted' ? 'mic' : 'bellOff'}/>${phase === 'muted' ? t('Unmute') : t('Mute')}</${Button}>
      ${phase === 'speaking' ? html`<${Button} onClick=${interrupt}>${t('Interrupt')}</${Button}>` : null}
      <${Button} kind="danger" onClick=${onClose}>${t('End voice chat')}</${Button}>
    </div>
  </div>`;
}

/** A voice message: play button, length and its transcript. */
export const voiceLength = seconds => seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : plural(seconds, '{n} second', '{n} seconds');
