// GET  /api/username — username sekarang + boleh diganti atau belum
// POST /api/username — ganti username login { username, sandi }
//
// Tiga penjaga yang disengaja:
//  1. **Kata sandi wajib diketik ulang.** Username adalah identitas
//     login; kalau sebuah sesi dicuri, penyerang yang mengganti username
//     akan mengunci pemilik aslinya di luar (ia mengetik username lama
//     yang sudah tidak ada). Meminta sandi menutup jalan itu.
//  2. **Jeda antar penggantian**, seperti kata sandi — orang lain
//     mengenali anggota lewat username-nya di chat dan daftar.
//  3. **Aturan bentuk ada di lib/username**, dipakai bersama pendaftaran,
//     supaya keduanya tidak pernah berbeda pendapat.
//
// Sesi TIDAK dicabut: token perangkat tidak terikat username, dan
// memaksa semua perangkat keluar hanya karena ganti nama akan terasa
// seperti kerusakan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { cocokkanSandi } from "@/lib/sandi";
import { hapusCacheUser, userDariToken } from "@/lib/sesi";
import { periksaUsername } from "@/lib/username";

export const dynamic = "force-dynamic";

/** Jarak minimum antar penggantian username. */
const JEDA_HARI = 30;

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

type BarisAkun = {
  username: string | null;
  password_hash: string | null;
  username_diubah_pada: string | null;
};

/**
 * Baca akun + kapan terakhir ganti. Kolom `username_diubah_pada` baru ada
 * sejak sql/55; bila migrasinya belum dijalankan, fitur tetap hidup tanpa
 * jeda daripada mati total dengan galat yang tidak bisa dibaca pengguna.
 */
async function bacaAkun(userId: number): Promise<{ baris: BarisAkun; adaKolom: boolean }> {
  const db = supabase();
  const lengkap = await db
    .from("app_user")
    .select("username, password_hash, username_diubah_pada")
    .eq("id", userId)
    .maybeSingle();
  if (!lengkap.error) {
    return { baris: (lengkap.data ?? {}) as BarisAkun, adaKolom: true };
  }
  if (lengkap.error.code !== "42703") throw new Error("Gagal membaca data akun.");
  const lama = await db
    .from("app_user")
    .select("username, password_hash")
    .eq("id", userId)
    .maybeSingle();
  return {
    baris: { ...((lama.data ?? {}) as Omit<BarisAkun, "username_diubah_pada">), username_diubah_pada: null },
    adaKolom: false,
  };
}

/** Sisa hari sebelum boleh ganti lagi; 0 = boleh sekarang. */
function sisaHari(terakhir: string | null): number {
  if (!terakhir) return 0;
  const lewat = (Date.now() - new Date(terakhir).getTime()) / 86_400_000;
  return lewat >= JEDA_HARI ? 0 : Math.ceil(JEDA_HARI - lewat);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const { baris } = await bacaAkun(Number(user.id));
    const sisa = sisaHari(baris.username_diubah_pada);
    return {
      username: baris.username ?? "",
      boleh_ganti: sisa === 0,
      sisa_hari: sisa,
      jeda_hari: JEDA_HARI,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      sandi?: string;
    };

    const { baris, adaKolom } = await bacaAkun(Number(user.id));

    const sisa = sisaHari(baris.username_diubah_pada);
    if (sisa > 0) {
      throw Object.assign(
        new Error(
          `Username baru bisa diganti lagi dalam ${sisa} hari. Batas ini menjaga agar orang lain tidak kehilangan jejak Anda.`,
        ),
        { status: 429 },
      );
    }

    // Aturan bentuk diperiksa SEBELUM sandi: pengguna yang salah ketik
    // username tidak perlu tahu apakah sandinya juga salah.
    const periksa = periksaUsername(body.username ?? "");
    if (!periksa.sah) {
      throw Object.assign(new Error(periksa.pesan), { status: 400 });
    }
    const baru = periksa.bersih;

    if (baru === (baris.username ?? "").toLowerCase()) {
      throw Object.assign(new Error("Username itu sudah dipakai akun Anda sendiri."), { status: 400 });
    }

    const sandi = body.sandi ?? "";
    if (!sandi) {
      throw Object.assign(new Error("Masukkan kata sandi Anda untuk memastikan ini benar-benar Anda."), { status: 400 });
    }
    if (!baris.password_hash || !(await cocokkanSandi(sandi, baris.password_hash))) {
      throw Object.assign(new Error("Kata sandi salah."), { status: 403 });
    }

    // Diperiksa lebih dulu supaya pesannya ramah; kolomnya sendiri unik
    // tanpa peduli huruf besar/kecil, jadi tetap ada penjaga terakhir
    // bila dua orang mengambil nama yang sama pada saat bersamaan.
    const { data: dipakai } = await supabase()
      .from("app_user")
      .select("id")
      .ilike("username", baru)
      .neq("id", Number(user.id))
      .maybeSingle();
    if (dipakai) {
      throw Object.assign(new Error(`Username "${baru}" sudah dipakai anggota lain.`), { status: 409 });
    }

    const perubahan: Record<string, unknown> = { username: baru };
    if (adaKolom) perubahan.username_diubah_pada = new Date().toISOString();

    const { error } = await supabase()
      .from("app_user")
      .update(perubahan)
      .eq("id", Number(user.id));
    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error(`Username "${baru}" sudah dipakai anggota lain.`), { status: 409 });
      }
      console.error("[username] ganti:", error.message);
      throw new Error("Gagal menyimpan username baru.");
    }
    await hapusCacheUser(user.id);

    return { sukses: true, username: baru, tanpa_jeda: !adaKolom };
  });
}
