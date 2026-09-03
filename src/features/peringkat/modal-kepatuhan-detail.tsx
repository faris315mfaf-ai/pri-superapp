"use client";

// ============================================================
// ModalKepatuhanDetail (3 Sep 2026) — dibuka dari leaderboard "Kepatuhan
// Komen" saat nama diketuk: semua postingan wajib periode berjalan untuk
// orang itu — sudah/belum komen, sosmed & akun, jam unggah, tombol "mata"
// untuk membuka postingannya. Di atas daftar tampil USERNAME TERDAFTAR orang
// itu (akun yang dipakai berkomentar). Tombol AJUKAN berlaku untuk SEMUA
// pengguna (3 Sep 2026): "sudah komen tapi sistem belum mencatat" → pilih
// username terdaftar milik orang itu → masuk antrean QC Divisi PALUGODAM;
// bila diajukan orang lain, pengajunya ikut tercatat.
// ============================================================

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Eye, Loader2, Send, X } from "lucide-react";
import { GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon, labelPlatform } from "@/components/platform-icon";
import { toast } from "@/hooks/use-app-store";
import { ajukanKomentar, getKepatuhanDetail, type KepatuhanDetail, type KepatuhanDetailPost } from "@/services";
import { jamWIB, tanggalIndonesia } from "@/lib/format";
import { cn } from "@/lib/utils";

function waktuUnggah(iso: string | null): string {
  if (!iso) return "jam unggah tidak diketahui";
  return `${tanggalIndonesia(iso)} ${jamWIB(iso)}`;
}

export function ModalKepatuhanDetail({ nama, onTutup }: { nama: string; onTutup: () => void }) {
  const [data, setData] = useState<KepatuhanDetail | null>(null);
  const [ajukanUntuk, setAjukanUntuk] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  function muat() {
    return getKepatuhanDetail(nama)
      .then(setData)
      .catch((e) => toast("error", "Gagal memuat rincian", e instanceof Error ? e.message : ""));
  }
  useEffect(() => {
    let hidup = true;
    getKepatuhanDetail(nama)
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && toast("error", "Gagal memuat rincian", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, [nama]);

  function bukaAjuan(d: KepatuhanDetailPost) {
    const cocok = (data?.akun ?? []).filter((a) => a.platform === d.platform);
    setAjukanUntuk(d.id_postingan);
    setUsername(cocok[0]?.username ?? "");
    setCatatan("");
  }

  async function kirimAjuan(d: KepatuhanDetailPost) {
    if (!data || sibuk) return;
    if (!username) {
      toast("peringatan", `Pilih username yang ${data.milik_sendiri ? "Anda" : nama} pakai berkomentar`);
      return;
    }
    setSibuk(true);
    try {
      await ajukanKomentar({
        id_postingan: d.id_postingan,
        periode: data.periode,
        username_komentar: username,
        catatan,
        ...(data.milik_sendiri ? {} : { nama: data.nama }),
      });
      toast(
        "sukses",
        "Ajuan terkirim",
        data.milik_sendiri
          ? "Divisi PALUGODAM akan memeriksa komentar Anda."
          : `Divisi PALUGODAM akan memeriksa komentar ${nama}.`,
      );
      setAjukanUntuk(null);
      await muat();
    } catch (e) {
      toast("error", "Ajuan gagal", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Rincian kepatuhan komen ${nama}`}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={sibuk ? undefined : onTutup} />
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[15px] font-extrabold text-teks-utama">{nama}</p>
            <p className="text-[10.5px] text-teks-sekunder">
              {data ? `${data.sudah}/${data.total} postingan dikomentari · periode ${data.periode}` : "memuat…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            disabled={sibuk}
            aria-label="Tutup"
            className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profil / username yang dipakai berkomentar (3 Sep 2026) */}
        {data ? (
          <div className="px-4 pb-2">
            {data.akun.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10.5px] font-bold text-teks-sekunder">Akun untuk komen:</span>
                {data.akun.map((a) => (
                  <span
                    key={`${a.platform}-${a.username}`}
                    className="glass-soft flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-teks-utama"
                  >
                    <PlatformIcon platform={a.platform} size={10} />@{a.username}
                  </span>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[10.5px] leading-relaxed text-gagal">
                {data.terdaftar
                  ? `Belum ada akun media sosial terdaftar atas nama ${data.milik_sendiri ? "Anda" : nama} — komentar dari akun yang tidak terdaftar tidak bisa dihitung.`
                  : `${nama} tidak ditemukan sebagai pengguna aktif aplikasi.`}
              </p>
            )}
          </div>
        ) : null}

        <div className="scrollbar-tipis flex-1 overflow-y-auto px-4 pb-6">
          {!data ? (
            <div className="flex flex-col gap-2 pt-1">
              <GlassSkeleton className="h-16 rounded-2xl" />
              <GlassSkeleton className="h-16 rounded-2xl" />
              <GlassSkeleton className="h-16 rounded-2xl" />
            </div>
          ) : data.daftar.length === 0 ? (
            <p className="glass mt-2 rounded-2xl px-4 py-5 text-center text-[12px] text-teks-sekunder">
              Belum ada postingan wajib untuk periode ini.
            </p>
          ) : (
            <>
              <p className="mt-1 rounded-xl bg-amber-400/10 px-3 py-2 text-[10.5px] leading-relaxed text-teks-sekunder">
                {data.milik_sendiri ? (
                  <>
                    Sudah komen tapi belum tercatat? Tekan <b>Ajukan</b> di postingan itu, pilih username yang
                    Anda pakai — Divisi PALUGODAM akan memeriksa dan menyetujuinya.
                  </>
                ) : (
                  <>
                    {nama} sudah komen tapi belum tercatat? Tekan <b>Ajukan</b> di postingan itu, pilih username
                    miliknya — Divisi PALUGODAM akan memeriksa dan menyetujuinya. Nama Anda tercatat sebagai pengaju.
                  </>
                )}
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {data.daftar.map((d) => {
                  // Berlaku untuk semua pengguna (3 Sep 2026), bukan hanya diri sendiri.
                  const bolehAjukan = !d.sudah && (!d.ajuan || d.ajuan.status === "ditolak");
                  const membuka = ajukanUntuk === d.id_postingan;
                  const akunCocok = data.akun.filter((a) => a.platform === d.platform);
                  return (
                    <div key={d.id_postingan} className="glass-soft rounded-xl p-2">
                      <div className="flex items-center gap-2">
                        {/* KIRI: Ajukan */}
                        {bolehAjukan ? (
                          <button
                            type="button"
                            onClick={() => (membuka ? setAjukanUntuk(null) : bukaAjuan(d))}
                            className={cn(
                              "btn-tekan shrink-0 rounded-full px-2.5 py-1.5 text-[10.5px] font-bold",
                              membuka ? "bg-black/10 text-teks-utama dark:bg-white/15" : "text-white",
                            )}
                            style={membuka ? undefined : { background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                          >
                            {membuka ? "Batal" : "Ajukan"}
                          </button>
                        ) : d.ajuan?.status === "menunggu" ? (
                          <StatusBadge label="diajukan" warna="kuning" />
                        ) : null}

                        {/* TENGAH: sosmed, akun, jam unggah, status */}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-teks-utama">
                            <PlatformIcon platform={d.platform} size={12} />
                            <span className="truncate">
                              {labelPlatform(d.platform)} · {d.akun_wajib}
                            </span>
                          </p>
                          {d.caption ? (
                            <p className="line-clamp-1 text-[10.5px] text-teks-sekunder">{d.caption}</p>
                          ) : null}
                          <p className="text-[10px] text-teks-sekunder">diunggah {waktuUnggah(d.waktu_posting)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {d.sudah ? (
                              <StatusBadge label={`sudah komen${d.jumlah > 1 ? ` ×${d.jumlah}` : ""}`} warna="hijau" />
                            ) : (
                              <StatusBadge label="belum komen" warna="merah" />
                            )}
                            {d.ajuan?.status === "disetujui" ? (
                              <StatusBadge label={`ACC @${d.ajuan.username_komentar}`} warna="biru" />
                            ) : null}
                            {d.ajuan?.status === "ditolak" ? (
                              <span className="text-[9.5px] text-gagal">
                                ajuan ditolak{d.ajuan.catatan_putusan ? `: ${d.ajuan.catatan_putusan}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* KANAN: mata → buka postingan */}
                        <a
                          href={d.url_postingan}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Lihat postingan"
                          className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      </div>

                      {/* Form ajuan */}
                      {membuka && (
                        <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5">
                          <p className="text-[11px] font-bold text-teks-utama">
                            {data.milik_sendiri ? "Saya" : nama} sudah berkomentar memakai username:
                          </p>
                          {akunCocok.length === 0 ? (
                            <p className="mt-1 text-[10.5px] leading-relaxed text-gagal">
                              {data.milik_sendiri
                                ? `Belum ada akun ${labelPlatform(d.platform)} terdaftar atas nama Anda. Daftarkan dulu di Profil → Akun Media Sosial, lalu ajukan lagi.`
                                : `Belum ada akun ${labelPlatform(d.platform)} terdaftar atas nama ${nama}. Minta yang bersangkutan mendaftarkannya di Profil → Akun Media Sosial.`}
                            </p>
                          ) : (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {akunCocok.map((a) => (
                                <button
                                  key={a.username}
                                  type="button"
                                  onClick={() => setUsername(a.username)}
                                  aria-pressed={username === a.username}
                                  className={cn(
                                    "btn-tekan rounded-full px-3 py-1.5 text-[11px] font-bold",
                                    username === a.username ? "text-white" : "glass text-teks-sekunder",
                                  )}
                                  style={username === a.username ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
                                >
                                  @{a.username}
                                </button>
                              ))}
                            </div>
                          )}
                          <input
                            value={catatan}
                            onChange={(e) => setCatatan(e.target.value)}
                            maxLength={300}
                            placeholder="Catatan (opsional), mis. isi komentarnya"
                            className="glass-input mt-2 h-9 w-full rounded-xl px-2.5 text-[11.5px] text-teks-utama"
                          />
                          <button
                            type="button"
                            onClick={() => void kirimAjuan(d)}
                            disabled={sibuk || akunCocok.length === 0 || !username}
                            className="btn-tekan mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
                            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
                          >
                            {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Kirim ajuan ke Divisi PALUGODAM
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 flex items-center justify-center gap-1 text-center text-[10px] text-teks-sekunder">
                <Check className="h-3 w-3" /> Komentar dihitung hanya bila ditulis di jendela 19.00–18.59 WIB memakai akun terdaftar.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
