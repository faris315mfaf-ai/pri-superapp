// /api/bot/sumber — kelola sumber video & daftar blokir bot (13 Okt 2026).
// POST { aksi: "tambah"|"aktif"|"hapus"|"blokir_tambah"|"blokir_hapus", ... }
// (bentuk: lib/bot-tipe AksiSumberBot). HANYA master. Tiap perubahan dicatat
// di audit dan disiarkan ke Ruang Bot. Daftar sumber/blokir dibaca lewat
// GET /api/bot/status.
//
// Validasi handle ada di lib/bot-sumber (juga dipakai klien). Penghapusan
// sumber TIDAK menghapus kandidatnya: FK bot_kandidat.sumber_id on delete set null.
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { supabase } from "@/lib/supabase";
import { catatAudit } from "@/lib/audit";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { siarkanBot } from "@/lib/bot-realtime";
import {
  BLOKIR_MAKS_JUMLAH,
  SUMBER_MAKS_PER_BOT,
  cocokBlokir,
  normalkanBlokir,
  normalkanKategori,
  normalkanSumber,
  pesanGalatSumber,
  samaTanpaHuruf,
  tampilkanHandle,
} from "@/lib/bot-sumber";

export const dynamic = "force-dynamic";

/** Kode galat Postgres untuk pelanggaran UNIQUE. */
const KODE_DUPLIKAT = "23505";

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

/** Galat tulis DB: migrasi belum jalan = 503 yang jelas, selain itu 500 dengan pesan ringkas. */
function galatTulis(error: { code?: string; message?: string }, pesanGagal: string): never {
  if (tabelBelumAda(error)) tolak("Migrasi bot belum dijalankan.", 503);
  console.error("[bot-sumber]", pesanGagal, error.message ?? "");
  tolak(pesanGagal, 500);
}

const idPositif = (v: unknown, nama: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) tolak(`${nama} tidak sah.`);
  return n;
};

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-sumber", 60, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) tolak("Ruang Bot hanya untuk master.", 403);
    if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = supabase();

    if (b.aksi === "tambah") {
      const botId = idPositif(b.bot_id, "bot_id");
      const sah = normalkanSumber({ platform: b.platform, handle: b.handle });
      if (!sah.ok) tolak(pesanGalatSumber(sah.kode));
      const kategori = normalkanKategori(b.kategori);
      if (!kategori) tolak(pesanGalatSumber("kategori_tak_dikenal"));

      const { data: bot, error: eBot } = await db.from("bot_redaksi").select("id, nama").eq("id", botId).maybeSingle();
      if (eBot) galatTulis(eBot, "Gagal memeriksa bot.");
      if (!bot) tolak("Bot tidak ditemukan.", 404);

      const { data: blokir, error: eBlokir } = await db.from("bot_blokir").select("kata").limit(BLOKIR_MAKS_JUMLAH * 2);
      if (eBlokir) galatTulis(eBlokir, "Gagal memeriksa daftar blokir.");
      const cocok = cocokBlokir(sah.handle, (blokir ?? []).map((r) => String((r as { kata: unknown }).kata ?? "")));
      if (cocok) tolak(`Akun ini cocok dengan daftar blokir (“${cocok}”).`);

      const { count, error: eHitung } = await db.from("bot_sumber").select("id", { count: "exact", head: true }).eq("bot_id", botId);
      if (eHitung) galatTulis(eHitung, "Gagal menghitung sumber bot.");
      if ((count ?? 0) >= SUMBER_MAKS_PER_BOT) tolak(`Satu bot maksimal ${SUMBER_MAKS_PER_BOT} sumber.`);

      const { data, error } = await db
        .from("bot_sumber")
        .insert({ bot_id: botId, platform: sah.platform, handle: sah.handle, kategori })
        .select("id")
        .single();
      if (error) {
        if (error.code === KODE_DUPLIKAT) {
          tolak(`Sumber ${tampilkanHandle(sah.platform, sah.handle)} (${sah.platform}) sudah ada untuk ${String(bot.nama)}.`, 409);
        }
        galatTulis(error, "Gagal menambah sumber.");
      }
      catatAudit(user.id, "bot_sumber", `Tambah sumber ${tampilkanHandle(sah.platform, sah.handle)} (${sah.platform}) untuk bot ${String(bot.nama)}`, {
        request,
        detail: { bot_id: botId, sumber_id: data?.id, platform: sah.platform, handle: sah.handle, kategori },
      });
    } else if (b.aksi === "aktif") {
      if (typeof b.nilai !== "boolean") tolak("nilai harus true/false.");
      const id = idPositif(b.id, "id");
      const { data, error } = await db.from("bot_sumber").update({ aktif: b.nilai }).eq("id", id).select("id, platform, handle");
      if (error) galatTulis(error, "Gagal menyimpan status sumber.");
      if (!data?.length) tolak("Sumber tidak ditemukan.", 404);
      const s = data[0] as { platform: string; handle: string };
      catatAudit(user.id, "bot_sumber", `${b.nilai ? "Mengaktifkan" : "Menonaktifkan"} sumber ${tampilkanHandle(s.platform, s.handle)} (${s.platform})`, {
        request,
        detail: { sumber_id: id, aktif: b.nilai },
      });
    } else if (b.aksi === "hapus") {
      const id = idPositif(b.id, "id");
      const { data, error } = await db.from("bot_sumber").delete().eq("id", id).select("id, platform, handle");
      if (error) galatTulis(error, "Gagal menghapus sumber.");
      if (!data?.length) tolak("Sumber tidak ditemukan.", 404);
      const s = data[0] as { platform: string; handle: string };
      catatAudit(user.id, "bot_sumber", `Menghapus sumber ${tampilkanHandle(s.platform, s.handle)} (${s.platform})`, {
        request,
        detail: { sumber_id: id },
      });
    } else if (b.aksi === "blokir_tambah") {
      const sah = normalkanBlokir(b.kata);
      if (!sah.ok) tolak(pesanGalatSumber(sah.kode));

      const { count, error: eHitung } = await db.from("bot_blokir").select("id", { count: "exact", head: true });
      if (eHitung) galatTulis(eHitung, "Gagal menghitung daftar blokir.");
      if ((count ?? 0) >= BLOKIR_MAKS_JUMLAH) tolak(`Daftar blokir maksimal ${BLOKIR_MAKS_JUMLAH} entri.`);

      // Pagar sebenarnya adalah indeks unik lower(kata); kode 23505 jadi 409.
      const { error } = await db.from("bot_blokir").insert({ kata: sah.kata });
      if (error) {
        if (error.code === KODE_DUPLIKAT) tolak(`“${sah.kata}” sudah ada di daftar blokir.`, 409);
        galatTulis(error, "Gagal menambah blokir.");
      }
      catatAudit(user.id, "bot_sumber", `Menambah blokir “${sah.kata}”`, { request, detail: { kata: sah.kata } });
    } else if (b.aksi === "blokir_hapus") {
      const sah = normalkanBlokir(b.kata);
      if (!sah.ok) tolak(pesanGalatSumber(sah.kode));
      // Cari lewat perbandingan huruf kecil di sini (ilike menganggap % dan _ sebagai pola).
      const { data: semua, error: eBaca } = await db.from("bot_blokir").select("id, kata").limit(BLOKIR_MAKS_JUMLAH * 2);
      if (eBaca) galatTulis(eBaca, "Gagal membaca daftar blokir.");
      const baris = (semua ?? []).find((r) => samaTanpaHuruf(String((r as { kata: unknown }).kata ?? ""), sah.kata)) as { id: number; kata: string } | undefined;
      if (!baris) tolak("Kata itu tidak ada di daftar blokir.", 404);
      // Bila permintaan lain sudah menghapusnya lebih dulu, hasil akhirnya sama: tetap sukses.
      const { error } = await db.from("bot_blokir").delete().eq("id", baris.id);
      if (error) galatTulis(error, "Gagal menghapus blokir.");
      catatAudit(user.id, "bot_sumber", `Menghapus blokir “${baris.kata}”`, { request, detail: { kata: baris.kata } });
    } else {
      tolak("aksi tidak dikenal.");
    }

    siarkanBot("kendali");
    return { sukses: true };
  });
}
