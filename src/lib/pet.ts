// ============================================================
// PET ROBOT (percobaan master, 3 Sep 2026) — aturan permainan yang dipakai
// SERVER dan KLIEN bersama (tanpa akses DB di sini):
//   • tiga katalog toko: AKSESORIS (30), MAKANAN (30), SPAREPART (30),
//   • rumus penurunan kebutuhan seiring waktu (energi ikut aktivitas harian),
//   • efek makanan & perawatan, XP → level, suasana hati, kelas animasi.
// Terinspirasi POU: robot dirawat (makan dari inventori, main, mandi, tidur).
// ============================================================

export type JenisRobot = "pria" | "wanita";
export type SlotAksesoris =
  "kepala" | "mata" | "leher" | "badan" | "punggung" | "tangan" | "aura";
export type BagianSparepart = "kepala" | "mata" | "tubuh" | "kaki" | "tangan";
export type Suasana =
  "senang" | "biasa" | "lapar" | "lelah" | "sedih" | "kotor" | "tidur";
/** Perawatan tanpa barang; makan memakai makanan dari inventori (aksi terpisah). */
export type Perawatan = "main" | "mandi";

export type Aksesoris = {
  kode: string;
  nama: string;
  slot: SlotAksesoris;
  harga: number;
  keterangan: string;
  /** Aksesoris generasi 2 (4 Sep 2026): digambar oleh keluarga bentuk `gambar` dengan warna `warna`. */
  gambar?: string;
  warna?: string;
};
export type Makanan = {
  kode: string;
  nama: string;
  emoji: string;
  harga: number;
  efek: { kenyang?: number; energi?: number; senang?: number };
  keterangan: string;
};
export type Sparepart = {
  kode: string;
  nama: string;
  bagian: BagianSparepart;
  harga: number;
  keterangan: string;
  /** Varian warna (4 Sep 2026): memakai bentuk `dasar` dengan warna `warna`. */
  dasar?: string;
  warna?: string;
};
/** Skin eksklusif musiman: hanya bisa DIBELI selama musimnya (bulan WIB), tetapi tetap dimiliki selamanya. */
export type Skin = {
  kode: string;
  nama: string;
  musim: string;
  /** Bulan mulai/akhir (1–12, WIB); boleh melewati pergantian tahun (mis. 12 → 1). */
  mulaiBulan: number;
  akhirBulan: number;
  harga: number;
  /** Warna utama bawaan skin (dipakai bila tidak ada warna custom). */
  warnaUtama: string;
  keterangan: string;
  fitur: string[];
  /** true = tersedia sepanjang tahun (edisi khusus, bukan musiman). */
  selalu?: boolean;
};

// ------------------------------------------------------------
// TOKO 1 — AKSESORIS (30). Kode TIDAK boleh diubah (tersimpan di DB).
// ------------------------------------------------------------
export const KATALOG_AKSESORIS: readonly Aksesoris[] = [
  // kepala (8)
  {
    kode: "topi_pesta",
    nama: "Topi Pesta",
    slot: "kepala",
    harga: 30,
    keterangan: "Kerucut warna-warni, siap merayakan apa saja.",
  },
  {
    kode: "bandana",
    nama: "Bandana Merah",
    slot: "kepala",
    harga: 40,
    keterangan: "Ikat kepala sporty.",
  },
  {
    kode: "pita_besar",
    nama: "Pita Besar",
    slot: "kepala",
    harga: 45,
    keterangan: "Pita manis di sisi kepala.",
  },
  {
    kode: "topi_baseball",
    nama: "Topi Baseball",
    slot: "kepala",
    harga: 60,
    keterangan: "Topi santai bervisor.",
  },
  {
    kode: "topi_koki",
    nama: "Topi Koki",
    slot: "kepala",
    harga: 70,
    keterangan: "Siap memasak oli terbaik.",
  },
  {
    kode: "helm_proyek",
    nama: "Helm Proyek",
    slot: "kepala",
    harga: 75,
    keterangan: "Keselamatan nomor satu.",
  },
  {
    kode: "topi_wisuda",
    nama: "Topi Wisuda",
    slot: "kepala",
    harga: 110,
    keterangan: "Lulus dengan pujian.",
  },
  {
    kode: "mahkota",
    nama: "Mahkota Emas",
    slot: "kepala",
    harga: 150,
    keterangan: "Untuk robot yang berkuasa.",
  },
  // mata (5)
  {
    kode: "kacamata_bulat",
    nama: "Kacamata Bulat",
    slot: "mata",
    harga: 40,
    keterangan: "Gaya cendekia.",
  },
  {
    kode: "kacamata_hitam",
    nama: "Kacamata Hitam",
    slot: "mata",
    harga: 50,
    keterangan: "Terlalu keren untuk silau.",
  },
  {
    kode: "kacamata_hati",
    nama: "Kacamata Hati",
    slot: "mata",
    harga: 55,
    keterangan: "Melihat dunia penuh cinta.",
  },
  {
    kode: "monokel",
    nama: "Monokel",
    slot: "mata",
    harga: 70,
    keterangan: "Satu lensa, seribu wibawa.",
  },
  {
    kode: "penutup_bajak_laut",
    nama: "Penutup Mata Bajak Laut",
    slot: "mata",
    harga: 65,
    keterangan: "Arrr, harta karunnya mana?",
  },
  // leher (5)
  {
    kode: "dasi_kupu",
    nama: "Dasi Kupu-kupu",
    slot: "leher",
    harga: 35,
    keterangan: "Rapi untuk acara resmi.",
  },
  {
    kode: "syal_merah",
    nama: "Syal Merah",
    slot: "leher",
    harga: 45,
    keterangan: "Hangat dan gagah.",
  },
  {
    kode: "dasi_panjang",
    nama: "Dasi Panjang",
    slot: "leher",
    harga: 50,
    keterangan: "Siap rapat penting.",
  },
  {
    kode: "kalung_bintang",
    nama: "Kalung Bintang",
    slot: "leher",
    harga: 80,
    keterangan: "Bintang kecil yang berkilau.",
  },
  {
    kode: "kalung_bunga",
    nama: "Kalung Bunga",
    slot: "leher",
    harga: 60,
    keterangan: "Aloha dari Hawaii.",
  },
  // badan (5)
  {
    kode: "kaos_pri",
    nama: "Kaos PRI",
    slot: "badan",
    harga: 60,
    keterangan: "Kaos merah kebanggaan partai.",
  },
  {
    kode: "rompi",
    nama: "Rompi Kulit",
    slot: "badan",
    harga: 90,
    keterangan: "Rompi cokelat berkelas.",
  },
  {
    kode: "jubah",
    nama: "Jubah Pahlawan",
    slot: "badan",
    harga: 120,
    keterangan: "Jubah ungu berkibar.",
  },
  {
    kode: "apron",
    nama: "Celemek Koki",
    slot: "badan",
    harga: 55,
    keterangan: "Anti cipratan oli.",
  },
  {
    kode: "jas_hitam",
    nama: "Jas Hitam",
    slot: "badan",
    harga: 130,
    keterangan: "Formal maksimal.",
  },
  // tangan (3)
  {
    kode: "balon",
    nama: "Balon",
    slot: "tangan",
    harga: 25,
    keterangan: "Balon merah di tangan kanan.",
  },
  {
    kode: "bendera",
    nama: "Bendera Merah Putih",
    slot: "tangan",
    harga: 40,
    keterangan: "Dikibarkan dengan bangga.",
  },
  {
    kode: "mic",
    nama: "Mikrofon",
    slot: "tangan",
    harga: 65,
    keterangan: "Siap siaran langsung.",
  },
  // punggung (2)
  {
    kode: "sayap",
    nama: "Sayap Malaikat",
    slot: "punggung",
    harga: 200,
    keterangan: "Sepasang sayap putih.",
  },
  {
    kode: "jetpack",
    nama: "Jetpack",
    slot: "punggung",
    harga: 250,
    keterangan: "Semburan api biru di punggung.",
  },
  // aura (2)
  {
    kode: "aura_emas",
    nama: "Aura Emas",
    slot: "aura",
    harga: 300,
    keterangan: "Cahaya keemasan mengelilingi robot.",
  },
  {
    kode: "aura_pelangi",
    nama: "Aura Pelangi",
    slot: "aura",
    harga: 320,
    keterangan: "Cincin warna-warni berputar.",
  },
  // ---- generasi 2 (4 Sep 2026): 40 aksesoris berbasis keluarga bentuk + warna ----
  {
    kode: "beanie_merah",
    nama: "Kupluk Merah",
    slot: "kepala",
    harga: 35,
    gambar: "beanie",
    warna: "#DC2626",
    keterangan: "Rajutan hangat warna merah.",
  },
  {
    kode: "beanie_biru",
    nama: "Kupluk Biru",
    slot: "kepala",
    harga: 35,
    gambar: "beanie",
    warna: "#2563EB",
    keterangan: "Rajutan hangat warna biru.",
  },
  {
    kode: "beanie_hijau",
    nama: "Kupluk Hijau",
    slot: "kepala",
    harga: 35,
    gambar: "beanie",
    warna: "#16A34A",
    keterangan: "Rajutan hangat warna hijau.",
  },
  {
    kode: "topi_jerami",
    nama: "Topi Jerami",
    slot: "kepala",
    harga: 45,
    gambar: "jerami",
    warna: "#F5D06F",
    keterangan: "Adem di sawah, keren di kota.",
  },
  {
    kode: "topi_koboi",
    nama: "Topi Koboi",
    slot: "kepala",
    harga: 60,
    gambar: "koboi",
    warna: "#92400E",
    keterangan: "Yeehaw, robot!",
  },
  {
    kode: "mahkota_perak",
    nama: "Mahkota Perak",
    slot: "kepala",
    harga: 150,
    gambar: "mahkota2",
    warna: "#CBD5E1",
    keterangan: "Bangsawan perak berkilau.",
  },
  {
    kode: "tanduk_merah",
    nama: "Tanduk Merah",
    slot: "kepala",
    harga: 70,
    gambar: "tanduk",
    warna: "#DC2626",
    keterangan: "Sedikit nakal, banyak gaya.",
  },
  {
    kode: "headphone",
    nama: "Headphone DJ",
    slot: "kepala",
    harga: 80,
    gambar: "headphone",
    warna: "#111827",
    keterangan: "Beat-nya kerasa sampai baut.",
  },
  {
    kode: "bando_kucing",
    nama: "Bando Telinga Kucing",
    slot: "kepala",
    harga: 55,
    gambar: "bando",
    warna: "#F472B6",
    keterangan: "Meong versi robot.",
  },
  {
    kode: "ikat_merah_putih",
    nama: "Ikat Kepala Merah Putih",
    slot: "kepala",
    harga: 40,
    gambar: "ikat",
    warna: "#DC2626",
    keterangan: "Semangat kemerdekaan.",
  },
  {
    kode: "kacamata_neon_biru",
    nama: "Kacamata Neon Biru",
    slot: "mata",
    harga: 60,
    gambar: "neon",
    warna: "#22D3EE",
    keterangan: "Menyala di kegelapan.",
  },
  {
    kode: "kacamata_neon_merah",
    nama: "Kacamata Neon Merah",
    slot: "mata",
    harga: 60,
    gambar: "neon",
    warna: "#F87171",
    keterangan: "Menyala di kegelapan.",
  },
  {
    kode: "kacamata_neon_ungu",
    nama: "Kacamata Neon Ungu",
    slot: "mata",
    harga: 60,
    gambar: "neon",
    warna: "#C084FC",
    keterangan: "Menyala di kegelapan.",
  },
  {
    kode: "monokel_emas",
    nama: "Monokel Emas",
    slot: "mata",
    harga: 90,
    gambar: "monokel2",
    warna: "#F59E0B",
    keterangan: "Kelas atas, satu mata.",
  },
  {
    kode: "kacamata_3d",
    nama: "Kacamata 3D",
    slot: "mata",
    harga: 50,
    gambar: "tigad",
    warna: "#EF4444",
    keterangan: "Merah-biru ala bioskop.",
  },
  {
    kode: "kacamata_pilot",
    nama: "Kacamata Pilot",
    slot: "mata",
    harga: 85,
    gambar: "pilot",
    warna: "#78716C",
    keterangan: "Siap lepas landas.",
  },
  {
    kode: "kalung_emas",
    nama: "Kalung Emas",
    slot: "leher",
    harga: 120,
    gambar: "kalung",
    warna: "#F59E0B",
    keterangan: "Bling-bling emas.",
  },
  {
    kode: "kalung_perak",
    nama: "Kalung Perak",
    slot: "leher",
    harga: 90,
    gambar: "kalung",
    warna: "#CBD5E1",
    keterangan: "Berkilau lembut.",
  },
  {
    kode: "dasi_merah_putih",
    nama: "Dasi Merah Putih",
    slot: "leher",
    harga: 45,
    gambar: "dasi2",
    warna: "#DC2626",
    keterangan: "Resmi dan nasionalis.",
  },
  {
    kode: "syal_biru",
    nama: "Syal Biru",
    slot: "leher",
    harga: 40,
    gambar: "syal",
    warna: "#2563EB",
    keterangan: "Hangat di leher baja.",
  },
  {
    kode: "syal_hijau",
    nama: "Syal Hijau",
    slot: "leher",
    harga: 40,
    gambar: "syal",
    warna: "#16A34A",
    keterangan: "Hangat di leher baja.",
  },
  {
    kode: "kalung_mutiara",
    nama: "Kalung Mutiara",
    slot: "leher",
    harga: 110,
    gambar: "mutiara",
    warna: "#F8FAFC",
    keterangan: "Butiran mutiara elegan.",
  },
  {
    kode: "kaos_merah",
    nama: "Kaos Merah",
    slot: "badan",
    harga: 40,
    gambar: "kaos",
    warna: "#DC2626",
    keterangan: "Kaos polos merah.",
  },
  {
    kode: "kaos_biru",
    nama: "Kaos Biru",
    slot: "badan",
    harga: 40,
    gambar: "kaos",
    warna: "#2563EB",
    keterangan: "Kaos polos biru.",
  },
  {
    kode: "kaos_hijau",
    nama: "Kaos Hijau",
    slot: "badan",
    harga: 40,
    gambar: "kaos",
    warna: "#16A34A",
    keterangan: "Kaos polos hijau.",
  },
  {
    kode: "kaos_hitam",
    nama: "Kaos Hitam",
    slot: "badan",
    harga: 40,
    gambar: "kaos",
    warna: "#111827",
    keterangan: "Kaos polos hitam.",
  },
  {
    kode: "jas_putih",
    nama: "Jas Putih",
    slot: "badan",
    harga: 150,
    gambar: "jas",
    warna: "#F8FAFC",
    keterangan: "Rapi seperti dokter robot.",
  },
  {
    kode: "rompi_neon",
    nama: "Rompi Neon",
    slot: "badan",
    harga: 70,
    gambar: "rompi2",
    warna: "#A3E635",
    keterangan: "Terlihat dari jauh.",
  },
  {
    kode: "kaos_pri_hitam",
    nama: "Kaos PRI Hitam",
    slot: "badan",
    harga: 90,
    gambar: "kaospri",
    warna: "#111827",
    keterangan: "Edisi hitam berlogo PRI.",
  },
  {
    kode: "jaket_kulit",
    nama: "Jaket Kulit",
    slot: "badan",
    harga: 130,
    gambar: "jaket",
    warna: "#292524",
    keterangan: "Rocker sejati.",
  },
  {
    kode: "sayap_api",
    nama: "Sayap Api",
    slot: "punggung",
    harga: 200,
    gambar: "sayap2",
    warna: "#F97316",
    keterangan: "Sayap membara.",
  },
  {
    kode: "sayap_es",
    nama: "Sayap Es",
    slot: "punggung",
    harga: 200,
    gambar: "sayap2",
    warna: "#7DD3FC",
    keterangan: "Sayap kristal es.",
  },
  {
    kode: "ransel",
    nama: "Ransel Petualang",
    slot: "punggung",
    harga: 80,
    gambar: "ransel",
    warna: "#92400E",
    keterangan: "Siap mendaki.",
  },
  {
    kode: "tabung_oksigen",
    nama: "Tabung Oksigen",
    slot: "punggung",
    harga: 90,
    gambar: "tabung",
    warna: "#9CA3AF",
    keterangan: "Untuk menyelam ke laut data.",
  },
  {
    kode: "bunga_mawar",
    nama: "Bunga Mawar",
    slot: "tangan",
    harga: 35,
    gambar: "bunga",
    warna: "#EF4444",
    keterangan: "Untuk yang tersayang.",
  },
  {
    kode: "obor",
    nama: "Obor",
    slot: "tangan",
    harga: 70,
    gambar: "obor",
    warna: "#F97316",
    keterangan: "Semangat menyala.",
  },
  {
    kode: "piala",
    nama: "Piala Juara",
    slot: "tangan",
    harga: 160,
    gambar: "piala",
    warna: "#F59E0B",
    keterangan: "Juara komentar sejati.",
  },
  {
    kode: "gitar",
    nama: "Gitar",
    slot: "tangan",
    harga: 140,
    gambar: "gitar",
    warna: "#92400E",
    keterangan: "Jreng!",
  },
  {
    kode: "aura_biru",
    nama: "Aura Biru",
    slot: "aura",
    harga: 180,
    gambar: "aura2",
    warna: "#3B82F6",
    keterangan: "Lingkaran cahaya biru.",
  },
  {
    kode: "aura_ungu",
    nama: "Aura Ungu",
    slot: "aura",
    harga: 180,
    gambar: "aura2",
    warna: "#A855F7",
    keterangan: "Lingkaran cahaya ungu.",
  },
];

// ------------------------------------------------------------
// TOKO 2 — MAKANAN (30). Dibeli → inventori → dimakan satu-satu.
// ------------------------------------------------------------
export const KATALOG_MAKANAN: readonly Makanan[] = [
  {
    kode: "oli_biasa",
    nama: "Oli Biasa",
    emoji: "🛢️",
    harga: 5,
    efek: { kenyang: 12 },
    keterangan: "Bahan bakar harian yang murah.",
  },
  {
    kode: "baterai_aa",
    nama: "Baterai AA",
    emoji: "🔋",
    harga: 8,
    efek: { energi: 12 },
    keterangan: "Setrum kecil pengganjal.",
  },
  {
    kode: "kabel_spageti",
    nama: "Kabel Spageti",
    emoji: "🍝",
    harga: 10,
    efek: { kenyang: 18 },
    keterangan: "Kenyal dan bergizi tembaga.",
  },
  {
    kode: "chip_kentang",
    nama: "Chip Kentang",
    emoji: "🍟",
    harga: 10,
    efek: { kenyang: 10, senang: 6 },
    keterangan: "Renyah, chip silikon rasa kentang.",
  },
  {
    kode: "roti_baut",
    nama: "Roti Baut",
    emoji: "🥐",
    harga: 12,
    efek: { kenyang: 20 },
    keterangan: "Roti isi baut karamel.",
  },
  {
    kode: "susu_pelumas",
    nama: "Susu Pelumas",
    emoji: "🥛",
    harga: 12,
    efek: { kenyang: 8, energi: 8 },
    keterangan: "Halus di sendi.",
  },
  {
    kode: "es_krim_led",
    nama: "Es Krim LED",
    emoji: "🍦",
    harga: 15,
    efek: { senang: 15, kenyang: 5 },
    keterangan: "Dingin dan berkelip.",
  },
  {
    kode: "nasi_goreng",
    nama: "Nasi Goreng",
    emoji: "🍛",
    harga: 18,
    efek: { kenyang: 30 },
    keterangan: "Favorit sejuta robot.",
  },
  {
    kode: "sate",
    nama: "Sate Ayam",
    emoji: "🍢",
    harga: 18,
    efek: { kenyang: 25, senang: 5 },
    keterangan: "Sepuluh tusuk, bumbu kacang.",
  },
  {
    kode: "bakso",
    nama: "Bakso Bearing",
    emoji: "🍲",
    harga: 20,
    efek: { kenyang: 28, energi: 4 },
    keterangan: "Bakso bulat dari bearing baja.",
  },
  {
    kode: "kopi_solar",
    nama: "Kopi Solar",
    emoji: "☕",
    harga: 15,
    efek: { energi: 25, senang: 3 },
    keterangan: "Melek seketika.",
  },
  {
    kode: "teh_tarik",
    nama: "Teh Tarik",
    emoji: "🧋",
    harga: 12,
    efek: { energi: 12, senang: 8 },
    keterangan: "Manis berbusa.",
  },
  {
    kode: "jus_jeruk",
    nama: "Jus Jeruk Listrik",
    emoji: "🍊",
    harga: 14,
    efek: { energi: 15, kenyang: 6 },
    keterangan: "Vitamin C plus volt.",
  },
  {
    kode: "pizza",
    nama: "Pizza Chip",
    emoji: "🍕",
    harga: 25,
    efek: { kenyang: 35, senang: 8 },
    keterangan: "Topping keping memori.",
  },
  {
    kode: "burger",
    nama: "Burger Magnet",
    emoji: "🍔",
    harga: 24,
    efek: { kenyang: 34, senang: 6 },
    keterangan: "Lengket di tangan, nikmat di hati.",
  },
  {
    kode: "sushi",
    nama: "Sushi Kabel",
    emoji: "🍣",
    harga: 26,
    efek: { kenyang: 26, energi: 10 },
    keterangan: "Gulungan kabel serat optik.",
  },
  {
    kode: "rendang",
    nama: "Rendang Baja",
    emoji: "🥘",
    harga: 30,
    efek: { kenyang: 45 },
    keterangan: "Dimasak 12 jam, kenyang 12 jam.",
  },
  {
    kode: "sup_sirkuit",
    nama: "Sup Sirkuit",
    emoji: "🍜",
    harga: 22,
    efek: { kenyang: 30, energi: 6 },
    keterangan: "Kuah hangat bermuatan.",
  },
  {
    kode: "donat",
    nama: "Donat Ring",
    emoji: "🍩",
    harga: 14,
    efek: { kenyang: 12, senang: 12 },
    keterangan: "Cincin gula bermesin.",
  },
  {
    kode: "kue_ultah",
    nama: "Kue Ulang Tahun",
    emoji: "🎂",
    harga: 40,
    efek: { kenyang: 25, senang: 30 },
    keterangan: "Selamat ulang tahun, robot!",
  },
  {
    kode: "cokelat",
    nama: "Cokelat Bit",
    emoji: "🍫",
    harga: 16,
    efek: { senang: 18, energi: 6 },
    keterangan: "Manis 8-bit.",
  },
  {
    kode: "permen",
    nama: "Permen Kapasitor",
    emoji: "🍬",
    harga: 6,
    efek: { senang: 8, energi: 4 },
    keterangan: "Meledak lembut di mulut.",
  },
  {
    kode: "buah_apel",
    nama: "Apel Merah",
    emoji: "🍎",
    harga: 9,
    efek: { kenyang: 12, energi: 5 },
    keterangan: "Sehat, tanpa karat.",
  },
  {
    kode: "pisang",
    nama: "Pisang Kuning",
    emoji: "🍌",
    harga: 8,
    efek: { kenyang: 10, energi: 8 },
    keterangan: "Kalium untuk servo.",
  },
  {
    kode: "semangka",
    nama: "Semangka",
    emoji: "🍉",
    harga: 12,
    efek: { kenyang: 10, senang: 10 },
    keterangan: "Segar untuk kipas pendingin.",
  },
  {
    kode: "energi_drink",
    nama: "Minuman Energi",
    emoji: "🥤",
    harga: 28,
    efek: { energi: 40 },
    keterangan: "Full charge dalam sekejap.",
  },
  {
    kode: "baterai_besar",
    nama: "Baterai Jumbo",
    emoji: "🪫",
    harga: 45,
    efek: { energi: 60 },
    keterangan: "Ganjal semalaman.",
  },
  {
    kode: "nuklir_mini",
    nama: "Sel Nuklir Mini",
    emoji: "☢️",
    harga: 80,
    efek: { energi: 100, senang: 10 },
    keterangan: "Aman, katanya.",
  },
  {
    kode: "prasmanan",
    nama: "Prasmanan Lengkap",
    emoji: "🍱",
    harga: 60,
    efek: { kenyang: 70, senang: 15 },
    keterangan: "Semua ada, semua enak.",
  },
  {
    kode: "pesta_besar",
    nama: "Paket Pesta Besar",
    emoji: "🎉",
    harga: 120,
    efek: { kenyang: 60, energi: 40, senang: 40 },
    keterangan: "Hari terbaik robot.",
  },
];

// ------------------------------------------------------------
// TOKO 3 — SPAREPART (30 = 6 per bagian). Mengubah BENTUK robot.
// ------------------------------------------------------------
export const KATALOG_SPAREPART: readonly Sparepart[] = [
  // kepala
  {
    kode: "kepala_kotak",
    nama: "Kepala Kotak",
    bagian: "kepala",
    harga: 80,
    keterangan: "Tegas bersudut.",
  },
  {
    kode: "kepala_bulat",
    nama: "Kepala Bola",
    bagian: "kepala",
    harga: 80,
    keterangan: "Bulat sempurna.",
  },
  {
    kode: "kepala_kucing",
    nama: "Kepala Kucing",
    bagian: "kepala",
    harga: 110,
    keterangan: "Telinga runcing menggemaskan.",
  },
  {
    kode: "kepala_kubah",
    nama: "Kepala Kubah",
    bagian: "kepala",
    harga: 100,
    keterangan: "Kubah kaca futuristik.",
  },
  {
    kode: "kepala_segi6",
    nama: "Kepala Heksagon",
    bagian: "kepala",
    harga: 120,
    keterangan: "Enam sisi, satu otak.",
  },
  {
    kode: "kepala_tv",
    nama: "Kepala TV Retro",
    bagian: "kepala",
    harga: 140,
    keterangan: "Lengkap dengan antena V.",
  },
  // mata
  {
    kode: "mata_bulat",
    nama: "Mata Bulat Besar",
    bagian: "mata",
    harga: 50,
    keterangan: "Imut maksimal.",
  },
  {
    kode: "mata_kotak",
    nama: "Mata Piksel",
    bagian: "mata",
    harga: 50,
    keterangan: "Gaya 8-bit.",
  },
  {
    kode: "mata_visor",
    nama: "Mata Visor",
    bagian: "mata",
    harga: 90,
    keterangan: "Satu garis cahaya.",
  },
  {
    kode: "mata_bintang",
    nama: "Mata Bintang",
    bagian: "mata",
    harga: 70,
    keterangan: "Berbinar-binar.",
  },
  {
    kode: "mata_hati",
    nama: "Mata Hati",
    bagian: "mata",
    harga: 70,
    keterangan: "Jatuh cinta setiap saat.",
  },
  {
    kode: "mata_led",
    nama: "Mata LED Tiga",
    bagian: "mata",
    harga: 60,
    keterangan: "Tiga titik berkedip.",
  },
  // tubuh
  {
    kode: "tubuh_kapsul",
    nama: "Tubuh Kapsul",
    bagian: "tubuh",
    harga: 90,
    keterangan: "Membulat aerodinamis.",
  },
  {
    kode: "tubuh_kotak",
    nama: "Tubuh Kotak",
    bagian: "tubuh",
    harga: 90,
    keterangan: "Kokoh seperti brankas.",
  },
  {
    kode: "tubuh_armor",
    nama: "Tubuh Armor",
    bagian: "tubuh",
    harga: 160,
    keterangan: "Pelat baja berlapis.",
  },
  {
    kode: "tubuh_bulat",
    nama: "Tubuh Bola",
    bagian: "tubuh",
    harga: 100,
    keterangan: "Gembul dan lucu.",
  },
  {
    kode: "tubuh_tabung",
    nama: "Tubuh Tabung",
    bagian: "tubuh",
    harga: 110,
    keterangan: "Bergaris-garis ring.",
  },
  {
    kode: "tubuh_jelly",
    nama: "Tubuh Jeli",
    bagian: "tubuh",
    harga: 130,
    keterangan: "Tembus pandang, isinya kelap-kelip.",
  },
  // kaki
  {
    kode: "kaki_roda",
    nama: "Roda",
    bagian: "kaki",
    harga: 80,
    keterangan: "Meluncur cepat.",
  },
  {
    kode: "kaki_roket",
    nama: "Roket Tunggal",
    bagian: "kaki",
    harga: 150,
    keterangan: "Melayang dengan semburan.",
  },
  {
    kode: "kaki_kucing",
    nama: "Kaki Kucing",
    bagian: "kaki",
    harga: 90,
    keterangan: "Empuk dan senyap.",
  },
  {
    kode: "kaki_tank",
    nama: "Roda Tank",
    bagian: "kaki",
    harga: 140,
    keterangan: "Melibas medan apa pun.",
  },
  {
    kode: "kaki_pegas",
    nama: "Kaki Pegas",
    bagian: "kaki",
    harga: 100,
    keterangan: "Melompat-lompat.",
  },
  {
    kode: "kaki_hover",
    nama: "Piringan Hover",
    bagian: "kaki",
    harga: 170,
    keterangan: "Tanpa kaki, hanya cahaya.",
  },
  // tangan
  {
    kode: "tangan_capit",
    nama: "Tangan Capit",
    bagian: "tangan",
    harga: 80,
    keterangan: "Menjepit apa saja.",
  },
  {
    kode: "tangan_tinju",
    nama: "Sarung Tinju",
    bagian: "tangan",
    harga: 90,
    keterangan: "Siap sparring.",
  },
  {
    kode: "tangan_tentakel",
    nama: "Tentakel",
    bagian: "tangan",
    harga: 120,
    keterangan: "Lentur seperti gurita.",
  },
  {
    kode: "tangan_sayap",
    nama: "Tangan Sayap",
    bagian: "tangan",
    harga: 110,
    keterangan: "Sayap kecil berbulu.",
  },
  {
    kode: "tangan_laser",
    nama: "Meriam Laser",
    bagian: "tangan",
    harga: 160,
    keterangan: "Pew pew (tidak berbahaya).",
  },
  {
    kode: "tangan_kuat",
    nama: "Lengan Kekar",
    bagian: "tangan",
    harga: 130,
    keterangan: "Otot hidrolik.",
  },
  // ---- varian warna (4 Sep 2026): 38 sparepart memakai bentuk `dasar` + warna sendiri ----
  {
    kode: "kepala_kotak_emas",
    nama: "Kepala Kotak Emas",
    bagian: "kepala",
    dasar: "kepala_kotak",
    warna: "#F59E0B",
    harga: 120,
    keterangan: "Varian warna kepala kotak emas.",
  },
  {
    kode: "kepala_kotak_hijau",
    nama: "Kepala Kotak Hijau",
    bagian: "kepala",
    dasar: "kepala_kotak",
    warna: "#16A34A",
    harga: 100,
    keterangan: "Varian warna kepala kotak hijau.",
  },
  {
    kode: "kepala_bulat_merah",
    nama: "Kepala Bulat Merah",
    bagian: "kepala",
    dasar: "kepala_bulat",
    warna: "#DC2626",
    harga: 100,
    keterangan: "Varian warna kepala bulat merah.",
  },
  {
    kode: "kepala_bulat_ungu",
    nama: "Kepala Bulat Ungu",
    bagian: "kepala",
    dasar: "kepala_bulat",
    warna: "#7C3AED",
    harga: 100,
    keterangan: "Varian warna kepala bulat ungu.",
  },
  {
    kode: "kepala_kubah_biru",
    nama: "Kepala Kubah Biru",
    bagian: "kepala",
    dasar: "kepala_kubah",
    warna: "#0EA5E9",
    harga: 110,
    keterangan: "Varian warna kepala kubah biru.",
  },
  {
    kode: "kepala_segi6_hitam",
    nama: "Kepala Segi Enam Hitam",
    bagian: "kepala",
    dasar: "kepala_segi6",
    warna: "#111827",
    harga: 110,
    keterangan: "Varian warna kepala segi enam hitam.",
  },
  {
    kode: "kepala_tv_retro",
    nama: "Kepala TV Retro",
    bagian: "kepala",
    dasar: "kepala_tv",
    warna: "#92400E",
    harga: 130,
    keterangan: "Varian warna kepala tv retro.",
  },
  {
    kode: "kepala_kucing_oranye",
    nama: "Kepala Kucing Oranye",
    bagian: "kepala",
    dasar: "kepala_kucing",
    warna: "#F97316",
    harga: 120,
    keterangan: "Varian warna kepala kucing oranye.",
  },
  {
    kode: "mata_bulat_hijau",
    nama: "Mata Bulat Hijau",
    bagian: "mata",
    dasar: "mata_bulat",
    warna: "#4ADE80",
    harga: 60,
    keterangan: "Varian warna mata bulat hijau.",
  },
  {
    kode: "mata_bulat_merah",
    nama: "Mata Bulat Merah",
    bagian: "mata",
    dasar: "mata_bulat",
    warna: "#F87171",
    harga: 60,
    keterangan: "Varian warna mata bulat merah.",
  },
  {
    kode: "mata_kotak_kuning",
    nama: "Mata Kotak Kuning",
    bagian: "mata",
    dasar: "mata_kotak",
    warna: "#FDE047",
    harga: 60,
    keterangan: "Varian warna mata kotak kuning.",
  },
  {
    kode: "mata_visor_ungu",
    nama: "Visor Ungu",
    bagian: "mata",
    dasar: "mata_visor",
    warna: "#C084FC",
    harga: 80,
    keterangan: "Varian warna visor ungu.",
  },
  {
    kode: "mata_bintang_emas",
    nama: "Mata Bintang Emas",
    bagian: "mata",
    dasar: "mata_bintang",
    warna: "#FBBF24",
    harga: 90,
    keterangan: "Varian warna mata bintang emas.",
  },
  {
    kode: "mata_hati_merah",
    nama: "Mata Hati Merah",
    bagian: "mata",
    dasar: "mata_hati",
    warna: "#F43F5E",
    harga: 90,
    keterangan: "Varian warna mata hati merah.",
  },
  {
    kode: "mata_led_hijau",
    nama: "Mata LED Hijau",
    bagian: "mata",
    dasar: "mata_led",
    warna: "#4ADE80",
    harga: 95,
    keterangan: "Varian warna mata led hijau.",
  },
  {
    kode: "mata_led_biru",
    nama: "Mata LED Biru",
    bagian: "mata",
    dasar: "mata_led",
    warna: "#60A5FA",
    harga: 95,
    keterangan: "Varian warna mata led biru.",
  },
  {
    kode: "tubuh_kapsul_merah",
    nama: "Tubuh Kapsul Merah",
    bagian: "tubuh",
    dasar: "tubuh_kapsul",
    warna: "#DC2626",
    harga: 110,
    keterangan: "Varian warna tubuh kapsul merah.",
  },
  {
    kode: "tubuh_kapsul_biru",
    nama: "Tubuh Kapsul Biru",
    bagian: "tubuh",
    dasar: "tubuh_kapsul",
    warna: "#2563EB",
    harga: 110,
    keterangan: "Varian warna tubuh kapsul biru.",
  },
  {
    kode: "tubuh_kotak_emas",
    nama: "Tubuh Kotak Emas",
    bagian: "tubuh",
    dasar: "tubuh_kotak",
    warna: "#F59E0B",
    harga: 140,
    keterangan: "Varian warna tubuh kotak emas.",
  },
  {
    kode: "tubuh_armor_hitam",
    nama: "Armor Hitam",
    bagian: "tubuh",
    dasar: "tubuh_armor",
    warna: "#111827",
    harga: 160,
    keterangan: "Varian warna armor hitam.",
  },
  {
    kode: "tubuh_armor_perak",
    nama: "Armor Perak",
    bagian: "tubuh",
    dasar: "tubuh_armor",
    warna: "#CBD5E1",
    harga: 160,
    keterangan: "Varian warna armor perak.",
  },
  {
    kode: "tubuh_bulat_hijau",
    nama: "Tubuh Bulat Hijau",
    bagian: "tubuh",
    dasar: "tubuh_bulat",
    warna: "#16A34A",
    harga: 110,
    keterangan: "Varian warna tubuh bulat hijau.",
  },
  {
    kode: "tubuh_tabung_ungu",
    nama: "Tubuh Tabung Ungu",
    bagian: "tubuh",
    dasar: "tubuh_tabung",
    warna: "#7C3AED",
    harga: 120,
    keterangan: "Varian warna tubuh tabung ungu.",
  },
  {
    kode: "tubuh_jelly_pink",
    nama: "Tubuh Jelly Pink",
    bagian: "tubuh",
    dasar: "tubuh_jelly",
    warna: "#F472B6",
    harga: 130,
    keterangan: "Varian warna tubuh jelly pink.",
  },
  {
    kode: "kaki_roda_merah",
    nama: "Roda Merah",
    bagian: "kaki",
    dasar: "kaki_roda",
    warna: "#DC2626",
    harga: 100,
    keterangan: "Varian warna roda merah.",
  },
  {
    kode: "kaki_roda_biru",
    nama: "Roda Biru",
    bagian: "kaki",
    dasar: "kaki_roda",
    warna: "#2563EB",
    harga: 100,
    keterangan: "Varian warna roda biru.",
  },
  {
    kode: "kaki_roket_emas",
    nama: "Roket Emas",
    bagian: "kaki",
    dasar: "kaki_roket",
    warna: "#F59E0B",
    harga: 170,
    keterangan: "Varian warna roket emas.",
  },
  {
    kode: "kaki_kucing_putih",
    nama: "Kaki Kucing Putih",
    bagian: "kaki",
    dasar: "kaki_kucing",
    warna: "#F8FAFC",
    harga: 110,
    keterangan: "Varian warna kaki kucing putih.",
  },
  {
    kode: "kaki_tank_hijau",
    nama: "Tank Hijau",
    bagian: "kaki",
    dasar: "kaki_tank",
    warna: "#16A34A",
    harga: 150,
    keterangan: "Varian warna tank hijau.",
  },
  {
    kode: "kaki_pegas_ungu",
    nama: "Pegas Ungu",
    bagian: "kaki",
    dasar: "kaki_pegas",
    warna: "#7C3AED",
    harga: 110,
    keterangan: "Varian warna pegas ungu.",
  },
  {
    kode: "kaki_hover_merah",
    nama: "Hover Merah",
    bagian: "kaki",
    dasar: "kaki_hover",
    warna: "#DC2626",
    harga: 160,
    keterangan: "Varian warna hover merah.",
  },
  {
    kode: "tangan_capit_emas",
    nama: "Capit Emas",
    bagian: "tangan",
    dasar: "tangan_capit",
    warna: "#F59E0B",
    harga: 120,
    keterangan: "Varian warna capit emas.",
  },
  {
    kode: "tangan_tinju_biru",
    nama: "Sarung Tinju Biru",
    bagian: "tangan",
    dasar: "tangan_tinju",
    warna: "#2563EB",
    harga: 100,
    keterangan: "Varian warna sarung tinju biru.",
  },
  {
    kode: "tangan_tentakel_ungu",
    nama: "Tentakel Ungu",
    bagian: "tangan",
    dasar: "tangan_tentakel",
    warna: "#7C3AED",
    harga: 130,
    keterangan: "Varian warna tentakel ungu.",
  },
  {
    kode: "tangan_sayap_pink",
    nama: "Tangan Sayap Pink",
    bagian: "tangan",
    dasar: "tangan_sayap",
    warna: "#F472B6",
    harga: 120,
    keterangan: "Varian warna tangan sayap pink.",
  },
  {
    kode: "tangan_laser_hijau",
    nama: "Meriam Laser Hijau",
    bagian: "tangan",
    dasar: "tangan_laser",
    warna: "#16A34A",
    harga: 170,
    keterangan: "Varian warna meriam laser hijau.",
  },
  {
    kode: "tangan_kuat_merah",
    nama: "Lengan Kekar Merah",
    bagian: "tangan",
    dasar: "tangan_kuat",
    warna: "#DC2626",
    harga: 140,
    keterangan: "Varian warna lengan kekar merah.",
  },
  {
    kode: "tangan_capit_hitam",
    nama: "Capit Hitam",
    bagian: "tangan",
    dasar: "tangan_capit",
    warna: "#111827",
    harga: 120,
    keterangan: "Varian warna capit hitam.",
  },
];

export const SLOT_LABEL: Record<SlotAksesoris, string> = {
  kepala: "Kepala",
  mata: "Mata",
  leher: "Leher",
  badan: "Badan",
  punggung: "Punggung",
  tangan: "Tangan",
  aura: "Aura",
};
export const BAGIAN_LABEL: Record<BagianSparepart, string> = {
  kepala: "Kepala",
  mata: "Mata",
  tubuh: "Tubuh",
  kaki: "Kaki",
  tangan: "Tangan",
};

export function aksesorisDariKode(kode: string): Aksesoris | undefined {
  return KATALOG_AKSESORIS.find((a) => a.kode === kode);
}
export function makananDariKode(kode: string): Makanan | undefined {
  return KATALOG_MAKANAN.find((a) => a.kode === kode);
}
export function sparepartDariKode(kode: string): Sparepart | undefined {
  return KATALOG_SPAREPART.find((a) => a.kode === kode);
}

// ------------------------------------------------------------
// TOKO 4 — SKIN EKSKLUSIF SEASONAL (5). Kode TIDAK boleh diubah (tersimpan di DB).
// Tiap skin = satu set megah (zirah, sayap/jubah, senjata, mahkota, aura) yang
// menggantikan slot kepala/badan/punggung/tangan; aksesoris mata/leher/aura tetap.
// Hanya bisa dibeli saat musimnya; setelah dimiliki, boleh dipakai kapan saja.
// ------------------------------------------------------------
export const KATALOG_SKIN: readonly Skin[] = [
  {
    kode: "skin_garuda_emas",
    nama: "Garuda Emas",
    musim: "Musim Kemerdekaan",
    mulaiBulan: 8,
    akhirBulan: 9,
    harga: 600,
    warnaUtama: "#F59E0B",
    keterangan:
      "Zirah emas berukir Garuda, sayap emas raksasa, jubah merah-putih, mahkota bermata rubi.",
    fitur: [
      "Sayap emas raksasa (mengepak)",
      "Jubah merah-putih",
      "Zirah dada lambang bintang",
      "Mahkota rubi",
      "Aura keemasan",
    ],
  },
  {
    kode: "skin_komandan_rakyat",
    nama: "Komandan Rakyat",
    musim: "Musim Kampanye",
    mulaiBulan: 10,
    akhirBulan: 11,
    harga: 550,
    warnaUtama: "#4D7C0F",
    keterangan:
      "Rompi taktis, baret merah berbintang, visor komando, dan pistol blaster berenergi.",
    fitur: [
      "Pistol blaster (sel energi berdenyut)",
      "Baret merah berbintang",
      "Rompi taktis + bandolier",
      "Bantalan bahu lapis baja",
      "Visor komando",
    ],
  },
  {
    kode: "skin_penjaga_salju",
    nama: "Penjaga Salju",
    musim: "Musim Akhir Tahun",
    mulaiBulan: 12,
    akhirBulan: 1,
    harga: 500,
    warnaUtama: "#38BDF8",
    keterangan:
      "Zirah kristal es, mahkota salju, tongkat es bercahaya, dan butiran salju yang berkilau.",
    fitur: [
      "Tongkat kristal es bercahaya",
      "Mahkota kristal",
      "Bahu berduri es",
      "Jubah biru es",
      "Salju berkilau di sekeliling",
    ],
  },
  {
    kode: "skin_naga_api",
    nama: "Naga Api",
    musim: "Musim Semangat Baru",
    mulaiBulan: 2,
    akhirBulan: 4,
    harga: 580,
    warnaUtama: "#DC2626",
    keterangan:
      "Zirah sisik naga, helm bertanduk, pedang api menyala, dan lingkaran api di sekeliling.",
    fitur: [
      "Pedang api (nyala bergoyang)",
      "Helm bertanduk naga",
      "Zirah sisik merah-hitam",
      "Pelindung bahu berduri",
      "Aura lingkaran api",
    ],
  },
  {
    kode: "skin_ksatria_cahaya",
    nama: "Ksatria Cahaya",
    musim: "Musim Fitri & Pahlawan",
    mulaiBulan: 5,
    akhirBulan: 7,
    harga: 560,
    warnaUtama: "#60A5FA",
    keterangan:
      "Zirah putih-emas, helm bersayap dengan lingkaran cahaya, pedang cahaya, dan perisai berbintang.",
    fitur: [
      "Pedang cahaya + perisai berbintang",
      "Lingkaran cahaya berputar",
      "Helm bersayap",
      "Zirah putih-emas",
      "Jubah biru langit",
    ],
  },
  // ---- EDISI KHUSUS PRI (4 Sep 2026): kaos PRI + topeng harimau putih, tersedia sepanjang tahun ----
  {
    kode: "skin_harimau_merah",
    nama: "Harimau Putih · Kaos Merah",
    musim: "Edisi Khusus PRI",
    mulaiBulan: 1,
    akhirBulan: 12,
    selalu: true,
    harga: 700,
    warnaUtama: "#DC2626",
    keterangan:
      "Topeng harimau putih bergaris hitam, kaos PRI merah, sarung tangan cakar.",
    fitur: [
      "Topeng harimau putih (mata menyala)",
      "Kaos PRI merah",
      "Sarung tangan cakar",
      "Ekor harimau",
      "Aura loreng",
    ],
  },
  {
    kode: "skin_harimau_hitam",
    nama: "Harimau Putih · Kaos Hitam",
    musim: "Edisi Khusus PRI",
    mulaiBulan: 1,
    akhirBulan: 12,
    selalu: true,
    harga: 700,
    warnaUtama: "#111827",
    keterangan:
      "Topeng harimau putih, kaos PRI hitam bergaris emas, jubah malam.",
    fitur: [
      "Topeng harimau putih (mata menyala)",
      "Kaos PRI hitam",
      "Jubah malam",
      "Sarung tangan cakar",
      "Ekor harimau",
    ],
  },
  {
    kode: "skin_harimau_emas",
    nama: "Harimau Putih · Kaos Emas",
    musim: "Edisi Khusus PRI",
    mulaiBulan: 1,
    akhirBulan: 12,
    selalu: true,
    harga: 900,
    warnaUtama: "#F59E0B",
    keterangan:
      "Topeng harimau putih bermahkota, kaos PRI emas, aura raja hutan.",
    fitur: [
      "Topeng harimau putih bermahkota",
      "Kaos PRI emas",
      "Aura raja hutan",
      "Sarung tangan cakar",
      "Ekor harimau",
    ],
  },
];

export function skinDariKode(kode: string): Skin | undefined {
  return KATALOG_SKIN.find((a) => a.kode === kode);
}

export const NAMA_BULAN = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

/** Bulan kalender WIB (1–12) untuk suatu waktu. */
export function bulanWib(kini = Date.now()): number {
  return new Date(kini + 7 * 3600_000).getUTCMonth() + 1;
}

/** Apakah skin sedang musimnya (bisa dibeli). Rentang boleh melewati tahun (12 → 1). */
export function skinTersedia(skin: Skin, kini = Date.now()): boolean {
  if (skin.selalu) return true;
  const b = bulanWib(kini);
  return skin.mulaiBulan <= skin.akhirBulan
    ? b >= skin.mulaiBulan && b <= skin.akhirBulan
    : b >= skin.mulaiBulan || b <= skin.akhirBulan;
}

export function labelMusimSkin(skin: Skin): string {
  return `${NAMA_BULAN[skin.mulaiBulan]}–${NAMA_BULAN[skin.akhirBulan]}`;
}

// ------------------------------------------------------------
// WARNA CUSTOM — dibuka sekali seharga 300 koin, lalu warna bebas diganti.
// ------------------------------------------------------------
export const HARGA_WARNA_CUSTOM = 300;
export const KODE_WARNA_CUSTOM = "warna_custom";

export const PRESET_WARNA: readonly { nama: string; hex: string }[] = [
  { nama: "Merah PRI", hex: "#DC2626" },
  { nama: "Oranye", hex: "#F97316" },
  { nama: "Emas", hex: "#F59E0B" },
  { nama: "Lemon", hex: "#EAB308" },
  { nama: "Hijau", hex: "#22C55E" },
  { nama: "Zamrud", hex: "#10B981" },
  { nama: "Toska", hex: "#14B8A6" },
  { nama: "Biru Langit", hex: "#0EA5E9" },
  { nama: "Biru", hex: "#3B82F6" },
  { nama: "Nila", hex: "#6366F1" },
  { nama: "Ungu", hex: "#A855F7" },
  { nama: "Magenta", hex: "#D946EF" },
  { nama: "Pink", hex: "#EC4899" },
  { nama: "Mawar", hex: "#F43F5E" },
  { nama: "Cokelat", hex: "#92400E" },
  { nama: "Arang", hex: "#374151" },
];

/** Warna heksa 6 digit yang sah (#RRGGBB); mengembalikan bentuk huruf besar atau null. */
export function warnaSah(mentah: unknown): string | null {
  const w = String(mentah ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(w) ? w.toUpperCase() : null;
}

function keRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function dariRgb(r: number, g: number, b: number): string {
  const c = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
/** Gelapkan warna sebesar f (0–1). */
export function gelapkan(hex: string, f: number): string {
  const [r, g, b] = keRgb(hex);
  return dariRgb(r * (1 - f), g * (1 - f), b * (1 - f));
}
/** Terangkan warna (campur ke putih) sebesar f (0–1). */
export function terangkan(hex: string, f: number): string {
  const [r, g, b] = keRgb(hex);
  return dariRgb(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

/** Batas nama robot. */
export const NAMA_MAKS = 16;
/** Hadiah koin harian saat merawat robot (sekali per hari WIB). */
export const HADIAH_HARIAN_KOIN = 10;
/** XP per level. */
export const XP_PER_LEVEL = 100;
/** XP tiap kali makan. */
export const XP_MAKAN = 4;

export type Kebutuhan = {
  kenyang: number;
  energi: number;
  senang: number;
  bersih: number;
};

export function jepitNilai(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Penurunan kebutuhan per JAM (linier terhadap waktu, kecil supaya robot tidak
 * "mati" saat ditinggal semalam): kenyang −6, senang −5, bersih −4.
 * ENERGI ikut AKTIVITAS harian: dasar −3/jam, +0,6/jam tiap aktivitas hari
 * ini (maks +6 → −9/jam bila sangat sibuk); tidur: +15/jam. Jarak ≥ 0, ≤ 72 jam.
 */
export function hitungPenurunan(
  k: Kebutuhan,
  tidur: boolean,
  jamBerlalu: number,
  aktivitasHariIni = 0,
): Kebutuhan {
  const j = Math.max(0, Math.min(72, jamBerlalu));
  const lajuEnergi = 3 + Math.min(6, Math.max(0, aktivitasHariIni) * 0.6);
  return {
    kenyang: jepitNilai(k.kenyang - 6 * j),
    senang: jepitNilai(k.senang - 5 * j),
    bersih: jepitNilai(k.bersih - 4 * j),
    energi: jepitNilai(tidur ? k.energi + 15 * j : k.energi - lajuEnergi * j),
  };
}

/** Perawatan tanpa barang (dipakai server; klien hanya menampilkan labelnya). */
export const EFEK_PERAWATAN: Record<
  Perawatan,
  { label: string; efek: Partial<Kebutuhan>; xp: number; syarat?: string }
> = {
  main: {
    label: "Ajak main",
    efek: { senang: 25, energi: -12, kenyang: -6 },
    xp: 8,
    syarat: "energi ≥ 15",
  },
  mandi: { label: "Mandikan", efek: { bersih: 40, senang: 3 }, xp: 5 },
};

export function terapkanEfek(k: Kebutuhan, e: Partial<Kebutuhan>): Kebutuhan {
  return {
    kenyang: jepitNilai(k.kenyang + (e.kenyang ?? 0)),
    energi: jepitNilai(k.energi + (e.energi ?? 0)),
    senang: jepitNilai(k.senang + (e.senang ?? 0)),
    bersih: jepitNilai(k.bersih + (e.bersih ?? 0)),
  };
}

export function levelDariXp(xp: number): {
  level: number;
  xpDiLevel: number;
  xpBerikut: number;
} {
  const level = Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
  return {
    level,
    xpDiLevel: Math.max(0, xp) % XP_PER_LEVEL,
    xpBerikut: XP_PER_LEVEL,
  };
}

/** Suasana hati dari kebutuhan (yang paling mendesak menang). */
export function suasanaDari(k: Kebutuhan, tidur: boolean): Suasana {
  if (tidur) return "tidur";
  const terendah = Math.min(k.kenyang, k.energi, k.senang, k.bersih);
  if (terendah < 25) {
    if (k.kenyang === terendah) return "lapar";
    if (k.energi === terendah) return "lelah";
    if (k.bersih === terendah) return "kotor";
    return "sedih";
  }
  const rata = (k.kenyang + k.energi + k.senang + k.bersih) / 4;
  return rata >= 70 ? "senang" : "biasa";
}

export const LABEL_SUASANA: Record<Suasana, string> = {
  senang: "Senang sekali!",
  biasa: "Baik-baik saja",
  lapar: "Lapar… beri makan dong",
  lelah: "Lelah, ingin tidur",
  sedih: "Sedih, ajak main yuk",
  kotor: "Kotor, perlu dimandikan",
  tidur: "Zzz… sedang tidur",
};

/**
 * Kelas animasi tubuh dari KONDISI energi & kenyang (1–100%), ≥5 ragam:
 *   tidur        → napas pelan
 *   energi ≤ 20  → LEMAS (terkulai, goyang sangat lambat)
 *   kenyang ≤ 20 → LAPAR (perut bergetar / menggigil)
 *   energi ≤ 50  → LELAH (goyang lambat)
 *   kenyang ≤ 50 → KERONCONGAN (goyang + perut naik-turun)
 *   keduanya > 80→ SEMANGAT (memantul cepat)
 *   selainnya    → NORMAL (melayang tenang)
 */
export type Vitalitas =
  "tidur" | "lemas" | "lapar" | "lelah" | "keroncongan" | "semangat" | "normal";
export function vitalitasDari(k: Kebutuhan, tidur: boolean): Vitalitas {
  if (tidur) return "tidur";
  if (k.energi <= 20) return "lemas";
  if (k.kenyang <= 20) return "lapar";
  if (k.energi <= 50) return "lelah";
  if (k.kenyang <= 50) return "keroncongan";
  if (k.energi > 80 && k.kenyang > 80) return "semangat";
  return "normal";
}
export const LABEL_VITALITAS: Record<Vitalitas, string> = {
  tidur: "tidur nyenyak",
  lemas: "lemas kehabisan energi",
  lapar: "perut keroncongan hebat",
  lelah: "agak lelah",
  keroncongan: "mulai lapar",
  semangat: "penuh semangat",
  normal: "tenang",
};

/** Palet warna per jenis (dipakai SVG & UI). */
export const PALET: Record<
  JenisRobot,
  {
    utama: string;
    utamaGelap: string;
    aksen: string;
    aksenTerang: string;
    badan: string;
    badanGelap: string;
    layar: string;
    mata: string;
    label: string;
  }
> = {
  pria: {
    utama: "#3B82F6",
    utamaGelap: "#1D4ED8",
    aksen: "#111827",
    aksenTerang: "#374151",
    badan: "#1F2937",
    badanGelap: "#0F172A",
    layar: "#0B1220",
    mata: "#67E8F9",
    label: "Robot Pria · biru-hitam",
  },
  wanita: {
    utama: "#EC4899",
    utamaGelap: "#BE185D",
    aksen: "#F9FAFB",
    aksenTerang: "#FFFFFF",
    badan: "#FDF2F8",
    badanGelap: "#FBCFE8",
    layar: "#3B0A2A",
    mata: "#FDA4AF",
    label: "Robot Wanita · pink-putih",
  },
};

// ------------------------------------------------------------
// TOKO 5 — GERAKAN / EMOT ROBOT (10, 4 Sep 2026). Dibeli sekali; setelah itu
// bisa dimainkan kapan saja (robot melayang di beranda & layar Pet).
// `kelas` = kelas animasi CSS (globals.css), `durasiMs` = lama sekali putar.
// ------------------------------------------------------------
export type Gerakan = {
  kode: string;
  nama: string;
  emoji: string;
  harga: number;
  kelas: string;
  durasiMs: number;
  keterangan: string;
};
export const KATALOG_GERAKAN: readonly Gerakan[] = [
  {
    kode: "gerak_joget",
    nama: "Joget",
    emoji: "🕺",
    harga: 60,
    kelas: "pet-gerak-joget",
    durasiMs: 2200,
    keterangan: "Goyang kiri-kanan mengikuti irama.",
  },
  {
    kode: "gerak_dab",
    nama: "Dab",
    emoji: "😎",
    harga: 60,
    kelas: "pet-gerak-dab",
    durasiMs: 1400,
    keterangan: "Gaya dab kilat.",
  },
  {
    kode: "gerak_salto",
    nama: "Salto",
    emoji: "🤸",
    harga: 120,
    kelas: "pet-gerak-salto",
    durasiMs: 1500,
    keterangan: "Berputar satu putaran penuh di udara.",
  },
  {
    kode: "gerak_lambai",
    nama: "Lambai",
    emoji: "👋",
    harga: 40,
    kelas: "pet-gerak-lambai",
    durasiMs: 2000,
    keterangan: "Melambaikan tangan ramah.",
  },
  {
    kode: "gerak_hormat",
    nama: "Hormat",
    emoji: "🫡",
    harga: 50,
    kelas: "pet-gerak-hormat",
    durasiMs: 1600,
    keterangan: "Membungkuk hormat.",
  },
  {
    kode: "gerak_tepuk",
    nama: "Tepuk Tangan",
    emoji: "👏",
    harga: 50,
    kelas: "pet-gerak-tepuk",
    durasiMs: 1800,
    keterangan: "Bersorak dan bertepuk.",
  },
  {
    kode: "gerak_jempol",
    nama: "Jempol",
    emoji: "👍",
    harga: 45,
    kelas: "pet-gerak-jempol",
    durasiMs: 1400,
    keterangan: "Mantap!",
  },
  {
    kode: "gerak_terbang",
    nama: "Terbang",
    emoji: "🚀",
    harga: 150,
    kelas: "pet-gerak-terbang",
    durasiMs: 2400,
    keterangan: "Melesat ke atas lalu mendarat.",
  },
  {
    kode: "gerak_moonwalk",
    nama: "Moonwalk",
    emoji: "🌙",
    harga: 130,
    kelas: "pet-gerak-moonwalk",
    durasiMs: 2200,
    keterangan: "Meluncur mundur ala legenda.",
  },
  {
    kode: "gerak_putar",
    nama: "Putar 360",
    emoji: "🔄",
    harga: 90,
    kelas: "pet-gerak-putar",
    durasiMs: 1600,
    keterangan: "Berputar satu lingkaran penuh.",
  },
];
export function gerakanDariKode(kode: string): Gerakan | undefined {
  return KATALOG_GERAKAN.find((a) => a.kode === kode);
}

// ------------------------------------------------------------
// HEWAN PELIHARAAN ROBOT (3, 4 Sep 2026): kucing, anjing, kapibara — semuanya
// robot. Dibeli di toko, tumbuh dari ANAK → REMAJA → DEWASA lewat XP yang
// didapat dari makan (makanan hewan dibeli di toko). Kenyang turun 4/jam.
// ------------------------------------------------------------
export type JenisHewan = "kucing" | "anjing" | "kapibara";
export type TahapHewan = "anak" | "remaja" | "dewasa";
export type Hewan = {
  kode: string;
  jenis: JenisHewan;
  nama: string;
  namaBawaan: string;
  harga: number;
  keterangan: string;
  favorit: string[];
};
export const KATALOG_HEWAN: readonly Hewan[] = [
  {
    kode: "hewan_kucing",
    jenis: "kucing",
    nama: "Kucing Robot",
    namaBawaan: "Miko",
    harga: 500,
    keterangan: "Lincah, suka melompat, ekor LED berkedip.",
    favorit: ["mh_ikan_led", "mh_susu_mini"],
  },
  {
    kode: "hewan_anjing",
    jenis: "anjing",
    nama: "Anjing Robot",
    namaBawaan: "Bolt",
    harga: 500,
    keterangan: "Setia, suka berlari, telinga antena.",
    favorit: ["mh_tulang_baja", "mh_sosis_kabel"],
  },
  {
    kode: "hewan_kapibara",
    jenis: "kapibara",
    nama: "Kapibara Robot",
    namaBawaan: "Kapi",
    harga: 650,
    keterangan: "Santai, suka berendam, jeruk di kepala saat dewasa.",
    favorit: ["mh_rumput_sirkuit", "mh_semangka_kapi"],
  },
];
export function hewanDariKode(kode: string): Hewan | undefined {
  return KATALOG_HEWAN.find((h) => h.kode === kode);
}
export const LABEL_TAHAP: Record<TahapHewan, string> = {
  anak: "Anak",
  remaja: "Remaja",
  dewasa: "Dewasa",
};
export const XP_HEWAN_REMAJA = 100;
export const XP_HEWAN_DEWASA = 300;
export function tahapHewan(xp: number): TahapHewan {
  return xp >= XP_HEWAN_DEWASA
    ? "dewasa"
    : xp >= XP_HEWAN_REMAJA
      ? "remaja"
      : "anak";
}
/** XP menuju tahap berikutnya (dewasa = penuh). */
export function progresHewan(xp: number): {
  tahap: TahapHewan;
  diTahap: number;
  butuh: number;
} {
  const tahap = tahapHewan(xp);
  if (tahap === "anak") return { tahap, diTahap: xp, butuh: XP_HEWAN_REMAJA };
  if (tahap === "remaja")
    return {
      tahap,
      diTahap: xp - XP_HEWAN_REMAJA,
      butuh: XP_HEWAN_DEWASA - XP_HEWAN_REMAJA,
    };
  return { tahap, diTahap: 1, butuh: 1 };
}
/** Kenyang hewan turun 4 per jam. */
export function hitungKenyangHewan(
  kenyang: number,
  jamBerlalu: number,
): number {
  return jepitNilai(kenyang - 4 * Math.max(0, jamBerlalu));
}
export type SuasanaHewan = "lapar" | "biasa" | "senang";
export function suasanaHewan(kenyang: number): SuasanaHewan {
  return kenyang < 30 ? "lapar" : kenyang < 60 ? "biasa" : "senang";
}
export const LABEL_SUASANA_HEWAN: Record<SuasanaHewan, string> = {
  lapar: "Lapar… kasih makan dong",
  biasa: "Santai",
  senang: "Senang sekali!",
};

export type MakananHewan = {
  kode: string;
  nama: string;
  emoji: string;
  harga: number;
  kenyang: number;
  xp: number;
  keterangan: string;
};
export const KATALOG_MAKANAN_HEWAN: readonly MakananHewan[] = [
  {
    kode: "mh_ikan_led",
    nama: "Ikan LED",
    emoji: "🐟",
    harga: 12,
    kenyang: 25,
    xp: 8,
    keterangan: "Favorit kucing robot.",
  },
  {
    kode: "mh_tulang_baja",
    nama: "Tulang Baja",
    emoji: "🦴",
    harga: 12,
    kenyang: 25,
    xp: 8,
    keterangan: "Favorit anjing robot.",
  },
  {
    kode: "mh_rumput_sirkuit",
    nama: "Rumput Sirkuit",
    emoji: "🌿",
    harga: 10,
    kenyang: 22,
    xp: 7,
    keterangan: "Favorit kapibara robot.",
  },
  {
    kode: "mh_susu_mini",
    nama: "Susu Pelumas Mini",
    emoji: "🥛",
    harga: 10,
    kenyang: 18,
    xp: 6,
    keterangan: "Menghangatkan mesin kecil.",
  },
  {
    kode: "mh_biskuit_chip",
    nama: "Biskuit Chip",
    emoji: "🍪",
    harga: 8,
    kenyang: 14,
    xp: 5,
    keterangan: "Camilan renyah.",
  },
  {
    kode: "mh_semangka_kapi",
    nama: "Semangka Segar",
    emoji: "🍉",
    harga: 15,
    kenyang: 30,
    xp: 9,
    keterangan: "Kapibara paling suka.",
  },
  {
    kode: "mh_sosis_kabel",
    nama: "Sosis Kabel",
    emoji: "🌭",
    harga: 14,
    kenyang: 26,
    xp: 8,
    keterangan: "Gurih berlistrik.",
  },
  {
    kode: "mh_wortel_neon",
    nama: "Wortel Neon",
    emoji: "🥕",
    harga: 10,
    kenyang: 18,
    xp: 6,
    keterangan: "Bagus untuk sensor mata.",
  },
  {
    kode: "mh_kue_hewan",
    nama: "Kue Ulang Tahun Hewan",
    emoji: "🎂",
    harga: 30,
    kenyang: 60,
    xp: 30,
    keterangan: "Lonjakan pertumbuhan.",
  },
  {
    kode: "mh_prasmanan_hewan",
    nama: "Prasmanan Hewan",
    emoji: "🍱",
    harga: 45,
    kenyang: 100,
    xp: 50,
    keterangan: "Kenyang penuh + tumbuh cepat.",
  },
];
export function makananHewanDariKode(kode: string): MakananHewan | undefined {
  return KATALOG_MAKANAN_HEWAN.find((m) => m.kode === kode);
}
/** Bonus XP 50% bila makanan itu favorit hewan tersebut. */
export function xpMakanHewan(hewan: Hewan, makanan: MakananHewan): number {
  return hewan.favorit.includes(makanan.kode)
    ? Math.round(makanan.xp * 1.5)
    : makanan.xp;
}

/** Bentuk yang tersimpan di kolom pet_robot.hewan (jsonb). */
export type DataHewanDb = {
  nama: string;
  xp: number;
  kenyang: number;
  terakhir: string;
};
export type HewanDb = {
  aktif?: string | null;
  daftar?: Record<string, DataHewanDb>;
};
/** Bentuk yang dikirim ke klien. */
export type HewanKlien = {
  kode: string;
  jenis: JenisHewan;
  nama: string;
  xp: number;
  kenyang: number;
  tahap: TahapHewan;
  suasana: SuasanaHewan;
  progres: { diTahap: number; butuh: number };
};
export type HewanState = { aktif: HewanKlien | null; daftar: HewanKlien[] };

/** Palet turunan: warna utama diganti (warna custom / warna bawaan skin), sisanya menyesuaikan. */
export function paletDenganWarna(
  jenis: JenisRobot,
  warna: string,
): (typeof PALET)[JenisRobot] {
  const dasar = PALET[jenis];
  if (jenis === "wanita") {
    return {
      ...dasar,
      utama: warna,
      utamaGelap: gelapkan(warna, 0.32),
      badan: terangkan(warna, 0.9),
      badanGelap: terangkan(warna, 0.72),
      layar: gelapkan(warna, 0.72),
      mata: terangkan(warna, 0.5),
    };
  }
  return {
    ...dasar,
    utama: warna,
    utamaGelap: gelapkan(warna, 0.32),
    mata: terangkan(warna, 0.45),
  };
}

/** Bentuk state yang dikirim API ke klien. */
export type PetState = {
  ada: boolean;
  jenis: JenisRobot | null;
  nama: string;
  /** Nama pemilik (untuk profil publik). */
  pemilik: string;
  kebutuhan: Kebutuhan;
  tidur: boolean;
  suasana: Suasana;
  vitalitas: Vitalitas;
  xp: number;
  level: number;
  xp_di_level: number;
  xp_berikut: number;
  dimiliki: string[];
  terpasang: Partial<Record<SlotAksesoris, string>>;
  sparepart_dimiliki: string[];
  sparepart_terpasang: Partial<Record<BagianSparepart, string>>;
  /** kode makanan → jumlah di inventori. */
  makanan: Record<string, number>;
  /** Skin eksklusif yang dimiliki & yang dipakai (null = tanpa skin). */
  skin_dimiliki: string[];
  skin_terpasang: string | null;
  /** Fitur warna custom sudah dibuka (300 koin) dan warna yang dipilih (#RRGGBB / null = bawaan). */
  warna_terbuka: boolean;
  warna_custom: string | null;
  /** Gerakan/emot yang sudah dibeli (4 Sep 2026). */
  gerakan_dimiliki: string[];
  /** Hewan peliharaan robot + inventori makanan hewan (4 Sep 2026). */
  hewan: HewanState;
  hewan_makanan: Record<string, number>;
  aktivitas_hari_ini: number;
  saldo_koin: number;
  hadiah_hari_ini: boolean;
  dibuat_pada: string | null;
};
