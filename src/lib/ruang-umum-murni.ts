// ============================================================
// RUANG BOT UNTUK PENGGUNA UMUM (14 Okt 2026) — sanitasi MURNI.
// Pengguna umum hanya melihat ruangan, siapa yang online (nama + JENIS kegiatan), dan chat global.
// Judul video, akun sosmed, platform, divisi, peran, username, handle bot, dan kendali bot
// TIDAK pernah dikirim ke peramban mereka. Tanpa DB/React supaya teruji.
// ============================================================

import type { BotRingkas, KoordinatorRingkas, StatusBot } from "@/lib/bot-tipe";
import type { AktivitasDunia, PenghuniDunia, StatusDunia } from "@/lib/dunia-murni";
import { PERAN_TERSEMBUNYI } from "@/lib/peran";

/** Bot seperti terlihat pengguna umum: rupa & tempatnya saja. */
export type BotUmum = Pick<BotRingkas, "id" | "nama" | "peran" | "warna" | "rupa" | "punya_otak" | "jeda"> & {
  /** Tahap tugas berjalan (tanpa judul) — menentukan meja bot. */
  tahap: string | null;
};

export type StatusRuangUmum = {
  waktu: number;
  dunia: StatusDunia;
  /** false bila tabel bot belum ada (migrasi sql/67). */
  bot_ada: boolean;
  jeda_global: boolean;
  bots: BotUmum[];
  koordinator: Pick<KoordinatorRingkas, "nama" | "peran" | "punya_otak"> | null;
  /** ISO pesan room Chat bot terbaru (hanya untuk animasi rapat). */
  chat_terakhir: string | null;
};

const tersembunyi = (role: string) => (PERAN_TERSEMBUNYI as readonly string[]).includes(role);

function aktivitasUmum(a: AktivitasDunia | null): AktivitasDunia | null {
  if (!a) return null;
  return { ...a, ringkasan: a.label, judul: "", akun: "", platform: "" };
}

/** Penghuni untuk pengguna umum: nama + layar + jenis kegiatan. Master/superadmin tidak dicantumkan. */
export function penghuniUmum(p: PenghuniDunia): PenghuniDunia {
  return { ...p, username: "", divisi: "", role: "", avatar_url: "", aktivitas: aktivitasUmum(p.aktivitas) };
}

export function duniaUmum(d: StatusDunia): StatusDunia {
  // Yang hanya "dipanggil" Koordinator untuk siaran tidak sedang online: tidak ditampilkan ke umum.
  const benarOnline = d.online.filter((p) => !p.dipanggil);
  const online = benarOnline.filter((p) => !tersembunyi(p.role)).map(penghuniUmum);
  const disembunyikan = benarOnline.length - online.length;
  return { waktu: d.waktu, jumlah: Math.max(online.length, d.jumlah - disembunyikan), terpotong: d.terpotong, online };
}

export function botUmum(b: BotRingkas): BotUmum {
  return {
    id: b.id,
    nama: b.nama,
    peran: b.peran,
    warna: b.warna,
    rupa: b.rupa,
    punya_otak: b.punya_otak,
    jeda: b.jeda,
    tahap: b.tugas_aktif?.tahap ?? null,
  };
}

/** Gabungkan status dunia + status bot menjadi payload aman untuk semua anggota. */
export function statusRuangUmum(dunia: StatusDunia, bot: StatusBot | null, waktu: number): StatusRuangUmum {
  const k = bot?.koordinator ?? null;
  return {
    waktu,
    dunia: duniaUmum(dunia),
    bot_ada: !!bot?.tabel_ada,
    jeda_global: !!bot?.jeda_global,
    bots: (bot?.bots ?? []).filter((b) => b.aktif !== false).map(botUmum),
    koordinator: k ? { nama: k.nama, peran: k.peran, punya_otak: k.punya_otak } : null,
    chat_terakhir: bot?.chat_terakhir ?? null,
  };
}
