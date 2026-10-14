// ============================================================
// CHAT GLOBAL RUANG BOT (14 Okt 2026) — KHUSUS SERVER.
// Baca/kirim/hapus/bisukan. Aturan murni di chat-global-murni. Siaran Realtime topik "ruang-chat"
// hanya membawa {t}; isi pesan selalu diambil lewat GET /api/ruang/chat (wajib login).
// Satu siaran membuat SEMUA peramban yang membuka Ruang memuat ulang serentak, jadi daftar pesan dan daftar
// bisu di-cache bersama 3 dtk dan dihapus dari cache setiap kali ada tulis (sebelum siaran).
// ============================================================

import { supabase } from "@/lib/supabase";
import { denganCache, hapusCacheBersama } from "@/lib/cache-bersama";
import { tabelBelumAda } from "@/lib/api-helper";
import { siarkanRealtime } from "@/lib/realtime-server";
import { karakterDariId } from "@/lib/dunia-murni";
import {
  EVENT_CHAT_GLOBAL,
  MAKS_PESAN_AWAL,
  TOPIK_CHAT_GLOBAL,
  awalRiwayatIso,
  masihBisu,
  type PesanGlobal,
  type StatusChatGlobal,
} from "@/lib/chat-global-murni";

export class GalatChat extends Error {
  constructor(
    pesan: string,
    public status: number,
  ) {
    super(pesan);
  }
}

const skemaBelumSiap = (e: { code?: string } | null | undefined) => tabelBelumAda(e) || e?.code === "42703" || e?.code === "PGRST204";

const KUNCI_PESAN = "chat-global:pesan:v1";
const KUNCI_BISU = "chat-global:bisu:v1";
const TTL_DETIK = 3;

/** Hapus cache yang terdampak, lalu beri tahu semua peramban. */
async function setelahTulis(kunci: string[]): Promise<void> {
  await Promise.all(kunci.map((k) => hapusCacheBersama(k).catch(() => undefined)));
  void siarkanRealtime(TOPIK_CHAT_GLOBAL, EVENT_CHAT_GLOBAL, { t: Date.now() }).catch(() => false);
}

type DaftarPesan = { tabel_ada: boolean; pesan: PesanGlobal[] };

/** Bersihkan riwayat lama sesekali (tanpa cron): paling sering sekali per 10 menit per proses. */
let bersihTerakhir = 0;
async function bersihkanLama(): Promise<void> {
  if (Date.now() - bersihTerakhir < 10 * 60_000) return;
  bersihTerakhir = Date.now();
  const { error } = await supabase().from("chat_global").delete().lt("dibuat_pada", awalRiwayatIso(Date.now()));
  if (error && !skemaBelumSiap(error)) console.error("[chat-global] bersihkan:", error.message);
}

/** Bisu yang masih berlaku: [user_id, sampai][] (bentuk JSON agar bisa di-cache). */
function daftarBisu(): Promise<[number, string][]> {
  return denganCache(KUNCI_BISU, TTL_DETIK, async () => {
    const { data, error } = await supabase().from("chat_global_bisu").select("user_id, sampai").gt("sampai", new Date().toISOString());
    if (error) {
      if (!skemaBelumSiap(error)) console.error("[chat-global] bisu:", error.message);
      return [];
    }
    return ((data ?? []) as { user_id: number; sampai: string }[]).map((b) => [Number(b.user_id), b.sampai] as [number, string]);
  });
}

async function bisuSampai(userId: number): Promise<string | null> {
  const s = (await daftarBisu()).find(([id]) => id === userId)?.[1] ?? null;
  return masihBisu(s, Date.now()) ? s : null;
}

/** Pesan terbaru (bukan yang dihapus) + status akun peminta. */
export async function bacaChatGlobal(peminta: { id: number | string; role?: string | null }): Promise<StatusChatGlobal> {
  const [daftar, bisu_sampai] = await Promise.all([denganCache(KUNCI_PESAN, TTL_DETIK, muatPesan), bisuSampai(Number(peminta.id))]);
  return { ...daftar, bisu_sampai, saya_master: peminta.role === "master" };
}

async function muatPesan(): Promise<DaftarPesan> {
  const db = supabase();
  const { data, error } = await db
    .from("chat_global")
    .select("id, user_id, teks, dibuat_pada")
    .is("dihapus_pada", null)
    .gte("dibuat_pada", awalRiwayatIso(Date.now()))
    .order("id", { ascending: false })
    .limit(MAKS_PESAN_AWAL);
  if (error) {
    if (skemaBelumSiap(error)) return { tabel_ada: false, pesan: [] };
    console.error("[chat-global] baca:", error.message);
    throw new GalatChat("Gagal memuat chat.", 500);
  }
  const baris = ((data ?? []) as { id: number; user_id: number; teks: string; dibuat_pada: string }[]).reverse();
  const idUser = [...new Set(baris.map((b) => Number(b.user_id)))];
  const { data: orang } = idUser.length
    ? await db.from("app_user").select("id, nama, username, role").in("id", idUser)
    : { data: [] as { id: number; nama: string | null; username: string | null; role: string | null }[] };
  const per = new Map(((orang ?? []) as { id: number; nama: string | null; username: string | null; role: string | null }[]).map((o) => [Number(o.id), o]));
  const pesan: PesanGlobal[] = baris.map((b) => {
    const o = per.get(Number(b.user_id));
    return {
      id: Number(b.id),
      user_id: Number(b.user_id),
      nama: String(o?.nama || o?.username || "Anggota"),
      karakter: karakterDariId(Number(b.user_id)),
      master: o?.role === "master",
      teks: String(b.teks),
      dibuat_pada: b.dibuat_pada,
    };
  });
  return { tabel_ada: true, pesan };
}

export async function kirimChatGlobal(userId: number, teks: string): Promise<void> {
  const sampai = await bisuSampai(userId);
  if (sampai) {
    const jam = new Date(Date.parse(sampai) + 7 * 3600_000).toISOString().slice(11, 16);
    throw new GalatChat(`Anda dibisukan master sampai pukul ${jam} WIB.`, 403);
  }
  const { error } = await supabase().from("chat_global").insert({ user_id: userId, teks });
  if (error) {
    if (skemaBelumSiap(error)) throw new GalatChat("Chat global belum aktif (migrasi sql/75 belum dijalankan).", 503);
    console.error("[chat-global] kirim:", error.message);
    throw new GalatChat("Pesan gagal dikirim.", 500);
  }
  await setelahTulis([KUNCI_PESAN]);
  void bersihkanLama();
}

export async function hapusChatGlobal(id: number, olehId: number): Promise<void> {
  const { error } = await supabase().from("chat_global").update({ dihapus_pada: new Date().toISOString(), dihapus_oleh: olehId }).eq("id", id).is("dihapus_pada", null);
  if (error) {
    console.error("[chat-global] hapus:", error.message);
    throw new GalatChat("Gagal menghapus pesan.", 500);
  }
  await setelahTulis([KUNCI_PESAN]);
}

export async function bisukanChatGlobal(userId: number, menit: number, olehId: number): Promise<string> {
  const sampai = new Date(Date.now() + menit * 60_000).toISOString();
  const { error } = await supabase().from("chat_global_bisu").upsert({ user_id: userId, sampai, oleh: olehId, dibuat_pada: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("[chat-global] bisukan:", error.message);
    throw new GalatChat("Gagal membisukan.", 500);
  }
  await setelahTulis([KUNCI_BISU]);
  return sampai;
}

export async function bukaBisuChatGlobal(userId: number): Promise<void> {
  const { error } = await supabase().from("chat_global_bisu").delete().eq("user_id", userId);
  if (error) {
    console.error("[chat-global] buka bisu:", error.message);
    throw new GalatChat("Gagal membuka bisu.", 500);
  }
  await setelahTulis([KUNCI_BISU]);
}
