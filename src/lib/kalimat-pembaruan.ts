// ============================================================
// Kalimat keadaan penyegar angka video (26 Sep 2026) — dipakai panel
// Insight per Kategori dan panel Video per Akun di TV Rakyat Nasional.
// Murni (tanpa server), aman untuk komponen klien.
// ============================================================
import { formatAngkaRingkas, jamWIB, waktuJelasWIB } from "@/lib/format";
import type { PembaruanMetrikVideo } from "@/services";

export function kalimatPembaruan(p: PembaruanMetrikVideo | null | undefined): string {
  if (!p || !p.terakhir) {
    return "Angka ditarik otomatis dari upload-post — penarikan pertama sedang disiapkan.";
  }
  if (p.jeda_sampai && Date.parse(p.jeda_sampai) > Date.now()) {
    return `Penarikan sedang menunggu kuota upload-post pulih (${jamWIB(p.jeda_sampai)} WIB).`;
  }
  const bagian = [
    "Video hari ini disegarkan ±tiap 20 menit; video lain bergiliran dari yang terlama ke terbaru, video kata kunci didahulukan",
  ];
  const s = p.siklus;
  if (s && s.total > 0) {
    const kataKunci =
      s.prioritas === 0
        ? ""
        : s.posisi >= s.prioritas
          ? " (video kata kunci sudah semua)"
          : ` (video kata kunci ${Math.floor((s.posisi / s.prioritas) * 100)}%)`;
    bagian.push(`putaran ke-${s.ke}: ${String(s.persen).replace(".", ",")}%${kataKunci}`);
  }
  bagian.push(`terakhir ${waktuJelasWIB(p.terakhir)}`);
  if (p.menunggu && p.menunggu.hari_ini > 0) bagian.push(`${formatAngkaRingkas(p.menunggu.hari_ini)} video hari ini menunggu giliran`);
  return bagian.join(" · ");
}

/** "12,3rb dari 84rb video akun tersambung sudah berangka" — atau "" bila belum ada data. */
export function kalimatKatalog(p: PembaruanMetrikVideo | null | undefined): string {
  const k = p?.katalog;
  if (!k || k.video === 0) return "";
  return `${formatAngkaRingkas(k.berangka)} dari ${formatAngkaRingkas(k.video)} video di ${k.akun} akun tersambung sudah berangka${
    k.akun_lengkap < k.akun ? ` · katalog ${k.akun_lengkap}/${k.akun} akun lengkap` : ""
  }`;
}
