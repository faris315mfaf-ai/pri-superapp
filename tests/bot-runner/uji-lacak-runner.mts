// Uji langkah Lacak Sumber di runner bot (15 Okt 2026). Murni — mesin & aplikasi dipalsukan.
// Jalankan: npx tsx tests/bot-runner/uji-lacak-runner.mts
import { GalatMesin } from "../../src/bot-runner/galat";
import { jalankanPerintah, labelDariAkun, type DepGiliran, type KeadaanGiliran } from "../../src/bot-runner/giliran";
import { ringkasLacak, type KeadaanMesin, type KlienMesin, type RingkasLacakMesin } from "../../src/bot-runner/klien-mesin";
import type { PerintahRunner } from "../../src/lib/bot-protokol";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, info?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, info !== undefined ? JSON.stringify(info) : "");
  }
};

const BUAT: Extract<PerintahRunner, { perintah: "buat_video" }> = {
  perintah: "buat_video",
  tugas_id: 11,
  url: "https://www.tiktok.com/@viralnusantara_/video/222",
  naskah: "naskah berita yang cukup panjang",
  kategori: "NEWS",
  sumber_label: "viralnusantara_",
  id_pengguna_mesin: 77,
  hook: "Hook dari otak bot",
};
const ASLI = "https://www.tiktok.com/@kabarpesisir.tv/video/111";

function palsu(lacak: { mulai?: () => Promise<string>; lihat?: (n: number) => Promise<RingkasLacakMesin> } | null) {
  const waktu = { t: 0 };
  const log: string[] = [];
  const badanJob: Record<string, unknown>[] = [];
  let panggilLihat = 0;
  const mesin: KlienMesin = {
    buatHook: async () => "Hook mesin",
    ambilKeadaan: async (): Promise<KeadaanMesin> => ({ jobs: [], stok: [] }),
    buatJob: async (_i, b) => {
      badanJob.push(b as unknown as Record<string, unknown>);
      return { jobs: [{ job_id: "BARU", status: "queued", progress: 0, texts: { hook: (b as { hook: string }).hook, kategori: "NEWS" }, error: null }], stok: [] } as unknown as KeadaanMesin;
    },
    ...(lacak
      ? {
          mulaiLacak: lacak.mulai ?? (async () => "0123456789abcdef"),
          lihatLacak: async () => (lacak.lihat ? lacak.lihat(++panggilLihat) : { status: "selesai", zona: "bukan", url_asli: "", akun: "" }),
        }
      : {}),
  };
  const dep: DepGiliran = {
    app: { denyut: async () => ({ sukses: true, jeda_global: false, menit_wib: 600, bots: [] }), ambilKerja: async () => ({ perintah: "diam", alasan: "uji" }), lapor: async () => undefined },
    mesin,
    pemanen: { panen: async () => ({ kandidat: [], jenis: "ok" }) },
    tidur: async (ms) => {
      waktu.t += ms;
    },
    sekarang: () => waktu.t,
    log: (t) => log.push(t),
  };
  const ker: KeadaanGiliran = { hilang: new Map(), harusBerhenti: () => false } as unknown as KeadaanGiliran;
  return { dep, ker, badanJob, log, waktu, lihat: () => panggilLihat };
}

console.log("\n[A] ringkasLacak & label");
cek("yakin -> url & akun terpilih", JSON.stringify(ringkasLacak({ status: "selesai", zona: "yakin", terpilih: 0, kandidat: [{ url: ASLI, akun: "@kabarpesisir.tv" }] })) === JSON.stringify({ status: "selesai", zona: "yakin", url_asli: ASLI, akun: "@kabarpesisir.tv" }));
cek("perlu_acc -> tanpa url", ringkasLacak({ status: "selesai", zona: "perlu_acc", terpilih: null, kandidat: [{ url: ASLI }] }).url_asli === "");
cek("url bukan https ditolak", ringkasLacak({ status: "selesai", zona: "yakin", terpilih: 0, kandidat: [{ url: "javascript:alert(1)" }] }).url_asli === "");
cek("bentuk asing -> gagal", ringkasLacak("x").status === "gagal" && ringkasLacak({ status: "aneh" }).status === "gagal");
cek("label dari akun", labelDariAkun("@kabarpesisir.tv") === "kabarpesisir.tv" && labelDariAkun("Kabar Pesisir TV") === "Kabar Pesisir TV");

console.log("\n[B] buat_video dengan lacak");
{
  const p = palsu({ lihat: async (n) => (n < 3 ? { status: "berjalan", zona: null, url_asli: "", akun: "" } : { status: "selesai", zona: "yakin", url_asli: ASLI, akun: "@kabarpesisir.tv" }) });
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("yakin -> job memakai video asli & kredit pemiliknya", p.badanJob[0]?.url === ASLI && p.badanJob[0]?.sumber === "kabarpesisir.tv", p.badanJob);
  cek("menunggu dengan polling", p.lihat() === 3 && p.waktu.t === 15_000, p.waktu.t);
}
{
  const p = palsu({ lihat: async () => ({ status: "selesai", zona: "perlu_acc", url_asli: "", akun: "" }) });
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("perlu_acc -> link semula", p.badanJob[0]?.url === BUAT.url && p.badanJob[0]?.sumber === "viralnusantara_");
}
{
  const p = palsu({ lihat: async () => ({ status: "gagal", zona: null, url_asli: "", akun: "" }) });
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("gagal -> link semula", p.badanJob[0]?.url === BUAT.url);
}
{
  const p = palsu({
    mulai: async () => {
      throw new GalatMesin(409, "Lacak otomatis untuk bot sedang dimatikan master.");
    },
  });
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("dimatikan master (409) -> diam, link semula", p.badanJob[0]?.url === BUAT.url && !p.log.some((l) => l.includes("lacak")), p.log);
}
{
  const p = palsu({
    mulai: async () => {
      throw new GalatMesin(503, "Pencari video asli sedang tidak aktif.");
    },
  });
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("layanan mati -> dicatat, link semula", p.badanJob[0]?.url === BUAT.url && p.log.some((l) => l.includes("lacak sumber dilewati")));
}
{
  const p = palsu({ lihat: async () => ({ status: "berjalan", zona: null, url_asli: "", akun: "" }) });
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("tidak selesai dalam batas -> link semula setelah 8 menit", p.badanJob[0]?.url === BUAT.url && p.waktu.t >= 8 * 60_000 && p.waktu.t <= 8 * 60_000 + 5_000, p.waktu.t);
}
{
  const p = palsu({ lihat: async () => ({ status: "selesai", zona: "yakin", url_asli: BUAT.url, akun: "@viralnusantara_" }) });
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("asli = link yang sama -> tidak diganti", p.badanJob[0]?.url === BUAT.url && p.badanJob[0]?.sumber === "viralnusantara_");
}
{
  const p = palsu(null);
  await jalankanPerintah(1, BUAT, p.dep, p.ker);
  cek("klien mesin lama (tanpa lacak) -> langsung job", p.badanJob[0]?.url === BUAT.url && p.waktu.t === 0);
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
