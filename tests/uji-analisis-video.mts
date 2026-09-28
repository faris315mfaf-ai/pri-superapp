// Uji Analisis Video (29 Sep 2026): mesin ringkasan murni + pembaca katalog.
// Jalankan: npx tsx tests/uji-analisis-video.mts
// Bagian pembaca memakai PostgREST TIRUAN di 127.0.0.1 — tidak menyentuh Supabase asli.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { median, siapkanBaris, susunTampilan, type BarisAnalisis, type BarisSiap } from "@/lib/analisis-video";
import { bacaKatalog } from "@/lib/analisis-video-data";
import { BELUM_DITARIK } from "@/lib/metrik-video-up";

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i).slice(0, 400) : "");
  }
};

const SEGAR = "2026-09-29T00:00:00+00:00";
let nomor = 0;
/** Baris katalog tiruan. `wib` = "YYYY-MM-DD HH:MM" waktu WIB. */
function baris(o: { wib: string | null; platform?: string; uid?: number; tayangan?: number; suka?: number; komentar?: number; bagikan?: number; belum?: boolean; user?: string }): BarisAnalisis {
  nomor += 1;
  return {
    kode: `tt_${String(nomor).padStart(7, "0")}`,
    platform: o.platform ?? "tiktok",
    user_id: o.uid ?? 1,
    akun_username: o.user ?? `akun${o.uid ?? 1}`,
    waktu_posting: o.wib ? new Date(`${o.wib.replace(" ", "T")}:00+07:00`).toISOString() : null,
    tayangan: o.tayangan ?? 0,
    suka: o.suka ?? 0,
    komentar: o.komentar ?? 0,
    bagikan: o.bagikan ?? 0,
    diperbarui_pada: o.belum ? BELUM_DITARIK : SEGAR,
  };
}
// "Kini" = Selasa 29 Sep 2026 10.00 WIB.
const KINI = Date.parse("2026-09-29T10:00:00+07:00");

console.log("siapkanBaris — waktu WIB & penanda");
{
  const a = siapkanBaris(baris({ wib: "2026-09-29 01:30" }));
  cek("UTC 18.30 kemarin → tanggal & jam WIB (Selasa 01)", a.tanggal === "2026-09-29" && a.jam === 1 && a.hari === 2, a);
  const s = siapkanBaris(baris({ wib: "2026-09-20 12:00" }));
  cek("tepat 12.00.00 WIB = waktu tebakan → jam -1, tanggal tetap", s.jam === -1 && s.tanggal === "2026-09-20" && s.hari === 0, s);
  const n = siapkanBaris(baris({ wib: null }));
  cek("tanpa waktu → tanggal kosong", n.tanggal === "" && n.jam === -1 && n.hari === -1);
  const b = siapkanBaris(baris({ wib: "2026-09-29 08:00", belum: true, tayangan: 500 }));
  cek("belum ditarik → tidak berangka", b.berangka === false);
  const t = siapkanBaris({ ...baris({ wib: "2026-09-29 08:00" }), tayangan: "1200", suka: "-3", komentar: null, platform: "x" });
  cek("angka teks diurai, negatif/null → 0, 'x' → twitter", t.tayangan === 1200 && t.suka === 0 && t.komentar === 0 && t.platform === "twitter", t);
  cek("median ganjil/genap/kosong", median([5, 1, 3]) === 3 && median([1, 2, 3, 10]) === 3 && median([]) === 0);
}

console.log("susunTampilan — rentang, saringan, ringkasan");
{
  const data: BarisSiap[] = [
    baris({ wib: "2026-09-29 09:00", tayangan: 1000, suka: 50, komentar: 30, bagikan: 20 }),
    baris({ wib: "2026-09-28 19:00", tayangan: 3000, suka: 100, komentar: 50, bagikan: 50 }),
    baris({ wib: "2026-09-28 19:10", belum: true, tayangan: 99999 }),
    baris({ wib: "2026-09-23 08:00", platform: "instagram", uid: 2, tayangan: 500, suka: 10 }),
    baris({ wib: "2026-09-22 23:59", tayangan: 7777 }), // di luar 7 hari (dari 23 Sep)
    baris({ wib: "2026-09-30 00:30", tayangan: 5 }), // masa depan (jam server beda) → di luar
    baris({ wib: null, tayangan: 42 }),
  ].map(siapkanBaris);
  const t = susunTampilan(data, { rentang: "7", kiniMs: KINI });
  cek("rentang 7 hari: 23–29 Sep", t.dari === "2026-09-23" && t.sampai === "2026-09-29", { dari: t.dari, sampai: t.sampai });
  cek("tren harian lengkap 7 titik (tanpa bolong)", t.tren.length === 7 && t.tren[0].t === "2026-09-23" && t.tren[6].t === "2026-09-29" && t.tren[2].video === 0);
  cek("video = semua di rentang (termasuk yang belum berangka)", t.ringkas.video === 4 && t.ringkas.berangka === 3, t.ringkas);
  cek("tayangan hanya dari yang berangka (99.999 tidak ikut)", t.ringkas.tayangan === 4500, t.ringkas.tayangan);
  cek("rata-rata & median per video berangka", t.ringkas.rata_tayangan === 1500 && t.ringkas.median_tayangan === 1000, t.ringkas);
  cek("ER = interaksi / tayangan", t.ringkas.er === Math.round((310 / 4500) * 10_000) / 100, t.ringkas.er);
  cek("tren 28 Sep: 2 video, 1 berangka, 3.000 tayangan, 200 interaksi", JSON.stringify(t.tren[5]) === JSON.stringify({ t: "2026-09-28", video: 2, berangka: 1, tayangan: 3000, interaksi: 200 }), t.tren[5]);
  cek("per platform urut TikTok lalu Instagram", t.per_platform.map((p) => p.platform).join(",") === "tiktok,instagram" && t.per_platform[1].tayangan === 500);
  cek("jumlah akun 2", t.jumlah_akun === 2);
  const ig = susunTampilan(data, { rentang: "7", platform: "instagram", kiniMs: KINI });
  cek("saring platform", ig.ringkas.video === 1 && ig.ringkas.tayangan === 500 && ig.platform === "instagram");
  const a1 = susunTampilan(data, { rentang: "7", akun: "1|tiktok", kiniMs: KINI });
  cek("saring akun (user_id|platform)", a1.ringkas.video === 3 && a1.jumlah_akun === 1 && a1.akun === "1|tiktok");
  const sm = susunTampilan(data, { rentang: "semua", kiniMs: KINI });
  cek("semua: mulai video tertua, satuan pekan", sm.dari === "2026-09-22" && sm.satuan_tren === "pekan", { dari: sm.dari });
  cek("semua: titik pekan diawali Senin & jumlahnya cocok", sm.tren[0].t === "2026-09-21" && sm.tren.reduce((n, p) => n + p.video, 0) === sm.ringkas.video && sm.ringkas.video === 5, sm.tren);
  const panjang = susunTampilan([...data, siapkanBaris(baris({ wib: "2023-08-13 10:00", tayangan: 1 }))], { rentang: "semua", kiniMs: KINI });
  cek("semua > 6 bulan: per bulan, Agu 2023 … Sep 2026 (38 titik)", panjang.satuan_tren === "bulan" && panjang.tren[0].t === "2023-08-01" && panjang.tren.at(-1)?.t === "2026-09-01" && panjang.tren.length === 38, { n: panjang.tren.length, a: panjang.tren[0]?.t });
  cek("…jumlah video per bulan tetap cocok", panjang.tren.reduce((n, p) => n + p.video, 0) === panjang.ringkas.video && panjang.tren.at(-1)?.video === 5);
  const kosong = susunTampilan([], { rentang: "30", kiniMs: KINI });
  cek("tanpa data: nol semua, tren 30 titik, tanpa galat", kosong.ringkas.video === 0 && kosong.ringkas.er === 0 && kosong.tren.length === 30 && kosong.video_teratas.length === 0);
}

console.log("susunTampilan — akun teratas, jam terbaik, video teratas");
{
  const data: BarisAnalisis[] = [];
  // Akun 10: 1 video viral. Akun 11: 40 video biasa (paling rajin).
  data.push(baris({ wib: "2026-09-25 20:15", uid: 10, tayangan: 1_000_000, suka: 10 }));
  for (let i = 0; i < 40; i++) data.push(baris({ wib: `2026-09-2${i % 5} 0${i % 10}:1${i % 6}`, uid: 11, tayangan: 100 + i }));
  // Sel Kamis 19.00: 6 video median 5.000. Sel Jumat 20.00: 2 video sangat tinggi (tak cukup sampel).
  for (let i = 0; i < 6; i++) data.push(baris({ wib: `2026-09-24 19:${10 + i}`, uid: 12, tayangan: 5000 + i }));
  data.push(baris({ wib: "2026-09-25 20:30", uid: 13, tayangan: 900_000 }));
  // Waktu tebakan 12.00 tidak masuk peta jam.
  data.push(baris({ wib: "2026-09-26 12:00", uid: 14, tayangan: 50 }));
  const t = susunTampilan(data.map(siapkanBaris), { rentang: "30", kiniMs: KINI });
  cek("akun teratas diurut tayangan (viral di atas)", t.akun_teratas[0].user_id === "10", t.akun_teratas.slice(0, 3));
  cek("akun paling rajin tetap ikut terkirim", t.akun_teratas.some((a) => a.user_id === "11" && a.video === 40));
  const kamis19 = t.jam.find((s) => s.hari === 4 && s.jam === 19);
  cek("sel Kamis 19.00: 6 video, median (5.002+5.003)/2 → 5.003", kamis19?.video === 6 && kamis19?.median === 5003, kamis19);
  cek("jam terbaik butuh ≥ 5 video (Jumat 20.00 viral tapi 2 video → tidak)", t.jam_terbaik[0]?.hari === 4 && t.jam_terbaik[0]?.jam === 19 && !t.jam_terbaik.some((s) => s.hari === 5 && s.jam === 20), t.jam_terbaik);
  cek("waktu tebakan 12.00 dihitung sebagai jam tak pasti", t.jam_tak_pasti === 1, t.jam_tak_pasti);
  cek("video teratas maks 10, urut tayangan", t.video_teratas.length === 10 && t.video_teratas[0].tayangan === 1_000_000 && t.video_teratas[1].tayangan === 900_000);
}

console.log("jam terbaik — sel sepi tidak boleh menang (data asli 29 Sep)");
{
  const data: BarisAnalisis[] = [];
  // 3.400 video merata di jam kerja (median tayangan ±100, ±40 video per sel).
  for (let i = 0; i < 3400; i++) data.push(baris({ wib: `2026-09-${String(10 + (i % 14)).padStart(2, "0")} ${String(8 + (i % 12)).padStart(2, "0")}:1${i % 6}`, uid: 20, tayangan: 90 + (i % 21) }));
  // Sel ramai Rabu 19.00: 120 video median ±500.
  for (let i = 0; i < 120; i++) data.push(baris({ wib: "2026-09-23 19:2" + (i % 10), uid: 21, tayangan: 480 + (i % 41) }));
  // Sel sepi Kamis 05.00: 12 video median 10.000.
  for (let i = 0; i < 12; i++) data.push(baris({ wib: "2026-09-24 05:3" + (i % 10), uid: 22, tayangan: 10_000 }));
  const t = susunTampilan(data.map(siapkanBaris), { rentang: "30", kiniMs: KINI });
  cek("ambang sel naik mengikuti isi data (separuh median isi sel)", t.min_video_sel === Math.round(median(t.jam.map((x) => x.video)) / 2) && t.min_video_sel > 12, t.min_video_sel);
  cek("sel sepi (12 video, median 10 rb) tidak jadi terbaik", !t.jam_terbaik.some((s) => s.hari === 4 && s.jam === 5), t.jam_terbaik);
  cek("sel ramai Rabu 19.00 jadi terbaik", t.jam_terbaik[0]?.hari === 3 && t.jam_terbaik[0]?.jam === 19, t.jam_terbaik[0]);
}

console.log("kinerja — 110 ribu video, 24 tampilan");
{
  const besar: BarisSiap[] = [];
  const pf = ["tiktok", "instagram", "youtube", "facebook", "threads"];
  const t0 = Date.now();
  for (let i = 0; i < 110_000; i++) {
    const ms = KINI - Math.floor(Math.random() * 400) * 86_400_000 - Math.floor(Math.random() * 86_400_000);
    besar.push(
      siapkanBaris({
        kode: `k${i}`,
        platform: pf[i % 5],
        user_id: 1 + (i % 640),
        akun_username: `a${i % 640}`,
        waktu_posting: new Date(ms).toISOString(),
        tayangan: Math.floor(Math.random() * 50_000),
        suka: 10,
        komentar: 2,
        bagikan: 1,
        diperbarui_pada: i % 2 ? SEGAR : BELUM_DITARIK,
      }),
    );
  }
  const t1 = Date.now();
  for (const r of ["7", "30", "90", "semua"] as const) for (const p of ["", ...pf]) susunTampilan(besar, { rentang: r, platform: p, kiniMs: KINI });
  const t2 = Date.now();
  console.log(`    (siapkan ${t1 - t0} ms, 24 tampilan ${t2 - t1} ms)`);
  cek("24 tampilan dari 110 ribu video < 6 detik", t2 - t1 < 6000, t2 - t1);
}

console.log("bacaKatalog — PostgREST tiruan (keyset, bukan offset)");
{
  const semua = Array.from({ length: 2500 }, (_, i) => ({
    ...baris({ wib: "2026-09-28 19:00", uid: 1 + (i % 3), tayangan: i }),
    kode: `tt_${String(i).padStart(5, "0")}`,
  }));
  const permintaan: string[] = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    permintaan.push(`${u.pathname}?${u.searchParams.toString()}`);
    res.writeHead(200, { "content-type": "application/json" });
    if (u.pathname.endsWith("/tvr_video_metrik")) {
      const gt = (u.searchParams.get("kode") ?? "").replace(/^gt\./, "");
      const lim = Number(u.searchParams.get("limit") ?? 1000);
      res.end(JSON.stringify(semua.filter((b) => !gt || b.kode > gt).slice(0, lim)));
      return;
    }
    if (u.pathname.endsWith("/app_user")) {
      res.end(JSON.stringify([{ id: 1, nama: "Satu" }, { id: 2, nama: "Dua" }, { id: 3, nama: "Tiga" }]));
      return;
    }
    res.end("[]");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const db = createClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, "kunci-uji", { auth: { persistSession: false } });
  const k = await bacaKatalog(db as never);
  const halaman = permintaan.filter((p) => p.startsWith("/rest/v1/tvr_video_metrik"));
  cek("2.500 baris terbaca lengkap dalam 3 halaman", k.baris.length === 2500 && halaman.length === 3, { n: k.baris.length, halaman: halaman.length });
  cek("halaman berikut memakai kode.gt (keyset), tanpa offset", halaman[1].includes("kode=gt.tt_00999") && !halaman.some((h) => h.includes("offset")), halaman[1]);
  cek("hanya akun tersambung (user_id tidak null) & urut kode", halaman.every((h) => h.includes("user_id=not.is.null") && h.includes("order=kode.asc")));
  cek("nama pemilik dimuat", k.nama.get(2) === "Dua" && k.nama.size === 3);
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exitCode = gagal > 0 ? 1 : 0;
