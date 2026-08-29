// GET    /api/tim — tim saya (bawahan + pantauan KPI hari ini) dan
//                   daftar kandidat yang bisa ditambahkan
// POST   /api/tim — { aksi: "tambah" | "keluarkan" | "tugas" }
//
// Struktur tim: satu anggota punya paling banyak SATU atasan (dijaga
// unique constraint). Hanya pengguna ber-role anggota yang bisa
// dijadikan bawahan — admin dan sesama pengurus tidak.
//
// Penugasan menulis LANGSUNG ke rencana kerja bawahan (kerja_item,
// kategori harian atau besar) dengan penanda ditugaskan_oleh, sehingga
// atasan memantau lewat data yang sama dengan yang dilaporkan bawahan
// — bukan dua daftar yang bisa saling berbeda.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { adalahHR } from "@/lib/hr";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { bolehBentukTim } from "@/lib/jabatan";
import { pastikanFiturAktif } from "@/lib/fitur-server";

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

// Boleh punya tim: role KETUA yang berjabatan (plus master) — lihat
// bolehBentukTim di lib/jabatan. Super admin & HR meng-ACC, bukan
// membentuk.
const PERAN_PENGACC = new Set(["super_admin", "admin_hr", "master"]);
const bolehPunyaTim = bolehBentukTim;

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const hariIni = tanggalWibSekarang();
    const url = new URL(request.url);

    // --- Antrean ACC keanggotaan tim (super admin / admin HR) ---
    if (url.searchParams.get("acc") === "1") {
      if (!PERAN_PENGACC.has(user.role) && !adalahHR(user)) {
        throw Object.assign(new Error("Hanya super admin / admin HR yang meng-ACC tim."), {
          status: 403,
        });
      }
      const { data } = await db
        .from("tim_anggota")
        .select(
          "id, dibuat_pada, atasan:app_user!tim_anggota_atasan_id_fkey(nama, jabatan), anggota:app_user!tim_anggota_anggota_id_fkey(nama)",
        )
        .eq("status", "menunggu")
        .order("id");
      return {
        data: (data ?? []).map((t) => {
          const atasan = Array.isArray(t.atasan) ? t.atasan[0] : t.atasan;
          const anggota = Array.isArray(t.anggota) ? t.anggota[0] : t.anggota;
          return {
            id: String(t.id),
            atasan_nama: atasan?.nama ?? "",
            atasan_jabatan: atasan?.jabatan ?? "",
            anggota_nama: anggota?.nama ?? "",
            dibuat_pada: t.dibuat_pada,
          };
        }),
      };
    }

    // Atasan SAYA (bila saya bawahan seseorang) — tampil di profil.
    const { data: atasanku } = await db
      .from("tim_anggota")
      .select("atasan_id, app_user!tim_anggota_atasan_id_fkey(nama, jabatan)")
      .eq("anggota_id", Number(user.id))
      .maybeSingle();

    if (!bolehPunyaTim(user)) {
      const embedded = atasanku?.app_user as { nama?: string } | null;
      return {
        boleh_punya_tim: false,
        atasan: atasanku ? { nama: embedded?.nama ?? "" } : null,
        tim: [],
        kandidat: [],
      };
    }

    const [{ data: tim }, { data: semuaAnggota }, { data: sudahPunya }] = await Promise.all([
      db
        .from("tim_anggota")
        .select("id, anggota_id, status, dibuat_pada, app_user!tim_anggota_anggota_id_fkey(nama, jabatan, avatar_url)")
        .eq("atasan_id", Number(user.id))
        .order("id"),
      // Kandidat: HANYA role anggota yang aktif.
      db
        .from("app_user")
        .select("id, nama, jabatan, avatar_url")
        .eq("role", "anggota")
        .eq("aktif", true)
        .eq("status", "aktif")
        .order("nama"),
      db.from("tim_anggota").select("anggota_id"),
    ]);

    const terpakai = new Set((sudahPunya ?? []).map((t) => Number(t.anggota_id)));
    const anggotaIds = (tim ?? []).map((t) => Number(t.anggota_id));

    // Pantauan hari ini per bawahan: KPI rencana + jumlah video + kehadiran.
    let pantau: Record<string, unknown>[] = [];
    if (anggotaIds.length > 0) {
      const [{ data: kpi }, { data: video }, { data: hadir }, { data: izin }] = await Promise.all([
        db.from("v_kerja_kpi").select("*").eq("tanggal_wib", hariIni).in("user_id", anggotaIds),
        db
          .from("laporan_video")
          .select("user_id")
          .eq("tanggal_wib", hariIni)
          .in("user_id", anggotaIds),
        db
          .from("absensi")
          .select("user_id, jenis")
          .eq("tanggal_wib", hariIni)
          .in("user_id", anggotaIds),
        db
          .from("perizinan")
          .select("user_id, jenis, status")
          .eq("tanggal_wib", hariIni)
          .in("user_id", anggotaIds),
      ]);

      const kpiPer = new Map((kpi ?? []).map((k) => [Number(k.user_id), k]));
      const videoPer = new Map<number, number>();
      for (const v of video ?? []) {
        videoPer.set(Number(v.user_id), (videoPer.get(Number(v.user_id)) ?? 0) + 1);
      }
      const masukSet = new Set(
        (hadir ?? []).filter((h) => h.jenis === "masuk").map((h) => Number(h.user_id)),
      );
      const izinPer = new Map(
        (izin ?? []).map((i) => [Number(i.user_id), { jenis: i.jenis, status: i.status }]),
      );

      pantau = (tim ?? []).map((t) => {
        const id = Number(t.anggota_id);
        const statusTim = (t as { status?: string }).status ?? "disetujui";
        const k = kpiPer.get(id);
        const iz = izinPer.get(id);
        const kehadiran = masukSet.has(id)
          ? "masuk"
          : iz?.status === "disetujui"
            ? iz.jenis
            : iz?.status === "menunggu"
              ? "menunggu izin"
              : "alfa";
        const embedded = t.app_user as { nama?: string; jabatan?: string; avatar_url?: string } | null;
        return {
          user_id: String(id),
          nama: embedded?.nama ?? "",
          jabatan: embedded?.jabatan ?? "",
          avatar_url: embedded?.avatar_url ?? "",
          status_tim: statusTim,
          kehadiran,
          video_hari_ini: videoPer.get(id) ?? 0,
          kpi_persen: k ? Number(k.kpi_persen ?? 0) : null,
          rencana_total: k ? Number(k.rencana_total ?? 0) : 0,
          rencana_selesai: k ? Number(k.rencana_selesai ?? 0) : 0,
        };
      });
    }

    const embeddedAtasan = atasanku?.app_user as { nama?: string } | null;
    return {
      boleh_punya_tim: true,
      atasan: atasanku ? { nama: embeddedAtasan?.nama ?? "" } : null,
      tanggal: hariIni,
      tim: pantau,
      kandidat: (semuaAnggota ?? [])
        .filter((a) => !terpakai.has(Number(a.id)) && Number(a.id) !== Number(user.id))
        .map((a) => ({
          id: String(a.id),
          nama: a.nama,
          jabatan: a.jabatan ?? "",
          avatar_url: a.avatar_url ?? "",
        })),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehPunyaTim(user)) {
      throw Object.assign(new Error("Anda belum berwenang membentuk tim."), { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      anggota_id?: string;
      deskripsi?: string;
      kategori?: string;
      tenggat?: string;
    };
    const db = supabase();
    const anggotaId = Number(body.anggota_id);
    if (!anggotaId) throw Object.assign(new Error("Anggota tidak disebutkan."), { status: 400 });

    if (body.aksi === "tambah") {
      await pastikanFiturAktif(
        user,
        "tim.tambah",
        "Penambahan anggota tim sedang dimatikan untuk peran Anda.",
      );
      // Target WAJIB ber-role anggota — aturan eksplisit strukturnya.
      const { data: target } = await db
        .from("app_user")
        .select("id, nama, role, aktif, status")
        .eq("id", anggotaId)
        .maybeSingle();
      if (!target || !target.aktif || target.status !== "aktif") {
        throw Object.assign(new Error("Anggota tidak ditemukan atau tidak aktif."), { status: 404 });
      }
      if (target.role !== "anggota") {
        throw Object.assign(
          new Error("Hanya pengguna berjabatan Anggota yang bisa dimasukkan ke tim."),
          { status: 400 },
        );
      }

      // Masuk sebagai PENGAJUAN — baru aktif setelah di-ACC super
      // admin / admin HR. Ketua tidak bisa membesarkan timnya sendiri
      // tanpa sepengetahuan pusat.
      const { error } = await db
        .from("tim_anggota")
        .insert({ atasan_id: Number(user.id), anggota_id: anggotaId, status: "menunggu" });
      if (error) {
        if (error.code === "23505") {
          throw Object.assign(new Error(`${target.nama} sudah tergabung/diajukan di tim lain.`), {
            status: 409,
          });
        }
        console.error("[tim] tambah:", error.message);
        throw new Error("Gagal mengajukan anggota tim.");
      }

      await kirimKabar({
        judul: "Pengajuan anggota tim baru",
        isi: `${user.nama} mengajukan ${target.nama} sebagai anggota timnya. Buka Profil → Keanggotaan Tim untuk menyetujui.`,
        kategori: "peringatan",
        jenis_peristiwa: "tim_acc",
        untukRole: ["super_admin", "admin_hr"],
      });
      return { sukses: true, status: "menunggu" };
    }

    if (body.aksi === "keluarkan") {
      const { data } = await db
        .from("tim_anggota")
        .delete()
        .eq("atasan_id", Number(user.id))
        .eq("anggota_id", anggotaId)
        .select("id")
        .maybeSingle();
      if (!data) {
        throw Object.assign(new Error("Orang ini bukan anggota tim Anda."), { status: 404 });
      }
      return { sukses: true };
    }

    if (body.aksi === "acc" || body.aksi === "tolak_acc") {
      // Keputusan pengajuan tim — khusus super admin / admin HR.
      if (!PERAN_PENGACC.has(user.role) && !adalahHR(user)) {
        throw Object.assign(new Error("Hanya super admin / admin HR yang meng-ACC tim."), {
          status: 403,
        });
      }
      const { data: baris } = await db
        .from("tim_anggota")
        .select("id, atasan_id, anggota_id, status")
        .eq("id", anggotaId) // di aksi ini, anggota_id membawa ID BARIS pengajuan
        .maybeSingle();
      if (!baris || baris.status !== "menunggu") {
        throw Object.assign(new Error("Pengajuan tidak ditemukan atau sudah diputus."), {
          status: 404,
        });
      }

      if (body.aksi === "acc") {
        await db
          .from("tim_anggota")
          .update({
            status: "disetujui",
            disetujui_oleh: user.nama,
            disetujui_pada: new Date().toISOString(),
          })
          .eq("id", baris.id);
        await kirimKabar({
          judul: "Keanggotaan tim disetujui",
          isi: `Pengajuan tim di-ACC oleh ${user.nama}. Penugasan kini bisa berjalan.`,
          kategori: "sukses",
          jenis_peristiwa: "tim_acc",
          untukUserIds: [Number(baris.atasan_id), Number(baris.anggota_id)],
        });
      } else {
        await db.from("tim_anggota").delete().eq("id", baris.id);
        await kirimKabar({
          judul: "Pengajuan tim ditolak",
          isi: `Pengajuan anggota tim ditolak oleh ${user.nama}.`,
          kategori: "peringatan",
          jenis_peristiwa: "tim_acc",
          untukUserIds: [Number(baris.atasan_id)],
        });
      }
      return { sukses: true };
    }

    if (body.aksi === "tugas") {
      // Penugasan hanya untuk bawahan sendiri yang SUDAH di-ACC.
      const { data: relasi } = await db
        .from("tim_anggota")
        .select("id, status, app_user!tim_anggota_anggota_id_fkey(nama)")
        .eq("atasan_id", Number(user.id))
        .eq("anggota_id", anggotaId)
        .eq("status", "disetujui")
        .maybeSingle();
      if (!relasi) {
        throw Object.assign(new Error("Anda hanya bisa memberi tugas ke anggota tim sendiri."), {
          status: 403,
        });
      }

      const deskripsi = String(body.deskripsi ?? "").trim();
      if (deskripsi.length < 3) {
        throw Object.assign(new Error("Tulis isi tugasnya (min. 3 huruf)."), { status: 400 });
      }
      const kategori = body.kategori === "besar" ? "besar" : "harian";
      const tenggat =
        kategori === "besar" && /^\d{4}-\d{2}-\d{2}$/.test(body.tenggat ?? "")
          ? body.tenggat
          : null;

      const { error } = await db.from("kerja_item").insert({
        user_id: anggotaId,
        tanggal_wib: tanggalWibSekarang(),
        deskripsi: deskripsi.slice(0, 500),
        jenis: "rencana",
        kategori,
        tenggat,
        ditugaskan_oleh: Number(user.id),
      });
      if (error) {
        console.error("[tim] tugas:", error.message);
        throw new Error("Gagal mengirim penugasan.");
      }

      await kirimKabar({
        judul: kategori === "besar" ? "Tugas besar baru dari atasan" : "Tugas baru dari atasan",
        isi: `${user.nama}: ${deskripsi.slice(0, 140)}${tenggat ? ` (tenggat ${tenggat})` : ""}`,
        kategori: "info",
        jenis_peristiwa: "penugasan",
        untukUserIds: [anggotaId],
      });
      return { sukses: true };
    }

    throw Object.assign(new Error("Aksi tidak dikenali."), { status: 400 });
  });
}
