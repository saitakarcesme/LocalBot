# Grok Bot parity — 100 UI gaps, build status

Source list: `../../reports/ui-brand/LOCALBOT-VS-GROKBOT-UI-100.md` (numbers below match it).
Status: `done` = built and exercised in the headless UI harness (`tests/ui`), `built` = code written, not yet exercised, `todo`, `n/a` = no local equivalent (reason given).

Harness: `node tests/ui/run.mjs <scenario>` starts a fake model server + self-hosted LocalBot on a temp data folder and drives it with headless Chromium.

## Design decisions (keep consistent)

- Every user-visible string goes through `t()` (`ui/src/i18n.js`); English text is the key, `ui/src/locales/tr.js` holds Turkish.
- Message extras live in `messages.meta` JSON: `reply`, `reactions`, `pinned`, `rating`, `options`, `multi`, `plan`, `draft`, `secret`.
- "New chat" keeps history visible but sets `bots.context_from`; the model only reads messages after it.
- Threads: `messages.thread` = root message id; thread runs read root + thread messages only.
- Sending while a bot works queues the message; Stop is only the button (empty composer) or Esc.

## Status — 2026-11-10

This is an implementation audit, not a claim of 100/100 completion. `built` means code exists; only the listed flows were exercised. Native changes passed Swift type checking, not an interactive macOS acceptance test. Voice needs a local transcription server.

| # | Status | Evidence / remaining scope |
|---|---|---|
| 1 | built | Bölüm ekleme, yeniden adlandırma, silme, daraltma — sidebar.js |
| 2 | built | Botları sürükleyerek sıralama/bölüme taşıma; bağlam menüsünde yukarı/aşağı taşıma — sidebar.js |
| 3 | built | Çoklu seçim, bölüme taşıma, onaylı toplu silme — sidebar.js |
| 4 | built | Kenar çubuğu gizleme/gösterme ve kompakt görünüm — main.js / sidebar.js |
| 5 | built | Sayısal okunmamış rozeti — sidebar.js |
| 6 | built | Okunmadı işaretleme API ve menüsü — sidebar.js |
| 7 | built | Ekran dışı okunmamışlara kaydırma — sidebar.js |
| 8 | built | Menüden onaylı silme — sidebar.js |
| 9 | built | Kopyalama — sidebar.js / bots/duplicate |
| 10 | built | Arşiv görünümü ve geri yükleme — sidebar.js |
| 11 | built | Kaydedilmiş taslağı satırda gösterme — sidebar.js |
| 12 | built | Bot etiketi ve yapılandırma formu — manage.js |
| 13 | built | Bot bazında sessize alma — engine.mjs / manage.js |
| 14 | built | Profil menüsü — sidebar.js |
| 15 | built | Alt oklar, mod+1–9 ve Alt sol/sağ geçmişi — main.js |
| 16 | built | Kısayollar diyaloğu — dialogs.js |
| 17 | built | Palette mesaj ve dosya araması — dialogs.js |
| 18 | built | Mesaj aramasında devam sayfası ve dosya sonuçları — sidebar.js |
| 19 | built | Yan panelde konu ve ayrı konu göndericisi — conversation.js |
| 20 | built | Yeni sohbet ve geri alma — conversation.js / bots/newchat |
| 21 | built | Sağ panelde dosya görüntüleme — viewer.js / main.js |
| 22 | built | Fare ve klavye ile ayrıntı genişliği — main.js |
| 23 | built | Mesaj sabitleme — messages.js |
| 24 | built | Yeni mesaj sayacı ve okunmamış sınırı — conversation.js |
| 25 | built | Artan limit ile eski mesajları yükleme — state.js / server.mjs |
| 26 | built | UI zoom ayarı, native View menüsü — settings.js / Main.swift |
| 27 | built | macOS menü çubuğu simgesi ve çalışma göstergesi — Main.swift |
| 28 | built | View/Window/Help menüleri — Main.swift |
| 29 | built | Yerel transkripsiyon sunucusuyla dikte — voice.js |
| 30 | built | Ses kaydı, transkripsiyon eki ve oynatma hızı — conversation.js / messages.js |
| 31 | built | Sesli görüşme ekranı — voice.js |
| 32 | built | Bahsetme menüsü — conversation.js |
| 33 | built | Beceri önerileri — conversation.js |
| 34 | built | Emoji seçici — emoji.js |
| 35 | built | Yazım denetimi tercihi — settings.js / conversation.js |
| 36 | built | Ek küçük resimleri — conversation.js |
| 37 | built | Canvas üzerinde görsel işaretleme — conversation.js |
| 38 | built | Çalışma sırasında kuyruğa mesaj gönderme — conversation.js / engine.mjs |
| 39 | built | Mesaj silme, geri alma, düzenleme — messages.js |
| 40 | built | Yerel gönderim kuyruğu ve yeniden deneme — conversation.js |
| 41 | built | Alıntı yanıt, iptal ve kaynak mesaja gitme — messages.js |
| 42 | built | Seçili metin/dosya yanıtı — conversation.js |
| 43 | built | Emoji tepkileri — messages.js |
| 44 | built | Yanıt değerlendirme — messages.js |
| 45 | built | Markdown/HTML kopyalama — messages.js |
| 46 | built | Highlight.js 11.12.0: 193 yerel dil tanımı; kaçış ve dil testleri geçti. |
| 47 | built | Yerel KaTeX varlıkları — markdown.js |
| 48 | built | Yerel Mermaid, büyütme/PNG — markdown.js / conversation.js |
| 49 | partial | JSON chart blokları ve veri ipuçları — markdown.js; not general D3/Three scenes |
| 50 | built | Tablo kopyalama ve büyütme — conversation.js |
| 51 | built | Tercihe bağlı bağlantı önizleme — messages.js |
| 52 | built | Satır içi görseller ve galeri/lightbox — messages.js / main.js |
| 53 | built | Native HTML audio/video kontrolleri — messages.js |
| 54 | built | DOCX metin ve XLSX çoklu sayfa/tablo önizlemesi eklendi; office tarayıcı testi geçti. DOCX düzen/görseller korunmaz; XLSX ilk 500 satır/100 sütun ve kaydedilmiş formül değerlerini gösterir. Eski DOC/XLS dış uygulamada açılır. |
| 55 | built | Kaydedilen metin dosyalarında fark görünümü — engine.mjs / messages.js |
| 56 | built | Tekli/çoklu seçenek kartları — messages.js |
| 57 | built | Gizli giriş kartı — messages.js / engine.mjs |
| 58 | partial | Taslak kartı düzenleme/iptal; e-posta için mailto — messages.js; external send needs provider |
| 59 | built | Plan ve adım ilerleme kartları — messages.js |
| 60 | built | HTML/SVG önizleme, son 20 metin revizyonu ve revizyon yorumları — viewer.js / server.mjs |
| 61 | built | Alt görev kartı ve hedef bot sohbetine gitme — messages.js / main.js |
| 62 | partial | macOS bot tarayıcısı snapshot ve iptal ederek devralma — Main.swift / details.js; other-app screen preview not implemented |
| 63 | built | Tur/hedef/bot/genel izin kapsamları — messages.js / engine.mjs |
| 64 | built | Doğal dil kural yönetimi — manage.js / engine.mjs |
| 65 | built | Yerel modelle otomatik inceleme tercihi — settings.js / engine.mjs |
| 66 | built | Onaylar arasında gezinme ve açık onay diyaloğuyla tümüne bir kez izin — messages.js |
| 67 | built | Kaydedilen izinleri listele/geri al — manage.js |
| 68 | built | Bot bazında devre dışı araçlar ve izin kuralları — manage.js |
| 69 | partial | macOS erişilebilirlik, mikrofon ve ekran kayıt durumu — Main.swift; full-disk status not implemented |
| 70 | built | Rol şablonları — dialogs.js |
| 71 | built | Yerel modelle bot taslağı üretme — dialogs.js |
| 72 | built | İlk görev adımı ve rehberi yeniden başlatma — dialogs.js |
| 73 | built | Ana bot seçimi ve koordinasyon bağlamı — settings.js / engine.mjs |
| 74 | partial | Özel avatar yükleme — manage.js; generated avatar not implemented |
| 75 | built | Profil fotoğrafı — settings.js / sidebar.js |
| 76 | built | Beceri oluştur/düzenle/sil ve bota ata — manage.js |
| 77 | partial | HTTP/stdio MCP connection management; curated searchable connector marketplace not implemented |
| 78 | partial | HTTP başlıkları, ortam değişkenleri, stdio ve araç listesi — manage.js; MCP JSON yapılandırması içe aktarma eklendi; OAuth remains unimplemented |
| 79 | built | Write-only giriş, AES-256-GCM veritabanı şifrelemesi ve ayrı yerel anahtar dosyası — store.mjs / manage.js. OS Keychain integration not provided. |
| 80 | built | Talimat/kişilik/beceri/araç/izin/grup ve hafıza tek yapılandırmada — manage.js |
| 81 | built | Anı arama/düzenleme/silme — details.js |
| 82 | built | Metin/Markdown anı içe aktarma — details.js |
| 83 | built | Grup üyeliği ve grup çalıştırma — manage.js / engine.mjs |
| 84 | built | Durum filtreli görevler görünümü — manage.js |
| 85 | built | Aktif görevleri listeleme/durdurma — manage.js |
| 86 | built | Rutin oluşturma/düzenleme — manage.js |
| 87 | built | Günlük/hafta içi/aylık/aralıklı/tek sefer ve zaman dilimi — manage.js |
| 88 | partial | Yerel webhook rutinleri — server.mjs / manage.js; email/service triggers need provider |
| 89 | built | Şimdi çalıştır ve çalışma geçmişi — manage.js |
| 90 | built | Dosya arama/tür filtresi/önizleme/silme/filtrelenenleri indirme — details.js |
| 91 | partial | İngilizce/Türkçe seçimi ve temel Türkçe katalog — i18n.js; translation coverage incomplete |
| 92 | partial | GitHub sürüm denetimi — manage.js; signed download/install/restart flow not implemented |
| 93 | built | Dört bildirim sesi seçimi — settings.js / sounds.js |
| 94 | built | Bot rengine göre balon tonu — conversation.js |
| 95 | built | Arşiv/anı/rutin geri alma — ui.js / sidebar.js / details.js / manage.js |
| 96 | built | Hata sınırı ve yükleme iskeleti — ui.js / main.js |
| 97 | built | İnsan okunur hata dönüştürme ve tanılama indirme — lib.js / manage.js |
| 98 | built | Kullanım toplamları, günlük token çubukları ve bot dağılımı — manage.js |
| 99 | built | Bot şablonu dışa/içe aktarma ve veri geri yükleme — settings.js / manage.js |
| 100 | partial | Telefon, kanallar, takvim, ödeme, ekip ve görev öğretme: user deferred provider selection; on hold |

## Verification

- `npm test`: 19 tests, including vault authentication/reopening tests and expanded HTTP assertions for sections, groups, skills, routines, secret redaction, bot import and onboarding reset.
- `UI_BROWSER_CHANNEL=chrome node tests/ui/run.mjs`: smoke, management forms, navigation/search/language, file preview/onboarding and DOCX/XLSX scenarios.
- `swiftc -typecheck native/Main.swift native/Computer.swift`.

## External decisions

Item 100 requires selected providers and account setup; clarification was requested. Item 92 requires an actual signed release/update distribution pipeline. These are not substituted with mock completion.

## Follow-up audit — 2026-11-10

- Rounded sidebar and message corners: 22px. Narrow-window checks cover 1280, 900, 760 and 660px; code/table content scrolls within its own container.
- Settings → Tasks now passes the navigation callback through DialogHost and Settings, so selecting a task's bot opens its conversation and closes Settings.
- One-time routine date editing now displays device-local time, matching datetime-local parsing; regression checks cover winter/summer in Luxembourg, New York and Kolkata. The field explicitly names the device time zone convention.
- Turkish catalog expanded for the entire Configure flow, abilities, permission descriptions, and common settings/management labels. Translation coverage elsewhere remains incomplete; this is not full localization.
- Runtime suite: 20 passing tests. Existing 10 UI scenarios passed after these changes; followup scenario covers task navigation and Turkish configuration.

### Remaining work (not completed by this update)

The partial rows above remain authoritative: general interactive scenes (#49), external draft delivery (#58), other-app preview (#62), full-disk permission status (#69), generated avatars (#74), connector catalog/OAuth (#77–78), service triggers (#88), complete localization (#91), signed updater distribution (#92), and deferred providers (#100). Microphone/voice and OS permission flows still need native acceptance tests with the relevant permissions and local speech server. These are not certified by the fake-model browser harness.
