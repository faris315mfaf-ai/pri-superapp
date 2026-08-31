// ============================================================
// Gemini (fitur 1.20/3) — SISI SERVER SAJA.
//
// Chatbot data internal partai. Prinsip keamanannya keras:
// 1. GEMINI_API_KEY tidak pernah menyentuh peramban. Mode suara
//    memakai TOKEN SEMENTARA (ephemeral) yang dimintakan server.
// 2. Model TIDAK diberi akses SQL. Ia hanya boleh MEMANGGIL ALAT
//    dari daftar putih di bawah — semuanya baca-saja, kolomnya
//    dipilih tangan (tanpa nomor WA, tanpa sandi, tanpa token).
// 3. Akses per jabatan (tabel chatbot_access) diperiksa di endpoint,
//    bukan di layar.
// ============================================================
import { supabase } from "@/lib/supabase";
import { kirimKabar } from "@/lib/notifikasi";
import { DIVISI } from "@/lib/struktur";
import { bacaBasis } from "@/lib/asisten-basis";

// Bawaan DIVERIFIKASI terhadap kunci user 28 Agu 2026: generasi 2.5
// sudah ditutup untuk pengguna baru; 3.6-flash teruji menjawab, dan
// 3.1-flash-live-preview adalah model bidi (suara) generasi terbaru.
export const MODEL_TEKS = process.env.GEMINI_MODEL || "gemini-3.6-flash";
export const MODEL_SUARA =
  process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";

export function geminiSiap(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function bolehChatbotRole(role: string): Promise<boolean> {
  // Master & super admin (= jabatan Ketua Umum, model peran baru) selalu
  // boleh — "buka seluruh mode untuk ketua umum" (permintaan 31 Agu 2026).
  if (role === "master" || role === "super_admin") return true;
  const { data } = await supabase()
    .from("chatbot_access")
    .select("aktif")
    .eq("role", role)
    .maybeSingle();
  return data?.aktif === true;
}

/** Identitas pemanggil — menentukan sapaan & alat yang terbuka. */
export type PemanggilAsisten = {
  id: string;
  nama: string;
  role: string;
  jabatan?: string | null;
};

/**
 * Akses PENUH asisten (semua alat, termasuk alat AKSI: kirim notifikasi/
 * pengumuman/chat + data personal). Berlaku untuk master DAN Ketua Umum
 * — permintaan user 31 Agu 2026: "buka seluruh akses tak terhingga untuk
 * AI assistennya". Jabatan dicek juga sebagai sabuk pengaman, walau
 * userDariToken sudah mempromosikan jabatan Ketua Umum → super_admin.
 */
export function aksesPenuhAsisten(p: Pick<PemanggilAsisten, "role" | "jabatan">): boolean {
  return (
    p.role === "master" ||
    p.role === "super_admin" ||
    (p.jabatan ?? "").trim() === "Ketua Umum"
  );
}

/**
 * Sapaan hormat berdasarkan JABATAN struktur partai (fitur 1.20.3).
 * Ini yang membuat Ketua Umum disambut "Pak Ketum". Master bisa
 * menimpanya lewat instruksi pelatihan.
 */
function sapaanJabatan(jabatan: string): string {
  const j = jabatan.trim().toLowerCase();
  if (!j) return "";
  if (j === "ketua umum") return 'Panggil beliau "Pak Ketum" dan awali jawaban pertama dengan "Siap, Pak Ketum!".';
  if (j.includes("sekretaris jenderal") || j === "sekjen")
    return 'Panggil beliau "Pak Sekjen" dengan hormat.';
  if (j.includes("bendahara")) return 'Panggil beliau "Pak/Bu Bendahara" dengan hormat.';
  if (j.includes("direktur")) return `Panggil beliau "Direktur" dengan hormat.`;
  if (j.includes("wakil")) return `Sapa beliau dengan jabatannya ("${jabatan}") secara hormat.`;
  if (j.includes("ketua")) return `Sapa beliau "Ketua" dengan hormat.`;
  return `Sapa beliau dengan hormat sesuai jabatannya ("${jabatan}").`;
}

// ------------------------------------------------------------
// Pelatihan (fitur 1.20.2): instruksi tambahan yang ditulis MASTER
// di Panel Master. Disuntikkan ke system instruction setiap
// percakapan (teks & suara) — cara "melatih" perilaku asisten yang
// langsung berlaku tanpa menunggu apa pun.
// ------------------------------------------------------------

export const MAKS_INSTRUKSI_LATIH = 6000;

export async function instruksiLatihan(): Promise<string> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", "asisten_instruksi")
      .maybeSingle();
    return String(data?.nilai ?? "").slice(0, MAKS_INSTRUKSI_LATIH);
  } catch {
    return "";
  }
}

/** System instruction lengkap untuk pemanggil ini (dasar + identitas + latihan + aksi). */
export async function instruksiUntuk(pemanggil: PemanggilAsisten): Promise<string> {
  const latihan = await instruksiLatihan();
  let instruksi = INSTRUKSI_ASISTEN;

  // --- Identitas lawan bicara (fitur 1.20.3) — untuk SEMUA pengguna,
  // supaya asisten menyapa dengan nama & jabatan yang tepat. Inilah
  // yang membuat Ketua Umum disambut "Pak Ketum".
  const namaPendek = pemanggil.nama.split(" ").slice(0, 2).join(" ") || pemanggil.nama;
  const jabatan = (pemanggil.jabatan ?? "").trim();
  instruksi += `\n\n=== LAWAN BICARA SAAT INI ===\nKamu sedang melayani ${pemanggil.nama}${jabatan ? ` — jabatan: ${jabatan}` : ""}.`;
  if (jabatan) {
    instruksi += ` ${sapaanJabatan(jabatan)}`;
  } else {
    instruksi += ` Sapa dengan sopan, mis. "Kak ${namaPendek}".`;
  }
  instruksi += `\nDi awal percakapan (terutama mode suara), sapa beliau lebih dulu dengan sapaan hormat itu SEBELUM menjawab.`;

  if (latihan.trim()) {
    instruksi += `\n\n=== PELATIHAN DARI MASTER (patuh selama tidak melanggar aturan keamanan di atas; boleh menimpa aturan sapaan) ===\n${latihan.trim()}`;
  }
  if (aksesPenuhAsisten(pemanggil)) {
    // Berlaku untuk MASTER maupun KETUA UMUM — keduanya pemegang akses
    // penuh alat aksi (buka-seluruh-mode, 31 Agu 2026).
    const gelar =
      pemanggil.role === "master"
        ? `MASTER (${pemanggil.nama}), pemegang kendali tertinggi aplikasi`
        : `KETUA UMUM (${pemanggil.nama}), pemegang kendali tertinggi partai`;
    instruksi += `\n\n=== MODE AKSES PENUH ===\nLawan bicaramu adalah ${gelar}.\nKamu juga punya alat AKSI: kirim_notifikasi, kirim_pengumuman, kirim_chat_grup, dan detail_anggota (data personal lengkap).\nJalankan alat aksi HANYA bila beliau memintanya secara eksplisit. Sebelum mengirim sesuatu ke banyak orang, bacakan dulu ringkasan isinya lalu minta konfirmasi satu kali; kirim setelah beliau mengiyakan.\nSetiap aksi tercatat di jejak audit.`;
  }
  return instruksi;
}

// ------------------------------------------------------------
// Alat (function calling) — SATU-SATUNYA jendela model ke data.
// ------------------------------------------------------------

function tanggalWibSekarang(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function tanggalSah(t: unknown): string {
  const s = String(t ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : tanggalWibSekarang();
}

export const DEKLARASI_ALAT = [
  {
    name: "baca_basis_pengetahuan",
    description:
      "Ambil GAMBARAN MENYELURUH seluruh sistem partai dalam satu objek terstruktur: keanggotaan (total, per peran, per divisi, kelengkapan data), absensi hari ini, KPI video, kepatuhan komentar, statistik TV Rakyat 7 hari, koin, rencana KPI aktif, acara mendatang, akun wajib QC, struktur divisi, CATATAN internal dari pengurus, serta BAHAN BELAJAR (materi teks yang diunggah pengurus sebagai rujukan). Panggil ini untuk pertanyaan LUAS/umum, saat butuh konteks lengkap, ATAU saat pertanyaan mungkin terjawab oleh bahan belajar yang diunggah; data disegarkan otomatis tiap jam.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "ringkasan_absensi",
    description:
      "Ringkasan kehadiran anggota partai pada satu tanggal: total anggota, sudah absen, izin/sakit disetujui, dan yang belum absen.",
    parameters: {
      type: "object",
      properties: {
        tanggal: { type: "string", description: "YYYY-MM-DD; kosong = hari ini WIB" },
      },
    },
  },
  {
    name: "ringkasan_kpi_video",
    description:
      "Ringkasan KPI laporan video harian anggota pada satu tanggal: total video dilaporkan, berapa anggota mencapai target, berapa belum.",
    parameters: {
      type: "object",
      properties: {
        tanggal: { type: "string", description: "YYYY-MM-DD; kosong = hari ini WIB" },
      },
    },
  },
  {
    name: "ringkasan_kepatuhan",
    description:
      "Ringkasan kepatuhan komentar hari ini: berapa kader sudah memenuhi seluruh kewajiban komentar di akun wajib, berapa yang belum.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "statistik_tv",
    description:
      "Statistik produksi video TV Rakyat beberapa hari terakhir: video dibuat, terunggah ke sosmed, posting sukses/gagal per keseluruhan, dan jumlah interaksi anggota.",
    parameters: {
      type: "object",
      properties: {
        hari: { type: "number", description: "Jendela hari ke belakang, 1-90 (bawaan 7)" },
      },
    },
  },
  {
    name: "cari_anggota",
    description:
      "Cari anggota berdasarkan nama. Mengembalikan maksimal 5: nama, divisi, jabatan, dan status keaktifan. TIDAK memuat kontak pribadi.",
    parameters: {
      type: "object",
      properties: {
        nama: { type: "string", description: "Sebagian nama yang dicari" },
      },
      required: ["nama"],
    },
  },
] as const;

// Alat KHUSUS MASTER (fitur 1.20.2): data personal penuh + aksi
// sistem. Tidak pernah masuk daftar alat peran lain, dan tiap
// eksekusinya diperiksa ulang di jalankanAlat (pertahanan berlapis).
export const DEKLARASI_ALAT_MASTER = [
  {
    name: "detail_anggota",
    description:
      "KHUSUS MASTER. Profil LENGKAP satu anggota: email, nomor WhatsApp, tanggal lahir, divisi, jabatan, peran, status akun, absensi hari ini, dan jumlah video hari ini.",
    parameters: {
      type: "object",
      properties: {
        nama: { type: "string", description: "Nama anggota (boleh sebagian)" },
      },
      required: ["nama"],
    },
  },
  {
    name: "kirim_notifikasi",
    description:
      "KHUSUS MASTER. Kirim notifikasi aplikasi (+push). target: 'semua', nama peran (super_admin/admin_hr/admin_tv/ketua/anggota), atau nama orang tertentu.",
    parameters: {
      type: "object",
      properties: {
        judul: { type: "string" },
        isi: { type: "string" },
        target: { type: "string", description: "'semua' | nama peran | nama orang" },
      },
      required: ["judul", "isi", "target"],
    },
  },
  {
    name: "kirim_pengumuman",
    description:
      "KHUSUS MASTER. Terbitkan PENGUMUMAN resmi ke SELURUH anggota atas nama master (tampil di Beranda + notifikasi tertarget).",
    parameters: {
      type: "object",
      properties: {
        judul: { type: "string" },
        isi: { type: "string" },
      },
      required: ["judul", "isi"],
    },
  },
  {
    name: "kirim_chat_grup",
    description:
      "KHUSUS MASTER. Kirim pesan ke ruang chat sebuah grup divisi atas nama master. Parameter divisi harus nama divisi yang sah.",
    parameters: {
      type: "object",
      properties: {
        divisi: { type: "string", description: "Nama divisi tujuan, mis. 'Divisi TV Rakyat'" },
        isi: { type: "string" },
      },
      required: ["divisi", "isi"],
    },
  },
] as const;

/**
 * Daftar alat yang terbuka untuk seorang pemanggil. Akses penuh
 * (master & Ketua Umum) mendapat SEMUA alat termasuk alat aksi.
 */
export function deklarasiAlatUntuk(
  pemanggil: Pick<PemanggilAsisten, "role" | "jabatan">,
) {
  return aksesPenuhAsisten(pemanggil)
    ? [...DEKLARASI_ALAT, ...DEKLARASI_ALAT_MASTER]
    : [...DEKLARASI_ALAT];
}

/** Jejak audit satu aksi AI — keamanan: setiap aksi tertelusur. */
async function catatAksiAi(
  pemanggil: PemanggilAsisten,
  aksi: string,
  detail: string,
): Promise<void> {
  try {
    await supabase().from("log_audit").insert({
      aktor_id: Number(pemanggil.id),
      aktor_nama: `${pemanggil.nama} (via Asisten AI)`,
      aksi,
      target_id: null,
      target_nama: "-",
      detail: detail.slice(0, 500),
    });
  } catch (e) {
    console.error("[gemini] audit:", e);
  }
}

/**
 * Jalankan SATU alat dari daftar putih. Nama di luar daftar ditolak
 * keras — bukan dijawab kosong — supaya penyimpangan ketahuan.
 * Alat master diperiksa ULANG terhadap peran pemanggil di sini
 * (pertahanan berlapis: daftar alat per peran saja tidak cukup).
 */
export async function jalankanAlat(
  nama: string,
  args: Record<string, unknown>,
  pemanggil: PemanggilAsisten,
): Promise<Record<string, unknown>> {
  const db = supabase();

  const ALAT_MASTER = new Set(DEKLARASI_ALAT_MASTER.map((a) => a.name as string));
  if (ALAT_MASTER.has(nama) && !aksesPenuhAsisten(pemanggil)) {
    throw new Error(`Alat "${nama}" khusus master/Ketua Umum.`);
  }

  switch (nama) {
    case "baca_basis_pengetahuan": {
      // Gambaran menyeluruh (fitur 1.20.4) — disegarkan otomatis tiap
      // jam di dalam bacaBasis(). Catatan pengurus digabung segar.
      const b = await bacaBasis();
      return {
        data: b.konten,
        catatan_internal: b.catatan || "(belum ada catatan)",
        // Bahan belajar TXT unggahan master (fitur 1.22/4) — materi
        // tambahan yang dijadikan rujukan AI saat menjawab.
        bahan_belajar: b.bahan_ajar || "(belum ada bahan belajar)",
        disegarkan: b.diperbarui_pada,
        umur_menit: b.umur_menit,
      };
    }

    // ---------- ALAT KHUSUS MASTER (fitur 1.20.2) ----------
    case "detail_anggota": {
      const q = String(args.nama ?? "").trim().slice(0, 60);
      if (q.length < 2) return { galat: "Nama pencarian terlalu pendek." };
      const { data: u } = await db
        .from("app_user")
        .select(
          "id, nama, email, nomor_wa, wa_terverifikasi, tanggal_lahir, divisi, sub_divisi, posisi_divisi, jabatan, role, status, aktif, google_linked, last_login_at, created_at",
        )
        .ilike("nama", `%${q.replace(/[%_]/g, "")}%`)
        .neq("role", "master")
        .limit(1)
        .maybeSingle();
      if (!u) return { galat: `Anggota "${q}" tidak ditemukan.` };
      const tanggal = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      const [{ data: absen }, { data: video }] = await Promise.all([
        db
          .from("absensi")
          .select("jenis, waktu")
          .eq("user_id", Number(u.id))
          .eq("tanggal_wib", tanggal),
        db
          .from("v_app_video_harian_user")
          .select("jumlah")
          .eq("user_id", Number(u.id))
          .eq("tanggal_wib", tanggal)
          .maybeSingle(),
      ]);
      await catatAksiAi(
        pemanggil,
        "ai_baca_personal",
        `Membaca profil lengkap "${u.nama}" lewat Asisten AI.`,
      );
      return {
        nama: u.nama,
        email: u.email,
        nomor_wa: u.nomor_wa ?? "-",
        wa_terverifikasi: u.wa_terverifikasi === true,
        tanggal_lahir: u.tanggal_lahir ?? "-",
        divisi: u.divisi || "-",
        sub_divisi: u.sub_divisi || "-",
        posisi_divisi: u.posisi_divisi || "-",
        jabatan: u.jabatan || "-",
        peran: u.role,
        status_akun: u.aktif ? u.status : "nonaktif",
        google_tertaut: u.google_linked === true,
        login_terakhir: u.last_login_at ?? "belum pernah (tercatat sejak 1.19)",
        terdaftar_pada: u.created_at,
        absen_hari_ini:
          (absen ?? []).map((a) => `${a.jenis} ${String(a.waktu).slice(11, 19)}`).join(", ") ||
          "belum absen",
        video_hari_ini: Number(video?.jumlah ?? 0),
      };
    }

    case "kirim_notifikasi": {
      const judul = String(args.judul ?? "").trim().slice(0, 100);
      const isi = String(args.isi ?? "").trim().slice(0, 500);
      const target = String(args.target ?? "").trim();
      if (!judul || !isi || !target) return { galat: "judul/isi/target wajib diisi." };

      const PERAN = new Set(["super_admin", "admin_hr", "admin_tv", "ketua", "anggota"]);
      let kepada: { untukRole?: string[]; untukUserIds?: number[] } = {};
      let deskripsi = "";
      if (target.toLowerCase() === "semua") {
        kepada = {};
        deskripsi = "SEMUA anggota";
      } else if (PERAN.has(target.toLowerCase())) {
        kepada = { untukRole: [target.toLowerCase()] };
        deskripsi = `peran ${target}`;
      } else {
        const { data: orang } = await db
          .from("app_user")
          .select("id, nama")
          .ilike("nama", `%${target.replace(/[%_]/g, "")}%`)
          .eq("aktif", true)
          .limit(1)
          .maybeSingle();
        if (!orang) return { galat: `Target "${target}" tidak dikenal (bukan peran/nama anggota).` };
        kepada = { untukUserIds: [Number(orang.id)] };
        deskripsi = orang.nama as string;
      }

      await kirimKabar({
        judul: `🤖 ${judul}`,
        isi,
        kategori: "info",
        jenis_peristiwa: "asisten",
        ...kepada,
      });
      await catatAksiAi(
        pemanggil,
        "ai_kirim_notifikasi",
        `Notifikasi "${judul}" ke ${deskripsi}: ${isi.slice(0, 120)}`,
      );
      return { sukses: true, terkirim_ke: deskripsi };
    }

    case "kirim_pengumuman": {
      const judul = String(args.judul ?? "").trim().slice(0, 120);
      const isi = String(args.isi ?? "").trim().slice(0, 2000);
      if (judul.length < 3 || isi.length < 3) return { galat: "Judul & isi wajib diisi." };

      const { data: semua } = await db
        .from("app_user")
        .select("id")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("id", Number(pemanggil.id));
      const penerima = (semua ?? []).map((x) => Number(x.id));
      if (penerima.length === 0) return { galat: "Tidak ada penerima." };

      const { data: baris, error } = await db
        .from("pengumuman")
        .insert({
          pengirim_id: Number(pemanggil.id),
          pengirim_nama: `${pemanggil.nama} 🤖`,
          judul,
          isi,
          cakupan: "semua",
          jabatan_target: null,
          jumlah_penerima: penerima.length,
        })
        .select("id")
        .single();
      if (error || !baris) return { galat: "Gagal menyimpan pengumuman." };
      await db
        .from("pengumuman_penerima")
        .insert(penerima.map((uid) => ({ pengumuman_id: baris.id, user_id: uid })));
      await kirimKabar({
        judul: `📢 ${judul.slice(0, 100)}`,
        isi: `${pemanggil.nama}: ${isi.slice(0, 200)}`,
        kategori: "info",
        jenis_peristiwa: "pengumuman",
        untukUserIds: penerima,
      });
      await catatAksiAi(
        pemanggil,
        "ai_kirim_pengumuman",
        `Pengumuman "${judul}" ke ${penerima.length} anggota: ${isi.slice(0, 120)}`,
      );
      return { sukses: true, jumlah_penerima: penerima.length };
    }

    case "kirim_chat_grup": {
      const divisi = String(args.divisi ?? "").trim();
      const isi = String(args.isi ?? "").trim().slice(0, 1000);
      if (!isi) return { galat: "Isi pesan kosong." };
      if (!(DIVISI as readonly string[]).includes(divisi)) {
        return {
          galat: `Divisi "${divisi}" tidak dikenal. Pilihan: ${DIVISI.join(", ")}.`,
        };
      }
      const { error } = await db.from("chat_pesan_grup").insert({
        divisi,
        pengirim_id: Number(pemanggil.id),
        isi,
      });
      if (error) return { galat: "Gagal mengirim pesan grup." };
      await catatAksiAi(
        pemanggil,
        "ai_kirim_chat",
        `Chat ke grup ${divisi}: ${isi.slice(0, 120)}`,
      );
      return { sukses: true, grup: divisi };
    }
    case "ringkasan_absensi": {
      const tanggal = tanggalSah(args.tanggal);
      const [{ data: roster }, { data: absen }, { data: izin }] = await Promise.all([
        db
          .from("app_user")
          .select("id")
          .eq("aktif", true)
          .eq("status", "aktif")
          .neq("role", "master")
          .limit(500),
        db.from("absensi").select("user_id, jenis").eq("tanggal_wib", tanggal).limit(1000),
        db
          .from("perizinan")
          .select("user_id, jenis")
          .eq("tanggal_wib", tanggal)
          .eq("status", "disetujui")
          .limit(500),
      ]);
      const total = (roster ?? []).length;
      const sudahMasuk = new Set(
        (absen ?? []).filter((a) => a.jenis === "masuk").map((a) => Number(a.user_id)),
      );
      const dibebaskan = new Set((izin ?? []).map((i) => Number(i.user_id)));
      const hadir = sudahMasuk.size;
      const izinSakit = dibebaskan.size;
      return {
        tanggal,
        total_anggota: total,
        sudah_absen: hadir,
        izin_atau_sakit: izinSakit,
        belum_absen: Math.max(0, total - hadir - izinSakit),
      };
    }

    case "ringkasan_kpi_video": {
      const tanggal = tanggalSah(args.tanggal);
      const [{ data: roster }, { data: video }] = await Promise.all([
        db
          .from("app_user")
          .select("id, kpi_video")
          .eq("aktif", true)
          .eq("status", "aktif")
          .neq("role", "master")
          .limit(500),
        db
          .from("v_app_video_harian_user")
          .select("user_id, jumlah")
          .eq("tanggal_wib", tanggal),
      ]);
      const per = new Map((video ?? []).map((v) => [Number(v.user_id), Number(v.jumlah)]));
      let tercapai = 0;
      let totalVideo = 0;
      for (const u of roster ?? []) {
        const target = u.kpi_video != null ? Number(u.kpi_video) : 5;
        const jumlah = per.get(Number(u.id)) ?? 0;
        totalVideo += jumlah;
        if (jumlah >= target) tercapai += 1;
      }
      const total = (roster ?? []).length;
      return {
        tanggal,
        total_anggota: total,
        total_video: totalVideo,
        anggota_tercapai: tercapai,
        anggota_belum: total - tercapai,
      };
    }

    case "ringkasan_kepatuhan": {
      const periode = `${tanggalWibSekarang()} 00:00-23:59`;
      const { data } = await db
        .from("v_app_kepatuhan_kader")
        .select("nama_kader, sudah, total")
        .eq("periode", periode);
      const baris = data ?? [];
      const penuh = baris.filter((b) => Number(b.sudah) >= Number(b.total) && Number(b.total) > 0);
      return {
        periode,
        total_kader: baris.length,
        sudah_penuh: penuh.length,
        belum_penuh: baris.length - penuh.length,
        catatan:
          baris.length === 0
            ? "Belum ada data — analisis komentar hari ini belum dijalankan."
            : undefined,
      };
    }

    case "statistik_tv": {
      const hari = Math.min(90, Math.max(1, Math.floor(Number(args.hari)) || 7));
      const batas = new Date(Date.now() - hari * 24 * 3600_000).toISOString();
      const [{ data: video }, { data: interaksi }] = await Promise.all([
        db
          .from("video_antrian")
          .select("diunggah_pada, ayrshare_hasil")
          .gte("jam_tanggal", batas)
          .limit(500),
        db.from("interaksi_video").select("jenis").gte("pada", batas).limit(1000),
      ]);
      let sukses = 0;
      let gagal = 0;
      for (const v of video ?? []) {
        for (const h of (Array.isArray(v.ayrshare_hasil) ? v.ayrshare_hasil : []) as {
          status?: string;
        }[]) {
          if (h.status === "success") sukses += 1;
          else gagal += 1;
        }
      }
      return {
        jendela_hari: hari,
        video_dibuat: (video ?? []).length,
        video_terunggah: (video ?? []).filter((v) => v.diunggah_pada).length,
        posting_sukses: sukses,
        posting_gagal: gagal,
        interaksi_anggota: (interaksi ?? []).length,
      };
    }

    case "cari_anggota": {
      const q = String(args.nama ?? "").trim().slice(0, 60);
      if (q.length < 2) return { hasil: [], catatan: "Nama pencarian terlalu pendek." };
      const { data } = await db
        .from("app_user")
        .select("nama, divisi, jabatan, aktif, status")
        .ilike("nama", `%${q.replace(/[%_]/g, "")}%`)
        .neq("role", "master")
        .limit(5);
      return {
        hasil: (data ?? []).map((u) => ({
          nama: u.nama,
          divisi: u.divisi || "-",
          jabatan: u.jabatan || "-",
          aktif: u.aktif === true && u.status === "aktif",
        })),
      };
    }

    default:
      throw new Error(`Alat "${nama}" tidak ada di daftar putih.`);
  }
}

// ------------------------------------------------------------
// Percakapan teks (generateContent + putaran alat)
// ------------------------------------------------------------

export const INSTRUKSI_ASISTEN = `Kamu adalah Asisten PRI, asisten data internal PRI SuperApp untuk pengurus Partai Rakyat Indonesia.
Jawab SELALU dalam Bahasa Indonesia yang sopan, ringkas, dan berbasis angka dari alat yang tersedia.
Gunakan alat untuk mengambil data sebelum menjawab pertanyaan tentang absensi, KPI video, kepatuhan komentar, statistik TV Rakyat, atau anggota.
Jangan pernah mengarang angka. Bila alat tidak menyediakan datanya, katakan terus terang.
Jangan membocorkan kontak pribadi, kata sandi, atau data di luar hasil alat.`;

type BagianGemini = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};
type IsiGemini = { role: string; parts: BagianGemini[] };

/**
 * Satu giliran chat: kirim riwayat + pesan, layani functionCall
 * (maksimal 4 putaran — pagar biaya & loop), kembalikan teks jawaban.
 */
export async function tanyaGemini(
  riwayat: { peran: "pengguna" | "asisten"; teks: string }[],
  pesan: string,
  pemanggil: PemanggilAsisten,
): Promise<string> {
  const kunci = process.env.GEMINI_API_KEY;
  if (!kunci) throw Object.assign(new Error("GEMINI_API_KEY belum diatur."), { status: 503 });

  // Instruksi & daftar alat MENGIKUTI PEMANGGIL: master & Ketua Umum
  // mendapat alat data personal + aksi, peran lain hanya alat ringkasan.
  const instruksi = await instruksiUntuk(pemanggil);
  const alat = deklarasiAlatUntuk(pemanggil);

  const isi: IsiGemini[] = [
    ...riwayat.slice(-12).map((r) => ({
      role: r.peran === "pengguna" ? "user" : "model",
      parts: [{ text: r.teks.slice(0, 4000) }],
    })),
    { role: "user", parts: [{ text: pesan.slice(0, 4000) }] },
  ];

  for (let putaran = 0; putaran < 4; putaran++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEKS}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": kunci,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruksi }] },
          contents: isi,
          tools: [{ functionDeclarations: alat }],
        }),
      },
    );
    if (!res.ok) {
      const galat = await res.text().catch(() => "");
      console.error("[gemini] status", res.status, galat.slice(0, 300));
      throw Object.assign(
        new Error(
          res.status === 429
            ? "Kuota AI sedang habis — coba lagi sebentar."
            : "Layanan AI sedang bermasalah. Coba lagi.",
        ),
        { status: 502, pesanAman: true },
      );
    }
    const json = (await res.json()) as {
      candidates?: { content?: IsiGemini }[];
    };
    const konten = json.candidates?.[0]?.content;
    const bagian = konten?.parts ?? [];

    const panggilan = bagian.filter((b) => b.functionCall?.name);
    if (panggilan.length === 0) {
      const teks = bagian
        .map((b) => b.text ?? "")
        .join("")
        .trim();
      return teks || "Maaf, saya tidak menemukan jawabannya.";
    }

    // Layani seluruh functionCall pada giliran ini, lalu lanjutkan.
    isi.push({ role: "model", parts: bagian });
    const balasan: BagianGemini[] = [];
    for (const p of panggilan) {
      const namaAlat = String(p.functionCall!.name);
      let hasil: Record<string, unknown>;
      try {
        hasil = await jalankanAlat(namaAlat, p.functionCall!.args ?? {}, pemanggil);
      } catch (e) {
        hasil = { galat: e instanceof Error ? e.message : "Alat gagal dijalankan." };
      }
      balasan.push({ functionResponse: { name: namaAlat, response: hasil } });
    }
    isi.push({ role: "user", parts: balasan });
  }

  return "Maaf, pertanyaannya terlalu berlapis untuk saya jawab sekali jalan — coba pecah jadi pertanyaan yang lebih kecil.";
}
