// /api/tvr/kirim-laporan — KIRIM LAPORAN VIDEO HARI INI ke WhatsApp (5 Sep 2026).
// GET  → keadaan: boleh kirim?, sisa jatah hari ini, kapan boleh lagi, kanal, pratinjau teks.
// POST → kirim (maks 2×/hari WIB, jeda 1 jam) lewat lib/wa-laporan; jejak disimpan.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userEfektifTvr } from "@/lib/sebagai";
import { rekonsiliasiKpiOtomatis } from "@/lib/kpi-otomatis";
import { bacaKonfigWaLaporan, BATAS_PER_HARI, JEDA_MENIT, kirimLaporanWa } from "@/lib/wa-laporan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const URUTAN = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];
const LABEL: Record<string, string> = { instagram: "INSTAGRAM", tiktok: "TIKTOK", youtube: "YOUTUBE", facebook: "FACEBOOK", threads: "THREADS", twitter: "X" };

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function awalHariWibIso(): string {
  return new Date(Date.parse(`${tanggalWib()}T00:00:00+07:00`)).toISOString();
}

async function susunTeks(uid: number, nama: string, tanggal: string) {
  const db = supabase();
  const [{ data: tercatat }, { data: pending }] = await Promise.all([
    db.from("laporan_video").select("platform, url_video, dibuat_pada").eq("user_id", uid).eq("tanggal_wib", tanggal).order("dibuat_pada", { ascending: true }).limit(500),
    db.from("laporan_video_pending").select("platform, url_video").eq("user_id", uid).eq("tanggal_wib", tanggal).eq("status", "menunggu").limit(100),
  ]);
  const per: Record<string, string[]> = {};
  let jumlah = 0;
  for (const b of tercatat ?? []) {
    const pf = String(b.platform ?? "").toLowerCase();
    const url = String(b.url_video ?? "").trim();
    if (!url) continue;
    if (!per[pf]) per[pf] = [];
    if (per[pf].includes(url)) continue;
    per[pf].push(url);
    jumlah += 1;
  }
  const platforms = [...URUTAN.filter((p) => per[p]?.length), ...Object.keys(per).filter((p) => !URUTAN.includes(p))];
  const baris: string[] = [`*LAPORAN VIDEO TV RAKYAT SAYA*`, `Nama: ${nama}`, `Tanggal: ${tanggal}`, `Total: ${jumlah} video`, ""];
  for (const p of platforms) {
    baris.push(`*${LABEL[p] ?? p.toUpperCase()}* (${per[p].length})`);
    per[p].forEach((u, i) => baris.push(`${i + 1}. ${u}`));
    baris.push("");
  }
  if ((pending ?? []).length > 0) {
    baris.push(`_Menunggu ACC HR (${pending!.length}):_`);
    for (const b of pending ?? []) baris.push(`- ${String(b.url_video ?? "")}`);
    baris.push("");
  }
  baris.push(`Dikirim otomatis dari PRI SuperApp`);
  return { teks: baris.join("\n").trim(), jumlah, menunggu: (pending ?? []).length, per };
}

async function keadaan(uid: number) {
  const db = supabase();
  const { data: riwayat } = await db.from("laporan_kirim_wa").select("dikirim_pada, kanal, jumlah_video, status").eq("user_id", uid).gte("dikirim_pada", awalHariWibIso()).order("dikirim_pada", { ascending: false });
  const hariIni = (riwayat ?? []).filter((r) => r.status === "terkirim");
  const terakhir = hariIni[0] ? Date.parse(String(hariIni[0].dikirim_pada)) : 0;
  const berikutnya = terakhir ? terakhir + JEDA_MENIT * 60_000 : 0;
  const konfig = await bacaKonfigWaLaporan();
  let alasan = "";
  if (konfig.kanal === "belum") alasan = "Master belum mengatur tujuan WhatsApp (grup Fonnte / nomor Convia) di Panel Master.";
  else if (hariIni.length >= BATAS_PER_HARI) alasan = `Jatah hari ini habis (${BATAS_PER_HARI}×). Kirim lagi besok.`;
  else if (berikutnya > Date.now()) alasan = `Baru bisa dikirim lagi ${Math.ceil((berikutnya - Date.now()) / 60_000)} menit lagi.`;
  return {
    boleh: !alasan,
    alasan,
    terkirim_hari_ini: hariIni.length,
    batas_per_hari: BATAS_PER_HARI,
    jeda_menit: JEDA_MENIT,
    berikutnya_pada: berikutnya > Date.now() ? new Date(berikutnya).toISOString() : null,
    kanal: konfig.kanal,
    riwayat: (riwayat ?? []).map((r) => ({ dikirim_pada: String(r.dikirim_pada), kanal: String(r.kanal), jumlah_video: Number(r.jumlah_video), status: String(r.status) })),
  };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await userEfektifTvr(request);
    const uid = Number(user.id);
    const tanggal = tanggalWib();
    await rekonsiliasiKpiOtomatis(uid, { anggaranMs: 12_000 });
    const [k, t] = await Promise.all([keadaan(uid), susunTeks(uid, user.nama, tanggal)]);
    return { ...k, tanggal, pratinjau: t.teks, jumlah: t.jumlah, menunggu: t.menunggu, per_platform: t.per };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await userEfektifTvr(request);
    const uid = Number(user.id);
    const k = await keadaan(uid);
    if (!k.boleh) throw Object.assign(new Error(k.alasan), { status: 429 });
    const t = await susunTeks(uid, user.nama, tanggalWib());
    if (t.jumlah === 0 && t.menunggu === 0) throw Object.assign(new Error("Belum ada video hari ini untuk dilaporkan."), { status: 400 });
    const db = supabase();
    try {
      const hasil = await kirimLaporanWa(t.teks);
      await db.from("laporan_kirim_wa").insert({ user_id: uid, kanal: hasil.kanal, tujuan: hasil.tujuan, jumlah_video: t.jumlah, status: "terkirim", pesan: t.teks.slice(0, 4000) });
      return { ...(await keadaan(uid)), sukses: true, kanal_dipakai: hasil.kanal, jumlah: t.jumlah };
    } catch (e) {
      const pesan = e instanceof Error ? e.message : "gagal";
      await db.from("laporan_kirim_wa").insert({ user_id: uid, kanal: k.kanal, tujuan: "", jumlah_video: t.jumlah, status: "gagal", pesan: pesan.slice(0, 500) });
      throw e;
    }
  });
}
