// Uji gerbang RUANG BOT & Divisi BOT (13 Okt 2026). Murni — tanpa jaringan.
// Jalankan: npx tsx tests/uji-ruang-bot.mts
import { bolehRuangBot } from "@/lib/peran";
import { DIVISI, DIVISI_BOT, adalahBot, pastikanStrukturSah } from "@/lib/struktur";
import { KONFIG_TAB, TAB_PER_ROLE } from "@/components/bottom-nav";
import { WARNA_DOCK } from "@/components/warna-dock";
import { LABEL_LAYAR_AUDIT } from "@/lib/audit-jenis";

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

console.log("\n[A] bolehRuangBot: HANYA role master");
cek("master boleh", bolehRuangBot({ role: "master" }) === true);
for (const r of ["super_admin", "superadmin", "admin_hr", "admin_tv", "ketua", "anggota", ""]) {
  cek(`role "${r}" ditolak`, bolehRuangBot({ role: r }) === false);
}
cek("null ditolak", bolehRuangBot(null) === false);
cek("undefined ditolak", bolehRuangBot(undefined) === false);
cek("objek kosong ditolak", bolehRuangBot({}) === false);

console.log("\n[B] Tab Ruang Bot di dock: semua peran kecuali superadmin (14 Okt 2026: pengguna umum = mode lihat)");
for (const [role, tabs] of Object.entries(TAB_PER_ROLE)) {
  const punya = tabs.includes("ruangbot");
  const harus = role !== "superadmin";
  cek(`TAB_PER_ROLE.${role} ${harus ? "memuat" : "TIDAK memuat"} ruangbot`, punya === harus);
}
cek("KONFIG_TAB.ruangbot ada (label + ikon)", !!KONFIG_TAB.ruangbot?.label && !!KONFIG_TAB.ruangbot?.ikon);
cek("label tab = Ruang Bot", KONFIG_TAB.ruangbot.label === "Ruang Bot");
cek("WARNA_DOCK.ruangbot punya dua warna", Array.isArray(WARNA_DOCK.ruangbot) && WARNA_DOCK.ruangbot.length === 2);
cek("LABEL_LAYAR_AUDIT.ruangbot ada", LABEL_LAYAR_AUDIT.ruangbot === "Ruang Bot");
cek("urutan tab master: ruangbot tepat setelah tvrku",
  TAB_PER_ROLE.master.indexOf("ruangbot") === TAB_PER_ROLE.master.indexOf("tvrku") + 1);

console.log("\n[C] Divisi BOT");
cek("adalahBot: Divisi BOT", adalahBot({ divisi: DIVISI_BOT }) === true);
cek("adalahBot: spasi di tepi diabaikan", adalahBot({ divisi: `  ${DIVISI_BOT} ` }) === true);
cek("adalahBot: divisi lain bukan bot", adalahBot({ divisi: "Divisi PALUGODAM" }) === false);
cek("adalahBot: kosong/null/undefined bukan bot", !adalahBot({ divisi: "" }) && !adalahBot({ divisi: null }) && !adalahBot(null) && !adalahBot(undefined));
cek("adalahBot: huruf kecil BUKAN bot (persis)", adalahBot({ divisi: "divisi bot" }) === false);
cek("Divisi BOT TIDAK ada di daftar DIVISI (tak bisa dipilih manusia)", !(DIVISI as readonly string[]).includes(DIVISI_BOT));
let ditolak = false;
try {
  pastikanStrukturSah(DIVISI_BOT, "");
} catch (e) {
  ditolak = (e as { status?: number }).status === 400;
}
cek("pastikanStrukturSah menolak Divisi BOT (400)", ditolak);

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
