# SmartPay Agent 🚀 (Moka United AI Ideathon & Hackathon)

SmartPay Agent, ödeme sistemleri (POS/Sanal POS) altyapılarında kesintileri ve anomalileri gerçek zamanlı tespit eden, ML tabanlı akıllı yönlendirme yapan ve otonom bir AI Agent (Gemini 2.0 Flash) ile anında müdahale sağlayan konsept bir projedir.

Bu proje **Moka United AI Ideathon & Hackathon** için bir demo olarak tasarlanmıştır.

## Özellikler

1. **ML Routing (Akıllı Yönlendirme):** İşlemleri (kart tipi, tutar vb.) değerlendirerek en uygun ve en yüksek başarı oranına sahip sanal POS'a (Acquirer) yönlendirir.
2. **Gerçek Zamanlı İzleme & Anomali Tespiti:** Arka planda sürekli çalışan monitoring servisi; başarı oranlarındaki ani düşüşleri, gecikme (latency) artışlarını veya üst üste gelen hataları anında tespit eder.
3. **Agentic AI Müdahalesi (Gemini 2.0 Flash):**
   - Anomali durumunda AI devreye girer.
   - Sistem loglarını, metrikleri ve hata dağılımlarını gerçek zamanlı **Tool Calling (Function Calling)** ile inceler.
   - Sorunu tespit eder, arızalı POS'un ağırlığını düşürür veya tamamen izole eder (kapatır).
   - Çözülemeyen veya çok riskli durumlarda "Admin" kullanıcısına **Escalation (İletişim)** açar.
4. **Retry Engine (Yeniden Deneme Mekanizması):** Bir acquirer'da işlem başarısız olursa, ML skorlarına göre en iyi ikinci/üçüncü acquirer üzerinden işlemi anında tekrar dener.
5. **Admin Dashboard:** Sistemi yönetmek, logları incelemek, acquirer durumlarını görmek ve Agent AI ile chat yapmak için tasarlanmış gerçek zamanlı, şık bir arayüz.

## Teknolojiler

- **Backend:** Node.js, Express.js, Socket.IO, SQLite
- **Frontend / Admin:** React, Vite, Socket.IO Client, Axios, CSS (Glassmorphism & Dark Mode)
- **AI:** Google Gemini 2.0 Flash (Tool Calling)
- **Altyapı:** Docker & Docker Compose

## Kurulum (Docker ile Tek Tıkla)

Sistemi ayağa kaldırmak için bilgisayarınızda **Docker** ve **Docker Compose** kurulu olmalıdır.

1. Depoyu klonlayın ve klasöre girin.
2. `.env.example` dosyasının adını `.env` olarak değiştirin ve içine kendi `GEMINI_API_KEY`'inizi yazın.

\`\`\`bash
cp .env.example .env
# nano .env ile GEMINI_API_KEY ekleyin
\`\`\`

3. Docker Compose ile tüm sistemi başlatın:

\`\`\`bash
docker compose up --build
\`\`\`

Bu komut 3 farklı servisi (Backend, Frontend, Admin) ayağa kaldıracaktır.

## Erişim Adresleri

| Uygulama | Port | Adres |
| :--- | :--- | :--- |
| **Backend API** | 4000 | http://localhost:4000 |
| **Müşteri Ödeme Ekranı** | 3000 | http://localhost:3000 |
| **Admin Dashboard** | 3001 | http://localhost:3001 |

**Admin Giriş Bilgileri:**
- **Kullanıcı Adı:** `admin`
- **Şifre:** `admin`

## Demo Senaryoları Nasıl Çalıştırılır?

Müşteri ödeme ekranında (localhost:3000) hazır demo senaryo butonları bulunur:

1. **🟢 Her Zaman Başarılı:** Garantili başarılı işlem döner.
2. **🟡 Riskli İşlem:** %70 ihtimalle başarılı olur, aksi takdirde Retry Engine devreye girer.
3. **🔴 Bakiye Yetersiz:** Kart bakiyesi yetersiz hatası döner (Acquirer sağlamdır, müdahale gerektirmez).
4. **⏱️ Timeout → Retry:** Acquirer zaman aşımına uğrar, sistem otomatik olarak başka bir bankadan dener.
5. **🤖 Anomali Tetikle (AI Devreye Girer):** Bu butona tıkladığınızda kasıtlı olarak bir sağlayıcının başarı oranı dibe çöktürülür.
   - Admin paneline geçin ve **Dashboard** veya **Acquirers** sekmesinden başarı oranının düştüğünü izleyin.
   - Kısa süre içinde **Agent AI** olayı fark edip incelemeye başlayacaktır.
   - **Agent AI** sekmesine giderek yapay zekanın hangi logları çektiğini, ne karar verdiğini ve nasıl aksiyon aldığını (örneğin arızalı bankayı kapatması) canlı olarak izleyebilirsiniz.

## Dosya Yapısı

- `/backend`: Express.js API, veritabanı init komutları, Gemini AI servisleri ve monitoring süreçleri.
- `/frontend`: Son kullanıcının kart bilgilerini girerek ödeme yaptığı Vite/React uygulaması.
- `/admin`: Sistem yöneticilerinin metrikleri, hataları, yapay zeka kararlarını gördüğü Vite/React uygulaması.

> Tüm veritabanı (SQLite) dosyası `data/` klasöründe tutulur ve container silinse bile veriler kaybolmaz.
