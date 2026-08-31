// GET /api/rekap — rekap kepatuhan kader
// Query: ?id_postingan=IG-001 (opsional) atau ?periode= (opsional)
// Bila ?id_postingan diberikan, respons menyertakan ringkasan
// { sudah, belum, persen } untuk postingan tersebut.
// Sumber: Supabase (view v_app_rekap).
import { supabase } from "@/lib/supabase";
import { bungkus, pastikanSukses } from "@/lib/api-helper";
import { adalahPengurus, pastikanMasuk } from "@/lib/sesi";
import { adalahHR } from "@/lib/hr";
import { periodeSaatIni } from "@/lib/periode-qc";

export const dynamic = "force-dynamic";

/** Ambang "perlu ditindaklanjuti" (persen), disetel HR — bawaan 70. */
async function ambangTindak(): Promise<number> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", "qc_ambang_tindak")
      .maybeSingle();
    const n = Number(data?.nilai);
    return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.floor(n) : 70;
  } catch {
    return 70;
  }
}

type BarisRekap = { sudah_komentar: boolean; nomor_wa?: string | null };

export async function GET(request: Request) {
  return bungkus(async () => {
    // Data internal partai — wajib login (dulu endpoint ini terbuka).
    const user = await pastikanMasuk(request);
    const { searchParams } = new URL(request.url);
    const idPostingan = searchParams.get("id_postingan");
    const periode = searchParams.get("periode");
    const namaKader = searchParams.get("nama_kader");

    // --- Kewajiban komentar SAYA (perbaikan 0/0, 31 Agu 2026) ---
    // Dihitung DI SERVER untuk SATU pengguna: presisi & ringan. Dulu
    // beranda menarik rekap SELURUH partai lalu menyaring di klien —
    // dua cacat sekaligus: (a) dipanggil tanpa header login → 401 →
    // dianggap kosong → selalu 0/0; (b) kalaupun login, ribuan baris
    // terpangkas cap 1000 PostgREST (urut nama) sehingga pengguna
    // berabjad belakang kebagian 0 baris. Cabang ini menutup keduanya.
    if (searchParams.get("saya") === "1") {
      // Tanpa ?periode = jendela QC yang SEDANG berjalan (17:00-16:59,
      // dihitung server — klien tak perlu tahu aturan jendelanya).
      const p = periode || periodeSaatIni();
      const { data } = await supabase()
        .from("v_app_kepatuhan_kader")
        .select("total, sudah")
        .eq("periode", p)
        .eq("nama_kader", user.nama)
        .maybeSingle();
      return {
        total: Number(data?.total ?? 0),
        sudah: Number(data?.sudah ?? 0),
      };
    }

    // --- Ringkasan PER PLATFORM (rombakan 31 Agu 2026) ---
    // Untuk kartu atas HR Center: jumlah postingan per sosmed + kader
    // patuh 100% per sosmed + daftar "perlu ditindaklanjuti" (< ambang).
    if (searchParams.get("ringkas_platform") === "1") {
      const p = periode || periodeSaatIni();
      const [{ data: perPlat }, { data: posts }, ambang] = await Promise.all([
        supabase()
          .from("v_app_kepatuhan_kader_platform")
          .select("platform, nama_kader, total, sudah")
          .eq("periode", p)
          .range(0, 9999),
        supabase()
          .from("postingan")
          .select("platform")
          .eq("periode", p)
          .range(0, 9999),
        ambangTindak(),
      ]);

      const postinganPer = new Map<string, number>();
      for (const b of posts ?? []) {
        const pf = String(b.platform).toLowerCase();
        postinganPer.set(pf, (postinganPer.get(pf) ?? 0) + 1);
      }
      // Patuh penuh PER PLATFORM = kader dengan sudah == total (>0).
      const platMap = new Map<string, { patuh: number; kader: number }>();
      for (const b of perPlat ?? []) {
        const pf = String(b.platform).toLowerCase();
        const d = platMap.get(pf) ?? { patuh: 0, kader: 0 };
        d.kader += 1;
        if (Number(b.total) > 0 && Number(b.sudah) >= Number(b.total)) d.patuh += 1;
        platMap.set(pf, d);
      }
      const platforms = [...new Set([...postinganPer.keys(), ...platMap.keys()])].sort();

      // Daftar tindak lanjut: gabungan SEMUA platform per kader < ambang.
      const { data: perKader } = await supabase()
        .from("v_app_kepatuhan_kader")
        .select("nama_kader, total, sudah, nomor_wa")
        .eq("periode", p)
        .range(0, 9999);
      const bolehWa = adalahPengurus(user.role) || adalahHR(user);
      const tindak = (perKader ?? [])
        .map((r) => ({
          nama_kader: String(r.nama_kader),
          total: Number(r.total ?? 0),
          sudah: Number(r.sudah ?? 0),
          persen:
            Number(r.total) > 0
              ? Math.round((Number(r.sudah) / Number(r.total)) * 100)
              : 0,
          nomor_wa: bolehWa ? ((r.nomor_wa as string | null) ?? null) : null,
        }))
        .filter((r) => r.total > 0 && r.persen < ambang)
        .sort((a, b) => a.persen - b.persen);

      return {
        periode: p,
        ambang,
        per_platform: platforms.map((pf) => ({
          platform: pf,
          postingan: postinganPer.get(pf) ?? 0,
          patuh_penuh: platMap.get(pf)?.patuh ?? 0,
          total_kader: platMap.get(pf)?.kader ?? 0,
        })),
        tindak_lanjut: tindak,
      };
    }

    // --- Ringkas per kader (spek 1.15) ---
    // Agregasi DI DATABASE (view) — satu baris per kader, jadi tidak
    // mungkin kena cap 1000 baris PostgREST yang membuat agregasi
    // JavaScript diam-diam salah saat postingan banyak.
    if (searchParams.get("ringkas_kader") === "1" && periode) {
      // Saringan platform (spek 1.18/2.1g) & saringan AKUN (31 Agu 2026:
      // kelompok akun wajib — tv rakyat / dpp.pri / muhammad nazaruddin).
      const platformSaring = searchParams.get("platform");
      const akunSaring = searchParams.get("akun");
      let qRingkas = supabase()
        .from(
          akunSaring
            ? "v_app_kepatuhan_kader_akun"
            : platformSaring
              ? "v_app_kepatuhan_kader_platform"
              : "v_app_kepatuhan_kader",
        )
        .select("nama_kader, total, sudah, nomor_wa")
        .eq("periode", periode)
        .order("nama_kader")
        .limit(1000);
      if (akunSaring) qRingkas = qRingkas.eq("kelompok_akun", akunSaring);
      if (platformSaring) qRingkas = qRingkas.eq("platform", platformSaring);
      const { data: mentah } = await qRingkas;
      // View per-akun berbutir (kader × platform) — bila platform TIDAK
      // ikut disaring, gabungkan dulu per kader supaya satu kader = satu
      // baris (panel mengharapkan itu).
      let data = mentah;
      if (akunSaring && !platformSaring && mentah) {
        const per = new Map<string, { nama_kader: string; total: number; sudah: number; nomor_wa: string | null }>();
        for (const b of mentah) {
          const d = per.get(String(b.nama_kader)) ?? {
            nama_kader: String(b.nama_kader),
            total: 0,
            sudah: 0,
            nomor_wa: (b.nomor_wa as string | null) ?? null,
          };
          d.total += Number(b.total ?? 0);
          d.sudah += Number(b.sudah ?? 0);
          if (!d.nomor_wa && b.nomor_wa) d.nomor_wa = b.nomor_wa as string;
          per.set(d.nama_kader, d);
        }
        data = [...per.values()];
      }
      const ringkas = (data ?? []).map((r) => ({
        nama_kader: r.nama_kader as string,
        total: Number(r.total ?? 0),
        sudah: Number(r.sudah ?? 0),
        nomor_wa: adalahPengurus(user.role) ? ((r.nomor_wa as string | null) ?? null) : null,
      }));
      return { data: ringkas };
    }

    let q = supabase()
      .from("v_app_rekap")
      .select(
        "id_unik, periode, nama_kader, platform, akun_wajib, id_postingan, sudah_komentar, jumlah_komentar, nomor_wa",
      )
      .order("nama_kader");
    if (idPostingan) q = q.eq("id_postingan", idPostingan);
    if (periode) q = q.eq("periode", periode);
    // Saring satu kader (detail popup) — barisnya sedikit, bebas cap.
    if (namaKader) q = q.eq("nama_kader", namaKader);

    const data = pastikanSukses(await q, "rekap kepatuhan") as BarisRekap[];

    // Nomor WhatsApp hanya untuk pengurus (dipakai fitur "ingatkan").
    if (!adalahPengurus(user.role)) {
      for (const baris of data) baris.nomor_wa = null;
    }

    const payload: Record<string, unknown> = { data };
    if (idPostingan) {
      const sudah = data.filter((r) => r.sudah_komentar).length;
      const belum = data.length - sudah;
      payload.ringkasan = {
        sudah,
        belum,
        persen: data.length > 0 ? Math.round((sudah / data.length) * 100) : 0,
      };
    }
    return payload;
  });
}

/**
 * POST /api/rekap — setel ambang "perlu ditindaklanjuti" (persen).
 * Body: { ambang: number 10-100 }. Hanya pengurus/HR.
 */
export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!adalahPengurus(user.role) && !adalahHR(user)) {
      throw Object.assign(new Error("Hanya pengurus yang boleh menyetel ambang."), {
        status: 403,
      });
    }
    const body = (await request.json().catch(() => ({}))) as { ambang?: number };
    const n = Math.floor(Number(body.ambang));
    if (!Number.isFinite(n) || n < 10 || n > 100) {
      throw Object.assign(new Error("Ambang harus 10-100 persen."), { status: 400 });
    }
    const { error } = await supabase()
      .from("pengaturan_sistem")
      .upsert(
        { kunci: "qc_ambang_tindak", nilai: String(n), diubah_pada: new Date().toISOString() },
        { onConflict: "kunci" },
      );
    if (error) throw new Error("Gagal menyimpan ambang.");
    return { sukses: true, ambang: n };
  });
}
