// ============================================================
// RUANG BOT — pemetaan data server ke bentuk tampilan (13 Okt 2026).
//
// Fungsi MURNI (tanpa React/DOM): mengubah BotRingkas/LogBotDb dari
// GET /api/bot/status menjadi BotContoh/LogItem yang dipakai tampilan,
// menerapkan aksi kendali secara optimis pada salinan StatusBot, dan
// merumuskan waktu relatif untuk denyut runner.
// ============================================================

import type { AksiKendaliBot, BotRingkas, LogBotDb, StatusBot } from "@/lib/bot-tipe";
import type { BotContoh, LogItem } from "./tipe";

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
