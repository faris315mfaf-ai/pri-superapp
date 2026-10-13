// ============================================================
// Grafik kecil untuk halaman Detail Bot (Oktober 2026):
//  - GrafikBatang7Hari : batang post per hari + garis kuota putus-putus.
//  - LiniMasaJadwal    : lini masa 07:00–21:00 dengan pita jam aktif,
//                        penanda jadwal posting, dan garis "sekarang".
//
// Komponen presentasional murni (tanpa state, tanpa effect) sehingga
// aman dipakai di server maupun klien. Warna teks/garis memakai token
// aplikasi lewat currentColor, jadi ikut terang/gelap otomatis; hanya
// warna bot (batang/penanda) yang tetap.
// ============================================================

import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Grafik batang 7 hari
// ------------------------------------------------------------

const VW = 300; // lebar viewBox
const VH = 150; // tinggi viewBox
const KIRI = 24; // ruang sumbu-y
const KANAN = 6;
const ATAS = 14;
const BAWAH = 24;
const LEBAR_BATANG = 26;

export function GrafikBatang7Hari({
  data,
  hari,
  warna,
  kuota,
  nama,
}: {
  /** Tujuh nilai: 6 hari lalu … hari ini (terakhir). */
  data: number[];
  /** Tujuh label hari, sejajar dengan `data`. */
  hari: string[];
  /** Warna batang (warna bot). */
  warna: string;
  /** Batas post per hari — digambar sebagai garis putus-putus. */
  kuota: number;
  nama: string;
}) {
  // Sumbu minimal 0..4 (seperti mockup); melebar bila kuota/nilai lebih besar.
  const maks = Math.max(4, kuota, ...data);
  const yDari = (v: number) => ATAS + (VH - ATAS - BAWAH) * (1 - v / maks);
  const jarak = (VW - KIRI - KANAN - 2) / data.length;
  const indeksAkhir = data.length - 1;
  const ringkas = data.map((n, i) => `${hari[i] ?? ""} ${n}`).join(", ");

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      role="img"
      aria-label={`Post tujuh hari terakhir untuk ${nama}: ${ringkas}. Kuota ${kuota} per hari.`}
      className="block h-auto w-full"
    >
      {Array.from({ length: maks + 1 }, (_, v) => (
        <g key={v}>
          <line
            x1={KIRI}
            x2={VW - KANAN}
            y1={yDari(v)}
            y2={yDari(v)}
            stroke="currentColor"
            strokeOpacity={0.14}
            className="text-teks-sekunder"
          />
          <text
            x={KIRI - 6}
            y={yDari(v) + 3.5}
            textAnchor="end"
            fontSize={10}
            fill="currentColor"
            className="text-teks-sekunder"
          >
            {v}
          </text>
        </g>
      ))}

      {/* Garis kuota */}
      <line
        x1={KIRI}
        x2={VW - KANAN}
        y1={yDari(kuota)}
        y2={yDari(kuota)}
        stroke="currentColor"
        strokeDasharray="4 3"
        strokeWidth={1.5}
        className="text-emas"
      />
      <text
        x={VW - KANAN - 2}
        y={yDari(kuota) - 4}
        textAnchor="end"
        fontSize={10}
        fontWeight={700}
        fill="currentColor"
        className="text-amber-600 dark:text-emas"
      >
        {`kuota ${kuota}`}
      </text>

      {data.map((n, i) => {
        const x = KIRI + 6 + i * jarak;
        const tinggi = (VH - ATAS - BAWAH) * (n / maks);
        const akhir = i === indeksAkhir;
        return (
          <g key={i}>
            <rect
              x={x}
              y={VH - BAWAH - tinggi}
              width={LEBAR_BATANG}
              height={tinggi}
              rx={2}
              fill={warna}
              opacity={akhir ? 1 : 0.6}
            />
            {n > 0 && (
              <text
                x={x + LEBAR_BATANG / 2}
                y={VH - BAWAH - tinggi - 4}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={700}
                fill="currentColor"
                className="text-teks-utama"
              >
                {n}
              </text>
            )}
            <text
              x={x + LEBAR_BATANG / 2}
              y={VH - 8}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={akhir ? 700 : 500}
              fill="currentColor"
              className={akhir ? "text-teks-utama" : "text-teks-sekunder"}
            >
              {hari[i] ?? ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// Lini masa jadwal posting hari ini
// ------------------------------------------------------------

/** Rentang yang digambar, dalam menit sejak 00:00. */
const MENIT_AWAL = 7 * 60;
const MENIT_AKHIR = 21 * 60;
const RENTANG = MENIT_AKHIR - MENIT_AWAL;

function kePersen(menit: number): string {
  return `${(((menit - MENIT_AWAL) / RENTANG) * 100).toFixed(2)}%`;
}

function keMenit(hhmm: string): number {
  const [j, m] = hhmm.split(":");
  return Number(j) * 60 + Number(m);
}

export function LiniMasaJadwal({
  jadwal,
  warna,
  jamSekarang,
  jamAktifMulai = 8,
  jamAktifSelesai = 20,
  nama,
}: {
  /** Jam posting "HH:MM". */
  jadwal: string[];
  warna: string;
  /** Jam sekarang dalam jam desimal (mis. 9,25 = 09:15). */
  jamSekarang: number;
  jamAktifMulai?: number;
  jamAktifSelesai?: number;
  nama: string;
}) {
  const menitSekarang = Math.min(MENIT_AKHIR, Math.max(MENIT_AWAL, Math.floor(jamSekarang * 60)));
  const mulai = jamAktifMulai * 60;
  const selesai = jamAktifSelesai * 60;
  const labelJam: number[] = [];
  for (let j = jamAktifMulai; j <= jamAktifSelesai; j += 2) labelJam.push(j);

  return (
    <div
      role="img"
      aria-label={`Jadwal posting ${nama} hari ini: ${jadwal.join(", ") || "belum ada"}. Jam aktif ${String(jamAktifMulai).padStart(2, "0")}.00 sampai ${String(jamAktifSelesai).padStart(2, "0")}.00.`}
      className="relative mx-2 mt-2 h-[58px]"
    >
      {/* Jalur dasar */}
      <div className="absolute inset-x-0 top-[22px] h-2 rounded-full bg-black/8 dark:bg-white/10" />
      {/* Pita jam aktif */}
      <div
        className="absolute top-[22px] h-2 rounded-full bg-emas/45"
        style={{ left: kePersen(mulai), width: `${(((selesai - mulai) / RENTANG) * 100).toFixed(2)}%` }}
      />
      {labelJam.map((j) => (
        <span
          key={j}
          className="absolute top-10 -translate-x-1/2 font-mono text-[10px] font-semibold text-teks-sekunder"
          style={{ left: kePersen(j * 60) }}
        >
          {String(j).padStart(2, "0")}
        </span>
      ))}
      {jadwal.map((t) => (
        <span key={t}>
          <span
            className="absolute top-[14px] -ml-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900"
            style={{ left: kePersen(keMenit(t)), background: warna }}
          />
          <span
            className="absolute top-0 -translate-x-1/2 font-mono text-[10px] font-semibold text-teks-utama"
            style={{ left: kePersen(keMenit(t)) }}
          >
            {t}
          </span>
        </span>
      ))}
      <span
        className={cn("absolute top-4 h-6 w-0.5 rounded-full bg-gagal")}
        style={{ left: kePersen(menitSekarang) }}
      />
    </div>
  );
}
