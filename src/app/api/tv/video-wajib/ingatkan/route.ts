// POST /api/tv/video-wajib/ingatkan { id }
//
// Tombol "Ingatkan yang belum" di lembar Pantau (15 Okt 2026): kabar dalam
// aplikasi (+ push) ke anggota yang HARI INI belum menuntaskan perintah.
// Dibatasi sekali per jam per perintah supaya tidak menjadi spam; tercatat
// di tvr_wajib_pengingat (juga dipakai penjadwal otomatis).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { bolehKelolaTvr } from "@/lib/tv-tim";
import { kirimKabar } from "@/lib/notifikasi";
import { catatanPosting, hitungKepatuhan, muatPerintah, roster } from "@/lib/video-wajib-pantau";
import { tanggalWibWajib } from "@/lib/video-wajib-perintah";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JEDA_MANUAL_MS = 60 * 60_000;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userDariToken(tokenDari(request));
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku."), { status: 401 });
    if (!(await bolehKelolaTvr(user))) {
      throw Object.assign(new Error("Hanya tim TV Rakyat & pimpinan yang boleh mengingatkan."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) throw Object.assign(new Error("id perintah tidak sah."), { status: 400 });
    const perintah = await muatPerintah(id);
    if (!perintah) throw Object.assign(new Error("Perintah tidak ditemukan."), { status: 404 });
    if (!perintah.aktif || !perintah.wajib_posting) {
      throw Object.assign(new Error("Perintah ini tidak sedang wajib posting."), { status: 409 });
    }

    const db = supabase();
    const hari = tanggalWibWajib(Date.now());
    const { data: terakhir, error: galatCatatan } = await db
      .from("tvr_wajib_pengingat")
      .select("dikirim_pada")
      .eq("perintah_id", id)
      .eq("jenis", "manual")
      .order("dikirim_pada", { ascending: false })
      .limit(1);
    if (galatCatatan) {
      throw Object.assign(new Error("Fitur pengingat belum aktif di database: jalankan sql/76_video_wajib_perintah.sql dulu."), { status: 503, pesanAman: true });
    }
    const sejak = terakhir?.[0]?.dikirim_pada ? Date.now() - Date.parse(String(terakhir[0].dikirim_pada)) : Infinity;
    if (sejak < JEDA_MANUAL_MS) {
      const sisa = Math.ceil((JEDA_MANUAL_MS - sejak) / 60_000);
      throw Object.assign(new Error(`Pengingat baru saja dikirim. Coba lagi ${sisa} menit lagi.`), { status: 429 });
    }

    // Pembacaan KETAT: data parsial akan mengingatkan anggota yang sebenarnya sudah selesai.
    const [anggota, { catatan }] = await Promise.all([roster(), catatanPosting(id)]);
    const { daftar } = hitungKepatuhan(perintah, hari, anggota, catatan);
    const belum = daftar.filter((b) => b.status !== "selesai").map((b) => Number(b.user_id)).filter((n) => n > 0);
    if (belum.length === 0) return { dikirim: 0, pesan: "Semua akun sudah menuntaskan perintah ini." };

    // Catat DULU lalu pastikan penanda ini yang paling awal dalam jendela 1 jam: dua klik berbarengan
    // sama-sama lolos pemeriksaan di atas, tetapi hanya yang pertama boleh mengirim.
    const { data: tanda, error: galatTanda } = await db
      .from("tvr_wajib_pengingat")
      .insert({ perintah_id: id, tanggal_wib: hari, jenis: "manual", jumlah: belum.length, dikirim_oleh: Number(user.id) })
      .select("id")
      .single();
    if (galatTanda || !tanda) throw new Error("Gagal mencatat pengingat.");
    const { data: awal } = await db
      .from("tvr_wajib_pengingat")
      .select("id")
      .eq("perintah_id", id)
      .eq("jenis", "manual")
      .gte("dikirim_pada", new Date(Date.now() - JEDA_MANUAL_MS).toISOString())
      .order("id", { ascending: true })
      .limit(1);
    if (awal?.[0] && Number(awal[0].id) !== Number(tanda.id)) {
      await db.from("tvr_wajib_pengingat").delete().eq("id", tanda.id);
      throw Object.assign(new Error("Pengingat baru saja dikirim. Coba lagi beberapa menit lagi."), { status: 429 });
    }

    try {
      await kirimKabar({
        judul: `⏰ Video Wajib belum diposting: ${perintah.judul}`.slice(0, 120),
        isi: `Anda belum memposting "${perintah.judul}"${perintah.kategori ? ` (kategori ${perintah.kategori})` : ""} di semua akun hari ini. Batas ${perintah.batas_jam.replace(":", ".")} WIB. Buka TV Rakyat Saya.`,
        kategori: "peringatan",
        jenis_peristiwa: "video_wajib_pengingat",
        target: "tvrku",
        untukUserIds: belum,
      });
    } catch (e) {
      await db.from("tvr_wajib_pengingat").delete().eq("id", tanda.id);
      throw e;
    }
    return { dikirim: belum.length };
  });
}
