// /api/tvr/siaran — SIARAN SERENTAK (3 Sep 2026): satu video, sekali klik,
// terkirim ke banyak profil upload-post. Khusus master & super_admin.
//
// POST { r2_key | path, ukuran?, judul, caption?, platforms[], profil[], jadwal? }
//      → simpan induk + item per profil (status menunggu), lalu mulai
//        memproses di latar (after). Berkas video sudah diunggah klien lewat
//        {aksi:"siapkan"} milik /api/tvr/unggah (URL bertanda tangan).
// GET  → daftar siaran saya (20 terakhir) + status tiap item; tiap
//        pemanggilan juga melanjutkan pemrosesan item yang masih menunggu.
// DELETE { id } → batalkan item yang belum terkirim.
import { after } from "next/server";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { daftarProfilUp, uploadPostSiap } from "@/lib/upload-post";
import { PLATFORM_KPI } from "@/lib/kpi-video";
import { MAKS_UMUR_URL_DETIK, presignR2, r2Siap } from "@/lib/r2";
import { prosesSiaranSerentak } from "@/lib/siaran";

export const dynamic = "force-dynamic";
// Pemrosesan di latar memanggil upload-post berulang — beri napas panjang.
export const maxDuration = 300;
/** Anggaran pemrosesan per permintaan (< maxDuration, sisakan ruang). */
const ANGGARAN_PROSES_MS = 240_000;
const UMUR_MEDIA_JAM = 2;
const MAKS_PROFIL = 60;

const PENGATUR = new Set(["master", "super_admin"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanPengatur(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!PENGATUR.has(user.role)) {
    throw Object.assign(new Error("Siaran serentak khusus master / Ketua Umum."), {
      status: 403,
    });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengatur(request);
    const db = supabase();
    const { data: induk } = await db
      .from("tvr_siaran")
      .select("id, judul, caption, platforms, jadwal, status, dibuat_pada, video_path")
      .eq("dibuat_oleh", Number(user.id))
      .order("id", { ascending: false })
      .limit(20);
    const ids = (induk ?? []).map((s) => Number(s.id));
    const { data: item } = ids.length
      ? await db
          .from("tvr_siaran_item")
          .select("id, siaran_id, profil, user_id, platforms, status, pesan, request_id, selesai_pada")
          .in("siaran_id", ids)
          .order("id", { ascending: true })
      : { data: [] as Record<string, unknown>[] };
    const userIds = [...new Set((item ?? []).map((i) => i.user_id).filter((x) => x != null).map(Number))];
    const namaPer = new Map<number, string>();
    if (userIds.length > 0) {
      const { data: u } = await db.from("app_user").select("id, nama").in("id", userIds);
      for (const x of u ?? []) namaPer.set(Number(x.id), String(x.nama ?? ""));
    }

    const adaMenunggu = (item ?? []).some((i) => i.status === "menunggu");
    if (adaMenunggu) after(() => prosesSiaranSerentak(ANGGARAN_PROSES_MS));

    const perSiaran = new Map<number, Record<string, unknown>[]>();
    for (const i of item ?? []) {
      const arr = perSiaran.get(Number(i.siaran_id)) ?? [];
      arr.push({
        id: String(i.id),
        profil: String(i.profil),
        user_id: i.user_id == null ? null : String(i.user_id),
        nama: i.user_id == null ? "" : (namaPer.get(Number(i.user_id)) ?? ""),
        platforms: i.platforms ?? [],
        status: String(i.status),
        pesan: String(i.pesan ?? ""),
        request_id: i.request_id ?? null,
        selesai_pada: i.selesai_pada ?? null,
      });
      perSiaran.set(Number(i.siaran_id), arr);
    }
    return {
      data: (induk ?? []).map((s) => {
        const daftar = perSiaran.get(Number(s.id)) ?? [];
        const hitung = (st: string) => daftar.filter((d) => d.status === st).length;
        return {
          id: String(s.id),
          judul: String(s.judul),
          caption: String(s.caption ?? ""),
          platforms: s.platforms ?? [],
          jadwal: s.jadwal ?? null,
          status: String(s.status),
          dibuat_pada: String(s.dibuat_pada),
          berkas_ada: Boolean(s.video_path),
          item: daftar,
          ringkas: {
            total: daftar.length,
            terkirim: hitung("terkirim"),
            gagal: hitung("gagal"),
            menunggu: hitung("menunggu") + hitung("diproses"),
            dibatalkan: hitung("dibatalkan"),
          },
        };
      }),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengatur(request);
    if (!uploadPostSiap()) throw new Error("upload-post belum tersambung (kunci API kosong).");
    const body = (await request.json().catch(() => ({}))) as {
      r2_key?: string;
      path?: string;
      ukuran?: number;
      judul?: string;
      caption?: string;
      platforms?: string[];
      profil?: string[];
      jadwal?: string;
    };
    const db = supabase();

    // ---- Berkas video: milik pengirim, dari alur "siapkan" ----
    const r2Key = String(body.r2_key ?? "").trim();
    const path = String(body.path ?? "").trim();
    const pakaiR2 = Boolean(r2Key);
    if (pakaiR2) {
      if (!r2Key.startsWith(`${user.id}/`) || !/^[\w./-]+$/.test(r2Key)) {
        throw Object.assign(new Error("Berkas video tidak dikenal."), { status: 400 });
      }
      if (!r2Siap()) {
        throw Object.assign(new Error("Penyimpanan video (R2) belum diatur."), { status: 503 });
      }
    } else if (!path.startsWith(`${user.id}/`) || !/^[\w./-]+$/.test(path)) {
      throw Object.assign(new Error("Berkas video tidak dikenal."), { status: 400 });
    }

    const judul = (body.judul ?? "").trim();
    if (judul.length < 3) {
      throw Object.assign(new Error("Judul video wajib diisi."), { status: 400 });
    }
    const caption = (body.caption ?? "").trim().slice(0, 2200);
    const platforms = [...new Set((body.platforms ?? []).map((p) => String(p).toLowerCase()))].filter(
      (p) => (PLATFORM_KPI as readonly string[]).includes(p),
    );
    if (platforms.length === 0) {
      throw Object.assign(new Error("Pilih minimal satu platform tujuan."), { status: 400 });
    }
    const profilDiminta = [...new Set((body.profil ?? []).map((p) => String(p).trim()).filter(Boolean))];
    if (profilDiminta.length === 0) {
      throw Object.assign(new Error("Pilih minimal satu profil tujuan."), { status: 400 });
    }
    if (profilDiminta.length > MAKS_PROFIL) {
      throw Object.assign(new Error(`Maksimal ${MAKS_PROFIL} profil per siaran.`), { status: 400 });
    }

    // ---- Jadwal (opsional): 5 menit .. 7 hari (umur URL R2) ----
    let jadwal: string | undefined;
    if (body.jadwal) {
      const t = Date.parse(body.jadwal);
      if (!Number.isFinite(t) || t < Date.now() + 4 * 60_000) {
        throw Object.assign(new Error("Waktu jadwal harus minimal 5 menit dari sekarang."), {
          status: 400,
        });
      }
      if (t > Date.now() + 7 * 86_400_000) {
        throw Object.assign(new Error("Jadwal maksimal 7 hari ke depan."), { status: 400 });
      }
      jadwal = new Date(t).toISOString();
    }

    // ---- Profil tujuan: harus ada di upload-post; platform = diminta ∩ tertaut ----
    const [{ profil: diUp }, { data: barisDb }] = await Promise.all([
      daftarProfilUp(),
      db
        .from("sosmed_profile")
        .select("profile_key, user_id")
        .eq("penyedia", "upload-post")
        .eq("jenis", "pengguna")
        .in("profile_key", profilDiminta),
    ]);
    const akunPer = new Map(diUp.map((p) => [p.username, p.akun]));
    const userPer = new Map((barisDb ?? []).map((b) => [String(b.profile_key), Number(b.user_id)]));
    const tidakAda = profilDiminta.filter((p) => !akunPer.has(p));
    if (tidakAda.length > 0) {
      throw Object.assign(
        new Error(`Profil tidak ada di upload-post: ${tidakAda.slice(0, 5).join(", ")}${tidakAda.length > 5 ? "…" : ""}`),
        { status: 400 },
      );
    }

    const videoUrl = pakaiR2
      ? presignR2("GET", r2Key, MAKS_UMUR_URL_DETIK)
      : db.storage.from("tvrku").getPublicUrl(path).data.publicUrl;
    // Berkas dihapus 2 jam setelah tayang (jadwal) — atau 2 jam setelah
    // sekarang bila kirim langsung; antrean 14+ profil selesai jauh sebelum itu.
    const dasarMs = jadwal ? Date.parse(jadwal) : Date.now();
    const hapusPada = new Date(dasarMs + UMUR_MEDIA_JAM * 3600_000).toISOString();

    const { data: induk, error } = await db
      .from("tvr_siaran")
      .insert({
        dibuat_oleh: Number(user.id),
        judul,
        caption,
        platforms,
        video_path: pakaiR2 ? r2Key : path,
        video_url: videoUrl,
        ukuran_byte:
          Number.isFinite(Number(body.ukuran)) && Number(body.ukuran) > 0
            ? Math.floor(Number(body.ukuran))
            : null,
        jadwal: jadwal ?? null,
        hapus_media_pada: hapusPada,
      })
      .select("id")
      .single();
    if (error || !induk) {
      console.error("[siaran] simpan induk:", error?.message);
      throw new Error("Gagal menyimpan siaran.");
    }

    const item = profilDiminta.map((p) => {
      const tertaut = Object.keys(akunPer.get(p) ?? {});
      const cocok = platforms.filter((x) => tertaut.includes(x));
      return {
        siaran_id: Number(induk.id),
        profil: p,
        user_id: userPer.get(p) ?? null,
        platforms: cocok,
        // Tanpa platform yang cocok → langsung gagal (jelas alasannya),
        // bukan menggantung di antrean.
        status: cocok.length > 0 ? "menunggu" : "gagal",
        pesan: cocok.length > 0 ? "" : "Profil ini belum menautkan platform yang dipilih.",
        selesai_pada: cocok.length > 0 ? null : new Date().toISOString(),
      };
    });
    const { error: eItem } = await db.from("tvr_siaran_item").insert(item);
    if (eItem) {
      console.error("[siaran] simpan item:", eItem.message);
      throw new Error("Gagal menyimpan daftar profil tujuan.");
    }

    after(() => prosesSiaranSerentak(ANGGARAN_PROSES_MS));
    return {
      sukses: true,
      id: String(induk.id),
      jumlah: item.length,
      langsung_gagal: item.filter((i) => i.status === "gagal").length,
      terjadwal: Boolean(jadwal),
    };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanPengatur(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Siaran tidak disebutkan."), { status: 400 });
    const db = supabase();
    const { data: induk } = await db
      .from("tvr_siaran")
      .select("id")
      .eq("id", id)
      .eq("dibuat_oleh", Number(user.id))
      .maybeSingle();
    if (!induk) throw Object.assign(new Error("Siaran tidak ditemukan."), { status: 404 });
    const kini = new Date().toISOString();
    const { data: dibatalkan } = await db
      .from("tvr_siaran_item")
      .update({ status: "dibatalkan", selesai_pada: kini })
      .eq("siaran_id", id)
      .eq("status", "menunggu")
      .select("id");
    await db.from("tvr_siaran").update({ status: "dibatalkan" }).eq("id", id);
    return { sukses: true, dibatalkan: dibatalkan?.length ?? 0 };
  });
}
