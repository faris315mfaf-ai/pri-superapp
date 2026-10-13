// Data contoh Ruang Bot — dipakai selama bot belum tersambung ke server.
// SEMUA angka dan judul di sini fiktif.

import type { BotContoh, HasilHariIni, ItemAcc, SumberContoh, TahapBot } from "./tipe";

export const MAKS_KUOTA_AWAL = 3;

export const NAMA_TAHAP: Record<TahapBot, string> = {
  cari: "Pencarian",
  edit: "Edit",
  posting: "Posting",
  istirahat: "Istirahat",
};

export const WARNA_TAHAP: Record<TahapBot, string> = {
  cari: "#38bdf8",
  edit: "#a78bfa",
  posting: "#34d399",
  istirahat: "#fbbf24",
};

export const URUTAN_TAHAP: TahapBot[] = ["cari", "edit", "posting", "istirahat"];

export const BOT_CONTOH: BotContoh[] = [
  {
    id: "bot1",
    nama: "Raka",
    peran: "Redaktur Pencari",
    persona: "Teliti membaca situasi. Mengejar berita yang baru terbit dan paling cepat naik tayangannya.",
    warna: "#f08a3c",
    handle: "@tvr.raka",
    platform: "Instagram",
    mode: "otomatis",
    rupa: { kaus: "#f08a3c", bayangan: "#c76a24", celana: "#3a4a78", kulit: "#e8b48a", rambut: "#3b2418", gayaRambut: "topi", warnaTopi: "#2d6a4f", berhud: true },
    riwayat6Hari: [2, 3, 3, 2, 3, 1],
    jadwalHariIni: ["08:41", "11:15", "15:30"],
    rataTayangan: "12,4 rb",
  },
  {
    id: "bot2",
    nama: "Sinta",
    peran: "Editor Video",
    persona: "Rapi soal tampilan. Memilih potongan terbaik, menulis hook, dan menjaga template tetap konsisten.",
    warna: "#a56bd1",
    handle: "@tvr.sinta",
    platform: "TikTok",
    mode: "acc",
    rupa: { kaus: "#a56bd1", bayangan: "#7f48a8", celana: "#2f3358", kulit: "#d9a07a", rambut: "#2a1a2e", gayaRambut: "panjang" },
    riwayat6Hari: [1, 2, 3, 3, 2, 2],
    jadwalHariIni: ["09:20", "13:05", "17:40"],
    rataTayangan: "8,9 rb",
  },
  {
    id: "bot3",
    nama: "Dimas",
    peran: "Pengunggah",
    persona: "Disiplin soal aturan. Memeriksa caption, kredit sumber, kuota, dan pagar dobel sebelum memposting.",
    warna: "#4cae6b",
    handle: "@tvr.dimas",
    platform: "YouTube",
    mode: "acc",
    rupa: { kaus: "#4cae6b", bayangan: "#348650", celana: "#4a3a2a", kulit: "#f0c29a", rambut: "#5a3a1a", gayaRambut: "pendek", kacamata: true },
    riwayat6Hari: [3, 2, 2, 3, 3, 2],
    jadwalHariIni: ["08:12", "12:48", "16:20"],
    rataTayangan: "15,1 rb",
  },
];

export const KUOTA_AWAL: Record<string, number> = { bot1: 1, bot2: 0, bot3: 1 };

export const JUDUL_CONTOH = [
  "Banjir rendam jalur Pantura",
  "Timnas menang tipis di laga uji coba",
  "Harga cabai turun di pasar induk",
  "Konser akbar padati stadion",
  "Kebakaran pasar tradisional berhasil dipadamkan",
  "Jembatan baru dibuka untuk umum",
  "Festival kuliner nusantara dimulai",
  "Hujan deras, warga diminta waspada",
];

export const SUMBER_AWAL: SumberContoh[] = [
  { akun: "@ntv", platform: "Instagram", kategori: "NEWS", botId: "bot1", kandidat24Jam: 14, terakhirAmbil: "09:02", aktif: true },
  { akun: "@ntv", platform: "TikTok", kategori: "NEWS", botId: "bot1", kandidat24Jam: 9, terakhirAmbil: "09:02", aktif: true },
  { akun: "NTV Channel", platform: "YouTube (feed RSS)", kategori: "NEWS", botId: "bot2", kandidat24Jam: 6, terakhirAmbil: "08:55", aktif: true },
  { akun: "@kompastv", platform: "TikTok", kategori: "HIBURAN", botId: "bot3", kandidat24Jam: 11, terakhirAmbil: "09:00", aktif: true },
  { akun: "@metrotv", platform: "Instagram", kategori: "NEWS", botId: "bot3", kandidat24Jam: 0, terakhirAmbil: "kemarin", aktif: false },
];

export const BLOKIR_AWAL = ["judi online", "konten SARA", "@akun-spam-contoh"];

export const ACC_AWAL: ItemAcc[] = [
  {
    id: 1,
    judul: "Banjir rendam jalur Pantura",
    hook: ["BANJIR!", "Jalur Pantura terendam, arus dialihkan"],
    kategori: "NEWS",
    akunSumber: "@ntv",
    platformSumber: "Instagram",
    botId: "bot2",
    platformTujuan: "TikTok",
    durasiDetik: 38,
    waktuTayang: "Hari ini 12:30",
    gradasi: ["#38bdf8", "#1e3a8a"],
    caption: "Banjir rendam jalur Pantura, arus lalu lintas dialihkan.\n\nSumber: @ntv (Instagram)\n#berita #banjir #pantura",
    tanda: [
      { jenis: "ok", teks: "Kredit sumber ada" },
      { jenis: "ok", teks: "Belum pernah dipakai bot lain" },
      { jenis: "warn", teks: "Konten akun media lain" },
    ],
  },
  {
    id: 2,
    judul: "Festival kuliner nusantara dimulai",
    hook: ["SERU!", "Festival kuliner nusantara resmi dibuka"],
    kategori: "HIBURAN",
    akunSumber: "@kompastv",
    platformSumber: "TikTok",
    botId: "bot3",
    platformTujuan: "YouTube",
    durasiDetik: 27,
    waktuTayang: "Hari ini 13:05",
    gradasi: ["#fb923c", "#7c2d12"],
    caption: "Festival kuliner nusantara resmi dibuka. Ada ratusan tenda makanan khas daerah.\n\nSumber: @kompastv (TikTok)\n#kuliner #festival",
    tanda: [
      { jenis: "ok", teks: "Kredit sumber ada" },
      { jenis: "ok", teks: "Belum pernah dipakai bot lain" },
      { jenis: "ok", teks: "Durasi sesuai template" },
    ],
  },
  {
    id: 3,
    judul: "Timnas menang tipis di laga uji coba",
    hook: ["MENANG!", "Timnas menang tipis lewat gol di menit akhir"],
    kategori: "NEWS",
    akunSumber: "NTV Channel",
    platformSumber: "YouTube",
    botId: "bot2",
    platformTujuan: "Instagram",
    durasiDetik: 44,
    waktuTayang: "Hari ini 15:10",
    gradasi: ["#a3e635", "#14532d"],
    caption: "Timnas menang tipis di laga uji coba.\n\nSumber: NTV Channel (YouTube)\n#timnas #sepakbola",
    tanda: [
      { jenis: "ok", teks: "Kredit sumber ada" },
      { jenis: "warn", teks: "Durasi 44 dtk, mendekati batas 45" },
      { jenis: "ok", teks: "Belum pernah dipakai bot lain" },
    ],
  },
];

export const HASIL_AWAL: HasilHariIni[] = [
  { judul: "Hujan deras, warga diminta waspada", botId: "bot1", platform: "Instagram", status: "tayang", waktu: "08:41", gradasi: ["#38bdf8", "#1e3a8a"] },
  { judul: "Harga cabai turun di pasar induk", botId: "bot3", platform: "YouTube", status: "menunggu-acc", waktu: "08:12", gradasi: ["#f59e0b", "#7c2d12"] },
];
