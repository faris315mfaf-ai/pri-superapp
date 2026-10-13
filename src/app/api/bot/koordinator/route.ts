// /api/bot/koordinator — agen koordinator "Nara" (tahap 3, 13 Okt 2026). HANYA master.
//   GET                                       → StatusKoordinator (kunci hanya "••••abcd") + usulan
//   POST { aksi:"simpan", penyedia, kunci }   → enkripsi AES-GCM (AAD "bot:0") lalu simpan; TULIS-SAJA
//   POST { aksi:"hapus" }                     → hapus kunci
//   POST { aksi:"uji" }                       → satu panggilan kecil dengan kunci itu
//   POST { aksi:"kepribadian", peran, persona }
// Kunci polos hanya ada di badan "simpan" dan sebentar di memori; tidak pernah dikembalikan,
// dicatat ke audit/log, atau dikirim ke runner. Setujui/tolak usulan ada di /api/bot/usulan.
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { supabase } from "@/lib/supabase";
import { catatAudit } from "@/lib/audit";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { siarkanBot } from "@/lib/bot-realtime";
import { enkripsiKunci, KunciIndukHilang, kunciIndukSiap } from "@/lib/bot-rahasia";
import { GalatOtak } from "@/lib/bot-otak";
import { ID_ENKRIPSI_KOORDINATOR, GalatKoor, bacaStatusKoordinator, tanyaKoordinator } from "@/lib/bot-koordinator";
import { LABEL_PENYEDIA, PESAN_GALAT_OTAK, adalahPenyedia, akhirKunci, normalkanKepribadian, normalkanKunciApi } from "@/lib/bot-otak-murni";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

function galatTulis(error: { code?: string; message?: string }, pesanGagal: string): never {
  if (tabelBelumAda(error)) tolak("Migrasi 74 (koordinator bot) belum dijalankan.", 503);
  console.error("[bot-koordinator/api]", pesanGagal, error.message ?? "");
  tolak(pesanGagal, 500);
}

async function pastikanMaster(request: Request) {
  const user = await pastikanMasuk(request);
  if (!bolehRuangBot(user)) tolak("Koordinator bot hanya untuk master.", 403);
  if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMaster(request);
    try {
      return await bacaStatusKoordinator();
    } catch (e) {
      if (e instanceof GalatKoor) tolak(e.message, e.status);
      throw e;
    }
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-koordinator", 20, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMaster(request);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = supabase();

    if (b.aksi === "simpan") {
      if (!adalahPenyedia(b.penyedia)) tolak("Penyedia tidak dikenal.");
      const sah = normalkanKunciApi(b.kunci);
      if (!sah.ok) tolak(sah.pesan);
      if (!kunciIndukSiap()) tolak("Server belum punya BOT_KUNCI_INDUK, kunci tidak bisa disimpan dengan aman.", 503);
      let sandi: string;
      try {
        sandi = enkripsiKunci(sah.kunci, ID_ENKRIPSI_KOORDINATOR);
      } catch (e) {
        if (e instanceof KunciIndukHilang) tolak(e.message, 503);
        throw e;
      }
      const { data, error } = await db
        .from("bot_koordinator")
        .update({ penyedia: b.penyedia, kunci_sandi: sandi, akhir: akhirKunci(sah.kunci), diubah_pada: new Date().toISOString(), diubah_oleh: Number(user.id), teruji_pada: null, hasil_uji: null })
        .eq("id", 1)
        .select("id");
      if (error) galatTulis(error, "Gagal menyimpan API key.");
      if (!data?.length) tolak("Baris koordinator belum ada. Jalankan migrasi 74.", 503);
      catatAudit(user.id, "bot_koordinator", `Mengatur API key ${LABEL_PENYEDIA[b.penyedia]} untuk Nara`, { request, detail: { penyedia: b.penyedia, akhir: akhirKunci(sah.kunci) } });
      siarkanBot("kendali");
      return { sukses: true };
    }

    if (b.aksi === "hapus") {
      const { error } = await db.from("bot_koordinator").update({ penyedia: null, kunci_sandi: null, akhir: "", teruji_pada: null, hasil_uji: null }).eq("id", 1);
      if (error) galatTulis(error, "Gagal menghapus API key.");
      catatAudit(user.id, "bot_koordinator", "Menghapus API key Nara", { request });
      siarkanBot("kendali");
      return { sukses: true };
    }

    if (b.aksi === "kepribadian") {
      const k = normalkanKepribadian(b.peran, b.persona);
      if (!k.ok) tolak(k.pesan);
      const { error } = await db.from("bot_koordinator").update({ peran: k.peran, persona: k.persona }).eq("id", 1);
      if (error) galatTulis(error, "Gagal menyimpan kepribadian.");
      catatAudit(user.id, "bot_koordinator", "Mengubah peran/watak Nara", { request, detail: { peran: k.peran } });
      siarkanBot("kendali");
      return { sukses: true };
    }

    if (b.aksi === "uji") {
      let hasil = "ok";
      try {
        await tanyaKoordinator({ sistem: "Balas hanya JSON valid.", pengguna: 'Balas persis: {"ok":true}', json: true, fitur: "uji", maksToken: 20, batasMs: 15_000 });
      } catch (e) {
        if (!(e instanceof GalatOtak)) throw e;
        hasil = e.kode;
      }
      if (hasil !== "tanpa_kunci") {
        const { error } = await db.from("bot_koordinator").update({ teruji_pada: new Date().toISOString(), hasil_uji: hasil }).eq("id", 1);
        if (error) console.error("[bot-koordinator/api] catat uji:", error.message);
      }
      catatAudit(user.id, "bot_koordinator", `Menguji API key Nara: ${hasil}`, { request, detail: { hasil } });
      const ok = hasil === "ok";
      return { sukses: ok, kode: hasil, pesan: ok ? "API key berfungsi." : (PESAN_GALAT_OTAK as Record<string, string>)[hasil] ?? PESAN_GALAT_OTAK.gagal };
    }

    return tolak("aksi tidak dikenal.");
  });
}
