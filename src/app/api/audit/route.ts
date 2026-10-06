// ============================================================
// GET /api/audit — modul Audit (6 Okt 2026), superadmin & master saja.
//
//   ?tanggal=YYYY-MM-DD            → ringkasan semua pengguna yang aktif
//                                    hari itu (WIB): lama aplikasi menyala,
//                                    jam pertama/terakhir, jumlah login,
//                                    hitungan tiap jenis aksi, unggahan.
//   ?tanggal=YYYY-MM-DD&user=<id>  → rincian satu orang: rentang sesi,
//                                    lama per layar, linimasa peristiwa,
//                                    dan video yang diunggah hari itu.
//
// Sumber: audit_harian + akumulasi Redis (lebih segar, lib/audit),
// audit_aktivitas, dan tvrku_post (unggahan TVR Saya — tercatat juga
// sebelum modul ini ada). Lihat sql/60.
// ============================================================
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { akumulasiTanggal, type AkumulasiAktif } from "@/lib/audit";
import { daftarHadir } from "@/lib/kehadiran";
import { bolehAudit } from "@/lib/peran";
import { pastikanMasuk } from "@/lib/sesi";
import { semuaBaris } from "@/lib/semua-baris";
import { supabase } from "@/lib/supabase";
import { tanggalWibHariIni } from "@/lib/format";

export const dynamic = "force-dynamic";

type BarisHarian = {
  user_id: number;
  detik_aktif: number;
  pertama: string | null;
  terakhir: string | null;
  sesi: [number, number][] | null;
  layar: Record<string, number> | null;
};

type BarisAktivitas = {
  id: number;
  user_id: number;
  jenis: string;
  ringkasan: string;
  detail: Record<string, unknown> | null;
  ip: string;
  perangkat: string;
  dibuat_pada: string;
};

type Harian = {
  detik_aktif: number;
  pertama: string | null;
  terakhir: string | null;
  sesi: [number, number][];
  layar: Record<string, number>;
};

function dariAkumulasi(a: AkumulasiAktif): Harian {
  return {
    detik_aktif: Math.round(a.d),
    pertama: new Date(a.p * 1000).toISOString(),
    terakhir: new Date(a.t * 1000).toISOString(),
    sesi: a.s,
    layar: a.m,
  };
}

function dariBaris(b: BarisHarian): Harian {
  return {
    detik_aktif: Number(b.detik_aktif) || 0,
    pertama: b.pertama,
    terakhir: b.terakhir,
    sesi: Array.isArray(b.sesi) ? b.sesi : [],
    layar: b.layar ?? {},
  };
}

/** Gabungan database + Redis: yang detak terakhirnya lebih baru menang. */
function gabungHarian(db: BarisHarian[], redis: Map<string, AkumulasiAktif>): Map<string, Harian> {
  const hasil = new Map<string, Harian>();
  for (const b of db) hasil.set(String(b.user_id), dariBaris(b));
  for (const [id, a] of redis) {
    const lama = hasil.get(id);
    if (!lama || !lama.terakhir || a.t * 1000 >= Date.parse(lama.terakhir)) hasil.set(id, dariAkumulasi(a));
  }
  return hasil;
}

function rentangHari(tanggal: string): { dari: string; sampai: string } {
  const dari = new Date(`${tanggal}T00:00:00+07:00`);
  const sampai = new Date(dari.getTime() + 86_400_000);
  return { dari: dari.toISOString(), sampai: sampai.toISOString() };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    // Tanpa izin: 404 — modul ini tidak perlu diumumkan.
    if (!bolehAudit(user)) throw Object.assign(new Error("Tidak ditemukan"), { status: 404 });

    const url = new URL(request.url);
    const tanggalMentah = url.searchParams.get("tanggal") ?? "";
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(tanggalMentah) ? tanggalMentah : tanggalWibHariIni();
    const { dari, sampai } = rentangHari(tanggal);
    const idUser = url.searchParams.get("user");
    const db = supabase();

    // ---------------- Rincian satu orang ----------------
    if (idUser) {
      if (!/^\d{1,12}$/.test(idUser)) throw Object.assign(new Error("Pengguna tidak dikenal."), { status: 400 });
      const id = Number(idUser);
      const [profil, harianDb, redis, aktivitas, unggahan, hadir] = await Promise.all([
        db.from("app_user").select("id, nama, username, avatar_url, divisi, jabatan, role").eq("id", id).maybeSingle(),
        db.from("audit_harian").select("user_id, detik_aktif, pertama, terakhir, sesi, layar").eq("user_id", id).eq("tanggal", tanggal),
        akumulasiTanggal(tanggal),
        db
          .from("audit_aktivitas")
          .select("id, user_id, jenis, ringkasan, detail, ip, perangkat, dibuat_pada")
          .eq("user_id", id)
          .gte("dibuat_pada", dari)
          .lt("dibuat_pada", sampai)
          .order("dibuat_pada", { ascending: true })
          .limit(1000),
        db
          .from("tvrku_post")
          .select("id, judul, platforms, video_url, video_path, jadwal, dibuat_pada")
          .eq("user_id", id)
          .gte("dibuat_pada", dari)
          .lt("dibuat_pada", sampai)
          .order("dibuat_pada", { ascending: true })
          .limit(200),
        daftarHadir(),
      ]);
      if (!profil.data) throw Object.assign(new Error("Pengguna tidak ditemukan."), { status: 404 });
      const belumSiap = tabelBelumAda(harianDb.error) || tabelBelumAda(aktivitas.error);
      const redisSaya = new Map([...redis].filter(([k]) => k === idUser));
      const harian = gabungHarian((harianDb.data ?? []) as BarisHarian[], redisSaya).get(idUser) ?? null;

      // Tautan postingan yang sudah terbit (dicatat rekonsiliasi KPI).
      const idPost = (unggahan.data ?? []).map((b) => Number(b.id));
      const { data: tautanRows } = idPost.length
        ? await db.from("laporan_video").select("tvrku_post_id, platform, url_video").in("tvrku_post_id", idPost)
        : { data: [] as { tvrku_post_id: unknown; platform: unknown; url_video: unknown }[] };
      const tautanPer = new Map<number, Record<string, string>>();
      for (const t of tautanRows ?? []) {
        const k = Number(t.tvrku_post_id);
        const peta = tautanPer.get(k) ?? {};
        peta[String(t.platform)] = String(t.url_video ?? "");
        tautanPer.set(k, peta);
      }

      return {
        tanggal,
        belum_siap: belumSiap,
        pengguna: { ...profil.data, id: String(profil.data.id), online: hadir.includes(idUser) },
        harian,
        aktivitas: ((aktivitas.data ?? []) as BarisAktivitas[]).map((a) => ({ ...a, id: String(a.id), user_id: String(a.user_id) })),
        unggahan: (unggahan.data ?? []).map((b) => ({
          id: String(b.id),
          judul: b.judul,
          platforms: b.platforms,
          jadwal: b.jadwal,
          dibuat_pada: b.dibuat_pada,
          // Berkas yang sudah disapu → video_url tak berlaku lagi.
          video_url: b.video_path ? b.video_url : "",
          tautan: tautanPer.get(Number(b.id)) ?? {},
        })),
      };
    }

    // ---------------- Ringkasan semua orang ----------------
    const [harianDb, redis, aktivitas, unggahan, hadir] = await Promise.all([
      semuaBaris<BarisHarian>((a, b) =>
        db
          .from("audit_harian")
          .select("user_id, detik_aktif, pertama, terakhir, sesi, layar")
          .eq("tanggal", tanggal)
          .range(a, b),
      ),
      akumulasiTanggal(tanggal),
      semuaBaris<Pick<BarisAktivitas, "user_id" | "jenis" | "dibuat_pada">>(
        (a, b) =>
          db
            .from("audit_aktivitas")
            .select("user_id, jenis, dibuat_pada")
            .gte("dibuat_pada", dari)
            .lt("dibuat_pada", sampai)
            .order("id", { ascending: true })
            .range(a, b),
        20_000,
      ),
      semuaBaris<{ user_id: number }>(
        (a, b) =>
          db.from("tvrku_post").select("user_id").gte("dibuat_pada", dari).lt("dibuat_pada", sampai).order("id").range(a, b),
        20_000,
      ),
      daftarHadir(),
    ]);
    // sql/60 belum dijalankan: semuaBaris menelan galatnya — periksa sekali.
    const cek = await db.from("audit_aktivitas").select("id").limit(1);
    const belumSiap = tabelBelumAda(cek.error);

    const harian = gabungHarian(harianDb, redis);
    const hitung = new Map<string, Record<string, number>>();
    const aksiTerakhir = new Map<string, string>();
    for (const a of aktivitas) {
      const id = String(a.user_id);
      const h = hitung.get(id) ?? {};
      h[a.jenis] = (h[a.jenis] ?? 0) + 1;
      hitung.set(id, h);
      aksiTerakhir.set(id, a.dibuat_pada);
    }
    const jumlahUnggah = new Map<string, number>();
    for (const u of unggahan) jumlahUnggah.set(String(u.user_id), (jumlahUnggah.get(String(u.user_id)) ?? 0) + 1);

    const ids = [...new Set([...harian.keys(), ...hitung.keys(), ...jumlahUnggah.keys(), ...(tanggal === tanggalWibHariIni() ? hadir : [])])]
      .filter((i) => /^\d{1,12}$/.test(i))
      .map(Number);
    const profil = await semuaBaris<{
      id: number;
      nama: string;
      username: string | null;
      avatar_url: string | null;
      divisi: string | null;
      jabatan: string | null;
      role: string;
    }>((a, b) =>
      db.from("app_user").select("id, nama, username, avatar_url, divisi, jabatan, role").in("id", ids.length ? ids : [0]).range(a, b),
    );

    const baris = profil.map((p) => {
      const id = String(p.id);
      const h = harian.get(id);
      return {
        id,
        nama: p.nama,
        username: p.username,
        avatar_url: p.avatar_url ?? "",
        divisi: p.divisi ?? "",
        jabatan: p.jabatan ?? "",
        role: p.role,
        online: hadir.includes(id),
        detik_aktif: h?.detik_aktif ?? 0,
        jumlah_sesi: h?.sesi.length ?? 0,
        pertama: h?.pertama ?? null,
        terakhir: h?.terakhir ?? null,
        aksi_terakhir: aksiTerakhir.get(id) ?? null,
        hitung: hitung.get(id) ?? {},
        unggahan: jumlahUnggah.get(id) ?? 0,
      };
    });
    baris.sort((a, b) => b.detik_aktif - a.detik_aktif || Object.keys(b.hitung).length - Object.keys(a.hitung).length);

    return { tanggal, belum_siap: belumSiap, online: hadir.length, data: baris };
  });
}
