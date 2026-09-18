# LocalBot Remote — iPhone ilk sürüm planı

Durum: Taslak plan, 19 Eylül 2026. Kullanıcı ilk platform olarak iPhone seçti. Bu belge uzaktan erişim servisini açmaz; uygulama geliştirmesi henüz başlamadı.

## Ürün

iPhone, Mac'teki LocalBot'un uzaktan kumandası olacak. Projeler, sohbetler, botlar, dosyalar ve ortak hafıza Mac'teki mevcut runtime'da kalacak. Telefonda başlayan bir görev telefondaki uygulama kapansa da Mac'te devam edecek. Mac kapalı/uykuda olduğunda açıkça çevrimdışı gösterilecek; sessizce başarı iddiası veya otomatik uzaktan uyandırma vaadi olmayacak.

## İlk sürümün ekranları

1. **Mac eşleştirme:** Mac'ten kısa süreli tek kullanımlık QR, telefonda tarama, Mac'te cihazı onaylama. Eşleşen cihaz listesi ve erişimi iptal etme.
2. **Ana ekran:** projeler ve Recents; botların renkli maskotları; bağlı Mac ve aktif görev durumu.
3. **Sohbet:** mesaj gönderme, iptal, dosya/fotoğraf eki, yanıtı kopyalama; bot maskotu ve açılabilir canlı activity. Boş sohbet ilk içerik/taslağa kadar kalıcı listeyi doldurmaz.
4. **Onaylar:** hangi botun hangi dosya/komut için onay istediği ve izin ver/reddet. Karar, tam tool-call ID'sine bağlı ve tek kullanımlık; eski onay yeniden oynatılamaz.
5. **Dosya çıktıları ve hafıza:** izinli proje dosyalarını/PDF'leri görüntüleme-paylaşma; ortak notların kaynağını görme, düzeltme ve unutma. Telefonda bağımsız, çelişen ikinci hafıza oluşturulmaz.

Native SwiftUI, mevcut renkler ve aynı maskot çizimi. Dar ekranda masaüstünün iki sidebar'ını küçültmek yerine tek sohbet + sheet/sekme geçişleri. Liquid Glass native desteklenen bileşenlerde; Reduce Motion/Transparency ve Dynamic Type dikkate alınır.

## Bağlantı mimarisi

`iPhone → eşleşmiş şifreli bağlantı → Mac Remote Gateway → mevcut localhost runtime`

- Mevcut runtime yalnızca `127.0.0.1` dinliyor. Yerel bearer token'ını QR'a koyup portu internete açmayacağız. Ayrı Remote Gateway, cihaz kimliklerini ve izin kapsamını doğrulayacak; yalnızca izinli API rotalarını içeri aktaracak.
- Eşleştirme sırasında cihaz anahtarları üretilir; kısa süreli QR challenge ve Mac onayı ile karşı tarafın kimliği bağlanır. Anahtarlar Keychain'de saklanır. Yerel TLS kimliği QR'daki parmak iziyle doğrulanır; sertifika kontrolünü devre dışı bırakan bir çözüm kullanılmaz.
- Aynı Wi-Fi için Bonjour keşfi ve manuel adres/QR alternatifi. iOS yerel ağ izni akışının reddedilme ve sonradan açılma durumları da tasarlanır. [Apple: Local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
- İnternet erişimi için öneri: Mac'in dışarıya bağlandığı relay; router port açma gerektirmez. Relay mesaj/dosya düz metnini göremez: eşleşmiş uçlar arasında kimliği doğrulanmış şifreleme gerekir. Relay barındırma ve işletme kararı uygulama başlamadan netleştirilmeli. İlk geliştirme kilometre taşı yerel ağ, ürün hedefi dışarıdan da erişim.
- Telefonda sürekli arka plan socket'i çalışacağı varsayılmaz. Ön plana dönünce yeniden bağlanıp eksik olaylar alınır. Bildirim için APNs sağlayıcı servisi, uygulama yetkileri ve dağıtım hesabı gerekir; bildirim yükü varsayılan olarak sohbet/dosya içeriği taşımaz. [Apple: APNs server](https://developer.apple.com/documentation/usernotifications/setting-up-a-remote-notification-server), [Apple: Networking API selection](https://developer.apple.com/documentation/technotes/tn3151-choosing-the-right-networking-api)

## Mevcut koda dayanan işler

- `/events` şu an yalnızca revision değişimini SSE ile bildiriyor; yeniden başlatmalar arasında kalıcı olay cursor'ı ve yeniden oynatma yok. Mobil için görev/mesaj/approval olayları kaynak ID'leri ve monoton sıra numarasıyla kalıcı tutulmalı. Snapshot + cursor recovery tasarlanmalı.
- `/messages` requestId ile tekrar gönderime karşı korumalı. iPhone outbox aynı requestId'yi yeniden kullanmalı; kopan ağ yeni bir görev yaratmamalı.
- `/snapshot`, `/messages`, `/activity`, `/cancel` ve `/approvals` gateway üzerinden kapsamlı olarak kullanılabilir. Provider credential, entegrasyon başlatma ve genel ayar rotaları ilk sürümde varsayılan olarak uzak istemciye açılmaz.
- Hafıza araçları runtime içinde mevcut; mobil yönetim için sayfalı, kaynaklı ve eşzamanlı değişiklik kontrolü içeren API eklenmeli.
- Yeni boş-sohbet temizliği Mac'te açık AppModel'leri ve yerel taslakları biliyor. Remote öncesinde sunucuda cihaz başına sohbet kullanım kaydı ve taslak revizyonu gerekir; Mac temizliği telefonda açık bir taslağı silememeli.
- Domain modelleri, API istemcisi ve uygun maskot/tema kodları küçük ortak Swift package'a ayrılabilir. AppKit, SwiftTerm ve masaüstü pencere yönetimi iPhone hedefinden ayrı tutulur.

## Uygulama sırası ve bitiş ölçütleri

| Aşama | Çıktı | Bitti sayılması için |
|---|---|---|
| 1. Protokol ve eşleştirme | Gateway, cihaz kimliği, iptal, yerel ağ bağlantısı | Gerçek iPhone Mac'e bağlanır; iptal edilen cihazın erişimi hemen kesilir |
| 2. Mobil ana akış | Proje/sohbet, gönderme, canlı activity, durdurma, onay | Telefonda başlatılan görev Mac'te görünür; iki ekranda tek görev ve tutarlı onay durumu vardır |
| 3. Kalıcılık ve dosyalar | Outbox, olay cursor'ı, taslaklar, çıktı görüntüleme, hafıza | Wi-Fi kopup geri geldiğinde çift mesaj oluşmaz; başka cihazın taslağı silinmez |
| 4. İnternet ve bildirim | Şifreli relay, APNs, çevrimdışı durum | Mobil veri üzerinden bağlantı; telefon arka plandayken tamamlanma/onay bildirimi; Mac çevrimdışıysa açık durum |
| 5. Dağıtım ve kalite | TestFlight adayı, erişilebilirlik, performans ölçümü | Küçük/büyük iPhone, klavye, uzun konuşma, ağ değişimi ve arka plan dönüşü gerçek cihazda doğrulanır |

İlk sürümde interaktif uzak terminal, masaüstü ekran kontrolü, çok kullanıcılı paylaşım ve App Store yayını ayrı kapsamdır. Activity ve dosya çıktıları ilk sürümde bulunur; terminal erişimi daha sonra açık izin ve oturum sınırlarıyla eklenebilir.

## Bir sonraki karar

İnternet erişimini ilk teslimata dahil edip relay'i birlikte kurmak mı, önce aynı Wi-Fi'de çalışan iPhone prototipini doğrulamak mı? Öneri: yerel ağda uçtan uca çalışan ilk kilometre taşı, ardından aynı protokol üzerinden internet erişimi. Ayrıca mevcut Apple Developer/TestFlight hesabı ve test iPhone'unun iOS sürümü uygulamaya başlarken doğrulanmalı.
