// GET   /api/pengguna — daftar seluruh akun (khusus super admin)
// PATCH /api/pengguna — setujui / tolak / ubah peran / nonaktifkan
//
// Semua tindakan di sini mengubah siapa boleh melihat apa, jadi hanya
// super admin yang boleh memanggilnya. Pemeriksaan dilakukan di server
// berdasarkan token; menyembunyikan tombol di layar saja tidak cukup.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { hapusCacheUser, userDariToken, cabutSemuaSesi } from "@/lib/sesi";
import { JABATAN_PARTAI, KUOTA_JABATAN } from "@/lib/jabatan";
import { pastikanStrukturSah } from "@/lib/struktur";

export const dynamic = "force-dynamic";

// Peran yang bisa DIPILIH dari panel kini hanya Ketua dan Anggota.
// super_admin / admin_hr / admin_tv DISEMBUNYIKAN dari pemilih — akun
// lama yang sudah memegangnya tetap berfungsi penuh, tapi tidak ada
// akun baru yang bisa diberi peran itu dari panel. 'master' seperti
// biasa hanya lewat akses langsung ke database.
const PERAN_SAH = ["ketua", "anggota"] as const;
type Peran = (typeof PERAN_SAH)[number];

// Jabatan STRUKTUR PARTAI — daftar & kuotanya di src/lib/jabatan.ts
// (satu sumber kebenaran dengan pemilih di layar Kelola Pengguna).
// String kosong = mengosongkan jabatan.
const JABATAN_SAH: readonly string[] = [...JABATAN_PARTAI, ""];

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Pastikan pemanggil adalah super admin yang aktif. */
async function pastikanSuperAdmin(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (user.role !== "super_admin" && user.role !== "master") {
    throw Object.assign(new Error("Hanya super admin yang boleh mengatur akun"), {
      status: 403,
    });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanSuperAdmin(request);

    const { data, error } = await supabase()
      .from("app_user")
      .select(
        "id, nama, email, username, nomor_wa, role, jabatan, bidang_jabatan, divisi, sub_divisi, posisi_divisi, avatar_url, status, aktif, wa_terverifikasi, profil_lengkap, created_at, disetujui_oleh, disetujui_pada",
      )
      // Yang menunggu persetujuan ditaruh paling atas — itu yang
      // butuh tindakan, bukan sekadar daftar.
      // Peran master tidak pernah tampil di panel mana pun — disaring
      // di server, bukan disembunyikan di layar, supaya tidak bisa
      // dilihat lewat pemeriksaan jaringan.
      .neq("role", "master")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error("Gagal memuat daftar pengguna");

    const daftar = (data ?? []).map((u) => ({
      ...u,
      id: String(u.id),
      avatar_url: u.avatar_url ?? "",
      jabatan: u.jabatan ?? "",
      bidang_jabatan: u.bidang_jabatan ?? "",
      divisi: u.divisi ?? "",
      sub_divisi: u.sub_divisi ?? "",
      posisi_divisi: u.posisi_divisi ?? "anggota",
    }));

    const ringkasan = {
      menunggu: daftar.filter((u) => u.status === "menunggu").length,
      aktif: daftar.filter((u) => u.status === "aktif").length,
      ditolak: daftar.filter((u) => u.status === "ditolak").length,
    };

    return { data: daftar, ringkasan };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const admin = await pastikanSuperAdmin(request);

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      tindakan?:
        | "setujui"
        | "tolak"
        | "ubah_peran"
        | "nonaktifkan"
        | "aktifkan"
        | "hapus"
        | "ubah_jabatan"
        | "ubah_divisi";
      role?: string;
      jabatan?: string;
      bidang?: string;
      divisi?: string;
      sub_divisi?: string;
      posisi_divisi?: string;
    };

    const id = Number(body.id);
    if (!id) throw Object.assign(new Error("Akun tidak disebutkan"), { status: 400 });

    // Penjaga: super admin tidak boleh menurunkan atau menonaktifkan
    // dirinya sendiri. Tanpa ini, satu kesalahan klik bisa membuat
    // sistem kehilangan seluruh super admin dan tidak bisa dipulihkan
    // dari dalam aplikasi.
    // Jabatan hanyalah label organisasi, bukan hak akses — aman
    // diubah untuk diri sendiri, beda dengan peran/status.
    if (
      String(id) === admin.id &&
      body.tindakan !== "setujui" &&
      body.tindakan !== "ubah_jabatan" &&
      body.tindakan !== "ubah_divisi"
    ) {
      throw Object.assign(
        new Error("Anda tidak bisa mengubah peran atau menonaktifkan akun sendiri."),
        { status: 400 },
      );
    }

    const db = supabase();

    // Akun master tidak terlihat di panel, tapi id-nya bisa saja ditebak.
    // Tolak di server supaya tidak bisa dinonaktifkan dari luar.
    const { data: sasaran } = await db
      .from("app_user")
      .select("role")
      .eq("id", id)
      .maybeSingle();
    if (sasaran?.role === "master") {
      throw Object.assign(new Error("Akun tidak ditemukan"), { status: 404 });
    }

    const perubahan: Record<string, unknown> = {};

    switch (body.tindakan) {
      case "setujui": {
        const peran = (body.role ?? "anggota") as Peran;
        if (!PERAN_SAH.includes(peran)) {
          throw Object.assign(new Error("Peran tidak dikenal"), { status: 400 });
        }
        perubahan.status = "aktif";
        perubahan.aktif = true;
        perubahan.role = peran;
        perubahan.disetujui_oleh = admin.nama;
        perubahan.disetujui_pada = new Date().toISOString();
        break;
      }
      case "tolak":
        perubahan.status = "ditolak";
        perubahan.aktif = false;
        break;
      case "ubah_peran": {
        const peran = (body.role ?? "") as Peran;
        if (!PERAN_SAH.includes(peran)) {
          throw Object.assign(new Error("Peran tidak dikenal"), { status: 400 });
        }
        perubahan.role = peran;
        break;
      }
      case "ubah_jabatan": {
        // Jabatan bakunya dari daftar resmi (untuk kuota); bidangnya
        // teks bebas pelengkap ("Bidang IT dan Infrastruktur").
        const jabatan = (body.jabatan ?? "").trim();
        if (!JABATAN_SAH.includes(jabatan)) {
          throw Object.assign(new Error("Jabatan tidak dikenal"), { status: 400 });
        }

        // Kuota jabatan tunggal/terbatas: menetapkan orang melebihi
        // kuota DITOLAK dengan menyebut pemegang lamanya — jangan
        // diam-diam membuat dua Ketua Umum.
        const kuota = KUOTA_JABATAN[jabatan];
        if (kuota) {
          const { data: pemegang } = await db
            .from("app_user")
            .select("id, nama")
            .eq("jabatan", jabatan)
            .eq("aktif", true)
            .neq("id", id);
          if ((pemegang ?? []).length >= kuota) {
            const nama = (pemegang ?? []).map((o) => o.nama).join(", ");
            throw Object.assign(
              new Error(
                kuota === 1
                  ? `Jabatan ${jabatan} hanya boleh satu orang dan sedang dipegang ${nama}. Kosongkan dulu jabatan beliau.`
                  : `Kuota ${jabatan} (${kuota} orang) sudah penuh: ${nama}.`,
              ),
              { status: 409 },
            );
          }
        }

        perubahan.jabatan = jabatan;
        perubahan.bidang_jabatan = jabatan ? (body.bidang ?? "").trim().slice(0, 120) || null : null;
        break;
      }
      case "ubah_divisi": {
        // Divisi + sub + posisi Kepala/Anggota — HANYA lewat panel ini;
        // anggota cuma bisa memilih divisinya sendiri (tanpa posisi).
        const divisi = (body.divisi ?? "").trim();
        const sub = (body.sub_divisi ?? "").trim();
        pastikanStrukturSah(divisi, sub);
        const posisi = body.posisi_divisi === "kepala" ? "kepala" : "anggota";
        perubahan.divisi = divisi;
        perubahan.sub_divisi = divisi ? sub : "";
        perubahan.posisi_divisi = divisi ? posisi : "anggota";
        break;
      }
      case "nonaktifkan":
        perubahan.aktif = false;
        break;
      case "aktifkan":
        perubahan.aktif = true;
        perubahan.status = "aktif";
        break;
      case "hapus": {
        // Hapus keanggotaan sepenuhnya. Sesi dan akun sosmednya ikut
        // terhapus lewat ON DELETE CASCADE, sehingga username yang
        // dilepas bisa langsung diklaim ulang orang lain.
        await hapusCacheUser(id);
        const { error: eHapus } = await db.from("app_user").delete().eq("id", id);
        if (eHapus) {
          console.error("[pengguna] hapus:", eHapus.message);
          throw new Error("Gagal menghapus keanggotaan");
        }
        return { sukses: true, dihapus: true };
      }
      default:
        throw Object.assign(new Error("Tindakan tidak dikenal"), { status: 400 });
    }

    const { error } = await db.from("app_user").update(perubahan).eq("id", id);
    // Baris app_user berubah → buang cache sesinya supaya perubahan
    // (termasuk pencabutan akses) berlaku seketika, bukan menunggu TTL.
    await hapusCacheUser(id);
    if (error) {
      console.error("[pengguna] ubah:", error.message);
      throw new Error("Gagal menyimpan perubahan");
    }

    // Hak akses berubah = sesi lama tidak boleh dipakai lagi. Kalau
    // tidak dicabut, akun yang baru saja ditolak atau diturunkan
    // perannya masih memegang akses lama sampai tokennya kebetulan
    // gagal — itu lubang keamanan, bukan sekadar ketidakrapian.
    if (
      body.tindakan === "tolak" ||
      body.tindakan === "nonaktifkan" ||
      body.tindakan === "ubah_peran"
    ) {
      await cabutSemuaSesi(id);
    }

    return { sukses: true };
  });
}
