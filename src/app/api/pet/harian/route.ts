// /api/pet/harian — HADIAH LOGIN HARIAN (5 Sep 2026).
//
// Tiap hari (WIB) pengguna bisa mengklaim koin sekali. Kalender 7 hari
// beruntun: hari ke-1..6 = bonus dasar (bawaan 20 = 10 koin × 2, diatur
// master lewat koin_bonus_login_harian), hari ke-7 = dua kali lipat, lalu
// siklus mulai lagi. Melewatkan sehari → beruntun kembali ke hari 1.
//
// Idempoten lewat buku besar koin_transaksi UNIQUE (user, aktivitas,
// referensi=tanggal WIB): klaim dua kali di hari yang sama diabaikan.
// GET  → keadaan (hari_ke, sudah_klaim, kalender, streak)
// POST → klaim
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bacaBonusKoin, saldoKoin } from "@/lib/koin";

export const dynamic = "force-dynamic";

const AKTIVITAS = "login_harian";

function tanggalWib(offsetHari = 0): string {
  return new Date(Date.now() + 7 * 3600_000 + offsetHari * 86_400_000).toISOString().slice(0, 10);
}

type Keadaan = {
  hari_ke: number;
  sudah_klaim: boolean;
  streak: number;
  koin_hari_ini: number;
  kalender: { hari: number; koin: number; diklaim: boolean; hari_ini: boolean }[];
  saldo: number;
};

async function keadaan(uid: number): Promise<Keadaan> {
  const db = supabase();
  const [{ data: rows }, bonus, saldo] = await Promise.all([
    db
      .from("koin_transaksi")
      .select("referensi")
      .eq("user_id", uid)
      .eq("aktivitas", AKTIVITAS)
      .order("referensi", { ascending: false })
      .limit(40),
    bacaBonusKoin(),
    saldoKoin(uid),
  ]);
  const dasar = Math.max(0, Math.floor(bonus.login_harian ?? 20));
  const hariIni = tanggalWib();
  const diklaim = new Set((rows ?? []).map((r) => String(r.referensi)));
  const sudah = diklaim.has(hariIni);
  // Beruntun: hitung mundur dari hari ini (bila sudah klaim) atau kemarin.
  let streak = 0;
  for (let i = sudah ? 0 : 1; i < 40; i++) {
    if (diklaim.has(tanggalWib(-i))) streak += 1;
    else break;
  }
  // Hari ke berapa dalam siklus 7: klaim berikutnya (atau hari ini bila sudah).
  const posisi = sudah ? streak : streak + 1; // 1..∞
  const hariKe = ((posisi - 1) % 7) + 1;
  const koin = (h: number) => (h === 7 ? dasar * 2 : dasar);
  const kalender = Array.from({ length: 7 }, (_, i) => {
    const hari = i + 1;
    return { hari, koin: koin(hari), diklaim: sudah ? hari <= hariKe : hari < hariKe, hari_ini: hari === hariKe };
  });
  return { hari_ke: hariKe, sudah_klaim: sudah, streak, koin_hari_ini: koin(hariKe), kalender, saldo };
}

export async function GET(request: Request) {
  return bungkus(async () => keadaan(Number((await pastikanMasuk(request)).id)));
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const uid = Number(user.id);
    const k = await keadaan(uid);
    if (k.sudah_klaim) return { ...k, pesan: "Hadiah hari ini sudah diklaim. Sampai jumpa besok!" };
    if (k.koin_hari_ini <= 0) return { ...k, pesan: "Hadiah login sedang dimatikan master." };
    const { error } = await supabase()
      .from("koin_transaksi")
      .upsert(
        { user_id: uid, jumlah: k.koin_hari_ini, aktivitas: AKTIVITAS, referensi: tanggalWib() },
        { onConflict: "user_id,aktivitas,referensi", ignoreDuplicates: true },
      );
    if (error) throw new Error("Gagal mencatat hadiah login.");
    const baru = await keadaan(uid);
    return {
      ...baru,
      pesan: `+${k.koin_hari_ini} koin! Hari ke-${k.hari_ke} dari 7${k.hari_ke === 7 ? " — bonus dua kali lipat 🎉" : ""}.`,
    };
  });
}
