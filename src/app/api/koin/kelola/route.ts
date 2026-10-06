// =====================================================================
// /api/koin/kelola — KELOLA KOIN (5 Okt 2026).
//
// Sejak bonus otomatis dihentikan (lib/koin BONUS_OTOMATIS_AKTIF), koin
// hanya masuk lewat sini: Pimpinan Redaksi, superadmin, dan master
// (lib/peran bolehKelolaKoin) memberi koin per VIDEO yang diunggah anggota,
// dan bisa me-reset koin satu orang atau semua orang.
//
//   GET  ?q=<nama>      → cari anggota (+ saldo)
//   GET  ?user_id=<id>  → saldo + video anggota dari tiga sumber, beserta
//                          koin yang sudah diberikan per video
//   POST { aksi:"beri", user_id, sumber, video_id, jumlah }
//        Satu video = satu kali hadiah (UNIQUE buku besar, referensi
//        "<sumber>-<id>"); ketukan ganda tidak membayar dua kali.
//   POST { aksi:"reset", user_id }                 → saldo orang itu jadi 0
//   POST { aksi:"reset_semua", konfirmasi:"RESET" } → saldo semua orang jadi 0
//
// Reset = baris penyeimbang (−saldo, aktivitas "reset_koin"), bukan
// menghapus — riwayatnya tetap utuh dan bisa diaudit.
// =====================================================================
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehKelolaKoin, PERAN_TERSEMBUNYI_IN } from "@/lib/peran";
import { kirimKabar } from "@/lib/notifikasi";
import { periksaJumlahKoin, teksAngkaKoin } from "@/lib/koin-chat";
import {
  AKTIVITAS_HADIAH_VIDEO,
  AKTIVITAS_RESET_KOIN,
  LABEL_SUMBER_VIDEO,
  saldoKoin,
  type SumberVideoKoin,
} from "@/lib/koin";

export const dynamic = "force-dynamic";

const MAKS_VIDEO_PER_SUMBER = 40;
const SUMBER = Object.keys(LABEL_SUMBER_VIDEO) as SumberVideoKoin[];

function galat(pesan: string, status: number): never {
  throw Object.assign(new Error(pesan), { status });
}

async function pengelola(request: Request) {
  const user = await pastikanMasuk(request);
  if (!bolehKelolaKoin(user)) galat("Hanya Pimpinan Redaksi, superadmin, dan master yang bisa mengelola koin.", 403);
  return user;
}

/** Anggota sasaran: ada, aktif, dan bukan akun sistem tersembunyi. */
async function anggota(id: number) {
  const { data } = await supabase()
    .from("app_user")
    .select("id, nama, jabatan, avatar_url, role, aktif")
    .eq("id", id)
    .not("role", "in", PERAN_TERSEMBUNYI_IN)
    .maybeSingle();
  if (!data) galat("Anggota tidak ditemukan.", 404);
  return data;
}

async function saldoBanyak(ids: number[]): Promise<Map<number, number>> {
  const peta = new Map<number, number>();
  if (ids.length === 0) return peta;
  const { data } = await supabase().from("v_app_koin_saldo").select("user_id, saldo").in("user_id", ids);
  for (const b of data ?? []) peta.set(Number(b.user_id), Number(b.saldo) || 0);
  return peta;
}

type VideoKoin = {
  sumber: SumberVideoKoin;
  sumber_label: string;
  id: string;
  judul: string;
  platform: string[];
  tanggal: string;
  url: string | null;
  koin: number | null;
};

/** Video anggota dari tiga sumber, terbaru dulu, beserta hadiah yang sudah diberikan. */
async function videoAnggota(uid: number): Promise<VideoKoin[]> {
  const db = supabase();
  const [tvrku, laporan, official] = await Promise.all([
    db
      .from("tvrku_post")
      .select("id, judul, platforms, dibuat_pada")
      .eq("user_id", uid)
      .order("dibuat_pada", { ascending: false })
      .limit(MAKS_VIDEO_PER_SUMBER),
    // Laporan yang lahir dari upload TVR Saya sudah tampil sebagai "tvrku".
    db
      .from("laporan_video")
      .select("id, platform, url_video, tanggal_wib, dibuat_pada")
      .eq("user_id", uid)
      .is("tvrku_post_id", null)
      .order("dibuat_pada", { ascending: false })
      .limit(MAKS_VIDEO_PER_SUMBER),
    db
      .from("video_antrian")
      .select("kode, judul, status, jam_tanggal, platform_terunggah")
      .eq("diupload_oleh_id", uid)
      .order("jam_tanggal", { ascending: false })
      .limit(MAKS_VIDEO_PER_SUMBER),
  ]);
  if (tvrku.error || laporan.error || official.error) {
    console.error("[koin/kelola] video:", tvrku.error?.message, laporan.error?.message, official.error?.message);
    galat("Daftar video gagal dimuat. Coba lagi.", 502);
  }

  // Tautan postingan TVR Saya ada di laporan_video otomatisnya.
  const idTvrku = (tvrku.data ?? []).map((t) => Number(t.id));
  const tautan = new Map<number, string>();
  if (idTvrku.length) {
    const { data } = await db.from("laporan_video").select("tvrku_post_id, url_video").in("tvrku_post_id", idTvrku);
    for (const b of data ?? []) if (!tautan.has(Number(b.tvrku_post_id))) tautan.set(Number(b.tvrku_post_id), String(b.url_video));
  }

  const daftar: VideoKoin[] = [
    ...(tvrku.data ?? []).map((t) => ({
      sumber: "tvrku" as const,
      sumber_label: LABEL_SUMBER_VIDEO.tvrku,
      id: String(t.id),
      judul: String(t.judul ?? "").trim() || "Video TVR Saya",
      platform: Array.isArray(t.platforms) ? t.platforms.map(String) : [],
      tanggal: String(t.dibuat_pada),
      url: tautan.get(Number(t.id)) ?? null,
      koin: null,
    })),
    ...(laporan.data ?? []).map((l) => ({
      sumber: "laporan" as const,
      sumber_label: LABEL_SUMBER_VIDEO.laporan,
      id: String(l.id),
      judul: String(l.url_video ?? "").replace(/^https?:\/\/(www\.)?/, "").slice(0, 60) || "Link video",
      platform: l.platform ? [String(l.platform)] : [],
      tanggal: String(l.dibuat_pada ?? l.tanggal_wib),
      url: l.url_video ? String(l.url_video) : null,
      koin: null,
    })),
    ...(official.data ?? []).map((v) => ({
      sumber: "official" as const,
      sumber_label: LABEL_SUMBER_VIDEO.official,
      id: String(v.kode),
      judul: String(v.judul ?? "").trim() || "Video TV Official",
      platform: Array.isArray(v.platform_terunggah) ? v.platform_terunggah.map(String) : [],
      tanggal: String(v.jam_tanggal),
      url: null,
      koin: null,
    })),
  ];

  // Hadiah yang sudah tercatat per video.
  if (daftar.length) {
    const { data } = await db
      .from("koin_transaksi")
      .select("referensi, jumlah")
      .eq("user_id", uid)
      .eq("aktivitas", AKTIVITAS_HADIAH_VIDEO)
      .in("referensi", daftar.map((v) => `${v.sumber}-${v.id}`));
    const sudah = new Map((data ?? []).map((b) => [String(b.referensi), Number(b.jumlah)]));
    for (const v of daftar) v.koin = sudah.get(`${v.sumber}-${v.id}`) ?? null;
  }
  return daftar.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
}

/** Video `id` dari `sumber` memang milik `uid`? */
async function milikAnggota(sumber: SumberVideoKoin, id: string, uid: number): Promise<{ judul: string } | null> {
  const db = supabase();
  if (sumber === "tvrku") {
    if (!/^\d+$/.test(id)) return null;
    const { data } = await db.from("tvrku_post").select("judul").eq("id", Number(id)).eq("user_id", uid).maybeSingle();
    return data ? { judul: String(data.judul ?? "") || "video TVR Saya" } : null;
  }
  if (sumber === "laporan") {
    if (!/^\d+$/.test(id)) return null;
    const { data } = await db.from("laporan_video").select("platform").eq("id", Number(id)).eq("user_id", uid).maybeSingle();
    return data ? { judul: `laporan video ${String(data.platform ?? "")}`.trim() } : null;
  }
  const { data } = await db.from("video_antrian").select("judul").eq("kode", id).eq("diupload_oleh_id", uid).maybeSingle();
  return data ? { judul: String(data.judul ?? "") || "video TV Official" } : null;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pengelola(request);
    const url = new URL(request.url);
    const idTeks = url.searchParams.get("user_id");
    if (idTeks) {
      const uid = Number(idTeks);
      if (!Number.isInteger(uid) || uid <= 0) galat("Anggota tidak dikenal.", 400);
      const orang = await anggota(uid);
      return {
        anggota: { id: String(orang.id), nama: orang.nama, jabatan: orang.jabatan ?? "", avatar_url: orang.avatar_url ?? null },
        saldo: await saldoKoin(uid),
        video: await videoAnggota(uid),
      };
    }
    const q = (url.searchParams.get("q") ?? "").trim().replace(/[%_,()]/g, " ").slice(0, 60);
    let kueri = supabase()
      .from("app_user")
      .select("id, nama, jabatan, avatar_url")
      .eq("aktif", true)
      .not("role", "in", PERAN_TERSEMBUNYI_IN)
      .order("nama")
      .limit(25);
    if (q) kueri = kueri.ilike("nama", `%${q}%`);
    const { data, error } = await kueri;
    if (error) galat("Daftar anggota gagal dimuat.", 502);
    const saldo = await saldoBanyak((data ?? []).map((u) => Number(u.id)));
    return {
      anggota: (data ?? []).map((u) => ({
        id: String(u.id),
        nama: u.nama,
        jabatan: u.jabatan ?? "",
        avatar_url: u.avatar_url ?? null,
        saldo: saldo.get(Number(u.id)) ?? 0,
      })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pengelola(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const aksi = String(body.aksi ?? "");
    const db = supabase();

    if (aksi === "beri") {
      const uid = Number(body.user_id);
      if (!Number.isInteger(uid) || uid <= 0) galat("Anggota tidak dikenal.", 400);
      if (String(uid) === String(user.id)) galat("Tidak bisa memberi koin untuk video sendiri.", 400);
      const sumber = String(body.sumber ?? "") as SumberVideoKoin;
      if (!SUMBER.includes(sumber)) galat("Sumber video tidak dikenal.", 400);
      const videoId = String(body.video_id ?? "").trim().slice(0, 80);
      if (!videoId) galat("Video tidak dikenal.", 400);
      const cek = periksaJumlahKoin(body.jumlah);
      if ("galat" in cek) galat(cek.galat, 400);
      await anggota(uid);
      const video = await milikAnggota(sumber, videoId, uid);
      if (!video) galat("Video ini bukan milik anggota tersebut.", 404);

      const { data, error } = await db
        .from("koin_transaksi")
        .upsert(
          { user_id: uid, jumlah: cek.jumlah, aktivitas: AKTIVITAS_HADIAH_VIDEO, referensi: `${sumber}-${videoId}`, pemberi_id: Number(user.id) },
          { onConflict: "user_id,aktivitas,referensi", ignoreDuplicates: true },
        )
        .select("id");
      if (error) {
        console.error("[koin/kelola] beri:", error.message);
        galat("Gagal mencatat koin. Coba lagi.", 502);
      }
      if ((data ?? []).length === 0) galat("Video ini sudah pernah diberi koin.", 409);
      after(() =>
        kirimKabar({
          judul: `🪙 Kamu menerima ${teksAngkaKoin(cek.jumlah)} koin`,
          isi: `Dari ${user.nama} untuk ${video.judul}. Koinnya sudah masuk ke dompetmu.`,
          kategori: "sukses",
          jenis_peristiwa: "koin",
          target: "beranda",
          untukUserIds: [uid],
        }),
      );
      return { sukses: true, saldo: await saldoKoin(uid), video: await videoAnggota(uid) };
    }

    if (aksi === "reset") {
      const uid = Number(body.user_id);
      if (!Number.isInteger(uid) || uid <= 0) galat("Anggota tidak dikenal.", 400);
      await anggota(uid);
      const saldo = await saldoKoin(uid);
      if (saldo !== 0) {
        const { error } = await db.from("koin_transaksi").insert({
          user_id: uid,
          jumlah: -saldo,
          aktivitas: AKTIVITAS_RESET_KOIN,
          referensi: `reset-${Date.now()}-oleh-${user.id}`,
        });
        if (error) {
          console.error("[koin/kelola] reset:", error.message);
          galat("Gagal me-reset koin. Coba lagi.", 502);
        }
      }
      return { sukses: true, saldo_sebelum: saldo, saldo: await saldoKoin(uid) };
    }

    if (aksi === "reset_semua") {
      if (String(body.konfirmasi ?? "") !== "RESET") galat('Ketik "RESET" untuk mengonfirmasi.', 400);
      const { data, error } = await db.from("v_app_koin_saldo").select("user_id, saldo").neq("saldo", 0);
      if (error) galat("Saldo gagal dibaca. Coba lagi.", 502);
      const ref = `reset-semua-${Date.now()}-oleh-${user.id}`;
      const baris = (data ?? []).map((b) => ({
        user_id: Number(b.user_id),
        jumlah: -Number(b.saldo),
        aktivitas: AKTIVITAS_RESET_KOIN,
        referensi: ref,
      }));
      for (let i = 0; i < baris.length; i += 500) {
        const { error: e } = await db.from("koin_transaksi").insert(baris.slice(i, i + 500));
        if (e) {
          console.error("[koin/kelola] reset semua:", e.message);
          galat(`Reset terhenti setelah ${i} orang. Tekan lagi untuk melanjutkan sisanya.`, 502);
        }
      }
      return { sukses: true, jumlah_orang: baris.length };
    }

    galat("Aksi tidak dikenal.", 400);
  });
}
