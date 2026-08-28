"use client";

// ============================================================
// DevMode (fitur 1.22/1) — Mode Developer: masuk sebagai peran/
// jabatan/divisi apa pun (hingga Ketua Umum) untuk pengujian.
// Impersonasi SESI — data akun asli tak berubah; keluar = normal.
// ============================================================

import { useState } from "react";
import { Loader2, TerminalSquare } from "lucide-react";
import { masukDeveloper, type UserLengkap } from "@/services";
import { JABATAN_PARTAI } from "@/lib/jabatan";
import { DIVISI, pilihanSubDivisi } from "@/lib/struktur";

const PERAN = [
  { id: "master", label: "Master" },
  { id: "super_admin", label: "Super Admin" },
  { id: "admin_hr", label: "Admin HR" },
  { id: "admin_tv", label: "Admin TV" },
  { id: "ketua", label: "Ketua" },
  { id: "anggota", label: "Anggota" },
];

export function DevMode({ onBerhasil }: { onBerhasil: (u: UserLengkap) => void }) {
  const [password, setPassword] = useState("");
  const [peran, setPeran] = useState("super_admin");
  const [jabatan, setJabatan] = useState("");
  const [divisi, setDivisi] = useState("");
  const [subDivisi, setSubDivisi] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subPilihan = divisi ? pilihanSubDivisi(divisi) : [];

  async function masuk() {
    if (memuat) return;
    setError(null);
    setMemuat(true);
    try {
      const user = await masukDeveloper({
        password,
        peran,
        jabatan,
        divisi,
        sub_divisi: subDivisi,
      });
      onBerhasil(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal masuk Mode Developer.");
    } finally {
      setMemuat(false);
    }
  }

  const kelasField =
    "glass-input h-11 w-full rounded-xl px-3 text-sm text-teks-utama";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-teks-sekunder">
        <TerminalSquare className="h-4.5 w-4.5" aria-hidden="true" />
        <p className="text-[12px] leading-snug">
          Masuk sebagai peran/jabatan/divisi apa pun untuk pengujian. Ini
          impersonasi sementara — data akun tak berubah.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder">Peran</span>
        <select value={peran} onChange={(e) => setPeran(e.target.value)} className={kelasField}>
          {PERAN.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder">
          Jabatan (opsional)
        </span>
        <select value={jabatan} onChange={(e) => setJabatan(e.target.value)} className={kelasField}>
          <option value="">— tanpa jabatan —</option>
          {JABATAN_PARTAI.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder">
          Divisi (opsional)
        </span>
        <select
          value={divisi}
          onChange={(e) => {
            setDivisi(e.target.value);
            setSubDivisi("");
          }}
          className={kelasField}
        >
          <option value="">— tanpa divisi —</option>
          {DIVISI.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {subPilihan.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder">
            Sub-divisi
          </span>
          <select value={subDivisi} onChange={(e) => setSubDivisi(e.target.value)} className={kelasField}>
            <option value="">— pilih —</option>
            {subPilihan.map((s) => (
              <option key={s.nilai} value={s.nilai}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-[11.5px] font-semibold text-teks-sekunder">
          Kata Sandi Developer
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void masuk();
          }}
          placeholder="••"
          className={kelasField}
          aria-label="Kata sandi developer"
        />
      </label>

      {error && (
        <p className="rounded-xl bg-gagal/12 px-3 py-2 text-center text-[12px] font-medium text-gagal">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void masuk()}
        disabled={memuat || !password}
        className="btn-tekan flex h-12 w-full items-center justify-center gap-2 rounded-xl font-heading text-sm font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #334155, #0F172A)" }}
      >
        {memuat && <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />}
        Masuk Mode Developer
      </button>
    </div>
  );
}
