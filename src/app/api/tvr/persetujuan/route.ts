// /api/tvr/persetujuan — meja ACC HR untuk dua hal KPI video (2 Sep 2026):
//
//   1. LAPORAN VIDEO MANUAL (link): dari `laporan_video_pending`.
//      Setuju → disalin ke `laporan_video` (baru masuk KPI) + koin;
//      Tolak → status 'ditolak' + alasan (tampil di layar anggota 7 hari).
//   2. PERMOHONAN SOSMED TERBLOKIR: dari `tvr_banned` status 'menunggu'.
//      Setuju → status 'disetujui' → target KPI berkurang 5/platform
//      (lib/kpi-video); Tolak → 'ditolak' (dicabut_pada diisi agar bisa
//      mengajukan ulang).
//
// GET   → { laporan[], banned[] } yang masih menunggu (+ nama & avatar).
// PATCH { jenis: 'laporan'|'banned', id, aksi: 'setuju'|'tolak', catatan? }
// Akses: Divisi HR / admin_hr / super_admin / master.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { adalahHR } from "@/lib/hr";
import { beriKoin } from "@/lib/koin";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

const PENGURUS = new Set(["master", "super_admin", "admin_hr"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanHR(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!PENGURUS.has(user.role) && !adalahHR(user)) {
    throw Object.assign(new Error("Hanya Divisi HR / pengurus yang boleh memutuskan."), {
      status: 403,
    });
  }
  return user;
}

type Orang = { nama: string; avatar_url: string };

async function petaOrang(ids: number[]): Promise<Map<number, Orang>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase()
    .from("app_user")
    .select("id, nama, avatar_url")
    .in("id", ids);
  return new Map(
    (data ?? []).map((u) => [
      Number(u.id),
      { nama: String(u.nama), avatar_url: String(u.avatar_url ?? "") },
    ]),
  );
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanHR(request);
    const db = supabase();
    const [{ data: laporan }, { data: banned }] = await Promise.all([
      db
        .from("laporan_video_pending")
        .select("id, user_id, platform, url_video, keyword, tanggal_wib, dibuat_pada")
        .eq("status", "menunggu")
        .order("dibuat_pada", { ascending: true })
        .limit(300),
      db
        .from("tvr_banned")
        .select("id, user_id, platform, bukti_url, keterangan, dibuat_pada")
        .eq("status", "menunggu")
        .is("dicabut_pada", null)
        .order("dibuat_pada", { ascending: true })
        .limit(200),
    ]);
    const ids = [
      ...new Set([
        ...(laporan ?? []).map((l) => Number(l.user_id)),
        ...(banned ?? []).map((b) => Number(b.user_id)),
      ]),
    ];
    const orang = await petaOrang(ids);
    const lengkapi = <T extends { user_id: unknown; id: unknown }>(b: T) => ({
      ...b,
      id: String(b.id),
      user_id: String(b.user_id),
      nama: orang.get(Number(b.user_id))?.nama ?? "",
      avatar_url: orang.get(Number(b.user_id))?.avatar_url ?? "",
    });
    return {
      laporan: (laporan ?? []).map(lengkapi),
      banned: (banned ?? []).map(lengkapi),
    };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const hr = await pastikanHR(request);
    const body = (await request.json().catch(() => ({}))) as {
      jenis?: string;
      id?: string;
      /** ACC sekaligus (2 Sep 2026): banyak laporan link sekali klik. */
      ids?: string[];
      aksi?: string;
      catatan?: string;
    };
    const id = Number(body.id);
    const aksi = body.aksi === "setuju" ? "setuju" : body.aksi === "tolak" ? "tolak" : "";
    const catatan = (body.catatan ?? "").trim().slice(0, 300);
    const banyak = Array.isArray(body.ids);
    if ((!id && !banyak) || !aksi) {
      throw Object.assign(new Error("Permintaan tidak lengkap."), { status: 400 });
    }
    if (aksi === "tolak" && !catatan) {
      throw Object.assign(new Error("Tulis alasan penolakan (dibaca anggotanya)."), {
        status: 400,
      });
    }
    const db = supabase();
    const kini = new Date().toISOString();

    // ================= 0. ACC SEKALIGUS (laporan link) =================
    if (body.jenis === "laporan" && banyak) {
      if (aksi !== "setuju") {
        throw Object.assign(new Error("ACC sekaligus hanya untuk menyetujui."), { status: 400 });
      }
      const ids = [
        ...new Set((body.ids ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)),
      ].slice(0, 300);
      if (ids.length === 0) {
        throw Object.assign(new Error("Tidak ada laporan yang dipilih."), { status: 400 });
      }
      const { data: daftar } = await db
        .from("laporan_video_pending")
        .select("id, user_id, platform, url_video, keyword, tanggal_wib")
        .in("id", ids)
        .eq("status", "menunggu");
      let disetujui = 0;
      const perUser = new Map<number, number>();
      for (const p of daftar ?? []) {
        const { data: baru, error } = await db
          .from("laporan_video")
          .insert({
            user_id: Number(p.user_id),
            platform: p.platform,
            url_video: p.url_video,
            keyword: p.keyword,
            tanggal_wib: p.tanggal_wib,
            sumber: "manual-acc",
          })
          .select("id")
          .single();
        // 23505 = sudah tercatat otomatis → tetap dianggap disetujui.
        if (error && error.code !== "23505") {
          console.error("[persetujuan] ACC sekaligus:", error.message);
          continue;
        }
        if (baru) await beriKoin(Number(p.user_id), "laporan_video", `laporan-${baru.id}`);
        await db
          .from("laporan_video_pending")
          .update({ status: "disetujui", catatan, diputus_oleh: hr.nama, diputus_pada: kini })
          .eq("id", p.id);
        disetujui++;
        perUser.set(Number(p.user_id), (perUser.get(Number(p.user_id)) ?? 0) + 1);
      }
      // Satu kabar per anggota (bukan satu per link) supaya tidak banjir.
      for (const [uid, n] of perUser) {
        await kirimKabar({
          judul: "Laporan video disetujui",
          isi: `${n} link video Anda disetujui ${hr.nama} dan sudah masuk KPI.`,
          kategori: "sukses",
          jenis_peristiwa: "laporan_video_acc",
          untukUserIds: [uid],
        });
      }
      return { sukses: true, disetujui };
    }

    // ================= 1. LAPORAN VIDEO MANUAL =================
    if (body.jenis === "laporan") {
      const { data: p } = await db
        .from("laporan_video_pending")
        .select("id, user_id, platform, url_video, keyword, tanggal_wib")
        .eq("id", id)
        .eq("status", "menunggu")
        .maybeSingle();
      if (!p) throw Object.assign(new Error("Laporan sudah diputus / tidak ada."), { status: 404 });

      if (aksi === "setuju") {
        // Baru DI SINI laporan masuk hitungan KPI.
        const { data: baru, error } = await db
          .from("laporan_video")
          .insert({
            user_id: Number(p.user_id),
            platform: p.platform,
            url_video: p.url_video,
            keyword: p.keyword,
            tanggal_wib: p.tanggal_wib,
            sumber: "manual-acc",
          })
          .select("id")
          .single();
        // 23505 = link sudah tercatat (mis. terdeteksi otomatis lebih dulu)
        // → tujuannya tercapai, tak perlu ditolak.
        if (error && error.code !== "23505") {
          console.error("[persetujuan] salin laporan:", error.message);
          throw new Error("Gagal menyetujui laporan.");
        }
        if (baru) await beriKoin(Number(p.user_id), "laporan_video", `laporan-${baru.id}`);
      }

      await db
        .from("laporan_video_pending")
        .update({
          status: aksi === "setuju" ? "disetujui" : "ditolak",
          catatan,
          diputus_oleh: hr.nama,
          diputus_pada: kini,
        })
        .eq("id", id);

      await kirimKabar({
        judul: aksi === "setuju" ? "Laporan video disetujui" : "Laporan video ditolak",
        isi:
          aksi === "setuju"
            ? `Link ${p.platform} Anda disetujui ${hr.nama} dan sudah masuk KPI.`
            : `Link ${p.platform} Anda ditolak ${hr.nama}: ${catatan}`,
        kategori: aksi === "setuju" ? "sukses" : "peringatan",
        jenis_peristiwa: "laporan_video_acc",
        untukUserIds: [Number(p.user_id)],
      });
      return { sukses: true };
    }

    // ================= 2. PERMOHONAN SOSMED TERBLOKIR =================
    if (body.jenis === "banned") {
      const { data: b } = await db
        .from("tvr_banned")
        .select("id, user_id, platform")
        .eq("id", id)
        .eq("status", "menunggu")
        .is("dicabut_pada", null)
        .maybeSingle();
      if (!b) throw Object.assign(new Error("Permohonan sudah diputus / tidak ada."), { status: 404 });

      const { error } = await db
        .from("tvr_banned")
        .update({
          status: aksi === "setuju" ? "disetujui" : "ditolak",
          catatan_putusan: catatan,
          diputus_oleh: hr.nama,
          diputus_pada: kini,
          // Ditolak → dicabut_pada diisi supaya anggota boleh mengajukan
          // ulang (indeks unik aktif hanya untuk yang belum dicabut).
          ...(aksi === "tolak" ? { dicabut_pada: kini, dicabut_oleh: hr.nama } : {}),
        })
        .eq("id", id);
      if (error) throw new Error("Gagal menyimpan putusan.");

      await kirimKabar({
        judul:
          aksi === "setuju" ? "Permohonan sosmed terblokir disetujui" : "Permohonan ditolak",
        isi:
          aksi === "setuju"
            ? `Akun ${b.platform} Anda diakui terblokir oleh ${hr.nama}. Target KPI berkurang 5 video untuk platform itu.`
            : `Permohonan akun ${b.platform} ditolak ${hr.nama}: ${catatan}`,
        kategori: aksi === "setuju" ? "sukses" : "peringatan",
        jenis_peristiwa: "tvr_banned",
        untukUserIds: [Number(b.user_id)],
      });
      return { sukses: true };
    }

    throw Object.assign(new Error("jenis harus 'laporan' atau 'banned'."), { status: 400 });
  });
}
