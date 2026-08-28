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

export const MODEL_TEKS = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const MODEL_SUARA =
  process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-09-2025";

export function geminiSiap(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function bolehChatbotRole(role: string): Promise<boolean> {
  if (role === "master") return true;
  const { data } = await supabase()
    .from("chatbot_access")
    .select("aktif")
    .eq("role", role)
    .maybeSingle();
  return data?.aktif === true;
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

/**
 * Jalankan SATU alat dari daftar putih. Nama di luar daftar ditolak
 * keras — bukan dijawab kosong — supaya penyimpangan ketahuan.
 */
export async function jalankanAlat(
  nama: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const db = supabase();

  switch (nama) {
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
): Promise<string> {
  const kunci = process.env.GEMINI_API_KEY;
  if (!kunci) throw Object.assign(new Error("GEMINI_API_KEY belum diatur."), { status: 503 });

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
          systemInstruction: { parts: [{ text: INSTRUKSI_ASISTEN }] },
          contents: isi,
          tools: [{ functionDeclarations: DEKLARASI_ALAT }],
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
        hasil = await jalankanAlat(namaAlat, p.functionCall!.args ?? {});
      } catch (e) {
        hasil = { galat: e instanceof Error ? e.message : "Alat gagal dijalankan." };
      }
      balasan.push({ functionResponse: { name: namaAlat, response: hasil } });
    }
    isi.push({ role: "user", parts: balasan });
  }

  return "Maaf, pertanyaannya terlalu berlapis untuk saya jawab sekali jalan — coba pecah jadi pertanyaan yang lebih kecil.";
}
