"use client";

// ============================================================
// STUDIO TEMPLATE — panel pengaturan elemen terpilih (16 Okt 2026): berkas
// (ganti, hapus latar), posisi & ukuran, rata cepat, transparansi, waktu
// tampil (pilihan cepat + patokan awal/akhir), urutan, sembunyikan, hapus.
// Juga pengaturan area tulisan berita dan outro.
// ============================================================

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Replace, Trash2, Wand2 } from "lucide-react";
import {
  OUTRO_MIN,
  PILIHAN_RATA,
  WARNA_JENIS,
  rentangTampil,
  teksPatok,
  type DokStudio,
  type ElemenStudio,
  type Patok,
  type Rect,
  type Waktu,
} from "@/mesin-video/studio-model";
import { cn } from "@/lib/utils";
import { PILIH_OUTRO, PILIH_TEKS } from "./kanvas-studio";
import type { AsetStudio } from "./studio-tipe";
import { PRESET_WAKTU, UKURAN_MIN, fmtDurasi, jepitKanvas, jepitRect, namaElemen, rataKanvas, ubahElemen } from "./studio-murni";

type Props = {
  dok: DokStudio;
  pilih: string | null;
  aset: Record<string, AsetStudio>;
  gambar: Record<string, string>;
  durasi: number;
  mulaiUbah: () => void;
  ubah: (fn: (d: DokStudio) => DokStudio) => void;
  kunciRasio: (id: string) => boolean;
  setKunciRasio: (id: string, v: boolean) => void;
  onGantiBerkas: (id: string) => void;
  onHapusLatar: (id: string) => void;
  onPakaiAsli: (id: string) => void;
  adaAsli: (id: string) => boolean;
  mengolah: string | null;
  onHapus: (id: string) => void;
  onPindah: (id: string, arah: 1 | -1) => void;
  onPilih: (id: string | null) => void;
};

const label = "flex flex-col gap-1 text-[11px] text-teks-sekunder";
const masukan = "h-9 w-full min-w-0 rounded-lg border border-black/15 bg-white/70 px-2 font-mono text-[12.5px] font-semibold text-teks-utama dark:border-white/15 dark:bg-white/5";
const tombolKecil = "btn-tekan h-9 rounded-lg border border-black/10 px-2.5 text-[12px] font-semibold text-teks-utama disabled:opacity-40 dark:border-white/15";
const judulBagian = "text-[12px] font-bold text-teks-utama";

function InputRect({ r, onUbah, mulai }: { r: Rect; onUbah: (r: Rect) => void; mulai: () => void }) {
  const kolom: [keyof Rect, string][] = [["x", "X"], ["y", "Y"], ["w", "Lebar"], ["h", "Tinggi"]];
  // Teks ketikan per kolom selama fokus: kolom boleh kosong / "-" sementara; angka sah langsung dipakai,
  // saat blur kembali menampilkan nilai dokumen.
  const [draf, setDraf] = useState<Partial<Record<keyof Rect, string>>>({});
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {kolom.map(([k, n]) => (
        <label key={k} className={label}>
          {n}
          <input
            type="number"
            inputMode="numeric"
            value={draf[k] ?? String(r[k])}
            onFocus={mulai}
            onChange={(e) => {
              const teks = e.target.value;
              setDraf((d) => ({ ...d, [k]: teks }));
              if (teks.trim() === "") return;
              const v = Math.round(Number(teks));
              if (Number.isFinite(v)) onUbah(jepitRect({ ...r, [k]: k === "w" || k === "h" ? Math.max(UKURAN_MIN, v) : v }));
            }}
            onBlur={() =>
              setDraf((d) => {
                const salin = { ...d };
                delete salin[k];
                return salin;
              })
            }
            className={masukan}
          />
        </label>
      ))}
    </div>
  );
}

function InputPatok({ judul, p, onUbah, mulai }: { judul: string; p: Patok; onUbah: (p: Patok) => void; mulai: () => void }) {
  return (
    <div className="grid grid-cols-[52px_68px_minmax(0,1fr)] items-center gap-1.5">
      <span className="text-[12px] font-semibold text-teks-utama">{judul}</span>
      <input
        type="number"
        step={0.1}
        min={0}
        value={p.d}
        aria-label={`${judul} (detik)`}
        onFocus={mulai}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value) * 10) / 10;
          if (Number.isFinite(v) && v >= 0) onUbah({ ...p, d: Math.min(600, v) });
        }}
        className={masukan}
      />
      <select
        aria-label={`Patokan ${judul.toLowerCase()}`}
        value={p.dari}
        onFocus={mulai}
        onChange={(e) => onUbah({ ...p, dari: e.target.value as Patok["dari"] })}
        className="h-9 min-w-0 rounded-lg border border-black/15 bg-white/70 px-1.5 text-[12px] text-teks-utama dark:border-white/15 dark:bg-white/5"
      >
        <option value="awal">dari awal video</option>
        <option value="akhir">sebelum akhir video</option>
      </select>
    </div>
  );
}

function BagianWaktu({ el, durasi, mulai, ubahWaktu }: { el: ElemenStudio; durasi: number; mulai: () => void; ubahWaktu: (w: Waktu) => void }) {
  const r = rentangTampil(el.waktu, durasi);
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-black/10 p-3 dark:border-white/10" aria-label="Waktu tampil">
      <span className={judulBagian}>Waktu tampil</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pilihan cepat">
        {PRESET_WAKTU.map((pr) => {
          const aktif = JSON.stringify(pr.waktu) === JSON.stringify(el.waktu);
          return (
            <button
              key={pr.kunci}
              type="button"
              aria-pressed={aktif}
              onClick={() => {
                mulai();
                ubahWaktu(pr.waktu);
              }}
              className={cn("btn-tekan h-8 rounded-full border px-3 text-[11.5px] font-semibold", aktif ? "border-teks-utama bg-teks-utama text-app-bg" : "border-black/15 text-teks-utama dark:border-white/15")}
            >
              {pr.label}
            </button>
          );
        })}
      </div>
      <InputPatok judul="Mulai" p={el.waktu.mulai} mulai={mulai} onUbah={(p) => ubahWaktu({ ...el.waktu, mulai: p })} />
      <InputPatok judul="Selesai" p={el.waktu.selesai} mulai={mulai} onUbah={(p) => ubahWaktu({ ...el.waktu, selesai: p })} />
      <p className={cn("m-0 text-[11.5px]", r ? "text-teks-sekunder" : "font-semibold text-gagal")}>
        {r
          ? `Pada contoh video ini: ${fmtDurasi(r.selesai - r.mulai)} (${teksPatok(el.waktu.mulai)} → ${teksPatok(el.waktu.selesai)}).`
          : "Pada contoh video sepanjang ini elemen tidak tampil (video terlalu pendek untuk waktu ini)."}
      </p>
    </section>
  );
}

export function PanelProperti(p: Props) {
  const { dok, pilih } = p;
  const berita = dok.elemen.find((e) => e.jenis === "berita") ?? null;

  if (!pilih) {
    return (
      <div className="flex flex-col gap-3 text-[12.5px] leading-relaxed text-teks-sekunder">
        <p className="m-0 font-heading text-[15px] font-extrabold text-teks-utama">Pilih elemen</p>
        <p className="m-0">Ketuk elemen di kanvas, di daftar, atau di timeline untuk mengatur letak, ukuran, transparansi, dan waktu tampilnya.</p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
          <li>Tulisan berita & kategori diisi saat membuat video — di sini hanya letaknya.</li>
          <li>Tulisan selalu paling depan, di atas semua gambar.</li>
          <li>Waktu dipatok ke awal atau akhir video, jadi pas untuk video sependek atau sepanjang apa pun.</li>
          <li>Buat video pratinjau sebelum menyimpan untuk melihat hasil sungguhan.</li>
        </ul>
      </div>
    );
  }

  if (pilih === PILIH_TEKS && berita?.teks) {
    const teks = berita.teks;
    return (
      <div className="flex flex-col gap-3">
        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-teks-sekunder">Elemen terpilih</span>
          <p className="m-0 font-heading text-[16px] font-extrabold text-teks-utama">Area tulisan berita</p>
        </div>
        <span className={judulBagian}>Posisi & ukuran (px)</span>
        <InputRect key="teks" r={teks} mulai={p.mulaiUbah} onUbah={(r) => p.ubah((d) => ({ ...d, elemen: d.elemen.map((e) => (e.jenis === "berita" ? { ...e, teks: jepitKanvas(r) } : e)) }))} />
        <div className="flex flex-col gap-1.5">
          <span className={judulBagian}>Warna tulisan</span>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Warna tulisan berita">
            {(["white", "black"] as const).map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={dok.teks_warna === w}
                onClick={() => {
                  p.mulaiUbah();
                  p.ubah((d) => ({ ...d, teks_warna: w }));
                }}
                className={cn(tombolKecil, dok.teks_warna === w && "border-teks-utama bg-teks-utama text-app-bg")}
              >
                {w === "white" ? "Putih" : "Hitam"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={judulBagian}>Perataan</span>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Perataan tulisan berita">
            {PILIHAN_RATA.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={dok.rata === r}
                onClick={() => {
                  p.mulaiUbah();
                  p.ubah((d) => ({ ...d, rata: r }));
                }}
                className={cn(tombolKecil, "px-1", dok.rata === r && "border-teks-utama bg-teks-utama text-app-bg")}
              >
                {{ justify: "Rata", left: "Kiri", center: "Tengah", right: "Kanan" }[r]}
              </button>
            ))}
          </div>
        </div>
        <p className="m-0 text-[11.5px] text-teks-sekunder">Waktu tampil tulisan mengikuti Kotak berita.</p>
        <button type="button" onClick={() => p.onPilih("berita")} className={tombolKecil}>
          Atur Kotak berita
        </button>
      </div>
    );
  }

  if (pilih === PILIH_OUTRO) {
    const ref = dok.outro.file;
    const info = ref ? p.aset[ref] : undefined;
    const asli = info?.durasi ?? null;
    const durasi = dok.outro.durasi ?? asli ?? 0;
    return (
      <div className="flex flex-col gap-3">
        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-teks-sekunder">Disambung setelah video</span>
          <p className="m-0 font-heading text-[16px] font-extrabold text-teks-utama">Outro</p>
        </div>
        {ref ? (
          <>
            <KartuBerkas info={info} url={p.gambar[ref]} />
            {asli !== null && asli > OUTRO_MIN && (
              <label className="flex flex-col gap-1.5">
                <span className="flex justify-between text-[12px] font-bold text-teks-utama">
                  Panjang outro <span className="font-mono">{fmtDurasi(durasi)}</span>
                </span>
                <input
                  type="range"
                  min={OUTRO_MIN}
                  max={asli}
                  step={0.1}
                  value={durasi}
                  onPointerDown={p.mulaiUbah}
                  onKeyDown={p.mulaiUbah}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    p.ubah((d) => ({ ...d, outro: { ...d.outro, durasi: v >= asli - 0.05 ? null : v } }));
                  }}
                  style={{ accentColor: "#dc2626" }}
                  aria-label="Panjang outro"
                />
                <span className="text-[11px] text-teks-sekunder">Asli {fmtDurasi(asli)} — outro hanya bisa dipendekkan.</span>
              </label>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => p.onGantiBerkas(PILIH_OUTRO)} className={cn(tombolKecil, "flex-1")}>
                Ganti video
              </button>
              <button
                type="button"
                onClick={() => {
                  p.mulaiUbah();
                  p.ubah((d) => ({ ...d, outro: { file: null, durasi: null } }));
                  p.onPilih(null);
                }}
                className={cn(tombolKecil, "flex-1 border-gagal/40 text-gagal")}
              >
                Hapus outro
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => p.onGantiBerkas(PILIH_OUTRO)} className={tombolKecil}>
            Pilih video outro
          </button>
        )}
      </div>
    );
  }

  const el = dok.elemen.find((e) => e.id === pilih);
  if (!el) return null;
  const info = el.file ? p.aset[el.file] : undefined;
  const i = dok.elemen.findIndex((e) => e.id === el.id);
  const ubahIni = (fn: (e: ElemenStudio) => ElemenStudio) => p.ubah((d) => ubahElemen(d, el.id, fn));
  const bisaHapusLatar = info?.jenis === "gambar" && (el.jenis === "pernak" || el.jenis === "logo" || el.jenis === "footer");
  const sedang = p.mengolah === el.id;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: WARNA_JENIS[el.jenis] }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-teks-sekunder">Elemen terpilih</span>
          <p className="m-0 truncate font-heading text-[16px] font-extrabold text-teks-utama">{namaElemen(el)}</p>
        </div>
      </div>

      {el.jenis === "pernak" && (
        <label className={label}>
          Nama (opsional)
          <input
            value={el.nama}
            maxLength={40}
            placeholder={namaElemen({ ...el, nama: "" })}
            onFocus={p.mulaiUbah}
            onChange={(e) => ubahIni((x) => ({ ...x, nama: e.target.value }))}
            className={cn(masukan, "font-sans")}
          />
        </label>
      )}

      {el.jenis !== "kategori" && (
        <div className="flex flex-col gap-2">
          {el.file ? <KartuBerkas info={info} url={p.gambar[el.file]} /> : <p className="m-0 text-[12px] text-teks-sekunder">Tanpa gambar kotak — hanya tulisan berita.</p>}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => p.onGantiBerkas(el.id)} className={cn(tombolKecil, "flex items-center gap-1.5")}>
              <Replace className="h-3.5 w-3.5" aria-hidden="true" />
              {el.file ? "Ganti" : "Pilih gambar"}
            </button>
            {bisaHapusLatar && (
              <button type="button" disabled={sedang} onClick={() => p.onHapusLatar(el.id)} className={cn(tombolKecil, "flex items-center gap-1.5 border-pink-300 text-pink-700 dark:text-pink-300")}>
                {sedang ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {sedang ? "Menghapus latar…" : "Hapus latar"}
              </button>
            )}
            {p.adaAsli(el.id) && (
              <button type="button" onClick={() => p.onPakaiAsli(el.id)} className={tombolKecil}>
                Pakai asli
              </button>
            )}
          </div>
          {el.jenis === "boom" && info?.jenis === "video" && !info.alpha && (
            <label className="flex items-center gap-2 text-[12.5px] text-teks-utama">
              <input
                type="checkbox"
                checked={el.kunci_hijau}
                onChange={(e) => {
                  p.mulaiUbah();
                  ubahIni((x) => ({ ...x, kunci_hijau: e.target.checked }));
                }}
                className="h-[18px] w-[18px]"
                style={{ accentColor: "#dc2626" }}
              />
              Latar hijau dibuang saat render
            </label>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className={judulBagian}>{el.jenis === "kategori" ? "Letak tulisan kategori (px)" : "Posisi & ukuran (px)"}</span>
        <InputRect key={el.id} r={el.rect} mulai={p.mulaiUbah} onUbah={(r) => ubahIni((x) => ({ ...x, rect: r }))} />
        <div className="grid grid-cols-6 gap-1" role="group" aria-label="Rata cepat">
          {(
            [
              ["kiri", "Kiri"],
              ["tengah-h", "Tengah"],
              ["kanan", "Kanan"],
              ["atas", "Atas"],
              ["tengah-v", "Tgh"],
              ["bawah", "Bawah"],
            ] as const
          ).map(([k, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                p.mulaiUbah();
                ubahIni((x) => ({ ...x, rect: rataKanvas(x.rect, k) }));
              }}
              className="btn-tekan h-8 rounded-md border border-black/10 text-[10.5px] font-semibold text-teks-utama dark:border-white/15"
            >
              {n}
            </button>
          ))}
        </div>
        {el.file && (
          <label className="flex items-center gap-2 text-[12.5px] text-teks-utama">
            <input type="checkbox" checked={p.kunciRasio(el.id)} onChange={(e) => p.setKunciRasio(el.id, e.target.checked)} className="h-[18px] w-[18px]" style={{ accentColor: "#dc2626" }} />
            Kunci rasio gambar (Shift saat menarik = bebas)
          </label>
        )}
        {el.jenis === "berita" && (
          <button type="button" onClick={() => p.onPilih(PILIH_TEKS)} className={tombolKecil}>
            Atur area tulisan berita
          </button>
        )}
      </div>

      {el.file && (
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-[12px] font-bold text-teks-utama">
            Transparansi <span className="font-mono">{Math.round(el.opacity * 100)}%</span>
          </span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(el.opacity * 100)}
            onPointerDown={p.mulaiUbah}
            onKeyDown={p.mulaiUbah}
            onChange={(e) => ubahIni((x) => ({ ...x, opacity: Number(e.target.value) / 100 }))}
            aria-label="Transparansi"
            style={{ accentColor: "#dc2626" }}
          />
        </label>
      )}

      <BagianWaktu el={el} durasi={p.durasi} mulai={p.mulaiUbah} ubahWaktu={(w) => ubahIni((x) => ({ ...x, waktu: w }))} />

      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={i >= dok.elemen.length - 1} onClick={() => p.onPindah(el.id, 1)} className={cn(tombolKecil, "flex items-center gap-1")}>
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> Ke depan
        </button>
        <button type="button" disabled={i <= 0} onClick={() => p.onPindah(el.id, -1)} className={cn(tombolKecil, "flex items-center gap-1")}>
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> Ke belakang
        </button>
        <button
          type="button"
          onClick={() => {
            p.mulaiUbah();
            ubahIni((x) => ({ ...x, tersembunyi: !x.tersembunyi }));
          }}
          className={cn(tombolKecil, "flex items-center gap-1")}
        >
          {el.tersembunyi ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
          {el.tersembunyi ? "Tampilkan" : "Sembunyikan"}
        </button>
        {el.jenis !== "berita" && (
          <button type="button" onClick={() => p.onHapus(el.id)} aria-label={`Hapus ${namaElemen(el)}`} className={cn(tombolKecil, "flex items-center gap-1 border-gagal/40 text-gagal")}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Hapus
          </button>
        )}
      </div>
    </div>
  );
}

function KartuBerkas({ info, url }: { info: AsetStudio | undefined; url: string | undefined }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-black/10 bg-black/[.03] p-2 dark:border-white/10 dark:bg-white/5">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ backgroundColor: "#fff", backgroundImage: "linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%)", backgroundSize: "10px 10px", backgroundPosition: "0 0,5px 5px" }}
      >
        {url ? (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-teks-sekunder" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-[11.5px] text-teks-sekunder">
        <p className="m-0 truncate font-semibold text-teks-utama">{info ? info.nama : "berkas"}</p>
        {info && (
          <p className="m-0">
            {info.jenis === "video" ? "Video" : info.jenis === "gif" ? "GIF" : "Gambar"} · {info.w}×{info.h}
            {info.durasi ? ` · ${fmtDurasi(info.durasi)}` : ""}
            {info.alpha ? " · transparan" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
