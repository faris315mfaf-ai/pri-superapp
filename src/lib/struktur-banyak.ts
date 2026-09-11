// ============================================================
// Validasi STRUKTUR GANDA di sisi server (11 Sep 2026).
//
// Satu orang boleh memegang beberapa struktur. Yang masuk ke database
// harus lolos aturan yang sama dengan struktur tunggal — divisi dikenal,
// sub-divisi wajib untuk Zona & Sayap — plus dua aturan tambahan:
// tidak boleh kembar, dan tidak boleh lebih dari MAKS_STRUKTUR.
// ============================================================
import {
  MAKS_STRUKTUR,
  kunciStruktur,
  pastikanStrukturSah,
  type StrukturSatuan,
} from "@/lib/struktur";

/**
 * Bersihkan & periksa daftar struktur dari klien. Melempar Error
 * (status 400) bila ada yang tidak sah.
 */
export function pastikanDaftarStrukturSah(
  mentah: unknown,
  sayapTambahan: readonly string[] = [],
): StrukturSatuan[] {
  if (mentah == null) return [];
  if (!Array.isArray(mentah)) {
    throw Object.assign(new Error("Daftar struktur tidak terbaca."), { status: 400 });
  }
  if (mentah.length > MAKS_STRUKTUR) {
    throw Object.assign(
      new Error(`Paling banyak ${MAKS_STRUKTUR} struktur untuk satu orang.`),
      { status: 400 },
    );
  }
  const keluar: StrukturSatuan[] = [];
  const sudah = new Set<string>();
  for (const x of mentah) {
    const o = (x ?? {}) as Record<string, unknown>;
    const divisi = String(o.divisi ?? "").trim();
    if (!divisi) continue;
    const sub = String(o.sub_divisi ?? "").trim();
    pastikanStrukturSah(divisi, sub, sayapTambahan);
    const satu: StrukturSatuan = {
      divisi,
      sub_divisi: sub,
      jabatan_sayap: String(o.jabatan_sayap ?? "").trim(),
    };
    const k = kunciStruktur(satu);
    if (sudah.has(k)) {
      throw Object.assign(new Error("Ada struktur yang dipilih dua kali."), { status: 400 });
    }
    sudah.add(k);
    keluar.push(satu);
  }
  return keluar;
}
