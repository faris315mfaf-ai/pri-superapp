"use client";

// ============================================================
// PemilihAnggota (13 Okt 2026) — pemilih akun superapp untuk menautkan
// profil upload-post: cari nama/username + filter divisi (termasuk Divisi
// BOT). Logika saring ada di lib/tautan-profil (murni, teruji).
// ============================================================

import { useMemo, useState } from "react";
import { Bot, Search } from "lucide-react";
import { AvatarInisial } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import {
  FILTER_SEMUA,
  FILTER_TANPA_DIVISI,
  hitungPerDivisi,
  pilihanFilterDivisi,
  saringAnggota,
  type AnggotaTautan,
} from "@/lib/tautan-profil";
import { DIVISI_BOT } from "@/lib/struktur";

const TAMPIL_AWAL = 40;

export function PemilihAnggota({
  daftar,
  onPilih,
}: {
  daftar: AnggotaTautan[];
  onPilih: (a: AnggotaTautan) => void;
}) {
  const [cari, setCari] = useState("");
  const [divisi, setDivisi] = useState(FILTER_SEMUA);
  const [semua, setSemua] = useState(false);

  const perDivisi = useMemo(() => hitungPerDivisi(daftar), [daftar]);
  const hasil = useMemo(() => saringAnggota(daftar, cari, divisi), [daftar, cari, divisi]);
  const terlihat = semua ? hasil : hasil.slice(0, TAMPIL_AWAL);
  // Hanya divisi yang punya anggota yang ditawarkan; Divisi BOT selalu ikut.
  const pilihan = pilihanFilterDivisi().filter((d) => (perDivisi.get(d) ?? 0) > 0 || d === DIVISI_BOT);

  return (
    <div>
      <div className="glass-input mt-1.5 flex h-11 items-center gap-2 rounded-xl px-3">
        <Search className="h-4 w-4 text-teks-sekunder" aria-hidden="true" />
        <input
          value={cari}
          onChange={(e) => {
            setCari(e.target.value);
            setSemua(false);
          }}
          placeholder="Cari nama atau username…"
          aria-label="Cari akun"
          autoFocus
          className="h-full w-full bg-transparent text-sm text-teks-utama outline-none"
        />
      </div>
      <select
        value={divisi}
        onChange={(e) => {
          setDivisi(e.target.value);
          setSemua(false);
        }}
        aria-label="Filter divisi"
        className="glass-input mt-2 h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama"
      >
        <option value={FILTER_SEMUA}>Semua divisi ({daftar.length})</option>
        {pilihan.map((d) => (
          <option key={d} value={d}>
            {d} ({perDivisi.get(d) ?? 0})
          </option>
        ))}
        {(perDivisi.get(FILTER_TANPA_DIVISI) ?? 0) > 0 && (
          <option value={FILTER_TANPA_DIVISI}>Tanpa divisi ({perDivisi.get(FILTER_TANPA_DIVISI)})</option>
        )}
      </select>

      <p className="mt-2 text-[10.5px] text-teks-sekunder" aria-live="polite">
        {hasil.length} akun
      </p>
      <div className="scrollbar-tipis mt-1 flex max-h-64 flex-col gap-1 overflow-y-auto">
        {terlihat.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPilih(r)}
            className="btn-tekan flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
          >
            {r.avatar_url ? (
              <FotoBulat src={r.avatar_url} ukuran={28} />
            ) : (
              <AvatarInisial nama={r.nama} ukuran={28} />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 truncate text-[12px] font-semibold text-teks-utama">
                {r.divisi === DIVISI_BOT && <Bot className="h-3 w-3 shrink-0 text-pri" aria-hidden="true" />}
                <span className="truncate">{r.nama}</span>
                {r.username && <span className="shrink-0 font-normal text-teks-sekunder">@{r.username}</span>}
              </span>
              <span className="block truncate text-[10px] text-teks-sekunder">
                {r.profil ? `sudah punya profil ${r.profil}` : r.divisi || "tanpa divisi"}
              </span>
            </span>
          </button>
        ))}
        {hasil.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] text-teks-sekunder">Tidak ada akun cocok.</p>
        )}
        {!semua && hasil.length > TAMPIL_AWAL && (
          <button
            type="button"
            onClick={() => setSemua(true)}
            className="btn-tekan rounded-xl py-2 text-center text-[11px] font-bold text-pri"
          >
            Tampilkan {hasil.length - TAMPIL_AWAL} lagi
          </button>
        )}
      </div>
    </div>
  );
}
