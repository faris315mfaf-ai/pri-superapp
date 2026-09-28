// ============================================================
// Sinkron akun sosmed tertaut (profil upload-post/Postiz) → akun_tvr_user.
// SERVER. (28 Sep 2026)
//
// Dulu ada tiga salinan (tvr/hubungkan GET, dashboard tv-anggota, studio)
// yang sama-sama bertanya ke database SATU AKUN SATU KUERI, lalu satu
// kueri lagi untuk menulis: 1 + 2N kueri tiap layar TVR Saya dibuka
// (pola N+1). Kini: satu kueri baca untuk semua akun, satu sisip massal,
// dan satu penandaan massal — dan penulisan dilewati bila tidak ada yang
// berubah (yang paling sering terjadi).
//
// Aturannya tidak berubah: akun yang belum terdaftar disisipkan
// (terhubung=true); milik sendiri ditandai terhubung; milik anggota lain
// = konflik (tidak disentuh).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export type AkunTertaut = { platform: string; username: string };
export type BarisAkunAda = { id: number; user_id: number; platform: string; username: string; terhubung: boolean | null };
export type RencanaSinkronAkun = { sisipkan: AkunTertaut[]; tandai: number[]; konflik: string[] };

export function normalUsername(u: string): string {
  return String(u ?? "").trim().toLowerCase().replace(/^@+/, "");
}

/** Akun unik (platform + username ternormal), yang kosong dibuang. */
export function akunUnik(akun: AkunTertaut[]): AkunTertaut[] {
  const lihat = new Set<string>();
  const hasil: AkunTertaut[] = [];
  for (const a of akun) {
    const platform = String(a.platform ?? "").trim().toLowerCase();
    const username = normalUsername(a.username);
    if (!platform || !username) continue;
    const k = `${platform}|${username}`;
    if (lihat.has(k)) continue;
    lihat.add(k);
    hasil.push({ platform, username });
  }
  return hasil;
}

/** MURNI (diuji): apa yang harus disisipkan, ditandai, dan dilaporkan konflik. */
export function rencanaSinkronAkun(userId: number, akun: AkunTertaut[], ada: BarisAkunAda[]): RencanaSinkronAkun {
  const rencana: RencanaSinkronAkun = { sisipkan: [], tandai: [], konflik: [] };
  for (const a of akunUnik(akun)) {
    const cocok = ada.filter((r) => r.platform === a.platform && normalUsername(r.username) === a.username);
    if (cocok.length === 0) {
      rencana.sisipkan.push(a);
      continue;
    }
    // Baris ganda (beda huruf besar/kecil): milik sendiri didahulukan.
    const milikKu = cocok.find((r) => Number(r.user_id) === userId);
    if (milikKu) {
      if (milikKu.terhubung !== true) rencana.tandai.push(Number(milikKu.id));
    } else {
      rencana.konflik.push(`@${a.username} (${a.platform}) sudah terdaftar milik anggota lain`);
    }
  }
  return rencana;
}

/** Nilai untuk filter or() PostgREST: dikutip supaya titik/koma aman. */
function kutip(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function sinkronkanAkunTertaut(
  db: SupabaseClient,
  userId: number,
  akunMentah: AkunTertaut[],
): Promise<{ tersinkron: number; konflik: string[] }> {
  const akun = akunUnik(akunMentah);
  if (akun.length === 0) return { tersinkron: 0, konflik: [] };
  const platforms = [...new Set(akun.map((a) => a.platform))];
  const { data: ada, error } = await db
    .from("akun_tvr_user")
    .select("id, user_id, platform, username, terhubung")
    .in("platform", platforms)
    // Tanpa beda huruf besar/kecil, sama seperti dulu (ilike). Kelebihan
    // cocok karena "_" disaring ulang di rencanaSinkronAkun.
    .or(akun.map((a) => `username.ilike.${kutip(a.username)}`).join(","));
  if (error) {
    // Tanpa daftar yang ada, menyisipkan bisa menabrak milik orang lain:
    // lebih aman tidak menulis apa pun kali ini.
    console.error("[akun-tertaut] baca:", error.message);
    return { tersinkron: 0, konflik: [] };
  }
  const rencana = rencanaSinkronAkun(userId, akun, (ada ?? []) as BarisAkunAda[]);

  let tersinkron = 0;
  if (rencana.sisipkan.length > 0) {
    const baris = rencana.sisipkan.map((a) => ({ user_id: userId, platform: a.platform, username: a.username, terhubung: true }));
    const { error: eMassal } = await db.from("akun_tvr_user").insert(baris);
    if (!eMassal) {
      tersinkron = baris.length;
    } else {
      // Satu baris bentrok (mis. baru saja didaftarkan orang lain) jangan
      // menggagalkan sisanya: ulangi satu per satu — jarang terjadi.
      for (const b of baris) {
        const { error: e1 } = await db.from("akun_tvr_user").insert(b);
        if (!e1) tersinkron += 1;
      }
    }
  }
  if (rencana.tandai.length > 0) {
    await db.from("akun_tvr_user").update({ terhubung: true }).in("id", rencana.tandai);
  }
  return { tersinkron, konflik: rencana.konflik };
}
