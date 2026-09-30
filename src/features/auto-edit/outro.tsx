"use client";

// ============================================================
// Outro (dibawa dari GODAM "Auto Outro").
//
// Satu klik: latar bergerak dirender layanan sendiri (gratis, tanpa AI/API),
// lalu renderer menempelkan nama channel dan enam handle PERSIS di atasnya.
// Bisa banyak sekaligus: tiap baris nama channel = satu outro, dan baris yang
// sama di kotak sosmed = akun untuk channel itu. Hasilnya muncul di bawah,
// satu kartu per outro, masing-masing dengan tombol unduh.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./outro.module.css";
import { apiFetch, bacaJson, pesanGalat } from "./api";

type Sosmed = { kunci: string; nama: string; ikon: string; contoh: string };

// Urutan isian sesuai permintaan: X, TikTok, Facebook, YouTube, Instagram, Threads.
const SOSMED: Sosmed[] = [
  { kunci: "x", nama: "X", ikon: "𝕏", contoh: "@namaakun" },
  { kunci: "tiktok", nama: "TikTok", ikon: "🎵", contoh: "@namaakun" },
  { kunci: "facebook", nama: "Facebook", ikon: "📘", contoh: "Nama Halaman" },
  { kunci: "youtube", nama: "YouTube", ikon: "▶️", contoh: "@namachannel" },
  { kunci: "instagram", nama: "Instagram", ikon: "📸", contoh: "@namaakun" },
  { kunci: "threads", nama: "Threads", ikon: "🧵", contoh: "@namaakun" },
];
const KOSONG: Record<string, string> = Object.fromEntries(SOSMED.map((s) => [s.kunci, ""]));

// Satu kiriman dibatasi supaya antrean render (satu per satu) tidak tertahan
// berjam-jam oleh satu orang.
const MAKS_SEKALIGUS = 50;

type Mode = "biasa" | "dpp";

type Job = {
  job_id: string;
  channel?: string;
  mode?: Mode;
  status: "queued" | "running" | "done" | "error" | "dibatalkan";
  langkah: string;
  progress: number;
  punya_video: boolean;
  message: string;
  seed?: number;
  gaya?: string;
  created?: number;
  updated?: number;
};

type Rencana = { channel: string; akun: Record<string, string> };

const LANGKAH: Record<string, string> = {
  antre: "Menunggu giliran",
  render: "Merender",
  audio: "Menempel audio",
  simpan: "Menyimpan",
  selesai: "Selesai",
  gagal: "Gagal",
  berhenti: "Dihentikan",
};

function aktif(j: Job): boolean {
  return j.status === "queued" || j.status === "running";
}

/** Baris-baris isian, dirapikan; baris kosong tetap dihitung (penentu urutan). */
function barisDari(teks: string): string[] {
  const baris = teks.split("\n").map((b) => b.trim());
  while (baris.length > 0 && baris[baris.length - 1] === "") baris.pop();
  return baris;
}

/**
 * Pasangkan tiap nama channel dengan akunnya. Baris ke-n di kotak sosmed milik
 * channel baris ke-n. Kotak sosmed yang hanya berisi SATU baris dipakai untuk
 * semua channel — akun yang sama untuk semuanya tidak perlu ditulis berulang.
 */
function susunRencana(channelTeks: string, akunTeks: Record<string, string>): Rencana[] {
  const channel = barisDari(channelTeks);
  const perSosmed = Object.fromEntries(SOSMED.map((s) => [s.kunci, barisDari(akunTeks[s.kunci] || "")]));
  const hasil: Rencana[] = [];
  channel.forEach((nama, i) => {
    if (!nama) return;
    const akun: Record<string, string> = {};
    for (const s of SOSMED) {
      const baris = perSosmed[s.kunci];
      akun[s.kunci] = baris.length === 1 ? baris[0] : baris[i] || "";
    }
    hasil.push({ channel: nama.slice(0, 80), akun });
  });
  return hasil;
}

function namaBerkas(channel: string): string {
  return `outro-${channel.trim().replace(/\s+/g, "-") || "video"}.mp4`;
}

export function Outro() {
  // "biasa": gaya acak, tiap tekan beda. "dpp": meniru outro TV Rakyat apa
  // adanya; nama channel ditulis melengkung di logonya, sosmed dari isian.
  const [mode, setMode] = useState<Mode>("biasa");
  const [channel, setChannel] = useState("");
  const [akun, setAkun] = useState<Record<string, string>>(KOSONG);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [galatJob, setGalatJob] = useState("");
  const [mengirim, setMengirim] = useState<{ ke: number; dari: number } | null>(null);
  const [videoUrl, setVideoUrl] = useState<Record<string, string>>({});
  // Semua blob yang pernah dibuat, supaya bisa dilepas saat alat ditutup.
  // Objeknya tidak pernah diganti (dikosongkan di tempat), jadi pembersih di
  // bawah selalu memegang daftar yang sama.
  const videoUrlRef = useRef<Record<string, string>>({});
  const diambilRef = useRef<Set<string>>(new Set());
  const hidupRef = useRef(true);
  // Video yang gagal diambil dicoba lagi dengan jeda memanjang. Tanpa ini,
  // yang gagal tidak pernah dicoba lagi begitu semua outro selesai
  // (pemantauan berhenti), dan kartunya tertahan di "Mengambil video..."
  // selamanya.
  const gagalRef = useRef<Record<string, { coba: number; lagi: number }>>({});
  const [detak, setDetak] = useState(0);
  const [cobaVideo, setCobaVideo] = useState<Record<string, number>>({});

  const rencana = useMemo(() => susunRencana(channel, akun), [channel, akun]);
  const jumlahChannel = barisDari(channel).length;

  // Kotak sosmed yang jumlah barisnya tidak cocok dengan jumlah channel —
  // hampir pasti salah urut, jadi diberi tahu sebelum dikirim.
  const tidakCocok = useMemo(
    () =>
      SOSMED.filter((s) => {
        const n = barisDari(akun[s.kunci] || "").length;
        return n > 1 && n !== jumlahChannel;
      }).map((s) => s.nama),
    [akun, jumlahChannel],
  );

  const adaAktif = jobs.some(aktif);

  async function perbarui() {
    try {
      const r = await apiFetch("/api/outro/jobs?batas=200", { cache: "no-store" });
      if (!r.ok) return;
      const data = await bacaJson(r);
      const terbaru = new Map(((data.jobs || []) as Job[]).map((j) => [j.job_id, j]));
      setJobs((lama) => lama.map((j) => terbaru.get(j.job_id) || j));
    } catch {
      // dicoba lagi pada putaran berikutnya
    }
  }

  // Pantau semua outro kiriman ini lewat SATU permintaan daftar.
  useEffect(() => {
    if (!adaAktif) return;
    const timer = setInterval(perbarui, 2000);
    return () => clearInterval(timer);
  }, [adaAktif]);

  // Chrome memperlambat pewaktu tab yang tidak terlihat sampai sekali per
  // MENIT, dan menunda memuat video di tab itu. Saat kembali, alat tampak
  // macet sampai giliran berikutnya — maka begitu tab terlihat lagi, status
  // dan video langsung disusul.
  useEffect(() => {
    function saatTerlihat() {
      if (document.visibilityState !== "visible") return;
      for (const g of Object.values(gagalRef.current)) g.lagi = 0;
      void perbarui();
      setDetak((d) => d + 1);
    }
    document.addEventListener("visibilitychange", saatTerlihat);
    window.addEventListener("focus", saatTerlihat);
    return () => {
      document.removeEventListener("visibilitychange", saatTerlihat);
      window.removeEventListener("focus", saatTerlihat);
    };
  }, []);

  // Outro yang SELESAI ditarik videonya sebagai blob, satu per satu: alamat
  // videonya butuh token, dan <video>/<a download> tidak bisa membawa header.
  useEffect(() => {
    const sekarang = Date.now();
    const perlu = jobs.filter(
      (j) =>
        j.status === "done" &&
        j.punya_video &&
        !diambilRef.current.has(j.job_id) &&
        (gagalRef.current[j.job_id]?.lagi ?? 0) <= sekarang,
    );
    if (perlu.length === 0) return;
    for (const j of perlu) diambilRef.current.add(j.job_id);
    void (async () => {
      for (const j of perlu) {
        let ok = false;
        try {
          const v = await apiFetch(`/api/outro/jobs/${j.job_id}/video`);
          if (v.ok) {
            const isi = await v.blob();
            if (!hidupRef.current) return;
            const url = URL.createObjectURL(isi);
            videoUrlRef.current[j.job_id] = url;
            setVideoUrl((lama) => ({ ...lama, [j.job_id]: url }));
            delete gagalRef.current[j.job_id];
            ok = true;
          }
        } catch {
          // ditangani di bawah
        }
        if (!ok && hidupRef.current) {
          const coba = (gagalRef.current[j.job_id]?.coba ?? 0) + 1;
          const jeda = Math.min(30000, 2000 * 2 ** (coba - 1));
          gagalRef.current[j.job_id] = { coba, lagi: Date.now() + jeda };
          setCobaVideo((lama) => ({ ...lama, [j.job_id]: coba }));
          diambilRef.current.delete(j.job_id);
          setTimeout(() => setDetak((d) => d + 1), jeda);
        }
      }
    })();
  }, [jobs, detak]);

  // Blob dilepas saat alat ditutup; unduhan yang masih berjalan dibuang.
  useEffect(() => {
    hidupRef.current = true;
    const simpanan = videoUrlRef.current;
    return () => {
      hidupRef.current = false;
      for (const url of Object.values(simpanan)) URL.revokeObjectURL(url);
    };
  }, []);

  async function jalankan() {
    if (rencana.length === 0 || mengirim) return;
    if (rencana.length > MAKS_SEKALIGUS) {
      setGalatJob(`Maksimal ${MAKS_SEKALIGUS} channel sekali kirim (sekarang ${rencana.length}).`);
      return;
    }
    setGalatJob("");
    const galat: string[] = [];
    for (let i = 0; i < rencana.length; i++) {
      const r0 = rencana[i];
      setMengirim({ ke: i + 1, dari: rencana.length });
      try {
        const r = await apiFetch("/api/outro/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: r0.channel, akun: r0.akun, mode }),
        });
        const j = await bacaJson(r);
        if (!r.ok) {
          galat.push(`${r0.channel}: ${pesanGalat(r.status, j, "gagal memulai")}`);
          // Layanan mati atau akun tidak diizinkan: sisanya pasti bernasib
          // sama, jadi tidak perlu dicoba satu per satu.
          if (r.status === 404 || r.status === 503) break;
          continue;
        }
        const job: Job = {
          job_id: j.job_id,
          channel: r0.channel,
          status: "queued",
          langkah: "antre",
          progress: 0,
          punya_video: false,
          message: "Menunggu giliran.",
          seed: j.seed,
          gaya: j.gaya,
          mode: j.mode,
        };
        // Kartunya langsung muncul satu per satu, tidak menunggu semua terkirim.
        setJobs((lama) => [...lama, job]);
      } catch {
        galat.push(`${r0.channel}: layanan tidak merespons`);
      }
    }
    setMengirim(null);
    if (galat.length > 0) setGalatJob(galat.join(" · "));
  }

  async function hentikanSemua() {
    await Promise.all(
      jobs
        .filter(aktif)
        .map((j) => apiFetch(`/api/outro/jobs/${j.job_id}/stop`, { method: "POST" }).catch(() => undefined)),
    );
  }

  function unduhSemua() {
    // Satu per satu dengan jeda: peramban menolak banyak unduhan serentak.
    const siap = jobs.filter((j) => videoUrl[j.job_id]);
    siap.forEach((j, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = videoUrl[j.job_id];
        a.download = namaBerkas(j.channel || "");
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  }

  function kosongkan() {
    setChannel("");
    setAkun(KOSONG);
    setJobs([]);
    setGalatJob("");
    for (const [id, url] of Object.entries(videoUrlRef.current)) {
      URL.revokeObjectURL(url);
      delete videoUrlRef.current[id];
    }
    diambilRef.current.clear();
    gagalRef.current = {};
    setCobaVideo({});
    setVideoUrl({});
  }

  // Server merender SATU per SATU; tanpa keterangan ini antrean panjang
  // (34 channel ~ 6 menit) terlihat seperti macet.
  const antre = jobs.filter((j) => j.status === "queued").sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  const posisiAntre = new Map(antre.map((j, i) => [j.job_id, i + 1]));
  const sedangRender = jobs.find((j) => j.status === "running");
  const waktuSelesai = jobs
    .filter((j) => j.status === "done" && j.updated)
    .map((j) => j.updated as number)
    .sort((a, b) => a - b);
  const rataDetik =
    waktuSelesai.length >= 2
      ? Math.max(3, (waktuSelesai[waktuSelesai.length - 1] - waktuSelesai[0]) / (waktuSelesai.length - 1))
      : 12;
  const sisaDetik = Math.round((antre.length + (sedangRender ? 1 : 0)) * rataDetik);
  const sisaTeks = sisaDetik >= 60 ? `±${Math.ceil(sisaDetik / 60)} menit lagi` : `±${sisaDetik} detik lagi`;

  const bisaJalan = rencana.length > 0 && !mengirim;
  const selesai = jobs.filter((j) => j.status === "done").length;
  const gagal = jobs.filter((j) => j.status === "error").length;
  const siapUnduh = jobs.filter((j) => videoUrl[j.job_id]).length;

  return (
    <div className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Auto Outro</h2>
        </div>
        <div className={styles.aksi}>
          <button
            type="button"
            className={mode === "biasa" ? styles.btnUtama : styles.btnSekunder}
            onClick={() => setMode("biasa")}
            disabled={!!mengirim}
          >
            Biasa
          </button>
          <button
            type="button"
            className={mode === "dpp" ? styles.btnUtama : styles.btnSekunder}
            onClick={() => setMode("dpp")}
            disabled={!!mengirim}
          >
            DPP
          </button>
        </div>
        {mode === "biasa" ? (
          <p className={styles.hint}>
            Isi nama channel dan akun tiap sosmed, lalu tekan sekali. Tiap outro gayanya berbeda — palet,
            latar, bentuk logo, tata letak, animasi — tapi logo, nama TV, dan sosmednya selalu ditulis
            persis. Gratis, tanpa batas.
          </p>
        ) : (
          <p className={styles.hint}>
            Persis outro TV Rakyat: latar, gerakan, tagline, dan pil emasnya sama. Yang berbeda hanya
            logonya — logo TV Rakyat asli dengan nama channel ditulis melengkung di bawah RAKYAT, mis.
            &quot;Aceh Barat&quot; — dan sosmed dari isian.
          </p>
        )}

        <div className={styles.form}>
          <div className={styles.blok}>
            <div className={styles.blokHead}>
              <h3>Nama channel</h3>
              <span className={styles.jumlahHuruf}>{rencana.length} outro</span>
            </div>
            <p className={styles.hint}>
              Satu baris = satu channel = satu video outro. Bisa banyak sekaligus (maks {MAKS_SEKALIGUS}).
            </p>
            <textarea
              className={styles.naskah}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder={mode === "dpp" ? "Aceh Barat\nAceh Besar\nKab. Siak" : "TV Rakyat\nTV Nusantara"}
              rows={Math.min(10, Math.max(3, jumlahChannel + 1))}
              disabled={!!mengirim}
            />
          </div>

          <div className={styles.blok}>
            <div className={styles.blokHead}>
              <h3>Nama akun tiap sosmed</h3>
            </div>
            <p className={styles.hint}>
              Baris ke-1 untuk channel baris ke-1, baris ke-2 untuk channel ke-2, dan seterusnya. Isi{" "}
              <b>satu baris saja</b> kalau akunnya sama untuk semua channel. Baris kosong = sosmed itu tidak
              ditampilkan di outro channel tersebut.
            </p>
            {SOSMED.map((s) => {
              const n = barisDari(akun[s.kunci] || "").length;
              return (
                <div key={s.kunci} className={styles.row}>
                  <label>
                    <span>
                      {s.ikon} {s.nama}
                      {n > 0 && <> · {n === 1 && jumlahChannel > 1 ? "sama untuk semua" : `${n} baris`}</>}
                    </span>
                    <textarea
                      className={styles.naskah}
                      value={akun[s.kunci] || ""}
                      onChange={(e) => setAkun((lama) => ({ ...lama, [s.kunci]: e.target.value }))}
                      placeholder={s.contoh}
                      rows={Math.min(8, Math.max(1, n))}
                      disabled={!!mengirim}
                    />
                  </label>
                </div>
              );
            })}
          </div>

          {tidakCocok.length > 0 && (
            <p className={styles.galat}>
              Jumlah baris {tidakCocok.join(", ")} tidak sama dengan jumlah channel ({jumlahChannel}). Cek
              urutannya di pratinjau di bawah.
            </p>
          )}

          {rencana.length > 1 && (
            <div className={styles.rincianKotak}>
              {rencana.map((r, i) => {
                const isi = SOSMED.filter((s) => r.akun[s.kunci]).map((s) => `${s.ikon} ${r.akun[s.kunci]}`);
                return (
                  <div key={i} className={styles.rincianBaris}>
                    <span className={styles.rincianNilai}>
                      <b>
                        {i + 1}. {r.channel}
                      </b>{" "}
                      — {isi.length > 0 ? isi.join("  ") : "tanpa sosmed"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {galatJob && <p className={styles.galat}>{galatJob}</p>}
          <div className={styles.aksi}>
            <button
              type="button"
              className={styles.btnUtama}
              onClick={() => void jalankan()}
              disabled={!bisaJalan}
              title={bisaJalan ? "Buat outro" : "Isi nama channel dulu"}
            >
              {mengirim
                ? `Mengirim ${mengirim.ke}/${mengirim.dari}…`
                : rencana.length > 1
                  ? `Buat ${rencana.length} Outro`
                  : "Buat Outro"}
            </button>
            {adaAktif ? (
              <button type="button" className={styles.btnBahaya} onClick={() => void hentikanSemua()}>
                Hentikan semua
              </button>
            ) : (
              <button type="button" className={styles.btnSekunder} onClick={kosongkan} disabled={!!mengirim}>
                Kosongkan
              </button>
            )}
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Hasil</h2>
          {jobs.length > 0 && (
            <span className={`${styles.badge} ${!adaAktif && gagal === 0 ? styles.sasaranOk : ""}`}>
              {selesai}/{jobs.length} selesai{gagal > 0 ? ` · ${gagal} gagal` : ""}
            </span>
          )}
        </div>
        {jobs.length === 0 ? (
          <p className={styles.hint}>Videonya akan muncul di sini setelah tombol ditekan.</p>
        ) : (
          <>
            {adaAktif && (
              <>
                <div className={styles.progresBatang}>
                  <div
                    className={styles.progresIsi}
                    style={{ width: `${Math.round((selesai / Math.max(1, jobs.length)) * 100)}%` }}
                  />
                </div>
                <p className={styles.hint}>
                  {sedangRender ? (
                    <>
                      Sedang dirender: <b>{sedangRender.channel}</b> ({sedangRender.progress}%)
                    </>
                  ) : (
                    "Menunggu giliran di server"
                  )}
                  {" · "}
                  {antre.length} antre · {sisaTeks}. Dirender satu per satu; boleh ditinggal, hasilnya tetap
                  tersimpan.
                </p>
              </>
            )}
            {siapUnduh > 1 && (
              <div className={styles.aksi}>
                <button type="button" className={styles.btnUtama} onClick={unduhSemua}>
                  Unduh semua ({siapUnduh})
                </button>
              </div>
            )}
            <div className={styles.kartuHasil}>
              {jobs.map((j) => (
                <div key={j.job_id} className={styles.rincianKotak}>
                  <div className={styles.blokHead}>
                    <h3 className={styles.namaChannel}>{j.channel}</h3>
                    <span
                      className={`${styles.badge} ${
                        j.status === "done" ? styles.sasaranOk : j.status === "error" ? styles.sasaranGagal : ""
                      }`}
                    >
                      {LANGKAH[j.langkah] || j.langkah}
                    </span>
                  </div>
                  {aktif(j) && (
                    <div className={styles.progresBatang}>
                      <div className={styles.progresIsi} style={{ width: `${j.progress}%` }} />
                    </div>
                  )}
                  {videoUrl[j.job_id] ? (
                    <>
                      <video
                        className={styles.video}
                        src={videoUrl[j.job_id]}
                        controls
                        loop
                        muted
                        playsInline
                        preload="metadata"
                      />
                      <a className={styles.btnUtama} href={videoUrl[j.job_id]} download={namaBerkas(j.channel || "")}>
                        Unduh
                      </a>
                    </>
                  ) : (
                    <p className={j.status === "error" ? styles.galat : styles.hint}>
                      {j.status === "done"
                        ? (cobaVideo[j.job_id] ?? 0) > 0
                          ? `Mengambil video… (coba lagi ke-${cobaVideo[j.job_id]})`
                          : "Mengambil video…"
                        : j.status === "queued" && posisiAntre.has(j.job_id)
                          ? `Antrean ke-${posisiAntre.get(j.job_id)}`
                          : j.message}
                    </p>
                  )}
                  {j.mode !== "dpp" && j.gaya && j.status === "done" && (
                    <p className={styles.hint}>
                      Gaya #{j.seed}: {j.gaya}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
