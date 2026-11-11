# LocalBot — 60 bağlantı adayı

11 Kasım 2026. Bu bir aday listesi; aşağıdaki uygulamalar LocalBot'a kurulmuş veya bağlanmış değildir. İlk öncelikler Mac'te görülen uygulamalar, kullanıcının açık talepleri ve üniversite, e-posta, kodlama, alışveriş ve spor kullanımına göre seçildi. Özel mesajlar veya tarayıcı geçmişi okunmadı.

P1: önce; P2: ikinci aşama; P3: ihtiyaca göre. “Yerel” dosya/CLI/uygulama köprüsü; “araştırılacak” hazır güvenilir bağlantı henüz doğrulanmadı. API erişimi ilgili hesabın yetkilerine bağlıdır. ChatGPT/Claude/Gemini model API'leri, tüketici uygulamasındaki sohbet geçmişine erişimle aynı şey değildir; bu uygulamalar için öncelikle seçili sohbeti paylaşma/içe aktarma akışı düşünülmeli. Ana model Elpis olarak kalır.

| # | Uygulama | Öncelik | Sana faydası | Önerilen yol |
|---|---|---|---|---|
| 1 | Gmail | P1 | Üniversite e-postaları, cevap taslakları, ekler | Google OAuth + Gmail API |
| 2 | Outlook | P1 | Okul/iş e-postaları ve takvim | Microsoft OAuth + Graph |
| 3 | Discord | P1 | Ders ve geliştirici topluluklarını takip | Resmî bot; erişim verilen kanallar |
| 4 | GitHub | P1 | Repo, issue, PR, bildirim | GitHub App/OAuth + API |
| 5 | Google Chrome | P1 | Seçili sekmeyi bota gönder, araştırma | Tarayıcı eklentisi + yerel köprü |
| 6 | Brave | P1 | Günlük tarayıcı araştırması | Chromium eklentisi; uyumluluk testi |
| 7 | ChatGPT | P1 | Seçili konuşmayı/çıktıyı LocalBot'a aktar | Paylaşım/dosya; uygulama köprüsü araştırılacak |
| 8 | Claude | P1 | Kod ve araştırma çıktılarını aktar | Paylaşım/dosya; model API ayrı seçenek |
| 9 | Gemini | P1 | Araştırma ve çoklu ortam çıktıları | Paylaşım/dosya; model API ayrı seçenek |
| 10 | Obsidian | P1 | Ders notları, proje belleği | Yerel vault Markdown dosyaları |
| 11 | OneDrive | P1 | Üniversite dokümanlarını bul | Graph veya yerel eşitlenmiş klasör |
| 12 | Visual Studio Code | P1 | Açık proje, tanılar, seçili kod | Editör eklentisi + yerel köprü |
| 13 | GitHub Desktop | P1 | Yerel repo/branch durumunu gör | Git CLI; Desktop arayüz köprüsü araştırılacak |
| 14 | T3 Code | P1 | Kodlama görevleri arasında bağlam | Mevcut yerel araçları araştırılacak |
| 15 | LLMRig | P1 | Model sağlığı, iki GPU durumu | Mevcut yerel HTTP uçları |
| 16 | Google Calendar | P1 | Ders, sınav, son teslim | Google OAuth + Calendar API |
| 17 | Google Drive | P1 | PDF ve ortak ders dosyaları | Google OAuth + Drive API |
| 18 | Apple Calendar | P1 | Mac takvimini planlarla birleştir | EventKit/yerel izinli köprü |
| 19 | Apple Reminders | P1 | Ödev ve günlük görevler | EventKit/yerel izinli köprü |
| 20 | Finder | P1 | Ders ve proje klasörlerini düzenle | Mevcut yerel dosya araçları |
| 21 | Microsoft Teams | P2 | Ders görüşmeleri ve ekip mesajları | Graph; kurum izinlerine bağlı |
| 22 | OneNote | P2 | Ders defterlerini tarama | Graph |
| 23 | SharePoint | P2 | Üniversite/kurum dosyaları | Graph |
| 24 | Microsoft To Do | P2 | Mailden görev çıkarma | Graph |
| 25 | Google Docs | P2 | Rapor ve ortak çalışma | Google Workspace API |
| 26 | Google Sheets | P2 | Bütçe, not ve program tabloları | Google Workspace API |
| 27 | Google Slides | P2 | Ders sunumu hazırlama | Google Workspace API |
| 28 | Google Tasks | P2 | Hafif günlük görev listesi | Google Workspace API |
| 29 | Notion | P2 | Üniversite/proje çalışma alanı | Resmî API/MCP |
| 30 | Todoist | P2 | Tek yerde görev takibi | API adayı; kapsam doğrulanacak |
| 31 | Trello | P2 | Basit proje panoları | API adayı; kapsam doğrulanacak |
| 32 | Linear | P2 | Yazılım iş takibi | API/MCP adayı; kapsam doğrulanacak |
| 33 | Slack | P2 | Proje ekibi iletişimi | OAuth + API adayı |
| 34 | Telegram | P2 | Bota uzaktan görev gönder | Bot API adayı; kişisel inbox değil |
| 35 | WhatsApp | P3 | Seçili konuşmadan görev/not | Dışa aktarma; kişisel hesap API varsayılmaz |
| 36 | Zoom | P2 | Ders/toplantı notları | API veya kayıt/transkript içe aktarma |
| 37 | Moodle | P1 | Ders, ödev, son teslim | Kurumun açtığı web servisleri araştırılacak |
| 38 | Canvas LMS | P2 | Ders ve teslim takibi | Kurum API erişimi araştırılacak |
| 39 | Zotero | P2 | Kaynakça ve makale arşivi | Yerel koleksiyon/API adayı |
| 40 | Anki | P2 | Notlardan çalışma kartları | Deste dosyası; yerel eklenti opsiyonu |
| 41 | Readwise Reader | P3 | Okuma kuyruğu ve vurgular | API adayı |
| 42 | Apple Notes | P2 | Hızlı notları düzenle | Yerel köprü; izin ve kapsam araştırılacak |
| 43 | Safari | P2 | Seçili sayfayı araştırmaya ekle | Safari eklentisi/yerel paylaşım |
| 44 | Figma | P2 | Tasarım ve geliştirme bağlamı | API/MCP adayı |
| 45 | Godot | P2 | Oyun projeleri, sahne ve hata analizi | Yerel proje dosyaları + CLI |
| 46 | Docker Desktop | P2 | Geliştirme ortamları | Yerel Docker CLI |
| 47 | Vercel | P2 | Site dağıtımı ve loglar | CLI/API adayı |
| 48 | Cloudflare | P3 | Alan adı ve yayın altyapısı | API adayı |
| 49 | Supabase | P3 | Uygulama veritabanı ve loglar | CLI/API adayı |
| 50 | Tailscale | P1 | Mac–LLMRig erişimi/sağlık | Yerel CLI, gerekirse yönetim API |
| 51 | Spotify | P2 | Çalışma/spor müziği | OAuth + Web API; hesap kısıtları kontrol edilir |
| 52 | IINA | P3 | Ders videosu zaman damgalı notları | Yerel dosya/uygulama köprüsü |
| 53 | Wispr Flow | P2 | Sesle LocalBot'a mesaj | Sistem diktesi; özel API araştırılacak |
| 54 | YouTube | P2 | Ders videoları ve izleme listeleri | Data API/dosya; transkript erişimi garanti değil |
| 55 | Strava | P2 | GymCoach için aktivite özeti | OAuth/API adayı |
| 56 | Apple Health | P3 | Spor ve uyku verileri | İzinli iPhone eşlikçi gerekir; Mac doğrudan değil |
| 57 | Hevy | P2 | Ağırlık antrenmanı günlüğü | Dışa aktarma/API koşulları araştırılacak |
| 58 | Amazon | P2 | Ürün karşılaştırma, sipariş e-postası | Seçili sayfa + e-posta; genel hesap API varsayılmaz |
| 59 | eBay | P3 | İkinci el fiyat/ürün takibi | API veya seçili sayfa; erişim koşulları araştırılacak |
| 60 | DHL | P2 | Alışveriş kargo takibi | Takip bağlantısı/e-posta; API erişimi araştırılacak |

İlk paket önerisi: Gmail, Outlook, Discord, GitHub, Chrome/Brave, Obsidian, OneDrive, Calendar, VS Code, LLMRig ve Tailscale. ChatGPT/Claude/Gemini için önce seçili içeriği aktaran basit bir köprü; kullanıcı oturumunun bütün geçmişini okuyabiliyormuş gibi bir bağlantı sunulmamalı.

Doğrulanan temel altyapı kaynakları: [Google Workspace](https://developers.google.com/workspace), [Microsoft Graph](https://learn.microsoft.com/en-us/graph/overview), [GitHub REST](https://docs.github.com/en/rest), [Discord](https://discord.com/developers), [Chrome Extensions](https://developer.chrome.com/docs/extensions/reference/api), [Notion](https://developers.notion.com/), [Obsidian](https://docs.obsidian.md/Home), [Spotify](https://developer.spotify.com/documentation/web-api), [Claude API](https://platform.claude.com/docs/en/api/overview), [Gemini API](https://ai.google.dev/gemini-api/docs). Diğer satırlar uygulama adaylarıdır; bağlantı geliştirilmeden önce resmî erişim yolu ve güncel izinleri ayrıca doğrulanmalı.

## Silmeden önce karar bekleyen manuel alanlar

- MCP sunucu URL/komut/header/env girişleri: hazır bağlantısı olmayan servisler için tek yol. Gelişmiş bölüme alındı. JSON dosyası seçimi eklendi.
- Model sunucusu adresi/API anahtarı: otomatik keşif zaten mevcut; keşfedilemeyen özel sunucular için yedek yol olarak bırakıldı.
- Skill, vault ve review-rule elle girişleri: konuşarak yönetilemeyen özel yapılandırma durumları için korundu. Kullanıcı kararından önce kaldırılmadı.
- Bot şablonu/veri yedeği içe aktarma: manuel JSON yazmak yerine dosya seçimi mevcut; görünümü temaya uyarlandı.
