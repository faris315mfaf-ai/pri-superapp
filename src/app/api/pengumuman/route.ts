// Pengumuman berjenjang atasan → bawahan.
//
// GET  → pengumuman UNTUK saya (+ yang saya kirim) — 30 terbaru.
// POST → kirim pengumuman { judul, isi, cakupan, jabatan_target? }
//
// Jenjang cakupan (lihat cakupanPengumuman di lib/jabatan):
// - Ketua Umum / master           : semua | per divisi (jabatan) | tim
// - Sekjen / Direktur Eksekutif /
//   para Wakil                    : per divisi | tim
// - Pemegang jabatan lain & ketua : tim sendiri saja
//
// Penerima dihitung SAAT kirim lalu disimpan di pengumuman_penerima,
// dan notifikasi + push dikirim TERTARGET per orang — sesuai prinsip
// "notifikasi hanya untuk yang relevan".
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { cakupanPengumuman, JABATAN_PARTAI } from "@/lib/jabatan";
import { adalahHR } from "@/lib/hr";
import { DIVISI } from "@/lib/struktur";

export const dynamic = "force-dynamic";

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const db = supabase();

    // Untuk saya: lewat tabel penerima. Yang saya kirim: lewat pengirim.
    const [{ data: untukku }, { data: kirimanKu }] = await Promise.all([
      db
        .from("pengumuman_penerima")
        .select("pengumuman:pengumuman(id, pengirim_nama, judul, isi, cakupan, jabatan_target, jumlah_penerima, dibuat_pada)")
        .eq("user_id", idKu)
        .order("pengumuman_id", { ascending: false })
        .limit(30),
      db
        .from("pengumuman")
        .select("id, pengirim_nama, judul, isi, cakupan, jabatan_target, jumlah_penerima, dibuat_pada")
        .eq("pengirim_id", idKu)
        .order("id", { ascending: false })
        .limit(30),
    ]);

    type P = {
      id: number;
      pengirim_nama: string;
      judul: string;
      isi: string;
      cakupan: string;
      jabatan_target: string | null;
      jumlah_penerima: number;
      dibuat_pada: string;
    };
    const gabung = new Map<number, P & { dari_saya: boolean }>();
    for (const b of kirimanKu ?? []) gabung.set(b.id, { ...(b as P), dari_saya: true });
    for (const b of untukku ?? []) {
      const p = (Array.isArray(b.pengumuman) ? b.pengumuman[0] : b.pengumuman) as P | null;
      if (p && !gabung.has(p.id)) gabung.set(p.id, { ...p, dari_saya: false });
    }

    return {
      cakupan_boleh: Array.from(
        new Set<string>([
          ...cakupanPengumuman(user),
          ...(adalahHR(user) ? ["semua", "divisi"] : []),
        ]),
      ),
      jabatan_pilihan: JABATAN_PARTAI,
      data: Array.from(gabung.values())
        .sort((a, b) => b.id - a.id)
        .map((p) => ({ ...p, id: String(p.id) })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    // Orang HR (peran admin_hr / Divisi HR — fitur 1.22.x/1) boleh
    // menyiarkan ke SEMUA atau ke satu DIVISI, di samping wewenang
    // berjenjang yang mungkin sudah dimiliki dari jabatannya.
    const boleh = Array.from(
      new Set<string>([
        ...cakupanPengumuman(user),
        ...(adalahHR(user) ? ["semua", "divisi"] : []),
      ]),
    );
    if (boleh.length === 0) {
      throw Object.assign(
        new Error("Anda belum berwenang mengirim pengumuman (butuh jabatan struktur, tim, atau peran HR)."),
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      judul?: string;
      isi?: string;
      cakupan?: string;
      jabatan_target?: string;
      divisi_target?: string;
      kecuali?: unknown;
    };
    const judul = (body.judul ?? "").trim();
    const isi = (body.isi ?? "").trim();
    if (judul.length < 3 || isi.length < 3) {
      throw Object.assign(new Error("Judul dan isi pengumuman wajib diisi."), { status: 400 });
    }
    const cakupan = (body.cakupan ?? "") as "semua" | "jabatan" | "tim" | "divisi";
    if (!boleh.includes(cakupan)) {
      throw Object.assign(
        new Error(`Cakupan "${cakupan}" di luar wewenang Anda.`),
        { status: 403 },
      );
    }
    // Pengguna yang DIKECUALIKAN (fitur 1.22.x/1) — id valid saja.
    const kecuali = new Set<number>(
      (Array.isArray(body.kecuali) ? body.kecuali : [])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0),
    );

    const db = supabase();

    // --- Hitung penerima sesuai cakupan ---
    let penerima: number[] = [];
    let jabatanTarget: string | null = null;
    let divisiTarget: string | null = null;

    if (cakupan === "semua") {
      const { data } = await db
        .from("app_user")
        .select("id")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("id", idKu);
      penerima = (data ?? []).map((u) => Number(u.id));
    } else if (cakupan === "jabatan") {
      jabatanTarget = (body.jabatan_target ?? "").trim();
      if (!(JABATAN_PARTAI as readonly string[]).includes(jabatanTarget)) {
        throw Object.assign(new Error("Pilih divisi/jabatan tujuan."), { status: 400 });
      }
      // Divisi = pemegang jabatan itu BESERTA anggota tim para
      // pemegangnya — pengumuman divisi harus sampai ke pelaksananya,
      // bukan berhenti di kepala divisinya.
      const { data: kepala } = await db
        .from("app_user")
        .select("id")
        .eq("jabatan", jabatanTarget)
        .eq("aktif", true)
        .eq("status", "aktif");
      const idKepala = (kepala ?? []).map((u) => Number(u.id));
      let idAnak: number[] = [];
      if (idKepala.length > 0) {
        const { data: anak } = await db
          .from("tim_anggota")
          .select("anggota_id")
          .in("atasan_id", idKepala)
          .eq("status", "disetujui");
        idAnak = (anak ?? []).map((t) => Number(t.anggota_id));
      }
      penerima = Array.from(new Set([...idKepala, ...idAnak])).filter((id) => id !== idKu);
    } else if (cakupan === "divisi") {
      // Divisi tertentu (fitur 1.22.x/1): semua anggota aktif di divisi itu.
      divisiTarget = (body.divisi_target ?? "").trim();
      if (!(DIVISI as readonly string[]).includes(divisiTarget)) {
        throw Object.assign(new Error("Pilih divisi tujuan."), { status: 400 });
      }
      const { data } = await db
        .from("app_user")
        .select("id")
        .eq("divisi", divisiTarget)
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("id", idKu);
      penerima = (data ?? []).map((u) => Number(u.id));
    } else {
      // tim: anggota tim saya yang sudah di-ACC.
      const { data: tim } = await db
        .from("tim_anggota")
        .select("anggota_id")
        .eq("atasan_id", idKu)
        .eq("status", "disetujui");
      penerima = (tim ?? []).map((t) => Number(t.anggota_id));
      if (penerima.length === 0) {
        throw Object.assign(
          new Error("Tim Anda belum punya anggota yang di-ACC."),
          { status: 400 },
        );
      }
    }

    // Buang pengguna yang dikecualikan, lalu pastikan masih ada penerima.
    penerima = penerima.filter((id) => !kecuali.has(id));
    if (penerima.length === 0) {
      throw Object.assign(
        new Error("Tidak ada penerima (mungkin semua tercakup dikecualikan)."),
        { status: 400 },
      );
    }

    // --- Simpan + catat penerima + kabar tertarget ---
    const { data: baris, error } = await db
      .from("pengumuman")
      .insert({
        pengirim_id: idKu,
        pengirim_nama: user.nama,
        judul: judul.slice(0, 120),
        isi: isi.slice(0, 2000),
        cakupan,
        jabatan_target: jabatanTarget,
        divisi_target: divisiTarget,
        jumlah_penerima: penerima.length,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[pengumuman] simpan:", error.message);
      throw new Error("Gagal menyimpan pengumuman.");
    }

    await db
      .from("pengumuman_penerima")
      .insert(penerima.map((uid) => ({ pengumuman_id: baris.id, user_id: uid })));

    await kirimKabar({
      judul: `📢 ${judul.slice(0, 100)}`,
      isi: `${user.nama}: ${isi.slice(0, 200)}`,
      kategori: "info",
      jenis_peristiwa: "pengumuman",
      target: "chat",
      untukUserIds: penerima,
    });

    return { sukses: true, id: String(baris.id), jumlah_penerima: penerima.length };
  });
}
