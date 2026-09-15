// ============================================================
// /api/master/penyedia-tvr — MASTER MEMILIH PENYEDIA SOSMED PER ANGGOTA
// (15 Sep 2026)
//
// Aplikasi ini memakai tiga gerbang posting:
//   • Ayrshare    — TV Rakyat OFFICIAL & QC komentar. Bukan urusan
//                   layar ini dan tidak bisa dipilih di sini.
//   • upload-post — akun pribadi anggota (TV Rakyat Saya). Bawaan.
//   • Postiz      — sama seperti upload-post, tapi berjalan di VPS kita
//                   sendiri. Masih UJI COBA.
//
// Postiz tidak menggantikan upload-post. Yang dibuka di sini adalah
// kemampuan master menunjuk ORANG PER ORANG siapa yang ikut mencoba
// Postiz, supaya kalau ada yang salah, yang terkena hanya beberapa
// orang dan mengembalikannya cukup satu klik.
//
// GET  → daftar anggota TV Rakyat Saya + penyedianya masing-masing.
// POST → { user_id, penyedia } pindahkan satu anggota.
// ============================================================
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { buatProfilUp, daftarProfilUp, uploadPostSiap } from "@/lib/upload-post";
import { postizSiap } from "@/lib/postiz";
import { idPenyediaBawaan, PENYEDIA_ANGGOTA } from "@/lib/sosmed-penyedia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENGELOLA = new Set(["master", "super_admin"]);
/** Yang boleh dipilih di layar ini. Ayrshare sengaja TIDAK termasuk. */
const BOLEH_DIPILIH = new Set(PENYEDIA_ANGGOTA);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanPengelola(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (!PENGELOLA.has(user.role)) {
    throw Object.assign(new Error("Khusus pengelola aplikasi."), { status: 403 });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanPengelola(request);
    const db = supabase();

    const [{ data: profil }, { data: akun }] = await Promise.all([
      db
        .from("sosmed_profile")
        .select("user_id, profile_key, penyedia, penyedia_diubah_pada")
        .eq("jenis", "pengguna")
        .in("penyedia", PENYEDIA_ANGGOTA)
        .not("user_id", "is", null),
      db.from("akun_tvr_user").select("user_id, platform").eq("terhubung", true),
    ]);

    const idAnggota = [...new Set((profil ?? []).map((p) => Number(p.user_id)))];
    const { data: orang } = idAnggota.length
      ? await db
          .from("app_user")
          .select("id, nama, username, avatar_url")
          .in("id", idAnggota)
      : { data: [] as { id: unknown; nama: unknown; username: unknown; avatar_url: unknown }[] };

    const orangPer = new Map<number, { nama: string; username: string; avatar_url: string }>();
    for (const o of orang ?? []) {
      orangPer.set(Number(o.id), {
        nama: String(o.nama ?? ""),
        username: String(o.username ?? ""),
        avatar_url: String(o.avatar_url ?? ""),
      });
    }
    const tertautPer = new Map<number, number>();
    for (const a of akun ?? []) {
      tertautPer.set(Number(a.user_id), (tertautPer.get(Number(a.user_id)) ?? 0) + 1);
    }

    const anggota = (profil ?? [])
      .map((p) => {
        const id = Number(p.user_id);
        const o = orangPer.get(id);
        return {
          id: String(id),
          nama: o?.nama ?? `Anggota ${id}`,
          username: o?.username ?? "",
          avatar_url: o?.avatar_url ?? "",
          profil: String(p.profile_key ?? ""),
          penyedia: String(p.penyedia ?? ""),
          tertaut: tertautPer.get(id) ?? 0,
          diubah_pada: p.penyedia_diubah_pada ? String(p.penyedia_diubah_pada) : null,
        };
      })
      // Yang sedang ikut uji coba ditaruh di atas — merekalah yang perlu
      // diawasi tiap hari selama percobaan berjalan.
      .sort(
        (a, b) =>
          Number(b.penyedia === "postiz") - Number(a.penyedia === "postiz") ||
          a.nama.localeCompare(b.nama),
      );

    return {
      anggota,
      bawaan: idPenyediaBawaan(),
      postiz_siap: postizSiap(),
      upload_post_siap: uploadPostSiap(),
      jumlah: {
        semua: anggota.length,
        postiz: anggota.filter((a) => a.penyedia === "postiz").length,
      },
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const master = await pastikanPengelola(request);
    const body = (await request.json().catch(() => ({}))) as {
      user_id?: number | string;
      penyedia?: string;
    };
    const userId = Number(body.user_id);
    const penyedia = String(body.penyedia ?? "").trim();

    if (!Number.isFinite(userId) || userId <= 0) {
      throw Object.assign(new Error("Anggota tidak dikenali."), { status: 400 });
    }
    if (!BOLEH_DIPILIH.has(penyedia)) {
      throw Object.assign(
        new Error(`Penyedia "${penyedia}" tidak bisa dipilih di sini. Pilihannya: ${[...BOLEH_DIPILIH].join(", ")}.`),
        { status: 400 },
      );
    }
    // Menaruh anggota di penyedia yang belum diatur berarti unggahannya
    // pasti gagal — ditolak di sini supaya ketahuan sekarang, bukan
    // nanti saat anggota menekan tombol unggah.
    if (penyedia === "postiz" && !postizSiap()) {
      throw Object.assign(
        new Error("Postiz belum diatur di server (POSTIZ_URL / POSTIZ_API_KEY kosong). Pasang dulu, baru pindahkan anggota."),
        { status: 400 },
      );
    }
    if (penyedia === "upload-post" && !uploadPostSiap()) {
      throw Object.assign(
        new Error("upload-post belum diatur (UPLOAD_POST_API_KEY kosong)."),
        { status: 400 },
      );
    }

    const db = supabase();
    const { data: baris } = await db
      .from("sosmed_profile")
      .select("id, profile_key, penyedia")
      .eq("jenis", "pengguna")
      .eq("user_id", userId)
      .maybeSingle();
    if (!baris) {
      throw Object.assign(
        new Error("Anggota ini belum punya profil TV Rakyat Saya. Minta dia menekan Hubungkan dulu."),
        { status: 409 },
      );
    }
    const sebelum = String(baris.penyedia ?? "");
    if (sebelum === penyedia) return { penyedia, berubah: false };

    const kunci = String(baris.profile_key ?? "");
    // Kembali ke upload-post: profilnya di sana mungkin belum pernah
    // dibuat (anggota yang langsung dimulai di Postiz). Dipastikan ada
    // SEBELUM kolomnya diubah — kalau dibalik urutannya, anggota sempat
    // berada di penyedia yang tidak mengenalinya.
    if (penyedia === "upload-post" && kunci) {
      try {
        const { profil } = await daftarProfilUp();
        if (!profil.some((p) => p.username === kunci)) {
          await buatProfilUp(kunci);
        }
      } catch (e) {
        throw Object.assign(
          new Error(
            `Gagal memastikan profil upload-post "${kunci}" ada: ${e instanceof Error ? e.message : "tidak diketahui"}`,
          ),
          { status: 502 },
        );
      }
    }

    const { error } = await db
      .from("sosmed_profile")
      .update({
        penyedia,
        penyedia_diubah_pada: new Date().toISOString(),
        penyedia_diubah_oleh: Number(master.id),
      })
      .eq("id", baris.id);
    if (error) {
      console.error("[master/penyedia-tvr] simpan:", error.message);
      throw new Error("Gagal menyimpan pilihan penyedia.");
    }

    return {
      penyedia,
      sebelumnya: sebelum,
      berubah: true,
      // Unggahan LAMA tidak ikut pindah: tiap baris riwayat menyimpan
      // penyedianya sendiri, jadi hasilnya tetap ditanyakan ke tempat
      // yang benar. Ini disebutkan supaya master tidak menduga sebaliknya.
      catatan:
        penyedia === "postiz"
          ? "Unggahan berikutnya lewat Postiz. Akun sosmednya harus sudah ditautkan di dasbor Postiz dengan label profil yang sama."
          : "Unggahan berikutnya kembali lewat upload-post.",
    };
  });
}
