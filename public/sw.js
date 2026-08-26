// ============================================================
// Service Worker PRI SuperApp
//
// Dua tugas: (1) memenuhi syarat agar aplikasi bisa DIPASANG
// (Android/Chrome menolak memasang tanpa service worker ber-fetch
// handler), dan (2) membuat cangkang aplikasi tetap terbuka saat
// sinyal putus.
//
// ATURAN PALING PENTING: permintaan /api/ TIDAK PERNAH di-cache.
// Isinya data kepatuhan kader dan status video yang berubah terus.
// Menampilkan angka lama seolah-olah masih berlaku jauh lebih
// berbahaya daripada sekadar gagal memuat.
//
// ATURAN KEDUA (dipelajari dari kegagalan nyata): HALAMAN diambil
// dari JARINGAN DULU, tidak pernah disajikan dari simpanan selama
// masih ada sinyal. Lihat penjelasan panjang di penangan "navigate".
// ============================================================

// Dinaikkan tiap kali aturan simpanan berubah: penangan "activate" menghapus semua
// cache yang namanya tidak diawali VERSI, sehingga simpanan v1 yang
// berisi HTML rusak (lihat catatan di bawah) ikut terbuang pada
// pemasangan pertama versi ini.
const VERSI = "pri-v3";
const CACHE_SHELL = `${VERSI}-shell`;

// Kunci tetap tempat cangkang HTML terakhir disimpan sebagai cadangan
// luring. Satu kunci untuk semua rute: aplikasi ini satu halaman,
// seluruh layarnya digambar di sisi klien.
const KUNCI_SHELL = "/__cangkang";

// Aset statis yang disimpan sejak pemasangan. Halaman "/" TIDAK ada di
// sini dan tidak pernah disimpan lebih dulu — ia hanya disalin sebagai
// cadangan luring setelah berhasil diambil dari jaringan.
const ASET_SHELL = [
  "/ikon/ikon-192.png",
  "/ikon/ikon-512.png",
  "/ikon/apple-touch-icon.png",
  // Lambang resmi PRI yang dipakai DI DALAM aplikasi (layar masuk &
  // splash). Wajib ikut disimpan sejak pemasangan: kedua layar itu
  // adalah yang PERTAMA tampil, dan bila berkasnya belum tersimpan
  // saat sinyal putus, komponen LogoPri jatuh ke cadangan lingkaran
  // bertuliskan "PRI" — persis tampilan lama yang sudah diganti.
  "/ikon/logo-app-256.png",
  "/manifest.webmanifest",
];

// true bila service worker ini MENGGANTIKAN versi lama (bukan
// pemasangan pertama). Dipakai penangan "activate" di bawah untuk
// memutuskan perlu-tidaknya memuat ulang jendela yang terbuka.
let menggantikanVersiLama = false;

self.addEventListener("install", (event) => {
  menggantikanVersiLama = Boolean(self.registration.active);
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(ASET_SHELL))
      // Satu aset gagal diunduh tidak boleh menggagalkan pemasangan
      // service worker secara keseluruhan.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((kunci) =>
        Promise.all(
          kunci.filter((k) => !k.startsWith(VERSI)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => {
        // PENYEMBUHAN OTOMATIS.
        //
        // Perangkat yang masih memegang service worker versi lama sudah
        // terlanjur disajikan HTML basi pada pembukaan ini — layarnya
        // rusak, dan pengguna tidak tahu harus menekan Reload. Begitu
        // versi baru ini berkuasa, jendela yang terbuka dimuat ulang
        // sendiri supaya mengambil HTML segar dari jaringan.
        //
        // Hanya dilakukan saat MENGGANTIKAN versi lama, dan hanya sekali
        // per versi service worker — jadi tidak mungkin berputar-putar.
        if (!menggantikanVersiLama) return undefined;
        return self.clients.matchAll({ type: "window" }).then((daftar) => {
          for (const klien of daftar) {
            try {
              klien.navigate(klien.url);
            } catch {
              // Sebagian peramban melarang navigate() dari service
              // worker; abaikan — pengguna cukup memuat ulang manual.
            }
          }
          return undefined;
        });
      })
      .catch(() => undefined),
  );
});

// ============================================================
// NOTIFIKASI PUSH
// Dikirim server lewat Web Push saat workflow n8n selesai/gagal,
// lalu ditampilkan Android sebagai notifikasi sistem sungguhan —
// muncul meski aplikasi sedang tertutup.
// ============================================================

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Payload bukan JSON (mis. uji manual dari alat luar).
    data = { judul: "PRI SuperApp", isi: event.data ? event.data.text() : "" };
  }

  const judul = data.judul || "PRI SuperApp";
  const opsi = {
    body: data.isi || "",
    icon: "/ikon/ikon-192.png",
    // Lencana tampil di bilah status Android; harus siluet sederhana.
    badge: "/ikon/ikon-192.png",
    lang: "id",
    // tag membuat notifikasi untuk video yang sama saling menimpa,
    // bukan menumpuk berkali-kali di panel notifikasi.
    tag: data.tag || "pri-umum",
    renotify: Boolean(data.tag),
    data: { target: data.target || null, url: data.url || "/" },
    // Getaran pendek: cukup terasa, tidak mengganggu.
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(judul, opsi));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tujuan = (event.notification.data && event.notification.data.url) || "/";

  // Kalau aplikasi sudah terbuka, fokuskan jendela itu alih-alih
  // membuka salinan baru.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((daftar) => {
        for (const klien of daftar) {
          if (klien.url.includes(self.location.origin) && "focus" in klien) {
            return klien.focus();
          }
        }
        return self.clients.openWindow(tujuan);
      }),
  );
});

/** Halaman cadangan saat benar-benar tidak ada sinyal DAN tidak ada simpanan */
function halamanLuring() {
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Tidak ada koneksi</title>" +
      "<body style='font-family:system-ui;background:#0B1120;color:#E2E8F0;" +
      "display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:24px'>" +
      "<div><h1 style='margin:0 0 8px'>Tidak ada koneksi</h1>" +
      "<p style='color:#94A3B8;margin:0'>Sambungkan internet lalu buka ulang PRI SuperApp.</p></div>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

self.addEventListener("fetch", (event) => {
  const permintaan = event.request;

  // Hanya tangani GET. POST/PATCH/DELETE (login, simpan suntingan,
  // proses video) harus selalu lewat jaringan apa adanya.
  if (permintaan.method !== "GET") return;

  const url = new URL(permintaan.url);

  // Lewatkan permintaan ke domain lain (Supabase, Cloudinary, video
  // Creatomate) — biarkan peramban menanganinya sendiri.
  if (url.origin !== self.location.origin) return;

  // DATA HIDUP: jangan pernah disajikan dari cache.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(permintaan).catch(
        () =>
          new Response(
            JSON.stringify({
              error: "Tidak ada koneksi internet. Coba lagi setelah tersambung.",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    return;
  }

  // ============================================================
  // HALAMAN: JARINGAN DULU. Simpanan hanya cadangan saat luring.
  //
  // Versi sebelumnya menyajikan HTML tersimpan SEKETIKA demi hemat
  // ~1,2 detik, dengan alasan "versi baru muncul pada pembukaan
  // berikutnya". Alasan itu keliru dan sempat membuat aplikasi mati
  // total di produksi:
  //
  // HTML Next.js menyebut berkas skrip yang namanya mengandung sidik
  // build (mis. /_next/static/chunks/page-ABC123.js). Setelah deploy
  // baru, berkas-berkas itu berganti nama. HTML LAMA yang disajikan
  // dari simpanan tetap meminta nama LAMA — sebagian sudah tidak ada
  // di server, sebagian lagi tercampur dengan berkas versi baru.
  // Akibatnya bukan sekadar "tertinggal satu versi", melainkan
  // aplikasi gagal dijalankan sama sekali dan peramban menampilkan
  // "This page couldn't load".
  //
  // Jadi pertukarannya bukan "1,2 detik vs tertinggal satu versi",
  // melainkan "1,2 detik vs aplikasi rusak setiap kali deploy".
  // Menunggu jaringan adalah harga yang benar untuk dibayar.
  // ============================================================
  if (permintaan.mode === "navigate") {
    event.respondWith(
      fetch(permintaan)
        .then((respons) => {
          // Simpan salinan HANYA sebagai cadangan luring, di bawah satu
          // kunci tetap KUNCI_SHELL.
          //
          // Kuncinya sengaja bukan permintaan aslinya: balasan Next.js
          // membawa header Vary (RSC, Next-Router-State-Tree), dan
          // dengan Vary, pencocokan simpanan ikut membandingkan header
          // permintaan. Header navigasi tidak pernah sama persis dari
          // waktu ke waktu, sehingga salinan itu praktis tak pernah
          // ketemu lagi — cadangan luring yang tidak pernah terpakai.
          if (respons && respons.status === 200) {
            const salinan = respons.clone();
            event.waitUntil(
              caches.open(CACHE_SHELL).then((cache) => cache.put(KUNCI_SHELL, salinan)),
            );
          }
          return respons;
        })
        .catch(() =>
          // Luring: sajikan cangkang terakhir yang berhasil diambil.
          // Berkas skrip yang dirujuknya juga ada di simpanan (lihat
          // penangan aset di bawah), jadi versinya tetap sepadan.
          caches
            .match(KUNCI_SHELL, { ignoreVary: true })
            .then((tersimpan) => tersimpan || halamanLuring()),
        ),
    );
    return;
  }

  // ============================================================
  // ASET STATIS (skrip, gaya, gambar).
  //
  // Berkas di /_next/static/ namanya mengandung sidik isi, jadi nama
  // yang sama SELALU berarti isi yang sama — aman disajikan dari
  // simpanan lebih dulu. Yang penting: penangan ini WAJIB selalu
  // mengembalikan sebuah Response. Versi sebelumnya bisa berakhir
  // dengan `undefined` saat berkas belum tersimpan DAN jaringan mati,
  // dan `respondWith(undefined)` membuat peramban menampilkan halaman
  // galat alih-alih gagal dengan tenang.
  // ============================================================
  event.respondWith(
    caches.match(permintaan).then((tersimpan) => {
      if (tersimpan) {
        // Segarkan diam-diam untuk pemakaian berikutnya.
        event.waitUntil(
          fetch(permintaan)
            .then((respons) => {
              if (respons && respons.status === 200 && respons.type === "basic") {
                const salinan = respons.clone();
                return caches
                  .open(CACHE_SHELL)
                  .then((cache) => cache.put(permintaan, salinan));
              }
              return undefined;
            })
            .catch(() => undefined),
        );
        return tersimpan;
      }

      return fetch(permintaan)
        .then((respons) => {
          if (respons && respons.status === 200 && respons.type === "basic") {
            const salinan = respons.clone();
            event.waitUntil(
              caches.open(CACHE_SHELL).then((cache) => cache.put(permintaan, salinan)),
            );
          }
          return respons;
        })
        .catch(
          () =>
            new Response("", {
              status: 504,
              statusText: "Tidak ada koneksi",
            }),
        );
    }),
  );
});
