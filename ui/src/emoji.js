import {html, useState, useRef, useEffect, cx, t} from './lib.js';
import {Popover} from './ui.js';

// A compact set with search words (English and Turkish). The system picker (⌃⌘Space) has the rest.
const GROUPS = [
  ['Smileys', '😀 grin gülmek|😄 smile gülümse|😁 beam|😂 joy laugh kahkaha|🤣 rofl|😊 blush mutlu|🙂 slight|😉 wink göz|😍 love aşk|😘 kiss öpücük|😎 cool|🤩 star|🤔 think düşün|🤨 doubt şüphe|😐 neutral|😴 sleep uyku|😅 sweat|😇 angel melek|🙃 upside|😋 yum|😢 cry ağla|😭 sob|😤 huff|😡 angry kızgın|🤯 mind blown|😱 scream|🥳 party kutlama|🤗 hug sarıl|🙄 eyeroll|😬 grimace|🤐 zip|🤒 sick hasta|🫠 melt|🫡 salute'],
  ['Gestures', '👍 thumbs up yes evet beğen|👎 thumbs down no hayır|👌 ok tamam|🙏 thanks pray teşekkür|👏 clap alkış|🙌 raise|💪 strong güçlü|🤝 handshake anlaşma|👋 wave merhaba|✌️ peace|🤞 fingers crossed|👀 eyes look bak|🫶 heart hands|✍️ write yaz|🤌 pinch|☝️ point up'],
  ['Symbols', '❤️ heart kalp love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|💔 broken|✨ sparkles parıltı|🔥 fire ateş|⭐ star yıldız|🎉 tada party kutlama|💯 hundred yüz|✅ check done tamam|❌ cross x yanlış|⚠️ warning uyarı|❓ question soru|❗ exclamation|💡 idea fikir|🚀 rocket roket|⏰ alarm saat|📌 pin|🔒 lock kilit|🔑 key anahtar|💤 zzz|♻️ recycle|➕ plus|➖ minus'],
  ['Things', '📎 clip ataş|📁 folder klasör|📄 document belge|📝 memo not|📅 calendar takvim|📊 chart grafik|📈 up artış|📉 down düşüş|💻 laptop bilgisayar|📱 phone telefon|🖥️ desktop|⌨️ keyboard klavye|🖱️ mouse|📷 camera kamera|🎧 headphones|🔍 search ara|🔧 wrench tamir|⚙️ gear ayar|🧪 test|🧠 brain beyin|📦 package paket|💰 money para|🛒 cart sepet|✉️ mail e-posta|🔔 bell zil|🗑️ trash çöp|🏠 home ev|🚗 car araba|✈️ plane uçak|☕ coffee kahve|🍵 tea çay|🍕 pizza|🍎 apple elma|🎂 cake pasta|🎵 music müzik|🎮 game oyun|⚽ football futbol|🌍 world dünya|☀️ sun güneş|🌙 moon ay|🌧️ rain yağmur|❄️ snow kar|🌱 sprout filiz|🐱 cat kedi|🐶 dog köpek'],
];
const ALL = GROUPS.map(([name, list]) => [name, list.split('|').map(item => { const [char, ...words] = item.split(' '); return {char, words: words.join(' ')}; })]);
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👎'];

export function EmojiPicker({anchor, onPick, onClose, placement = 'top-start'}) {
  const [query, setQuery] = useState('');
  const input = useRef();
  useEffect(() => { input.current?.focus(); }, []);
  const q = query.trim().toLowerCase();
  const groups = ALL.map(([name, items]) => [name, q ? items.filter(e => e.words.includes(q) || e.char === q) : items]).filter(([, items]) => items.length);
  return html`<${Popover} anchor=${anchor} onClose=${onClose} className="emoji-picker" placement=${placement}>
    <input ref=${input} class="emoji-search" value=${query} placeholder=${t('Search emoji')} aria-label=${t('Search emoji')} onInput=${e => setQuery(e.target.value)}
      onKeyDown=${e => { if (e.key === 'Enter' && groups[0]) { e.preventDefault(); onPick(groups[0][1][0].char); } }}/>
    <div class="emoji-scroll">
      ${groups.length ? groups.map(([name, items]) => html`<div class="emoji-group" key=${name}>
        <div class="emoji-label">${t(name)}</div>
        <div class="emoji-grid">${items.map(e => html`<button type="button" class="emoji" title=${e.words.split(' ')[0]} onClick=${() => onPick(e.char)}>${e.char}</button>`)}</div>
      </div>`) : html`<p class="emoji-empty">${t('No emoji found')}</p>`}
    </div>
  </${Popover}>`;
}
