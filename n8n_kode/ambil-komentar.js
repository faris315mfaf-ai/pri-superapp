// ============================================================================
// Code node n8n: "Ambil Komentar"  (mode: Run Once for All Items)
//
// Masukan  : item postingan dari node "Batasi Jumlah Postingan"
// Keluaran : 1 item per KOMENTAR di dalam jendela, ditambah 1 item ringkasan
//            per postingan yang memuat angka cakupan.
//
// KENAPA ada angka cakupan: API komentar TikTok/Instagram TIDAK selalu bisa
// mengembalikan seluruh komentar pada postingan ramai. Terukur nyata:
// 113 komentar -> hanya 90 (80%), 1.302 komentar -> hanya 216 (17%).
// Kalau angka ini tidak dilaporkan, sistem akan menuduh kader "tidak
// berkomentar" padahal komentarnya memang tidak bisa diambil. Karena itu
// setiap postingan membawa cakupannya sendiri, dan yang di bawah ambang
// ditandai perlu_cek_manual supaya tidak dipakai memvonis siapa pun.
// ============================================================================

// --- Token TikHub -----------------------------------------------------------
// TOKEN TIDAK BOLEH DITULIS DI SINI. Ia dibaca dari Variables n8n
// (Settings -> Variables) dengan nama TIKHUB_TOKEN. Alasannya: nilai yang
// ditulis langsung di kode ikut tersimpan di JSON workflow saat diekspor,
// dan ikut terbawa ke berkas repo -- dua jalur kebocoran yang tidak perlu.
//
// Kalau variabelnya belum dibuat, node ini sengaja BERHENTI dengan pesan
// yang jelas. Gagal terang-terangan lebih baik daripada diam-diam memakai
// token lama yang mungkin sudah dicabut.
let TOKEN_TIKHUB = '';
try { if (typeof $vars !== 'undefined' && $vars && $vars.TIKHUB_TOKEN) TOKEN_TIKHUB = $vars.TIKHUB_TOKEN; } catch (e) {}
try { if (typeof $env !== 'undefined' && $env && $env.TIKHUB_TOKEN) TOKEN_TIKHUB = $env.TIKHUB_TOKEN; } catch (e) {}
if (!TOKEN_TIKHUB) {
  throw new Error('TIKHUB_TOKEN belum diatur. Buka n8n -> Settings -> Variables, buat variabel bernama TIKHUB_TOKEN berisi token TikHub, lalu jalankan ulang.');
}

const BASIS = 'https://api.tikhub.io/api/v1';

// Ambang cakupan. Di bawah ini postingan ditandai perlu dicek manusia.
const AMBANG_CAKUPAN = 0.95;

// ============================================================================
// PLAFON WAKTU -- PERBAIKAN KRITIS (24 Agustus 2026)
//
// n8n Cloud MEMBUNUH PAKSA setiap Code node yang berjalan lebih dari 60 DETIK.
// Ini batas platform (Task Runner), TERPISAH TOTAL dari executionTimeout
// workflow (2400 dtk) -- dan TIDAK BISA diubah dari sisi workflow.
//
// Terbukti nyata (eksekusi 14334, 14342): SATU postingan TikTok berkomentar
// 18 saja bisa menghabiskan penuh 60 detik di dalam paginasinya sendiri.
// Pengecekan waktu yang lama (BATAS_WAKTU_MS 30 menit, dicek HANYA di antar-
// postingan) tidak pernah sempat aktif -- node keburu dibunuh paksa duluan.
// Karena semua penulisan Supabase ada di UJUNG alur, node yang dibunuh paksa
// membuat SELURUH hasil analisis hilang -- tidak ada satu baris pun tersimpan.
//
// PERBAIKANNYA: batas diturunkan ke DETIK, dan dicek di DALAM setiap iterasi
// halaman/sapuan (bukan cuma antar-postingan) -- supaya proses SELALU berhenti
// sendiri jauh sebelum batas 60 detik n8n, lalu menyerahkan apa pun yang
// sudah berhasil diambil. 35 detik menyisakan ~25 detik jeda aman untuk
// permintaan terakhir yang masih berjalan + penyusunan hasil akhir.
//
// Postingan yang terpotong otomatis punya cakupan rendah dan ditandai
// perlu_cek_manual oleh pagar mutu yang sudah ada -- TIDAK ada kader yang
// divonis dari data yang belum lengkap. Kalau masih ada postingan tersisa,
// admin tinggal menekan Analisis Ulang; upsert on_conflict membuat run
// berikutnya melengkapi tanpa mengulang dari nol.
// ============================================================================
const BATAS_WAKTU_MS = 35_000;
const mulaiJalan = Date.now();
function lewatBatas() { return Date.now() - mulaiJalan >= BATAS_WAKTU_MS; }

// --- Batas khusus TikTok ----------------------------------------------------
// count WAJIB <= 50. Sudah terbukti: API tetap membalas maksimal 50 item, TAPI
// cursor maju sebesar count yang DIMINTA. count=100 -> dapat 50, cursor lompat
// 100, sehingga 50 komentar dilewati diam-diam tiap halaman. Angka 20 dipilih
// karena pada uji nyata menghasilkan komentar unik TERBANYAK (219 vs 215 vs 146).
const TT_COUNT = 20;
// Satu sapuan tidak pernah lengkap untuk postingan >40 komentar, dan urutan
// komentar TIDAK kronologis sehingga tidak ada jalan pintas. Uji 8 sapuan pada
// video 189 komentar: 142 -> 165 -> 168 -> 170 -> 172 -> 173 -> 173 -> 173.
// Sapuan ke-4 dan ke-5 masih menambah data, jadi 5 adalah minimum yang layak.
const TT_SAPUAN = 3;
const TT_MAKS_HALAMAN = 20;

// --- Batas khusus Instagram -------------------------------------------------
// Halaman-halaman awal adalah BLOK RANKED yang acak, bukan komentar terbaru.
// Panjangnya tak terduga (pernah 1 item, pernah 100 item / 7 halaman). Berhenti
// di halaman 6 pernah kehilangan 12 dari 14 komentar yang ada di dalam jendela.
// Karena itu DILARANG berhenti sebelum halaman ke-10.
const IG_MIN_HALAMAN = 10;
// Setelah melewati blok ranked, arus komentar menurun kronologis. Tiga halaman
// berturut-turut tanpa komentar dalam jendela = sudah lewat, aman berhenti.
const IG_KOSONG_BERTURUT = 3;
const IG_MAKS_HALAMAN = 40;

async function panggilApi(url) {
  return await this.helpers.httpRequest({
    method: 'GET',
    url: url,
    headers: {
      Authorization: 'Bearer ' + TOKEN_TIKHUB,
      Accept: 'application/json',
      'User-Agent': 'n8n-qc-sosmed/1.0',
    },
    json: true,
    timeout: 20000,
  });
}

function detikKeIso(detik) {
  const n = Number(detik);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function bersihkanUsername(u) {
  return String(u == null ? '' : u).trim().replace(/^@+/, '').toLowerCase();
}

// --- Komentar TikTok --------------------------------------------------------
async function komentarTiktok(post, jejak) {
  const kumpul = new Map(); // cid -> komentar (dedup lintas sapuan)

  for (let sapuan = 1; sapuan <= TT_SAPUAN; sapuan++) {
    if (lewatBatas()) { jejak.batasWaktu = true; break; }
    let cursor = 0;
    for (let hal = 1; hal <= TT_MAKS_HALAMAN; hal++) {
      if (lewatBatas()) { jejak.batasWaktu = true; break; }
      const url = BASIS + '/tiktok/app/v3/fetch_video_comments'
        + '?aweme_id=' + encodeURIComponent(post.id_postingan)
        + '&cursor=' + cursor + '&count=' + TT_COUNT;

      let resp;
      try {
        resp = await panggilApi.call(this, url);
      } catch (e) {
        // Kegagalan satu halaman tidak boleh menjatuhkan seluruh postingan;
        // sapuan berikutnya masih punya kesempatan mengambilnya.
        jejak.error.push('tt hal' + hal + ': ' + e.message);
        break;
      }
      jejak.request += 1;

      const data = (resp && resp.data) || {};
      const daftar = Array.isArray(data.comments) ? data.comments : [];

      for (const k of daftar) {
        const cid = k && k.cid ? String(k.cid) : null;
        if (!cid || kumpul.has(cid)) continue;
        kumpul.set(cid, {
          id_komentar: 'tt-' + cid,
          username: bersihkanUsername(k.user && k.user.unique_id),
          isi: String(k.text == null ? '' : k.text),
          waktu_unix: Number(k.create_time) || 0,
        });
      }

      // data.total DIABAIKAN TOTAL: nilainya palsu, hanya mengekor cursor
      // (cursor=400 membuat total=400). Satu-satunya penanda sah adalah has_more.
      if (Number(data.has_more) !== 1) break;
      const berikut = Number(data.cursor);
      if (!Number.isFinite(berikut) || berikut <= cursor) break; // anti-loop
      cursor = berikut;
    }
  }
  return Array.from(kumpul.values());
}

// --- Komentar Instagram -----------------------------------------------------
async function komentarInstagram(post, jendela, jejak) {
  const kumpul = new Map(); // id -> komentar
  let token = null;
  let kosongBerturut = 0;

  for (let hal = 1; hal <= IG_MAKS_HALAMAN; hal++) {
    if (lewatBatas()) { jejak.batasWaktu = true; break; }
    let url = BASIS + '/instagram/v2/fetch_post_comments'
      + '?code_or_url=' + encodeURIComponent(post.id_postingan)
      + '&sort_by=recent';
    // Token mengandung + / = - WAJIB di-encode, kalau tidak "+" terbaca
    // sebagai spasi dan paginasi diam-diam mengulang halaman 1.
    if (token) url += '&pagination_token=' + encodeURIComponent(token);

    let resp;
    try {
      resp = await panggilApi.call(this, url);
    } catch (e) {
      jejak.error.push('ig hal' + hal + ': ' + e.message);
      break;
    }
    jejak.request += 1;

    const luar = (resp && resp.data) || {};
    // Saat status false, data.data TIDAK ADA. Membacanya langsung = crash.
    if (luar.status === false) {
      jejak.error.push('ig: ' + (luar.errorMessage || 'ditolak API'));
      break;
    }
    const dalam = luar.data || {};
    const daftar = Array.isArray(dalam.items) ? dalam.items : [];

    let adaDalamJendela = 0;
    for (const k of daftar) {
      const id = k && k.id ? String(k.id) : null;
      if (!id || kumpul.has(id)) continue;
      const w = Number(k.created_at) || 0;
      kumpul.set(id, {
        id_komentar: 'ig-' + id,
        username: bersihkanUsername(k.user && k.user.username),
        isi: String(k.text == null ? '' : k.text),
        waktu_unix: w,
      });
      // Sengaja memakai akhir_unix (tutup sesi), BUKAN batas efektif: angka ini cuma
      // penentu kapan paginasi boleh berhenti. Batas yang lebih longgar membuat kita
      // menelusuri lebih jauh - salah di sisi aman. Penyaringan kepatuhan yang
      // sesungguhnya dilakukan di bawah dengan AKHIR_EFEKTIF.
      if (w >= jendela.awal_unix && w <= jendela.akhir_unix) adaDalamJendela += 1;
    }

    // Satu-satunya tanda berhenti yang sah. DILARANG berhenti karena jumlah
    // item < 15: ukuran halaman teramati 1, 5, 10, 11, dan 15.
    token = luar.pagination_token || null;
    if (!token) break;

    // Early-stop hanya SETELAH blok ranked dilewati seluruhnya.
    kosongBerturut = adaDalamJendela === 0 ? kosongBerturut + 1 : 0;
    if (hal >= IG_MIN_HALAMAN && kosongBerturut >= IG_KOSONG_BERTURUT) break;
  }
  return Array.from(kumpul.values());
}

// ============================================================================
// Alur utama
// ============================================================================

const sd = $getWorkflowStaticData('global');
const jendela = sd.jendelaContext;
if (!jendela) {
  throw new Error('jendelaContext tidak ada. Node "Ambil Postingan" harus jalan lebih dulu.');
}

// Batas atas SESI yang dipakai menyaring komentar.
// Node "Ambil Postingan" mengirim akhir_efektif_unix = min(tutup sesi, jam sekarang),
// supaya analisis yang dijalankan jam 15.00 hanya menghitung komentar sampai jam 15.00.
// Cadangan ke akhir_unix dipertahankan agar node ini tetap jalan bila suatu saat
// dipasangkan dengan versi "Ambil Postingan" yang lama (yang belum mengirim field ini).
const AKHIR_EFEKTIF = Number.isFinite(Number(jendela.akhir_efektif_unix))
  ? Number(jendela.akhir_efektif_unix)
  : Number(jendela.akhir_unix);

// Dibaca lewat nama node, bukan $input: antara node pembatas dan node ini
// sekarang terselip pencatat progres yang keluarannya bukan daftar postingan.
const masuk = $('Batasi Jumlah Postingan').all()
  .map((i) => i.json)
  .filter((j) => j && !j.__kosong && j.id_postingan);

const keluaran = [];
const ringkasan = [];
const dilewatiWaktu = [];

for (const post of masuk) {
  // Jangan mulai postingan BARU bila waktu sudah habis -- postingan yang
  // sudah dimulai selalu dibiarkan selesai sendiri lewat cek di dalam
  // komentarTiktok/komentarInstagram, tapi yang belum tersentuh sama sekali
  // lebih baik ditandai "dilewati" daripada dipaksa mulai lalu terpotong.
  if (lewatBatas()) {
    dilewatiWaktu.push(post.id_postingan);
    continue;
  }

  const jejak = { request: 0, error: [] };
  let mentah = [];

  try {
    mentah = post.platform === 'tiktok'
      ? await komentarTiktok.call(this, post, jejak)
      : await komentarInstagram.call(this, post, jendela, jejak);
  } catch (e) {
    jejak.error.push(e.message);
  }

  // Hanya komentar di dalam jendela yang dihitung untuk kepatuhan.
  const dalamJendela = mentah.filter(
    (k) => k.waktu_unix >= jendela.awal_unix && k.waktu_unix <= AKHIR_EFEKTIF,
  );

  // Cakupan dihitung dari SELURUH komentar yang berhasil diambil (bukan hanya
  // yang di dalam jendela) dibanding jumlah yang diklaim platform - karena
  // yang diukur adalah seberapa lengkap kita bisa melihat postingan itu.
  const klaim = Number(post.jumlah_komentar_klaim) || 0;
  const cakupan = klaim > 0 ? Math.min(1, mentah.length / klaim) : 1;
  const perluCek = cakupan < AMBANG_CAKUPAN;

  for (const k of dalamJendela) {
    if (!k.username) continue; // tanpa username tidak bisa dicocokkan ke siapa pun
    keluaran.push({
      json: {
        id_komentar: k.id_komentar,
        id_postingan: post.id_postingan,
        platform: post.platform,
        akun_wajib: post.akun_wajib,
        periode: post.periode,
        username_komentator: k.username,
        isi_komentar: k.isi,
        waktu_komentar_iso: detikKeIso(k.waktu_unix),
      },
    });
  }

  const r = {
    __ringkasan: true,
    id_postingan: post.id_postingan,
    platform: post.platform,
    akun_wajib: post.akun_wajib,
    periode: post.periode,
    jumlah_terambil: mentah.length,
    jumlah_dalam_jendela: dalamJendela.length,
    jumlah_klaim: klaim,
    cakupan: Number(cakupan.toFixed(4)),
    perlu_cek_manual: perluCek,
    request: jejak.request,
    error: jejak.error.length ? jejak.error.join(' | ') : null,
  };
  ringkasan.push(r);
  keluaran.push({ json: r });
}

sd.ringkasanKomentar = ringkasan;
sd.plafonWaktu = {
  batas_ms: BATAS_WAKTU_MS,
  terpakai_ms: Date.now() - mulaiJalan,
  diproses: ringkasan.length,
  dilewati: dilewatiWaktu.length,
  // Maksimal 20 id supaya static data tidak membengkak.
  id_dilewati: dilewatiWaktu.slice(0, 20),
};

// Marker supaya node berikutnya tidak macet saat tidak ada apa-apa.
if (keluaran.length === 0) {
  return [{ json: { __kosong: true, catatan: 'tidak ada postingan untuk diperiksa' } }];
}

return keluaran;
