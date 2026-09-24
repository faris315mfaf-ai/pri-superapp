// Uji struktur DPD/DPC (lib/struktur, 24 Sep 2026) — murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-struktur-daerah.mts
import {
  adalahDaerah,
  butuhSubDivisi,
  deskripsiStruktur,
  DIVISI,
  DIVISI_BIASA,
  kategoriStruktur,
  pastikanStrukturSah,
  rapikanNamaDaerah,
  subTersimpan,
} from "@/lib/struktur";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i) : "");
  }
};
const melempar = (f: () => void) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

console.log("\n[A] Pengenal");
cek("DPD & DPC ada di DIVISI", (DIVISI as readonly string[]).includes("DPD") && (DIVISI as readonly string[]).includes("DPC"));
cek("DPD/DPC tidak ikut daftar divisi biasa", !(DIVISI_BIASA as readonly string[]).includes("DPD") && !(DIVISI_BIASA as readonly string[]).includes("DPC"));
cek("adalahDaerah", adalahDaerah("DPD") && adalahDaerah(" DPC ") && !adalahDaerah("Divisi HR") && !adalahDaerah(null));
cek("kategori dpd/dpc", kategoriStruktur("DPD") === "dpd" && kategoriStruktur("DPC") === "dpc");
cek("kategori lama tetap", kategoriStruktur("Divisi Zona") === "zona" && kategoriStruktur("Divisi HR") === "divisi");
cek("butuh sub", butuhSubDivisi("DPD") && butuhSubDivisi("DPC") && !butuhSubDivisi("Divisi HR"));

console.log("\n[B] Rapikan nama");
cek("spasi berlebih", rapikanNamaDaerah("  Jawa   Barat ") === "Jawa Barat");
cek("awalan DPD dilepas", rapikanNamaDaerah("DPD Jawa Barat") === "Jawa Barat");
cek("awalan dpc. dilepas", rapikanNamaDaerah("dpc. Kota Bandung") === "Kota Bandung");
cek("kata berawalan dpd TIDAK dipotong", rapikanNamaDaerah("Dpdxyz") === "Dpdxyz");
cek("maks 80", rapikanNamaDaerah("a".repeat(120)).length === 80);
cek("subTersimpan hanya DPD/DPC", subTersimpan("DPD", "DPD Bali") === "Bali" && subTersimpan("Divisi Zona", "Jawa Barat") === "Jawa Barat");

console.log("\n[C] Validasi");
cek("DPD dengan nama sah", !melempar(() => pastikanStrukturSah("DPD", "Jawa Barat")));
cek("DPD tanpa nama ditolak", melempar(() => pastikanStrukturSah("DPD", "")));
cek("DPC nama 1 huruf ditolak", melempar(() => pastikanStrukturSah("DPC", "A")));
cek("DPD hanya 'DPD' ditolak", melempar(() => pastikanStrukturSah("DPD", "DPD")));
cek("zona tetap wajib dari daftar", melempar(() => pastikanStrukturSah("Divisi Zona", "Antah Berantah")));
cek("divisi biasa tanpa sub tetap sah", !melempar(() => pastikanStrukturSah("Divisi HR", "")));

console.log("\n[D] Tampilan");
cek("deskripsi DPD", deskripsiStruktur({ divisi: "DPD", sub_divisi: "Jawa Barat" }) === "DPD Jawa Barat");
cek("deskripsi kepala DPC", deskripsiStruktur({ divisi: "DPC", sub_divisi: "Kota Bandung", posisi_divisi: "kepala" }) === "Kepala DPC Kota Bandung");
cek("deskripsi divisi biasa tak berubah", deskripsiStruktur({ divisi: "Divisi HR" }) === "Divisi HR");

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
