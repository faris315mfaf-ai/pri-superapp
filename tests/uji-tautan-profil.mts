// Uji tautan profil upload-post ke akun (13 Okt 2026). Murni, tanpa jaringan.
// Jalankan: npx tsx tests/uji-tautan-profil.mts
import {
  bolehDitautkan,
  FILTER_SEMUA,
  FILTER_TANPA_DIVISI,
  hitungPerDivisi,
  periksaTautan,
  pilihanFilterDivisi,
  saringAnggota,
  type AnggotaTautan,
  type BarisProfilTautan,
} from "@/lib/tautan-profil";

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

const a = (id: number, nama: string, username: string, divisi: string, profil = ""): AnggotaTautan => ({
  id: String(id), nama, username, avatar_url: "", divisi, profil,
});
const daftar = [
  a(1, "Budi Santoso", "budi", "Divisi Editor"),
  a(2, "Siti Aminah", "siti.a", "Divisi PALUGODAM", "siti-pri-2"),
  a(3, "Bot Satu", "bot1", "Divisi BOT"),
  a(4, "Bot Dua", "bot2", "Divisi BOT"),
  a(5, "Éka Putri", "eka", "Divisi Editor"),
  a(6, "Tanpa Divisi", "tanpa", ""),
];
const ids = (x: AnggotaTautan[]) => x.map((v) => v.id).join(",");

console.log("\n[A] Pilihan filter divisi");
const pil = pilihanFilterDivisi();
cek("memuat Divisi BOT (di luar DIVISI) dan Divisi Editor", pil.includes("Divisi BOT") && pil.includes("Divisi Editor"));
cek("tanpa duplikat", new Set(pil).size === pil.length);

console.log("\n[B] Saring anggota");
cek("tanpa filter = semua, urut nama", ids(saringAnggota(daftar, "", FILTER_SEMUA)) === "4,3,1,5,2,6", ids(saringAnggota(daftar, "", FILTER_SEMUA)));
cek("filter Divisi BOT = bot1+bot2 (urut nama)", ids(saringAnggota(daftar, "", "Divisi BOT")) === "4,3");
cek("cari 'bot' ketemu lewat username dan nama", ids(saringAnggota(daftar, "bot", FILTER_SEMUA)) === "4,3");
cek("cari + divisi digabung", ids(saringAnggota(daftar, "satu", "Divisi BOT")) === "3");
cek("cari + divisi salah = kosong", saringAnggota(daftar, "satu", "Divisi Editor").length === 0);
cek("diakritik diabaikan: 'eka' menemukan 'Éka'", ids(saringAnggota(daftar, "eka", FILTER_SEMUA)) === "5");
cek("beberapa kata: 'siti amin'", ids(saringAnggota(daftar, "siti amin", FILTER_SEMUA)) === "2");
cek("huruf besar diabaikan", ids(saringAnggota(daftar, "BUDI", FILTER_SEMUA)) === "1");
cek("filter tanpa divisi", ids(saringAnggota(daftar, "", FILTER_TANPA_DIVISI)) === "6");
cek("batas memotong hasil", saringAnggota(daftar, "", FILTER_SEMUA, 2).length === 2);
cek("tidak mengubah daftar asal", daftar[0].id === "1" && daftar.length === 6);
const per = hitungPerDivisi(daftar);
cek("hitung per divisi", per.get("Divisi BOT") === 2 && per.get("Divisi Editor") === 2 && per.get(FILTER_TANPA_DIVISI) === 1);

console.log("\n[C] Aturan tautan");
const b = (id: number, key: string, uid: number | null, penyedia = "upload-post", jenis = "pengguna"): BarisProfilTautan => ({
  id, profile_key: key, user_id: uid, penyedia, jenis,
});
const dasar = { userId: 10, profil: "tvjkt", namaAnggota: "Bot Satu", ganti: false };
let r = periksaTautan({ ...dasar, pemilikProfil: [], milikAnggota: [] });
cek("profil bebas + anggota belum punya = boleh, insert", r.ok && r.idMilik === null && !r.idempoten, r);
r = periksaTautan({ ...dasar, pemilikProfil: [b(1, "tvjkt", 99)], milikAnggota: [] });
cek("profil milik anggota lain = 409", !r.ok && r.status === 409 && /anggota lain/.test(r.pesan), r);
r = periksaTautan({ ...dasar, pemilikProfil: [b(1, "tvjkt", 10), b(2, "tvjkt", 99, "postiz")], milikAnggota: [b(1, "tvjkt", 10)] });
cek("baris kedua (penyedia lain) milik orang lain tetap ditolak — bukan lolos diam-diam", !r.ok && r.status === 409, r);
r = periksaTautan({ ...dasar, pemilikProfil: [b(3, "tvjkt", null, "upload-post", "bot")], milikAnggota: [] });
cek("profil terpakai jenis lain tanpa user = 409", !r.ok && r.status === 409 && /bot/.test(r.pesan), r);
r = periksaTautan({ ...dasar, pemilikProfil: [b(1, "tvjkt", 10)], milikAnggota: [b(1, "tvjkt", 10)] });
cek("sudah tertaut ke anggota yang sama = idempoten", r.ok && r.idempoten && r.idMilik === 1, r);
r = periksaTautan({ ...dasar, pemilikProfil: [], milikAnggota: [b(5, "lama", 10)] });
cek("anggota punya profil lain tanpa ganti = 409", !r.ok && r.status === 409 && /ganti=true/.test(r.pesan), r);
r = periksaTautan({ ...dasar, ganti: true, pemilikProfil: [], milikAnggota: [b(5, "lama", 10)] });
cek("dengan ganti = boleh, update baris lama", r.ok && r.idMilik === 5 && !r.idempoten, r);
r = periksaTautan({ ...dasar, ganti: true, pemilikProfil: [], milikAnggota: [b(5, "lama", 10), b(6, "lama2", 10, "postiz")] });
cek("data ganda milik anggota = 409 walau ganti", !r.ok && r.status === 409 && /ganda/.test(r.pesan), r);
r = periksaTautan({ ...dasar, pemilikProfil: [b(1, "tvjkt", 10)], milikAnggota: [b(1, "tvjkt", 10), b(7, "x", 10, "postiz")] });
cek("data ganda tertangkap sebelum idempoten", !r.ok && /ganda/.test(r.pesan), r);

console.log("\n[D] Sasaran tautan");
cek("anggota aktif boleh", bolehDitautkan({ aktif: true, status: "aktif", role: "anggota" }).ok);
cek("akun bot (role anggota) boleh", bolehDitautkan({ aktif: true, status: "aktif", role: "anggota" }).ok);
cek("nonaktif ditolak", !bolehDitautkan({ aktif: false, status: "aktif", role: "anggota" }).ok);
cek("status belum aktif ditolak", !bolehDitautkan({ aktif: true, status: "menunggu", role: "anggota" }).ok);
cek("master ditolak", !bolehDitautkan({ aktif: true, status: "aktif", role: "master" }).ok);
cek("superadmin ditolak", !bolehDitautkan({ aktif: true, status: "aktif", role: "superadmin" }).ok);
cek("null aman", !bolehDitautkan({ aktif: null, status: null, role: null }).ok);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
