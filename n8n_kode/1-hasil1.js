// ============================================================================
// Code node n8n: "Ambil Postingan"  (mode: Run Once for All Items)
// Masukan  : item-item ber-json { username, platform }  platform='instagram'|'tiktok'
// Keluaran : 1 item per postingan yang terbit di dalam jendela periode berjalan,
//            bentuknya seragam lintas platform.
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
const OFFSET_WIB_DETIK = 7 * 3600;   // WIB = UTC+7, tidak ada DST, jadi aman dipatok

// Berapa halaman maksimum yang boleh diambil per akun. Penjaga biaya: tiap
// request TikHub berbayar, dan jendela kita cuma ~23 jam sehingga 8 halaman
// (TikTok 8x10 video / IG 8x~12 postingan) jauh lebih dari cukup. Angka ini
// hampir tidak pernah tercapai karena loop sudah berhenti duluan begitu
// menemukan postingan yang lebih tua dari awal jendela.
const MAKS_HALAMAN = 8;

// Berapa postingan "sudah lebih tua dari jendela" berturut-turut yang harus
// ditemui sebelum berhenti. KENAPA tidak berhenti di postingan tua pertama:
// Instagram kadang menaruh postingan yang di-pin (maksimal 3) di paling atas,
// dan postingan pin bisa berumur berbulan-bulan. Kalau langsung berhenti,
// postingan baru yang ada di bawahnya ikut hilang. Angka 4 = 3 pin + 1 margin.
const BATAS_TUA_BERTURUT = 4;

// --- Helper waktu -----------------------------------------------------------
// KENAPA ada helper sendiri: semua endpoint TikHub memberi waktu dalam UNIX
// DETIK (bukan milidetik, bukan ISO). Kalau langsung dipakai sebagai ms,
// tahunnya jadi 1970 dan semua postingan dianggap di luar jendela.
function detikKeIso(detik) {
  const n = Number(detik);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

// Menghitung jendela HARIAN: 00:00:00 s.d. 23:59:59 WIB pada SATU tanggal.
//
// ATURAN (per permintaan): scraping mengambil postingan yang terbit pada hari
// itu saja. Tanggalnya bisa dipilih dari aplikasi (dikirim lewat body webhook,
// field "tanggal" berformat YYYY-MM-DD); tanpa kiriman, dipakai hari ini WIB.
//
// DUA BATAS ATAS tetap dipertahankan:
//   akhirUnix        = 23:59:59 tanggal itu (tutup resmi jendela).
//   akhirEfektifUnix = min(tutup, jam sekarang) - analisis jam 15.00 hanya
//                      menghitung data sampai jam 15.00, bukan berpura-pura
//                      sudah punya data sampai tengah malam.
// Untuk tanggal yang SUDAH LEWAT keduanya sama (23:59:59 hari itu).
function hitungJendela(tanggalStr, sekarangMs) {
  const sekarangUnix = Math.floor(sekarangMs / 1000);

  let th, bl, tg;
  if (tanggalStr) {
    const bag = tanggalStr.split('-').map(Number);
    th = bag[0]; bl = bag[1] - 1; tg = bag[2];
  } else {
    const wib = new Date(sekarangMs + OFFSET_WIB_DETIK * 1000);
    th = wib.getUTCFullYear(); bl = wib.getUTCMonth(); tg = wib.getUTCDate();
  }

  const mulaiMs = Date.UTC(th, bl, tg, 0, 0, 0) - OFFSET_WIB_DETIK * 1000;
  const awalUnix = Math.floor(mulaiMs / 1000);
  const akhirUnix = awalUnix + 24 * 3600 - 1;   // 23:59:59 WIB hari itu
  const akhirEfektifUnix = Math.min(akhirUnix, sekarangUnix);

  // Label periode = tanggal + rentang hariannya; format "T HH:MM-HH:MM"
  // dipertahankan supaya tampilan dropdown periode di aplikasi tetap rapi.
  const p = (x) => String(x).padStart(2, '0');
  const tanggal = th + '-' + p(bl + 1) + '-' + p(tg);
  const periode = tanggal + ' 00:00-23:59';

  return { awalUnix, akhirUnix, akhirEfektifUnix, periode, tanggal };
}

// --- Helper HTTP ------------------------------------------------------------
// User-Agent diisi karena TikHub berada di belakang Cloudflare; klien tanpa
// User-Agent yang wajar pernah ditolak 403.
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
    timeout: 60000,
  });
}

// --- Pengambil postingan TikTok --------------------------------------------
async function ambilTiktok(username, jendela, jejak) {
  const hasil = new Map();          // kunci aweme_id -> anti-dobel antar halaman
  let cursor = 0;
  let tuaBerturut = 0;

  for (let halaman = 1; halaman <= MAKS_HALAMAN; halaman++) {
    // count DIPAKSA 10: API TikHub memang membatasi maksimal 10 video per
    // panggilan untuk endpoint ini, minta lebih tidak menambah hasil.
    const url = BASIS + '/tiktok/app/v3/fetch_user_post_videos'
      + '?unique_id=' + encodeURIComponent(username)
      + '&max_cursor=' + cursor + '&count=10';
    const resp = await panggilApi.call(this, url);
    const data = (resp && resp.data) || {};
    jejak.request += 1;

    // Kalau username salah, key aweme_list TIDAK ADA sama sekali (bukan array
    // kosong). Bedakan keduanya supaya salah ketik username tidak diam-diam
    // dianggap "akun tanpa postingan".
    if (!Object.prototype.hasOwnProperty.call(data, 'aweme_list')) {
      throw new Error('TikTok @' + username + ': respons tanpa aweme_list (username salah / akun privat)');
    }
    const daftar = Array.isArray(data.aweme_list) ? data.aweme_list : [];
    jejak.dilihat += daftar.length;

    for (const v of daftar) {
      // Postingan yang disematkan (pinned) dibuang: is_top === 1.
      // Pinned juga TIDAK boleh ikut menghitung "tua berturut-turut", karena
      // pinned selalu nangkring di atas walau umurnya berbulan-bulan.
      if (Number(v.is_top) === 1) { jejak.pinned += 1; continue; }

      const t = Number(v.create_time);   // UNIX DETIK
      if (!Number.isFinite(t) || t <= 0) continue;

      if (t < jendela.awalUnix) { tuaBerturut += 1; continue; }
      tuaBerturut = 0;
      if (t > jendela.akhirEfektifUnix) continue;   // sesudah batas efektif (jam sekarang / tutup sesi)

      const id = String(v.aweme_id || '');
      if (!id) continue;
      const akun = (v.author && v.author.unique_id) ? v.author.unique_id : username;

      // Foto profil diambil sambil lalu dari data postingan - gratis, tanpa
      // request tambahan - untuk mengisi avatar akun di layar QC.
      if (!jejak.avatar && v.author && v.author.avatar_thumb
          && Array.isArray(v.author.avatar_thumb.url_list) && v.author.avatar_thumb.url_list[0]) {
        jejak.avatar = String(v.author.avatar_thumb.url_list[0]);
      }

      hasil.set(id, {
        id_postingan: id,
        platform: 'tiktok',
        akun_wajib: akun,
        url_postingan: 'https://www.tiktok.com/@' + akun + '/video/' + id,
        caption: String(v.desc || ''),
        waktu_posting_iso: detikKeIso(t),
        jumlah_like: Number((v.statistics && v.statistics.digg_count) || 0),
        jumlah_komentar_klaim: Number((v.statistics && v.statistics.comment_count) || 0),
        thumbnail_url: (v.video && v.video.cover && Array.isArray(v.video.cover.url_list))
          ? (v.video.cover.url_list[0] || '') : '',
        periode: jendela.periode,
      });
    }

    // Berhenti kalau sudah cukup dalam ke masa lalu. Untuk POSTINGAN urutan
    // memang kronologis menurun, jadi berhenti awal aman (berbeda dengan
    // KOMENTAR yang urutannya acak dan tidak boleh dihentikan lebih awal).
    if (tuaBerturut >= BATAS_TUA_BERTURUT) break;
    if (Number(data.has_more) !== 1) break;
    const cursorBaru = Number(data.max_cursor);
    if (!Number.isFinite(cursorBaru) || cursorBaru <= 0 || cursorBaru === cursor) break;
    cursor = cursorBaru;   // max_cursor TikTok satuannya MILIdetik, dipakai apa adanya
  }

  return Array.from(hasil.values());
}

// --- Pengambil postingan Instagram -----------------------------------------
async function ambilInstagram(username, jendela, jejak) {
  const hasil = new Map();          // kunci shortcode -> anti-dobel antar halaman
  let token = null;
  let tuaBerturut = 0;

  for (let halaman = 1; halaman <= MAKS_HALAMAN; halaman++) {
    // pagination_token mengandung karakter + dan = sehingga WAJIB di-URL-encode,
    // kalau tidak, '+' terbaca sebagai spasi dan halaman berikutnya gagal.
    let url = BASIS + '/instagram/v2/fetch_user_posts?username=' + encodeURIComponent(username);
    if (token) url += '&pagination_token=' + encodeURIComponent(token);

    const resp = await panggilApi.call(this, url);
    const data = (resp && resp.data) || {};
    jejak.request += 1;

    // Kalau data.status === false maka data.data TIDAK ADA; pesan aslinya ada
    // di data.errorMessage. Dibaca dulu supaya errornya jelas, bukan
    // "cannot read property items of undefined".
    if (data.status === false) {
      throw new Error('Instagram @' + username + ': ' + (data.errorMessage || 'permintaan ditolak API'));
    }
    const daftar = (data.data && Array.isArray(data.data.items)) ? data.data.items : [];
    jejak.dilihat += daftar.length;

    for (const it of daftar) {
      // Instagram juga punya postingan yang di-pin. Sama seperti TikTok, pin
      // dibuang dan tidak ikut menghitung "tua berturut-turut".
      const dipin = it.is_pinned === true
        || (Array.isArray(it.timeline_pinned_user_ids) && it.timeline_pinned_user_ids.length > 0);
      if (dipin) { jejak.pinned += 1; continue; }

      const t = Number(it.taken_at);     // UNIX DETIK
      if (!Number.isFinite(t) || t <= 0) continue;

      if (t < jendela.awalUnix) { tuaBerturut += 1; continue; }
      tuaBerturut = 0;
      if (t > jendela.akhirEfektifUnix) continue;

      // id_postingan memakai code/shortcode, KARENA endpoint komentar IG
      // menerima code_or_url, bukan id numerik.
      const kode = String(it.code || '');
      if (!kode) continue;
      const akun = (it.user && it.user.username) ? it.user.username : username;

      // caption bisa berbentuk objek {text:...} atau string kosong/null.
      let caption = '';
      if (it.caption && typeof it.caption === 'object') caption = String(it.caption.text || '');
      else if (typeof it.caption === 'string') caption = it.caption;

      let thumb = String(it.thumbnail_url || '');
      if (!thumb && it.image_versions && Array.isArray(it.image_versions.items) && it.image_versions.items[0]) {
        thumb = String(it.image_versions.items[0].url || '');
      }

      if (!jejak.avatar && it.user && it.user.profile_pic_url) {
        jejak.avatar = String(it.user.profile_pic_url);
      }

      hasil.set(kode, {
        id_postingan: kode,
        platform: 'instagram',
        akun_wajib: akun,
        url_postingan: 'https://www.instagram.com/p/' + kode + '/',
        caption: caption,
        waktu_posting_iso: detikKeIso(t),
        jumlah_like: Number(it.like_count || 0),
        jumlah_komentar_klaim: Number(it.comment_count || 0),
        thumbnail_url: thumb,
        periode: jendela.periode,
      });
    }

    if (tuaBerturut >= BATAS_TUA_BERTURUT) break;
    // Satu-satunya tanda "habis" yang sah adalah pagination_token === null.
    // JANGAN berhenti karena jumlah item sedikit: ukuran halaman IG tidak tetap
    // (pernah 1, 5, 10, 11, 12, 15 item).
    const tokenBaru = data.pagination_token;
    if (!tokenBaru) break;
    if (tokenBaru === token) break;   // jaga-jaga token mandek supaya tidak berputar
    token = tokenBaru;
  }

  return Array.from(hasil.values());
}

// ============================== EKSEKUSI ====================================
// Tanggal yang diminta aplikasi, dikirim lewat body webhook: {"tanggal":"YYYY-MM-DD"}.
// try/catch karena pada run manual (tombol Execute di editor) node webhook
// tidak pernah jalan dan mereferensikannya melempar error.
let TANGGAL_DIMINTA = null;
try {
  const badan = $('Webhook Mulai Analisis').first().json.body || {};
  const t = String(badan.tanggal || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) TANGGAL_DIMINTA = t;
} catch (e) { /* run manual -> pakai hari ini */ }

const jendela = hitungJendela(TANGGAL_DIMINTA, Date.now());

// Tanggal masa depan: belum ada sedetik pun yang bisa diperiksa. Berhenti
// jujur di sini, jangan membakar kuota scraping untuk hasil yang pasti kosong.
if (jendela.akhirEfektifUnix < jendela.awalUnix) {
  const sdAwal = $getWorkflowStaticData('global');
  sdAwal.jendelaContext = { periode: jendela.periode };
  return [{ json: { __kosong: true, periode: jendela.periode, catatan: 'tanggal ' + jendela.tanggal + ' belum dimulai (masa depan)' } }];
}

// Rapikan daftar akun + buang duplikat platform|username. Dibaca lewat nama
// node (bukan $input) karena antara node akun dan node ini sekarang terselip
// node pencatat progres yang keluarannya bukan daftar akun.
const akunUnik = new Map();
for (const item of $('Siapkan Daftar Akun').all()) {
  const j = item.json || {};
  const username = String(j.username || '').trim().replace(/^@/, '');
  const platform = String(j.platform || '').trim().toLowerCase();
  if (!username || (platform !== 'instagram' && platform !== 'tiktok')) continue;
  akunUnik.set(platform + '|' + username, { username: username, platform: platform });
}

const semuaPostingan = [];
const ringkasan = [];
const gagal = [];

const avatarAkun = {};   // 'platform|username(master)' -> url foto profil

for (const akun of akunUnik.values()) {
  const jejak = { request: 0, dilihat: 0, pinned: 0, avatar: null };
  try {
    const daftar = akun.platform === 'tiktok'
      ? await ambilTiktok.call(this, akun.username, jendela, jejak)
      : await ambilInstagram.call(this, akun.username, jendela, jejak);
    semuaPostingan.push(...daftar);
    if (jejak.avatar) avatarAkun[akun.platform + '|' + akun.username] = jejak.avatar;
    ringkasan.push({ akun: akun.username, platform: akun.platform, masuk_jendela: daftar.length, dilihat: jejak.dilihat, pinned: jejak.pinned, request: jejak.request });
  } catch (e) {
    // Satu akun bermasalah tidak boleh menjatuhkan akun lain - dicatat dulu,
    // baru diputuskan di bawah.
    gagal.push(akun.platform + '/' + akun.username + ': ' + e.message);
    ringkasan.push({ akun: akun.username, platform: akun.platform, masuk_jendela: 0, dilihat: jejak.dilihat, pinned: jejak.pinned, request: jejak.request, error: e.message });
  }
}

// Kalau SEMUA akun gagal, itu tanda masalah global (token mati / kuota habis /
// API down). Sengaja dilempar sebagai error supaya run tidak lolos diam-diam
// dengan hasil kosong yang menyesatkan.
if (akunUnik.size > 0 && gagal.length === akunUnik.size) {
  throw new Error('Semua akun gagal diambil. ' + gagal.join(' | '));
}

// Urutkan dari yang paling lama ke paling baru supaya urutan pemrosesan
// (dan urutan di laporan) stabil antar-run.
semuaPostingan.sort((a, b) => String(a.waktu_posting_iso).localeCompare(String(b.waktu_posting_iso)));

// Simpan konteks untuk node-node berikutnya lewat static data (pola rumah),
// bukan lewat $('NamaNode').
const sd = $getWorkflowStaticData('global');
sd.jendelaContext = {
  periode: jendela.periode,
  awal_iso: detikKeIso(jendela.awalUnix),
  akhir_iso: detikKeIso(jendela.akhirUnix),
  awal_unix: jendela.awalUnix,
  akhir_unix: jendela.akhirUnix,
  // Batas atas yang benar-benar dipakai menyaring = min(tutup sesi, jam sekarang).
  // Node "Ambil Komentar" WAJIB memakai yang ini, bukan akhir_unix, supaya
  // analisis jam 15.00 tidak ikut menghitung komentar yang belum ada.
  akhir_efektif_unix: jendela.akhirEfektifUnix,
  akhir_efektif_iso: detikKeIso(jendela.akhirEfektifUnix),
  sesi_masih_berjalan: jendela.akhirEfektifUnix < jendela.akhirUnix,
  tanggal: jendela.tanggal,
};
sd.avatarAkun = avatarAkun;
sd.postsPeriodeIni = semuaPostingan;
sd.ringkasanAmbilPostingan = ringkasan;
sd.akunGagal = gagal;

// Marker __kosong: Code node yang bisa menghasilkan 0 item WAJIB mengeluarkan
// 1 item penanda, kalau tidak node loop/IF berikutnya macet karena tak ada input.
if (semuaPostingan.length === 0) {
  return [{ json: { __kosong: true, periode: jendela.periode, catatan: gagal.length ? gagal.join(' | ') : 'tidak ada postingan di dalam jendela' } }];
}

return semuaPostingan.map((p) => ({ json: p }));