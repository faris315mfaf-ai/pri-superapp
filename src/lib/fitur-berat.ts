// ============================================================
// Daftar fitur berat yang bisa dimatikan master (MURNI — aman untuk klien).
// Dipindah dari lib/sakelar (28 Sep 2026): layar Panel Master mengimpor
// daftar ini, dan dulu ikut menyeret lib/sakelar → lib/supabase (modul
// server) ke dalam bundel peramban.
// ============================================================

export const DAFTAR_FITUR_BERAT = [
  {
    kunci: "ludo",
    label: "Ludo Robot",
    keterangan: "Permainan multipemain — tiap pemain menanyakan keadaan ruang ke server 1,5 detik sekali.",
  },
  {
    kunci: "pet_beranda",
    label: "Robot & hewan melayang di beranda",
    keterangan: "Dua komponen animasi + pemuatan data pet setiap kali beranda dibuka.",
  },
  {
    kunci: "juara_efek",
    label: "Running text & kembang api juara",
    keterangan: "Kanvas kembang api dan kueri juara komentar di beranda semua pengguna.",
  },
  {
    kunci: "asisten",
    label: "Asisten AI",
    keterangan: "Panggilan model AI — paling mahal dan lambat saat server sibuk.",
  },
] as const;

export type KunciFiturBerat = (typeof DAFTAR_FITUR_BERAT)[number]["kunci"];
