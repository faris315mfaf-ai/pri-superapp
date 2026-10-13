// ============================================================
// RUANG BOT — pemetaan data server ke bentuk tampilan (13 Okt 2026).
//
// Fungsi MURNI (tanpa React/DOM): mengubah BotRingkas/LogBotDb dari
// GET /api/bot/status menjadi BotContoh/LogItem yang dipakai tampilan,
// menerapkan aksi kendali secara optimis pada salinan StatusBot, dan
// merumuskan waktu relatif untuk denyut runner.
// ============================================================

import type { AksiKendaliBot, AksiSumberBot, BotRingkas, LogBotDb, StatusBot, SumberBotDb } from "@/lib/bot-tipe";
import { normalkanSumber, samaTanpaHuruf, tampilkanHandle } from "@/lib/bot-sumber";
import type { BotContoh, LogItem, SumberContoh } from "./tipe";

/** Bot dari server -> bentuk tampilan. Data yang belum ada di server dikosongkan. */
export function petakanBot(b: BotRingkas): BotContoh {
  return {
    id: String(b.id),
    nama: b.nama,
    peran: b.peran,
    persona: b.persona,
    warna: b.warna,
    handle: b.handle,
    platform: b.platform,
    mode: b.mode,
    rupa: b.rupa,
    // Belum tersedia dari server: dibiarkan kosong, tampilan menandainya.
    riwayat6Hari: [],
    jadwalHariIni: [],
    rataTayangan: "—",
    kuotaHarian: b.kuota_harian,
    nyata: {
      id: b.id,
      userId: b.user_id,
      username: b.username,
      jeda: b.jeda,
      aktif: b.aktif,
      jamMulai: b.jam_mulai,
      jamSelesai: b.jam_selesai,
      gagalBeruntun: b.gagal_beruntun,
      akunTertaut: b.akun_tertaut,
    },
  };
}

/** "HH:MM" WIB dari stempel waktu ISO (tak bergantung zona perangkat). */
function jamWib(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "--:--";
  const d = new Date(ms + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Log server -> umpan tampilan, terbaru di atas (urutan dijaga di sini, bukan dipercayakan ke server). */
export function petakanLog(log: LogBotDb[]): LogItem[] {
  return [...log]
    .sort((a, b) => {
      const sel = Date.parse(b.dibuat_pada) - Date.parse(a.dibuat_pada);
      return Number.isFinite(sel) && sel !== 0 ? sel : b.id - a.id;
    })
    .map((l) => ({ waktu: jamWib(l.dibuat_pada), botId: String(l.bot_id), tahap: l.tahap, teks: l.teks }));
}

/** "baru saja", "3 mnt lalu", "2 jam lalu", atau tanggal bila lebih dari sehari. */
export function waktuRelatif(iso: string | null): string {
  if (!iso) return "belum pernah";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "belum pernah";
  const detik = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (detik < 45) return "baru saja";
  const menit = Math.round(detik / 60);
  if (menit < 60) return `${menit} mnt lalu`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
}

/** Kunci "sedang diproses" sebuah aksi (cegah klik ganda pada kontrol yang sama). */
export function kunciAksi(a: AksiKendaliBot): string {
  switch (a.aksi) {
    case "jeda_global":
      return "jeda_global";
    case "jeda_bot":
      return `jeda:${a.bot_id}`;
    case "mode":
      return `mode:${a.bot_id}`;
    case "kuota":
      return "kuota";
  }
}

/** Salinan status dengan aksi diterapkan (dipakai untuk pembaruan optimis & rollback). */
export function terapkanAksi(s: StatusBot, a: AksiKendaliBot): StatusBot {
  if (a.aksi === "jeda_global") return { ...s, jeda_global: a.nilai };
  const ubah = (b: BotRingkas): BotRingkas => {
    if (b.id !== a.bot_id) return b;
    switch (a.aksi) {
      case "jeda_bot":
        return { ...b, jeda: a.nilai };
      case "mode":
        return { ...b, mode: a.nilai };
      case "kuota":
        return { ...b, kuota_harian: a.nilai };
    }
  };
  return { ...s, bots: s.bots.map(ubah) };
}

/**
 * Aksi yang mengembalikan nilai LAMA (untuk rollback bila server menolak).
 * null bila bot yang dituju tidak ada di status.
 */
export function aksiBalik(s: StatusBot, a: AksiKendaliBot): AksiKendaliBot | null {
  if (a.aksi === "jeda_global") return { aksi: "jeda_global", nilai: s.jeda_global };
  const b = s.bots.find((x) => x.id === a.bot_id);
  if (!b) return null;
  switch (a.aksi) {
    case "jeda_bot":
      return { aksi: "jeda_bot", bot_id: b.id, nilai: b.jeda };
    case "mode":
      return { aksi: "mode", bot_id: b.id, nilai: b.mode };
    case "kuota":
      return { aksi: "kuota", bot_id: b.id, nilai: b.kuota_harian };
  }
}

/** Kalimat sukses singkat untuk toast. */
export function labelSukses(s: StatusBot, a: AksiKendaliBot): string {
  if (a.aksi === "jeda_global") return a.nilai ? "Semua bot dijeda" : "Semua bot dilanjutkan";
  if (a.aksi === "kuota") return `Kuota harian ${a.nilai} post per bot`;
  const nama = s.bots.find((b) => b.id === a.bot_id)?.nama ?? "Bot";
  if (a.aksi === "jeda_bot") return a.nilai ? `${nama} dijeda` : `${nama} dilanjutkan`;
  return `${nama}: mode ${a.nilai === "otomatis" ? "Otomatis" : "Perlu ACC"}`;
}

/** Galat server yang menandakan akun bukan master (fetchJson hanya meneruskan pesannya). */
export function galatDilarang(pesan: string): boolean {
  return /\b403\b|forbidden|hanya (untuk )?master|bukan master|tidak (punya|memiliki) (izin|akses|hak)|tidak berhak/i.test(pesan);
}

// ------------------------------------------------------------
// Sumber & daftar blokir (mode nyata)
// ------------------------------------------------------------

/** Sumber dari server -> baris tampilan (waktu relatif dihitung saat dipanggil). */
export function petakanSumber(s: SumberBotDb): SumberContoh {
  return {
    id: s.id,
    akun: tampilkanHandle(s.platform, s.handle),
    platform: s.platform,
    kategori: s.kategori,
    botId: String(s.bot_id),
    kandidat24Jam: s.kandidat_24_jam,
    terakhirAmbil: waktuRelatif(s.terakhir_ambil),
    aktif: s.aktif,
  };
}

/**
 * Kunci "sedang diproses" aksi sumber/blokir. Aktif & hapus pada sumber yang sama
 * berbagi kunci, jadi keduanya saling mengunci (tak ada hapus saat sakelar berjalan).
 */
export function kunciAksiSumber(a: AksiSumberBot): string {
  switch (a.aksi) {
    case "tambah":
      return "sumber:tambah";
    case "aktif":
    case "hapus":
      return `sumber:${a.id}`;
    case "blokir_tambah":
      return "blokir:tambah";
    case "blokir_hapus":
      return `blokir:${a.kata.trim().toLowerCase()}`;
  }
}

/** Salinan status dengan aksi sumber/blokir diterapkan (pembaruan optimis). */
export function terapkanAksiSumber(s: StatusBot, a: AksiSumberBot, idSementara: number): StatusBot {
  const sumber = s.sumber ?? [];
  const blokir = s.blokir ?? [];
  switch (a.aksi) {
    case "tambah": {
      const sah = normalkanSumber({ platform: a.platform, handle: a.handle });
      if (!sah.ok) return s;
      const baris: SumberBotDb = {
        id: idSementara,
        bot_id: a.bot_id,
        platform: sah.platform,
        handle: sah.handle,
        kategori: a.kategori,
        aktif: true,
        terakhir_ambil: null,
        kandidat_24_jam: 0,
      };
      return { ...s, sumber: [...sumber, baris] };
    }
    case "aktif":
      return { ...s, sumber: sumber.map((x) => (x.id === a.id ? { ...x, aktif: a.nilai } : x)) };
    case "hapus":
      return { ...s, sumber: sumber.filter((x) => x.id !== a.id) };
    case "blokir_tambah":
      return blokir.some((k) => samaTanpaHuruf(k, a.kata)) ? s : { ...s, blokir: [...blokir, a.kata] };
    case "blokir_hapus":
      return { ...s, blokir: blokir.filter((k) => !samaTanpaHuruf(k, a.kata)) };
  }
}

/**
 * Kebalikan terapkanAksiSumber untuk rollback bila server menolak. `awal` = status
 * SEBELUM aksi (sumber nilai lama). Hanya menyentuh bagian yang diubah aksi itu,
 * jadi aksi lain yang berjalan bersamaan tidak ikut terbatalkan.
 */
export function batalkanAksiSumber(s: StatusBot, a: AksiSumberBot, awal: StatusBot, idSementara: number): StatusBot {
  const sumber = s.sumber ?? [];
  const blokir = s.blokir ?? [];
  switch (a.aksi) {
    case "tambah":
      return { ...s, sumber: sumber.filter((x) => x.id !== idSementara) };
    case "aktif": {
      const lama = (awal.sumber ?? []).find((x) => x.id === a.id);
      return lama ? { ...s, sumber: sumber.map((x) => (x.id === a.id ? { ...x, aktif: lama.aktif } : x)) } : s;
    }
    case "hapus": {
      const lama = (awal.sumber ?? []).find((x) => x.id === a.id);
      if (!lama || sumber.some((x) => x.id === a.id)) return s;
      return { ...s, sumber: [...sumber, lama].sort((p, q) => p.id - q.id) };
    }
    case "blokir_tambah":
      return { ...s, blokir: blokir.filter((k) => !samaTanpaHuruf(k, a.kata)) };
    case "blokir_hapus": {
      if (blokir.some((k) => samaTanpaHuruf(k, a.kata))) return s;
      const awalBlokir = awal.blokir ?? [];
      const indeks = awalBlokir.findIndex((k) => samaTanpaHuruf(k, a.kata));
      if (indeks < 0) return s;
      const baru = [...blokir];
      baru.splice(Math.min(indeks, baru.length), 0, awalBlokir[indeks]);
      return { ...s, blokir: baru };
    }
  }
}

/** Nama sumber untuk kalimat toast ("@ntv (Instagram)"). */
function namaSumber(s: StatusBot, id: number): string {
  const x = (s.sumber ?? []).find((y) => y.id === id);
  return x ? `${tampilkanHandle(x.platform, x.handle)} (${x.platform})` : "Sumber";
}

/** Kalimat sukses singkat untuk toast; `awal` = status sebelum aksi. */
export function labelSuksesSumber(awal: StatusBot, a: AksiSumberBot): string {
  switch (a.aksi) {
    case "tambah": {
      const sah = normalkanSumber({ platform: a.platform, handle: a.handle });
      return sah.ok ? `Sumber ditambahkan: ${tampilkanHandle(sah.platform, sah.handle)} (${sah.platform})` : "Sumber ditambahkan";
    }
    case "aktif":
      return `${namaSumber(awal, a.id)} ${a.nilai ? "diaktifkan" : "dinonaktifkan"}`;
    case "hapus":
      return `${namaSumber(awal, a.id)} dihapus`;
    case "blokir_tambah":
      return `Diblokir: ${a.kata}`;
    case "blokir_hapus":
      return `Blokir dicabut: ${a.kata}`;
  }
}
