// GET    /api/laporan-kerja — rencana + laporan sendiri per tanggal
//         ?semua=1&tanggal=…       → ringkasan KPI semua anggota (HR)
//         ?user=ID&tanggal=…       → butir milik satu anggota (HR)
// POST   /api/laporan-kerja — tambah butir rencana / aktivitas tambahan
// PATCH  /api/laporan-kerja — lapor realisasi satu butir (selesai/tidak)
// DELETE /api/laporan-kerja — hapus butir rencana yang belum dilaporkan
//
// Alur harian: pagi mengisi rencana; sore melaporkan realisasi tiap
// butir; pekerjaan dadakan dicatat sebagai aktivitas tambahan. KPI =
// butir rencana selesai / total butir rencana (tambahan tidak
// menghitung KPI supaya orang tidak dihukum karena kerja ekstra).
//
// Kejujuran waktu dijaga stempel server: dibuat_pada & dilaporkan_pada
// tidak bisa diisi dari ponsel — HR bisa melihat rencana yang baru
// ditulis sore hari.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { pastikanFiturAktif } from "@/lib/fitur-server";

export const dynamic = "force-dynamic";

const BOLEH_LIHAT_SEMUA = new Set(["admin_hr", "super_admin", "master"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Tanggal hari ini menurut WIB (zona server Vercel adalah UTC). */
function tanggalWibSekarang(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function tanggalDariQuery(url: URL): string {
  const t = url.searchParams.get("tanggal") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : tanggalWibSekarang();
}

const KOLOM_ITEM =
  "id, user_id, tanggal_wib, deskripsi, jenis, status, catatan_realisasi, dibuat_pada, dilaporkan_pada, kategori, tenggat, ditugaskan_oleh, penugas:app_user!kerja_item_ditugaskan_oleh_fkey(nama)";

type BarisItem = {
  id: number;
  user_id: number;
  tanggal_wib: string;
  deskripsi: string;
  jenis: string;
  status: string;
  catatan_realisasi: string | null;
  dibuat_pada: string;
  dilaporkan_pada: string | null;
  kategori: string;
  tenggat: string | null;
  ditugaskan_oleh: number | null;
  penugas?: { nama?: string } | { nama?: string }[] | null;
};

function rapikanItem(b: BarisItem) {
  const penugas = Array.isArray(b.penugas) ? b.penugas[0] : b.penugas;
  return {
    ...b,
    id: String(b.id),
    user_id: String(b.user_id),
    penugas: undefined,
    nama_penugas: b.ditugaskan_oleh ? (penugas?.nama ?? "Atasan") : null,
  };
}

/** Hitung KPI dari kumpulan butir satu hari. */
function hitungKpi(items: BarisItem[]) {
  const rencana = items.filter((i) => i.jenis === "rencana");
  const selesai = rencana.filter((i) => i.status === "selesai").length;
  const tambahan = items.filter((i) => i.jenis === "tambahan").length;
  return {
    rencana_total: rencana.length,
    rencana_selesai: selesai,
    rencana_gagal: rencana.filter((i) => i.status === "tidak_selesai").length,
    rencana_belum_lapor: rencana.filter((i) => i.status === "direncanakan").length,
    tambahan_total: tambahan,
    kpi_persen: rencana.length === 0 ? null : Math.round((100 * selesai) / rencana.length),
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const url = new URL(request.url);
    const tanggal = tanggalDariQuery(url);
    const db = supabase();

    // --- Mode HR: ringkasan KPI semua anggota utk satu tanggal ---
    if (url.searchParams.get("semua") === "1") {
      if (!BOLEH_LIHAT_SEMUA.has(user.role)) {
        throw Object.assign(new Error("Hanya HR yang boleh melihat laporan semua anggota."), {
          status: 403,
        });
      }

      // Rekap RENCANA BESAR: proyek lintas hari semua anggota, yang
      // belum tuntas didahulukan (itu yang perlu dipantau atasan).
      if (url.searchParams.get("kategori") === "besar") {
        const { data, error } = await db
          .from("kerja_item")
          .select(KOLOM_ITEM + ", pemilik:app_user!kerja_item_user_id_fkey(nama)")
          .eq("kategori", "besar")
          .order("status")
          .order("tenggat", { ascending: true, nullsFirst: false })
          .limit(100);
        if (error) {
          console.error("[laporan-kerja] besar semua:", error.message);
          throw new Error("Gagal memuat rencana besar.");
        }
        return {
          tanggal,
          data: ((data ?? []) as unknown as (BarisItem & {
            pemilik?: { nama?: string } | { nama?: string }[] | null;
          })[]).map((b) => {
            const pemilik = Array.isArray(b.pemilik) ? b.pemilik[0] : b.pemilik;
            return { ...rapikanItem(b), pemilik: undefined, nama: pemilik?.nama ?? "" };
          }),
        };
      }

      const { data, error } = await db
        .from("v_kerja_kpi")
        .select("*")
        .eq("tanggal_wib", tanggal)
        .order("nama");
      if (error) {
        console.error("[laporan-kerja] kpi:", error.message);
        throw new Error("Gagal memuat ringkasan KPI.");
      }
      return {
        tanggal,
        data: (data ?? []).map((r) => ({ ...r, user_id: String(r.user_id) })),
      };
    }

    // --- Mode HR: detail butir milik satu anggota ---
    const userDiminta = url.searchParams.get("user");
    let idTarget = Number(user.id);
    if (userDiminta && Number(userDiminta) !== Number(user.id)) {
      if (!BOLEH_LIHAT_SEMUA.has(user.role)) {
        throw Object.assign(new Error("Hanya HR yang boleh melihat laporan anggota lain."), {
          status: 403,
        });
      }
      idTarget = Number(userDiminta);
    }

    const kategori = url.searchParams.get("kategori") === "besar" ? "besar" : "harian";

    let q = db
      .from("kerja_item")
      .select(KOLOM_ITEM)
      .eq("user_id", idTarget)
      .eq("kategori", kategori);
    if (kategori === "harian") {
      q = q.eq("tanggal_wib", tanggal).order("jenis").order("id");
    } else {
      // Rencana besar: yang belum tuntas tampil terus, diurut tenggat.
      q = q.order("status").order("tenggat", { ascending: true, nullsFirst: false }).limit(100);
    }
    const { data, error } = await q;
    if (error) {
      console.error("[laporan-kerja] baca:", error.message);
      throw new Error("Gagal memuat laporan kerja.");
    }

    const items = (data ?? []) as BarisItem[];
    return {
      tanggal,
      hari_ini: tanggalWibSekarang(),
      kategori,
      data: items.map(rapikanItem),
      kpi: hitungKpi(items.filter((i) => i.kategori === "harian")),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      deskripsi?: string | string[];
      kategori?: string;
      tenggat?: string;
    };

    const hariIni = tanggalWibSekarang();
    const db = supabase();

    // Rencana & aktivitas hanya bisa ditambahkan untuk HARI INI —
    // menulis rencana kemarin (setelah hasilnya ketahuan) itulah
    // celah akal-akalan yang mau ditutup.
    if (body.aksi === "rencana") {
      const kategori = body.kategori === "besar" ? "besar" : "harian";
      await pastikanFiturAktif(
        user,
        kategori === "besar" ? "kerja.besar" : "kerja.harian",
        "Fitur rencana kerja ini sedang dimatikan untuk peran Anda.",
      );
      const tenggat =
        kategori === "besar" && /^\d{4}-\d{2}-\d{2}$/.test(String(body.tenggat ?? ""))
          ? String(body.tenggat)
          : null;
      const mentah = Array.isArray(body.deskripsi) ? body.deskripsi : [body.deskripsi ?? ""];
      const daftar = mentah
        .map((d) => String(d ?? "").trim())
        .filter((d) => d.length >= 3)
        .slice(0, 20);
      if (daftar.length === 0) {
        throw Object.assign(new Error("Tulis minimal satu rencana kerja (min. 3 huruf)."), {
          status: 400,
        });
      }
      const { data, error } = await db
        .from("kerja_item")
        .insert(
          daftar.map((deskripsi) => ({
            user_id: Number(user.id),
            tanggal_wib: hariIni,
            deskripsi: deskripsi.slice(0, 500),
            jenis: "rencana",
            kategori,
            tenggat,
          })),
        )
        .select(KOLOM_ITEM);
      if (error) {
        console.error("[laporan-kerja] tambah rencana:", error.message);
        throw new Error("Gagal menyimpan rencana kerja.");
      }
      return { sukses: true, data: ((data ?? []) as BarisItem[]).map(rapikanItem) };
    }

    if (body.aksi === "tambahan") {
      const deskripsi = String(body.deskripsi ?? "").trim();
      if (deskripsi.length < 3) {
        throw Object.assign(new Error("Tulis aktivitasnya (min. 3 huruf)."), { status: 400 });
      }
      // Aktivitas tambahan dicatat SETELAH dikerjakan, jadi langsung
      // berstatus selesai dan berstempel waktu lapor.
      const { data, error } = await db
        .from("kerja_item")
        .insert({
          user_id: Number(user.id),
          tanggal_wib: hariIni,
          deskripsi: deskripsi.slice(0, 500),
          jenis: "tambahan",
          status: "selesai",
          dilaporkan_pada: new Date().toISOString(),
        })
        .select(KOLOM_ITEM)
        .single();
      if (error) {
        console.error("[laporan-kerja] tambah aktivitas:", error.message);
        throw new Error("Gagal menyimpan aktivitas.");
      }
      return { sukses: true, data: rapikanItem(data as BarisItem) };
    }

    throw Object.assign(new Error("Aksi tidak dikenali."), { status: 400 });
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      catatan?: string;
    };

    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Butir tidak disebutkan."), { status: 400 });
    const status =
      body.status === "selesai" || body.status === "tidak_selesai" ? body.status : null;
    if (!status) {
      throw Object.assign(new Error("Status harus selesai atau tidak selesai."), { status: 400 });
    }

    const db = supabase();
    // .eq(user_id) memastikan orang hanya bisa melaporkan butirnya
    // sendiri — id yang ditebak orang lain tidak akan kena.
    const { data, error } = await db
      .from("kerja_item")
      .update({
        status,
        catatan_realisasi: (body.catatan ?? "").trim().slice(0, 500) || null,
        dilaporkan_pada: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .select(KOLOM_ITEM)
      .maybeSingle();

    if (error) {
      console.error("[laporan-kerja] lapor:", error.message);
      throw new Error("Gagal menyimpan laporan.");
    }
    if (!data) throw Object.assign(new Error("Butir tidak ditemukan."), { status: 404 });
    return { sukses: true, data: rapikanItem(data as BarisItem) };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Butir tidak disebutkan."), { status: 400 });

    const db = supabase();
    // Hanya butir milik sendiri dan belum dilaporkan. Butir HARIAN
    // hanya boleh dihapus di hari yang sama (sejarah yang sudah
    // dibaca atasan tidak boleh berubah diam-diam); rencana BESAR
    // berjalan lintas hari sehingga boleh dibatalkan kapan pun
    // selama belum dilaporkan.
    const { data: butir } = await db
      .from("kerja_item")
      .select("id, kategori, tanggal_wib, status")
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .maybeSingle();
    const bolehHapus =
      butir &&
      butir.status === "direncanakan" &&
      (butir.kategori === "besar" || butir.tanggal_wib === tanggalWibSekarang());
    if (!bolehHapus) {
      throw Object.assign(
        new Error("Butir tidak bisa dihapus (sudah dilaporkan atau bukan milik Anda)."),
        { status: 400 },
      );
    }
    const { data, error } = await db
      .from("kerja_item")
      .delete()
      .eq("id", id)
      .eq("user_id", Number(user.id))
      .eq("status", "direncanakan")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[laporan-kerja] hapus:", error.message);
      throw new Error("Gagal menghapus butir.");
    }
    if (!data) {
      throw Object.assign(
        new Error("Butir tidak bisa dihapus (sudah dilaporkan atau bukan milik Anda)."),
        { status: 400 },
      );
    }
    return { sukses: true };
  });
}
