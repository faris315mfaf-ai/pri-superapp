// Uji pelulusan antrean ACC HR lama (lib/laporan-tertahan) — tanpa jaringan.
//
// Database tiruan meniru perilaku PostgREST yang penting di sini:
// kunci unik user_id+url_video (galat 23505), kolom keyword yang belum
// ada di database cloud, dan galat lain yang tidak boleh menutup antrean.
// Jalankan: npx tsx tests/uji-laporan-tertahan.mts
import { luluskanLaporanTertahan } from "@/lib/laporan-tertahan";

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

type Baris = Record<string, unknown>;

function dbTiruan(opsi: {
  pending: Baris[];
  laporan?: Baris[];
  tanpaKolomKeyword?: boolean;
  galatInsertUntukUrl?: string;
  galatBacaPending?: boolean;
}) {
  const pending = opsi.pending.map((b) => ({ ...b }));
  const laporan = (opsi.laporan ?? []).map((b) => ({ ...b }));
  let idBerikut = 1000;
  const log = { insertDicoba: 0, update: 0 };

  function from(tabel: string) {
    const filter: [string, unknown][] = [];
    let batas = Infinity;
    let aksi: "select" | "insert" | "update" = "select";
    let isi: Baris = {};
    const cocok = (b: Baris) => filter.every(([k, v]) => b[k] === v);

    const jalankan = async () => {
      if (tabel === "laporan_video_pending" && aksi === "select") {
        if (opsi.galatBacaPending) return { data: null, error: { message: "koneksi putus" } };
        const data = pending
          .filter(cocok)
          .sort((a, b) => Number(a.id) - Number(b.id))
          .slice(0, batas);
        return { data, error: null };
      }
      if (tabel === "laporan_video_pending" && aksi === "update") {
        let n = 0;
        for (const b of pending) {
          if (cocok(b)) {
            Object.assign(b, isi);
            n++;
          }
        }
        log.update += n;
        return { data: null, error: null };
      }
      if (tabel === "laporan_video" && aksi === "insert") {
        log.insertDicoba++;
        if (opsi.tanpaKolomKeyword && "keyword" in isi) {
          return {
            data: null,
            error: { code: "PGRST204", message: "Could not find the 'keyword' column of 'laporan_video' in the schema cache" },
          };
        }
        if (isi.url_video === opsi.galatInsertUntukUrl) {
          return { data: null, error: { code: "57014", message: "statement timeout" } };
        }
        if (laporan.some((l) => l.user_id === isi.user_id && l.url_video === isi.url_video)) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        const baru = { ...isi, id: idBerikut++ };
        laporan.push(baru);
        return { data: { id: baru.id }, error: null };
      }
      throw new Error(`tak terduga: ${tabel} ${aksi}`);
    };

    const pembangun: Record<string, unknown> = {
      select: () => pembangun,
      insert: (x: Baris) => {
        aksi = "insert";
        isi = x;
        return pembangun;
      },
      update: (x: Baris) => {
        aksi = "update";
        isi = x;
        return pembangun;
      },
      eq: (k: string, v: unknown) => {
        filter.push([k, v]);
        return pembangun;
      },
      order: () => pembangun,
      limit: (n: number) => {
        batas = n;
        return pembangun;
      },
      single: () => pembangun,
      then: (ok: (v: unknown) => unknown, tolak: (e: unknown) => unknown) => jalankan().then(ok, tolak),
    };
    return pembangun;
  }
  return { db: { from } as never, pending, laporan, log };
}

function koinTiruan() {
  const dibayar: string[] = [];
  const koin = (async (uid: number, aktivitas: string, ref: string) => {
    dibayar.push(`${uid}|${aktivitas}|${ref}`);
  }) as never;
  return { koin, dibayar };
}

const p = (id: number, user_id: number, url: string, extra: Baris = {}) => ({
  id,
  user_id,
  platform: "tiktok",
  url_video: url,
  keyword: "Bansos",
  tanggal_wib: "2026-09-11",
  status: "menunggu",
  ...extra,
});

console.log("\n[A] Kasus normal");
{
  const t = dbTiruan({ pending: [p(1, 7, "https://t/1"), p(2, 7, "https://t/2"), p(3, 8, "https://t/3")] });
  const k = koinTiruan();
  const n = await luluskanLaporanTertahan(undefined, 200, { db: t.db, koin: k.koin });
  cek("tiga antrean diluluskan", n === 3, n);
  cek("tiga baris masuk laporan_video", t.laporan.length === 3, t.laporan.length);
  cek("tanggal asli dipertahankan", t.laporan.every((l) => l.tanggal_wib === "2026-09-11"));
  cek("kategori ikut tersalin", t.laporan.every((l) => l.keyword === "Bansos"));
  cek("sumber = manual", t.laporan.every((l) => l.sumber === "manual"));
  cek("semua antrean berstatus disetujui", t.pending.every((b) => b.status === "disetujui"));
  cek("diputus oleh Sistem", t.pending.every((b) => b.diputus_oleh === "Sistem"));
  cek("koin dibayar sekali per laporan baru", k.dibayar.length === 3, k.dibayar);
  cek("referensi koin = laporan-<id baru>", k.dibayar[0] === "7|laporan_video|laporan-1000", k.dibayar[0]);
}

console.log("\n[B] Hanya milik satu orang");
{
  const t = dbTiruan({ pending: [p(1, 7, "https://t/1"), p(2, 8, "https://t/2")] });
  const k = koinTiruan();
  const n = await luluskanLaporanTertahan(7, 50, { db: t.db, koin: k.koin });
  cek("hanya satu yang diputus", n === 1, n);
  cek("milik orang lain tetap menunggu", t.pending.find((b) => b.id === 2)?.status === "menunggu");
}

console.log("\n[C] Link sudah tercatat (23505)");
{
  const t = dbTiruan({
    pending: [p(1, 7, "https://t/1")],
    laporan: [{ id: 5, user_id: 7, url_video: "https://t/1" }],
  });
  const k = koinTiruan();
  const n = await luluskanLaporanTertahan(7, 50, { db: t.db, koin: k.koin });
  cek("antrean tetap ditutup", n === 1 && t.pending[0].status === "disetujui");
  cek("tidak ada baris dobel", t.laporan.length === 1, t.laporan.length);
  cek("koin TIDAK dibayar lagi", k.dibayar.length === 0, k.dibayar);
}

console.log("\n[D] Database tanpa kolom keyword");
{
  const t = dbTiruan({ pending: [p(1, 7, "https://t/1")], tanpaKolomKeyword: true });
  const k = koinTiruan();
  const n = await luluskanLaporanTertahan(7, 50, { db: t.db, koin: k.koin });
  cek("tetap tercatat lewat percobaan ulang", n === 1 && t.laporan.length === 1);
  cek("baris ulang tanpa keyword", !("keyword" in t.laporan[0]));
  cek("dua kali mencoba insert", t.log.insertDicoba === 2, t.log.insertDicoba);
}

console.log("\n[E] Galat lain tidak menutup antrean");
{
  const t = dbTiruan({
    pending: [p(1, 7, "https://t/1"), p(2, 7, "https://t/2")],
    galatInsertUntukUrl: "https://t/1",
  });
  const k = koinTiruan();
  const n = await luluskanLaporanTertahan(7, 50, { db: t.db, koin: k.koin });
  cek("yang gagal dilewati, sisanya tetap jalan", n === 1, n);
  cek("yang gagal masih menunggu (dicoba lagi nanti)", t.pending[0].status === "menunggu");
  cek("yang berhasil disetujui", t.pending[1].status === "disetujui");
}

console.log("\n[F] Idempoten & batas");
{
  const t = dbTiruan({ pending: [1, 2, 3, 4, 5].map((i) => p(i, 7, `https://t/${i}`)) });
  const k = koinTiruan();
  const n1 = await luluskanLaporanTertahan(undefined, 2, { db: t.db, koin: k.koin });
  cek("batas dihormati (2 per putaran)", n1 === 2, n1);
  const n2 = await luluskanLaporanTertahan(undefined, 200, { db: t.db, koin: k.koin });
  cek("putaran berikutnya menghabiskan sisa", n2 === 3, n2);
  const n3 = await luluskanLaporanTertahan(undefined, 200, { db: t.db, koin: k.koin });
  cek("putaran ketiga tidak mengerjakan apa-apa", n3 === 0, n3);
  cek("total baris = 5, tidak ada dobel", t.laporan.length === 5, t.laporan.length);
  cek("koin total 5", k.dibayar.length === 5, k.dibayar.length);
}

console.log("\n[G] Gagal baca tidak melempar");
{
  const t = dbTiruan({ pending: [], galatBacaPending: true });
  const k = koinTiruan();
  let n = -1;
  let melempar = false;
  try {
    n = await luluskanLaporanTertahan(7, 50, { db: t.db, koin: k.koin });
  } catch {
    melempar = true;
  }
  cek("tidak melempar", !melempar);
  cek("hasil 0", n === 0, n);
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
