// /api/bot/akun — Kelola Bot: membuat & mengubah akun/profil bot (14 Okt 2026). HANYA master.
//
//   POST { aksi:"buat", nama, peran, persona, warna, handle, platform, rupa_indeks }
//        → akun superapp bot di Divisi BOT (username otomatis bot1, bot2, …; TIDAK bisa login — lib/sesi menolak
//          Divisi BOT) + baris bot_redaksi. Kata sandi acak yang tak pernah ditampilkan hanya mengisi kolom wajib.
//   POST { aksi:"ubah", bot_id, nama, peran, persona, warna, handle, platform, rupa_indeks? }
//
// Menggantikan scripts/buat-akun-bot.mjs. Gagal di tengah (baris bot_redaksi gagal) membatalkan akun yang
// baru dibuat supaya tidak ada akun yatim.
import { randomBytes } from "node:crypto";
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { supabase } from "@/lib/supabase";
import { catatAudit } from "@/lib/audit";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { siarkanBot } from "@/lib/bot-realtime";
import { buatHashSandi } from "@/lib/sandi";
import { DIVISI_BOT } from "@/lib/struktur";
import { normalkanKepribadian } from "@/lib/bot-otak-murni";
import { MAKS_BOT, KUOTA_AWAL_BOT, emailAkunBot, normalkanProfilBot, rupaBot, usernameBerikut, type HasilBuatAkunBot } from "@/lib/bot-akun-murni";

export const dynamic = "force-dynamic";

// Semua pesan di sini ditulis sendiri (aman ditampilkan), termasuk yang berstatus 5xx.
function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status, pesanAman: true });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) tolak("Kelola Bot hanya untuk master.", 403);
    if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
    const batas = await pastikanTidakMelebihiBatas(request, "bot-akun", 20, 60, String(user.id));
    if (batas) tolak("Terlalu banyak permintaan. Coba lagi sebentar.", 429);

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sah = normalkanProfilBot(b);
    if (!sah.ok) tolak(sah.pesan);
    const kepr = normalkanKepribadian(sah.nilai.peran, sah.nilai.persona);
    if (!kepr.ok) tolak(kepr.pesan);
    const p = { ...sah.nilai, peran: kepr.peran, persona: kepr.persona };
    const indeksRupa = Number.isFinite(Number(b.rupa_indeks)) ? Number(b.rupa_indeks) : 0;
    const db = supabase();

    if (b.aksi === "buat") {
      const { count, error: eHitung } = await db.from("bot_redaksi").select("id", { count: "exact", head: true });
      if (eHitung) {
        if (tabelBelumAda(eHitung)) tolak("Migrasi Bot Redaksi (sql/67) belum dijalankan.", 503);
        console.error("[bot-akun] hitung bot:", eHitung.message);
        tolak("Gagal memeriksa jumlah bot.", 500);
      }
      if ((count ?? 0) >= MAKS_BOT) tolak(`Jumlah bot sudah mencapai batas (${MAKS_BOT}).`, 409);

      const hash = await buatHashSandi(randomBytes(24).toString("base64url"));
      const sekarang = new Date().toISOString();
      // Username: bot1, bot2, ... pertama yang bebas di seluruh akun (bukan hanya Divisi BOT). Dua pembuatan
      // serentak bisa memilih nomor sama; yang kalah (pelanggaran unik 23505) membaca ulang dan mencoba lagi.
      let userId = 0;
      let username = "";
      for (let percobaan = 0; percobaan < 3 && userId === 0; percobaan++) {
        const { data: ada, error: eAda } = await db.from("app_user").select("username").ilike("username", "bot%");
        if (eAda) {
          console.error("[bot-akun] baca username:", eAda.message);
          tolak("Gagal memeriksa username.", 500);
        }
        username = usernameBerikut(((ada ?? []) as { username: string | null }[]).map((r) => String(r.username ?? "")));
        const { data: baru, error: eUser } = await db
          .from("app_user")
          .insert({
            nama: p.nama,
            username,
            email: emailAkunBot(username),
            nomor_wa: null,
            password_hash: hash,
            role: "anggota",
            jabatan: "",
            bidang_jabatan: "",
            divisi: DIVISI_BOT,
            sub_divisi: "",
            posisi_divisi: "anggota",
            status: "aktif",
            aktif: true,
            profil_lengkap: true,
            // Rilis 2.1 mewajibkan verifikasi WA + tutorial: bot tidak pernah login, tetapi penandanya
            // diisi supaya tidak memicu layar wajib saat master beralih ke akun bot.
            wa_terverifikasi: true,
            verifikasi_21_pada: sekarang,
            tutorial_21_pada: sekarang,
            disetujui_oleh: "sistem (akun bot)",
            disetujui_pada: sekarang,
          })
          .select("id")
          .single();
        if (!eUser && baru) {
          userId = Number((baru as { id: number }).id);
        } else if (eUser?.code !== "23505") {
          console.error("[bot-akun] buat akun:", eUser?.message);
          tolak("Gagal membuat akun bot.", 500);
        }
      }
      if (userId === 0) tolak("Gagal membuat akun bot: nomor username bentrok. Coba lagi.", 409);
      const { data: barisBot, error: eBot } = await db
        .from("bot_redaksi")
        .insert({
          user_id: userId,
          nama: p.nama,
          peran: p.peran,
          persona: p.persona,
          warna: p.warna,
          handle: p.handle,
          platform: p.platform,
          rupa: rupaBot(indeksRupa, p.warna),
          mode: "acc",
          kuota_harian: KUOTA_AWAL_BOT,
        })
        .select("id")
        .single();
      if (eBot || !barisBot) {
        console.error("[bot-akun] buat bot_redaksi:", eBot?.message);
        // Batalkan akun yatim (hasilnya dicatat: bila gagal, akun tanpa profil perlu dibersihkan manual).
        const { error: eBatal } = await db.from("app_user").delete().eq("id", userId);
        if (eBatal) console.error(`[bot-akun] GAGAL membatalkan akun ${userId} (${username}):`, eBatal.message);
        tolak("Gagal membuat profil bot. Akun dibatalkan.", 500);
      }
      const hasil: HasilBuatAkunBot = { id: Number((barisBot as { id: number }).id), user_id: userId, username };
      catatAudit(user.id, "bot_akun", `Membuat bot ${p.nama} (${username})`, { request, detail: { bot_id: hasil.id, username, platform: p.platform } });
      siarkanBot("kendali");
      return hasil;
    }

    if (b.aksi === "ubah") {
      const botId = Number(b.bot_id);
      if (!Number.isInteger(botId) || botId <= 0) tolak("bot_id tidak sah.");
      const { data: lama, error: eLama } = await db.from("bot_redaksi").select("id, user_id").eq("id", botId).maybeSingle();
      if (eLama) tolak("Gagal membaca bot.", 500);
      if (!lama) tolak("Bot tidak ditemukan.", 404);
      const ubah: Record<string, unknown> = { nama: p.nama, peran: p.peran, persona: p.persona, warna: p.warna, handle: p.handle };
      if (p.platform) ubah.platform = p.platform;
      if (b.rupa_indeks != null) ubah.rupa = rupaBot(indeksRupa, p.warna);
      const { error } = await db.from("bot_redaksi").update(ubah).eq("id", botId);
      if (error) {
        console.error("[bot-akun] ubah bot:", error.message);
        tolak("Gagal menyimpan perubahan.", 500);
      }
      // Nama akun ikut (nama yang tampil di layar lain).
      const { error: eNama } = await db.from("app_user").update({ nama: p.nama }).eq("id", (lama as { user_id: number }).user_id).eq("divisi", DIVISI_BOT);
      if (eNama) console.error("[bot-akun] sinkron nama akun:", eNama.message);
      catatAudit(user.id, "bot_akun", `Mengubah profil bot ${p.nama}`, { request, detail: { bot_id: botId } });
      siarkanBot("kendali");
      return { sukses: true };
    }

    return tolak("Aksi tidak dikenal.");
  });
}
