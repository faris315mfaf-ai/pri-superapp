// ============================================================
// Ingatkan verifikasi akun (KHUSUS SISI SERVER) — fitur 1.22.x/1.
//
// Mendeteksi anggota aktif yang BELUM lengkap verifikasinya (WhatsApp,
// Google, atau Wajah) lalu mengirim notifikasi + push berkala yang
// mengajak menyelesaikannya. Menumpang after() di /api/sesi (dibuka
// setiap orang membuka aplikasi), jadi TANPA cron.
//
// Kekerapan diklaim ATOMIK lewat pengaturan_sistem: bawaan tiap 60
// menit; bisa diubah tanpa deploy lewat kunci
// `verif_reminder_interval_menit` (mis. 360 = tiap 6 jam).
// ============================================================
import { supabase } from "@/lib/supabase";
import { kirimKabar } from "@/lib/notifikasi";

const KUNCI_KLAIM = "verif_reminder_bucket";
const KUNCI_INTERVAL = "verif_reminder_interval_menit";
const INTERVAL_BAWAAN = 60;
const INTERVAL_MIN = 15;

async function bacaIntervalMenit(db: ReturnType<typeof supabase>): Promise<number> {
  const { data } = await db
    .from("pengaturan_sistem")
    .select("nilai")
    .eq("kunci", KUNCI_INTERVAL)
    .maybeSingle();
  const n = Number(data?.nilai ?? INTERVAL_BAWAAN);
  return Number.isFinite(n) && n >= INTERVAL_MIN ? Math.floor(n) : INTERVAL_BAWAAN;
}

/**
 * Kirim ajakan verifikasi maksimal SEKALI per jendela (bawaan 60 menit).
 * Kunci klaim di pengaturan_sistem memastikan dua pembukaan aplikasi yang
 * berbarengan tidak mengirim dobel: hanya request yang berhasil mengubah
 * nilainya ke "bucket" jendela sekarang yang boleh mengirim.
 */
export async function siaranVerifikasiBerkala(): Promise<void> {
  try {
    const db = supabase();
    const intervalMenit = await bacaIntervalMenit(db);
    const bucket = String(Math.floor(Date.now() / (intervalMenit * 60_000)));

    // Pastikan baris klaim ada (tanpa menimpa nilainya), lalu klaim atomik.
    await db
      .from("pengaturan_sistem")
      .upsert({ kunci: KUNCI_KLAIM, nilai: "" }, { onConflict: "kunci", ignoreDuplicates: true });
    const { data: klaim } = await db
      .from("pengaturan_sistem")
      .update({ nilai: bucket })
      .eq("kunci", KUNCI_KLAIM)
      .neq("nilai", bucket)
      .select("kunci");
    if (!klaim || klaim.length === 0) return; // sudah dikirim untuk jendela ini

    // Anggota aktif (bukan master) + status verifikasi WA & Google.
    const { data: users } = await db
      .from("app_user")
      .select("id, wa_terverifikasi, google_linked")
      .eq("aktif", true)
      .eq("status", "aktif")
      .neq("role", "master");
    if (!users || users.length === 0) return;

    // Wajah dilacak lewat KEBERADAAN baris di wajah_template (tak ada kolom
    // boolean di app_user), jadi butuh gabungan terpisah.
    const { data: wajah } = await db.from("wajah_template").select("user_id");
    const punyaWajah = new Set((wajah ?? []).map((w) => Number(w.user_id)));

    // Kelompokkan per KOMBINASI yang kurang → satu notifikasi per kombinasi
    // (maks. 7 panggilan, bukan satu per orang) tapi tetap menyebut persis
    // apa yang kurang untuk kelompok itu.
    const kelompok = new Map<string, number[]>();
    for (const u of users) {
      const kurang: string[] = [];
      if (u.wa_terverifikasi !== true) kurang.push("WhatsApp");
      if (u.google_linked !== true) kurang.push("Google");
      if (!punyaWajah.has(Number(u.id))) kurang.push("Wajah");
      if (kurang.length === 0) continue;
      const sig = kurang.join("|");
      const arr = kelompok.get(sig);
      if (arr) arr.push(Number(u.id));
      else kelompok.set(sig, [Number(u.id)]);
    }
    if (kelompok.size === 0) return;

    for (const [sig, ids] of kelompok) {
      const daftar = sig.split("|").join(", ");
      await kirimKabar({
        judul: "Lengkapi verifikasi akun Anda",
        isi:
          `Akun Anda belum lengkap: ${daftar}. Buka menu Profil untuk ` +
          `menyelesaikannya agar akun aman dan notifikasi penting sampai ke Anda.`,
        kategori: "info",
        jenis_peristiwa: "verifikasi",
        untukUserIds: ids,
      });
    }
  } catch (e) {
    // Gagal mengingatkan tidak boleh mengganggu pembukaan aplikasi.
    console.error("[verifikasi] siaran berkala:", e);
  }
}
