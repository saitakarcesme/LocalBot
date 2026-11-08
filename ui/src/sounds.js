// Notification sounds are synthesized, so there are no audio files to ship or license.
let audio = null;
const SOUNDS = {
  chime: [[880, 0, .22, 'sine'], [1318.5, .11, .32, 'sine']],
  pop: [[520, 0, .09, 'triangle'], [780, .045, .08, 'triangle']],
  bell: [[1046.5, 0, .7, 'sine'], [2093, 0, .35, 'sine'], [3139, 0, .18, 'sine']],
  tick: [[1600, 0, .035, 'square']],
};
export const SOUND_NAMES = Object.keys(SOUNDS);

export function playSound(name = 'chime') {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    for (const [frequency, delay, length, type] of SOUNDS[name] || SOUNDS.chime) {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(type === 'square' ? .05 : .16, now + delay + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + delay + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + delay); osc.stop(now + delay + length + .02);
    }
  } catch {}
}
