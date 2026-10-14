"use client";

// ============================================================
// ModalTautkanProfil (2 Sep 2026) — admin menautkan profil upload-post
// yang SUDAH ADA (dibuat di dashboard upload-post) ke seorang anggota,
// atau membuat profil BERNAMA baru untuk anggota. Setelah tertaut,
// profil itu menjadi "profil TVR Saya" anggota tersebut: login sosmed,
// unggah, insight, KPI otomatis, leaderboard — semua ikut.
// ============================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getAnggotaTautan, tautanProfilTv, tautkanProfilTv } from "@/services";
import type { AnggotaTautan } from "@/lib/tautan-profil";
import { PemilihAnggota } from "./pemilih-anggota";
import { cn } from "@/lib/utils";

export type PermintaanTautkan = { mode: "tautkan"; profil: string } | { mode: "buat" };

const POLA_USERNAME = /^[a-z0-9][a-z0-9-]{2,39}$/;

export function ModalTautkanProfil({
  permintaan,
  onTutup,
  onSelesai,
  userIdAwal,
}: {
  permintaan: PermintaanTautkan;
  onTutup: () => void;
  onSelesai: () => void;
  /** Akun yang sudah terpilih saat modal dibuka (mis. dari Kelola Bot); masih bisa diganti. */
  userIdAwal?: number;
}) {
  const [roster, setRoster] = useState<AnggotaTautan[] | null>(null);
  // undefined = belum disentuh (pakai akun awal bila ada); null = sengaja dikosongkan lewat "Ganti".
  const [pilihManual, setPilih] = useState<AnggotaTautan | null | undefined>(undefined);
  const pilih =
    pilihManual !== undefined ? pilihManual : userIdAwal !== undefined ? (roster?.find((r) => Number(r.id) === userIdAwal) ?? null) : null;
  const [username, setUsername] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [konfirmasiGanti, setKonfirmasiGanti] = useState(false);
  const [hasil, setHasil] = useState<{ profil: string; tersinkron: number; konflik: string[] } | null>(
    null,
  );
  const [tautan, setTautan] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    getAnggotaTautan()
      .then((r) => hidup && setRoster(r))
      .catch((e) => {
        if (!hidup) return;
        setRoster([]);
        toast("error", "Daftar akun gagal dimuat", e instanceof Error ? e.message : "");
      });
    return () => {
      hidup = false;
    };
  }, []);

  const usernameSah = POLA_USERNAME.test(username);
  const profilTarget = permintaan.mode === "tautkan" ? permintaan.profil : username;
  const profilLama = pilih?.profil || undefined;

  async function kirim(ganti: boolean) {
    if (!pilih || sibuk) return;
    if (permintaan.mode === "buat" && !usernameSah) {
      toast("peringatan", "Nama profil: huruf kecil, angka, strip; 3–40 karakter");
      return;
    }
    setSibuk(true);
    try {
      const r = await tautkanProfilTv({
        aksi: permintaan.mode,
        profil: permintaan.mode === "tautkan" ? permintaan.profil : undefined,
        username: permintaan.mode === "buat" ? username : undefined,
        user_id: pilih.id,
        ganti,
      });
      setHasil({ profil: r.profil, tersinkron: r.tersinkron, konflik: r.konflik });
      setKonfirmasiGanti(false);
      toast("sukses", "Profil tertaut", `${r.profil} → ${pilih.nama}`);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : "";
      // 409 "sudah punya profil" → minta konfirmasi pengalihan, bukan gagal.
      if (/sudah punya profil/i.test(pesan) && !ganti) setKonfirmasiGanti(true);
      else toast("error", "Gagal menautkan", pesan);
    } finally {
      setSibuk(false);
    }
  }

  async function salinTautan() {
    if (!hasil) return;
    try {
      const url = tautan ?? (await tautanProfilTv(hasil.profil));
      setTautan(url);
      await navigator.clipboard.writeText(url);
      toast("sukses", "Tautan login disalin", "Kirim ke anggotanya — berlaku 48 jam.");
    } catch (e) {
      toast("error", "Gagal menyalin tautan", e instanceof Error ? e.message : "");
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label="Tautkan profil upload-post"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={sibuk ? undefined : onTutup} />
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <Link2 className="h-5 w-5 text-pri" aria-hidden="true" />
          <p className="font-heading text-[15px] font-extrabold text-teks-utama">
            {permintaan.mode === "tautkan" ? "Tautkan Profil ke Anggota" : "Buat Profil Bernama"}
          </p>
          <button
            type="button"
            onClick={onTutup}
            disabled={sibuk}
            aria-label="Tutup"
            className="glass btn-tekan ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-6">
          {hasil ? (
            <div className="mt-1">
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-[12px] leading-relaxed text-teks-utama">
                <p className="flex items-center gap-1.5 font-bold">
                  <Check className="h-4 w-4 text-emerald-500" /> Profil <b>{hasil.profil}</b> kini milik{" "}
                  {pilih?.nama}
                </p>
                <p className="mt-1 text-teks-sekunder">
                  {hasil.tersinkron > 0
                    ? `${hasil.tersinkron} akun sosmed yang sudah tertaut di profil itu ikut tercatat ke anggotanya.`
                    : "Belum ada akun sosmed di profil ini — kirim tautan login di bawah supaya anggotanya menyambungkan akunnya."}
                </p>
                {hasil.konflik.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-600 dark:text-amber-400">
                    {hasil.konflik.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => void salinTautan()}
                className="glass btn-tekan mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[12.5px] font-bold text-teks-utama"
              >
                <Copy className="h-4 w-4 text-pri" />
                {tautan ? "Salin lagi tautan login" : "Buat & salin tautan login akun (48 jam)"}
              </button>
              {tautan && (
                <p className="mt-2 rounded-xl bg-black/5 px-3 py-2 text-[10.5px] break-all text-teks-sekunder dark:bg-white/10">
                  {tautan}
                </p>
              )}
              <p className="mt-2 text-[10.5px] leading-relaxed text-teks-sekunder">
                Anggota juga bisa menyambungkan akunnya sendiri lewat TV Rakyat Saya → Hubungkan akun.
              </p>
              <button
                type="button"
                onClick={onSelesai}
                className="btn-tekan mt-3 h-11 w-full rounded-xl text-[13px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
              >
                Selesai
              </button>
            </div>
          ) : (
            <>
              {permintaan.mode === "tautkan" ? (
                <p className="mt-1 text-[12px] text-teks-sekunder">
                  Profil upload-post: <b className="text-teks-utama">{permintaan.profil}</b>
                </p>
              ) : (
                <div className="mt-1">
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder="nama profil, mis. tvjakartaterkini"
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={sibuk}
                    className="glass-input h-11 w-full rounded-xl px-3 text-sm text-teks-utama"
                  />
                  <p className="mt-1 text-[10.5px] text-teks-sekunder">
                    Huruf kecil, angka, strip; 3–40 karakter. Nama ini yang tampil di upload-post.
                    {username && !usernameSah ? " Format belum sah." : ""}
                  </p>
                </div>
              )}

              <p className="mt-3 text-[11px] font-semibold text-teks-sekunder">Tautkan ke anggota:</p>
              {pilih ? (
                <div className="glass mt-1.5 flex items-center gap-2.5 rounded-xl px-3 py-2">
                  {pilih.avatar_url ? (
                    <FotoBulat src={pilih.avatar_url} ukuran={30} />
                  ) : (
                    <AvatarInisial nama={pilih.nama} ukuran={30} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-teks-utama">{pilih.nama}</span>
                    <span className="block truncate text-[10px] text-teks-sekunder">{pilih.divisi || "tanpa divisi"}{pilih.username ? ` · @${pilih.username}` : ""}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPilih(null);
                      setKonfirmasiGanti(false);
                    }}
                    disabled={sibuk}
                    className="btn-tekan text-[11px] font-bold text-pri"
                  >
                    Ganti
                  </button>
                </div>
              ) : (
                roster === null ? (
                  <GlassSkeleton className="mt-2 h-32 rounded-xl" />
                ) : (
                  <PemilihAnggota daftar={roster} onPilih={setPilih} />
                )
              )}

              {pilih && profilLama && profilLama !== profilTarget && (
                <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                  {pilih.nama} sudah punya profil <b>{profilLama}</b>. Menautkan berarti mengalihkan
                  TV Rakyat Saya-nya ke <b>{profilTarget || "profil baru"}</b>; profil lama tetap ada di
                  upload-post.
                </p>
              )}

              {pilih && (permintaan.mode === "tautkan" || usernameSah) && !konfirmasiGanti && (
                <p className="mt-3 rounded-xl bg-black/5 px-3 py-2 text-[11.5px] leading-relaxed text-teks-utama dark:bg-white/10">
                  Profil <b>{profilTarget}</b> akan menjadi profil TV Rakyat Saya milik <b>{pilih.nama}</b>
                  {pilih.username ? ` (@${pilih.username})` : ""}. Unggahan, KPI, dan insight akun itu
                  mengikuti profil ini.
                </p>
              )}

              {konfirmasiGanti ? (
                <div className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">
                  <p className="text-[12px] leading-relaxed text-teks-utama">
                    Anggota ini sudah punya profil lain. Alihkan ke <b>{profilTarget}</b>?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void kirim(true)}
                      disabled={sibuk}
                      className="btn-tekan flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                    >
                      {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Ya, alihkan
                    </button>
                    <button
                      type="button"
                      onClick={() => setKonfirmasiGanti(false)}
                      disabled={sibuk}
                      className="glass btn-tekan rounded-xl px-3 text-[12px] font-bold text-teks-utama"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void kirim(false)}
                  disabled={!pilih || sibuk || (permintaan.mode === "buat" && !usernameSah)}
                  className={cn(
                    "btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                >
                  {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  {permintaan.mode === "tautkan" ? "Tautkan ke anggota ini" : "Buat profil & tautkan"}
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
