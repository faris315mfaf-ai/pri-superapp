/**
 * Gerbang modul Auto Edit (khusus master, 30 Sep 2026).
 *
 * Mesin edit videonya layanan Python terpisah (folder autoedit/, container
 * pri-autoedit-api) yang TIDAK punya port jaringan: ia hanya mendengar di
 * socket Unix yang foldernya dipasang ke container aplikasi ini. Rute
 * /api/autoedit/* satu-satunya jalan masuk ke sana, jadi di sinilah peran
 * diperiksa; layanan Python cukup mempercayai id akun yang kita kirim.
 *
 * Isi permintaan dan jawaban DIALIRKAN, tidak ditampung di memori: unggahan
 * video dan hasil render bisa ratusan MB. Karena itu rute tersebut juga
 * dikecualikan dari proxy.ts (yang memotong isi permintaan di 10 MB).
 */
import { request as mintaHttp } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as AliranNode } from "node:stream/web";

// Hanya dua keluarga rute layanan yang boleh dijangkau dari luar.
const KELUARGA_SAH = new Set(["video", "outro"]);
const HEADER_MASUK = ["content-type", "content-length", "range", "accept"];
const HEADER_KELUAR = [
  "content-type",
  "content-length",
  "content-disposition",
  "content-range",
  "accept-ranges",
  "cache-control",
  "last-modified",
  "etag",
];
// Batas DIAM (tanpa data mengalir), bukan batas total: unggahan besar di
// jaringan lambat boleh lama asal terus bergerak. Pratinjau link paling lama
// ±45 dtk di sisi layanan.
const BATAS_DIAM_MS = 10 * 60 * 1000;

function socketAutoEdit(): string {
  return process.env.AUTOEDIT_SOCKET || "/run/autoedit/api.sock";
}

export function galatAutoEdit(status: number, detail: string): Response {
  return Response.json({ detail }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Khusus master — superadmin ikut karena peran efektifnya master. Pengguna
 * virtual uji beban tidak pernah boleh, dan id harus angka karena menjadi
 * nama pemilik berkas di layanan ("pri-<id>").
 */
export function bolehAutoEdit(
  user: { id?: string | null; role?: string | null; ujiBeban?: boolean } | null | undefined,
): boolean {
  return user?.role === "master" && user.ujiBeban !== true && /^\d{1,12}$/.test(user.id ?? "");
}

/** Teruskan permintaan ke layanan Auto Edit sebagai akun `idAkun`. */
export function teruskanAutoEdit(request: Request, jalur: string[], idAkun: string): Promise<Response> {
  if (!jalur.length || !KELUARGA_SAH.has(jalur[0]) || jalur.some((b) => b === "." || b === "..")) {
    return Promise.resolve(galatAutoEdit(404, "Tidak ditemukan"));
  }
  const tujuan = `/api/${jalur.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;

  const header: Record<string, string> = { "x-autoedit-pengguna": idAkun };
  for (const nama of HEADER_MASUK) {
    const nilai = request.headers.get(nama);
    if (nilai) header[nama] = nilai;
  }

  return new Promise<Response>((selesai) => {
    const permintaan = mintaHttp(
      // agent: false = sambungan baru tiap permintaan (murah di socket lokal).
      // Soket keep-alive yang disimpan bisa basi setelah layanan dimulai
      // ulang, dan permintaan pertama sesudahnya gagal tanpa sebab jelas.
      { socketPath: socketAutoEdit(), path: tujuan, method: request.method, headers: header, agent: false },
      (jawaban) => {
        const headerJawaban = new Headers();
        for (const nama of HEADER_KELUAR) {
          const nilai = jawaban.headers[nama];
          if (typeof nilai === "string") headerJawaban.set(nama, nilai);
        }
        if (!headerJawaban.has("cache-control")) headerJawaban.set("Cache-Control", "no-store");
        const status = jawaban.statusCode ?? 502;
        const tanpaIsi = request.method === "HEAD" || status === 204 || status === 304;
        if (tanpaIsi) jawaban.resume();
        selesai(
          new Response(
            tanpaIsi ? null : (Readable.toWeb(jawaban) as unknown as ReadableStream<Uint8Array>),
            { status, headers: headerJawaban },
          ),
        );
      },
    );
    let tersambung = false;
    let waktuHabis = false;
    permintaan.on("socket", (s) => s.once("connect", () => (tersambung = true)));
    permintaan.setTimeout(BATAS_DIAM_MS, () => {
      waktuHabis = true;
      permintaan.destroy(new Error("waktu habis"));
    });
    permintaan.on("error", () => {
      // Setelah jawaban mulai mengalir, galat di sini hanya memutus aliran
      // itu; selesai() kedua diabaikan Promise. Kode galat "tidak tersambung"
      // berbeda per sistem (ENOENT/ECONNREFUSED di Linux, lain lagi untuk
      // pipe Windows), jadi yang dilihat: sempat tersambung atau tidak.
      selesai(
        !tersambung && !waktuHabis
          ? galatAutoEdit(503, "Auto Edit sedang tidak aktif. Coba lagi sebentar lagi.")
          : galatAutoEdit(504, "Auto Edit tidak menjawab. Coba lagi."),
      );
    });
    // Peramban membatalkan (tab ditutup, unggahan dihentikan): jangan biarkan
    // layanan terus menerima sesuatu yang tak ditunggu siapa pun.
    request.signal.addEventListener("abort", () => permintaan.destroy());

    if (request.body && request.method !== "GET" && request.method !== "HEAD") {
      Readable.fromWeb(request.body as unknown as AliranNode<Uint8Array>)
        .on("error", (e) => permintaan.destroy(e))
        .pipe(permintaan);
    } else {
      permintaan.end();
    }
  });
}
