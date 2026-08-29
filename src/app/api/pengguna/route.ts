// GET   /api/pengguna — daftar seluruh akun (khusus super admin)
// PATCH /api/pengguna — setujui / tolak / ubah peran / nonaktifkan
//
// Semua tindakan di sini mengubah siapa boleh melihat apa, jadi hanya
// super admin yang boleh memanggilnya. Pemeriksaan dilakukan di server
// berdasarkan token; menyembunyikan tombol di layar saja tidak cukup.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { hapusCacheUser, userDariToken, cabutSemuaSesi } from "@/lib/sesi";
import { buatHashSandi } from "@/lib/sandi";
import { kirimKabar } from "@/lib/notifikasi";
import { JABATAN_PARTAI, KUOTA_JABATAN } from "@/lib/jabatan";
import { pastikanStrukturSah } from "@/lib/struktur";
import { aksesDashboardRole } from "@/lib/dashboard-akses";
import { adalahHR, diDivisiHR } from "@/lib/hr";

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
    // Admin HR boleh MEMBACA daftar (Database Anggota, spek 1.18/2.2);
    // tindakan pengubah tetap dijaga per-tindakan di PATCH.
    const pembaca = await userDariToken(tokenDari(request));
    if (!pembaca) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    // Orang HR (peran admin_hr ATAU anggota Divisi HR — fitur 1.22.x/1)
    // boleh membuka Kelola Pengguna.
    if (!["super_admin", "master"].includes(pembaca.role) && !adalahHR(pembaca)) {
      // Fitur 1.19/3.3: jabatan yang diberi master akses dashboard
      // berbasis daftar anggota ikut boleh MEMBACA roster (baca-saja;
      // semua tindakan pengubah tetap dijaga ketat di PATCH).
      const akses = await aksesDashboardRole(pembaca.role);
      const butuhRoster = ["absensi", "kpi", "anggota"];
      if (!butuhRoster.some((k) => akses.includes(k))) {
        throw Object.assign(new Error("Hanya pengurus yang boleh membuka daftar akun"), {
          status: 403,
        });
      }
    }

    const { data, error } = await supabase()
      .from("app_user")
      .select(
        "id, nama, nama_panggilan, email, username, nomor_wa, role, jabatan, bidang_jabatan, divisi, sub_divisi, posisi_divisi, zona_id, zona:zona(nama), avatar_url, status, aktif, wa_terverifikasi, profil_lengkap, created_at, disetujui_oleh, disetujui_pada",
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

/**
 * POST /api/pengguna — SETUJUI SEMUA pendaftar yang masih menunggu,
 * sekaligus, sebagai peran "anggota".
 *
 * Untuk situasi banyak pendaftaran masuk bersamaan. Sengaja hanya
 * memberi peran anggota (bukan peran istimewa apa pun), jadi tidak ada
 * kuota jabatan yang bisa dilanggar dan tidak ada risiko menaikkan
 * banyak orang ke peran berbahaya dalam sekali klik. Peran/jabatan
 * lanjutan tetap diberikan satu per satu seperti biasa.
 */
export async function POST(request: Request) {
  return bungkus(async () => {
    const admin = await pastikanSuperAdmin(request);
    const db = supabase();

    const { data, error } = await db
      .from("app_user")
      .update({
        status: "aktif",
        aktif: true,
        role: "anggota",
        disetujui_oleh: admin.nama,
        disetujui_pada: new Date().toISOString(),
      })
      .eq("status", "menunggu")
      .select("id");
    if (error) {
      console.error("[pengguna] setujui semua:", error.message);
      throw new Error("Gagal menyetujui pendaftar.");
    }

    // Buang cache sesi tiap akun yang berubah supaya statusnya berlaku
    // seketika bila mereka sudah memegang token (mis. sedang di layar
    // "menunggu persetujuan").
    for (const u of data ?? []) await hapusCacheUser(u.id);

    return { sukses: true, jumlah: (data ?? []).length };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    // Auth dua lapis: semua tindakan butuh super admin/master, KECUALI
    // ubah_divisi yang juga boleh dilakukan admin HR dan KETUA DIVISI
    // (posisi kepala — spek 1.2; dibatasi lebih ketat di bawah).
    const pemanggil = await userDariToken(tokenDari(request));
    if (!pemanggil) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });

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
        | "ubah_divisi"
        | "ganti_sandi";
      role?: string;
      jabatan?: string;
      bidang?: string;
      divisi?: string;
      sub_divisi?: string;
      posisi_divisi?: string;
    };

    // Otoritas penuh Kelola Pengguna: Super Admin + Master + anggota
    // Divisi HR (fitur 1.22.x/1 — "Divisi HR + Super Admin + Master",
    // DITAMBAHKAN ke aturan lama, tidak mencabut). Termasuk hak menetapkan
    // divisi/jabatan/peran. Admin HR (bukan Divisi HR) tetap terbatas
    // lewat `bolehTerbatas` di bawah.
    const adminPenuh =
      pemanggil.role === "super_admin" ||
      pemanggil.role === "master" ||
      diDivisiHR(pemanggil);
    const kepalaDivisi = pemanggil.posisi_divisi === "kepala" && Boolean(pemanggil.divisi);
    if (!adminPenuh) {
      const bolehTerbatas =
        (body.tindakan === "ubah_divisi" &&
          (pemanggil.role === "admin_hr" || kepalaDivisi)) ||
        // Ganti sandi (spek 1.18/2.2): HR juga boleh — dgn jejak audit.
        (body.tindakan === "ganti_sandi" && pemanggil.role === "admin_hr");
      if (!bolehTerbatas) {
        throw Object.assign(new Error("Hanya super admin yang boleh mengatur akun"), {
          status: 403,
        });
      }
      // Ketua divisi hanya boleh menarik orang KE DIVISINYA SENDIRI,
      // dan tidak boleh mengangkat kepala (spek 1.2). HR bebas divisi.
      if (kepalaDivisi && pemanggil.role !== "admin_hr") {
        if ((body.divisi ?? "") !== pemanggil.divisi) {
          throw Object.assign(
            new Error("Ketua divisi hanya bisa menempatkan anggota ke divisinya sendiri."),
            { status: 403 },
          );
        }
        if (body.posisi_divisi === "kepala") {
          throw Object.assign(
            new Error("Hanya HR/master yang boleh mengangkat kepala divisi."),
            { status: 403 },
          );
        }
      }
    }
    const admin = pemanggil;

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
      // --- Ganti sandi anggota (spek 1.18/2.2: HR/super/master) ---
      case "ganti_sandi": {
        const sandiBaru = String(body.role ?? ""); // dititipkan di kolom role
        if (sandiBaru.length < 8) {
          throw Object.assign(new Error("Sandi baru minimal 8 karakter."), { status: 400 });
        }
        const { data: target } = await db
          .from("app_user")
          .select("id, nama, role")
          .eq("id", id)
          .maybeSingle();
        if (!target) throw Object.assign(new Error("Akun tidak ditemukan."), { status: 404 });
        if (target.role === "master") {
          throw Object.assign(new Error("Sandi master tidak bisa diganti dari sini."), {
            status: 403,
          });
        }
        const { error: eSandi } = await db
          .from("app_user")
          .update({ password_hash: await buatHashSandi(sandiBaru) })
          .eq("id", id);
        if (eSandi) throw new Error("Gagal mengganti sandi.");
        await cabutSemuaSesi(id);
        await hapusCacheUser(id);
        // JEJAK AUDIT (spek): siapa mengganti sandi siapa.
        await db.from("log_audit").insert({
          aktor_id: Number(pemanggil.id),
          aktor_nama: pemanggil.nama,
          aksi: "ganti_sandi",
          target_id: id,
          target_nama: target.nama,
          detail: "Sandi diganti lewat Database Anggota; semua sesi target dicabut.",
        });
        await kirimKabar({
          judul: "Sandi akun Anda diganti pengurus",
          isi: "Masuk lagi dengan sandi baru dari pengurus.",
          kategori: "peringatan",
          jenis_peristiwa: "keamanan",
          untukUserIds: [id],
        });
        return { sukses: true };
      }

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
