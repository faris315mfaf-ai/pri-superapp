"use client";
// ============================================================
// Panel Master — BUAT AKUN BARU & MODUL PER AKUN (10 Sep 2026).
//
// Master mengisi akun lengkap dalam satu kartu: identitas, sandi awal,
// peran, jabatan (+ bidang), struktur (Zona / Sayap / Divisi + posisi),
// dan modul apa saja yang DIBUKA atau DITUTUP khusus akun itu.
//
// Modul per akun punya tiga keadaan:
//   ikut peran (bawaan) · dibuka · ditutup
// Disimpan sebagai app_user.modul_izin; server yang menegakkannya
// (lihat lib/peran.ts modulDibuka).
// ============================================================
import { useState } from "react";
import { Eye, EyeOff, Loader2, ShieldPlus, UserPlus, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { SectionTitle } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { JABATAN_PARTAI } from "@/lib/jabatan";
import { MODUL_AKUN, type KunciModul, type ModulIzin } from "@/lib/peran";
import { cn } from "@/lib/utils";
import { PilihStrukturBanyak, type NilaiStruktur } from "@/features/pengguna/pilih-struktur";
import { DIVISI_SAYAP } from "@/lib/struktur";
import { aksiMaster, aksiMasterHasil, type PenggunaAdmin } from "@/services";

const PERAN_BARU = [
  { id: "anggota", label: "Anggota" },
  { id: "ketua", label: "Ketua" },
  { id: "superadmin", label: "Superadmin (tersembunyi)" },
] as const;

type Keadaan = "ikut" | "buka" | "tutup";
const PILIHAN_KEADAAN: { nilai: Keadaan; label: string }[] = [
  { nilai: "ikut", label: "Ikut peran" },
  { nilai: "buka", label: "Dibuka" },
  { nilai: "tutup", label: "Ditutup" },
];

function dariIzin(izin: Record<string, boolean> | null | undefined): Record<KunciModul, Keadaan> {
  const hasil = {} as Record<KunciModul, Keadaan>;
  for (const m of MODUL_AKUN) {
    const v = izin?.[m.kunci];
    hasil[m.kunci] = v === true ? "buka" : v === false ? "tutup" : "ikut";
  }
  return hasil;
}

function keIzin(keadaan: Record<KunciModul, Keadaan>): ModulIzin | null {
  const hasil: Record<string, boolean> = {};
  for (const m of MODUL_AKUN) {
    if (keadaan[m.kunci] === "buka") hasil[m.kunci] = true;
    if (keadaan[m.kunci] === "tutup") hasil[m.kunci] = false;
  }
  return Object.keys(hasil).length > 0 ? (hasil as ModulIzin) : null;
}

/** Kontrol tiga-keadaan untuk tiap modul. */
export function KontrolModul({
  keadaan,
  onUbah,
  disabled = false,
}: {
  keadaan: Record<KunciModul, Keadaan>;
  onUbah: (baru: Record<KunciModul, Keadaan>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {MODUL_AKUN.map((m) => (
        <div key={m.kunci} className="glass-soft rounded-xl p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold text-teks-utama">{m.label}</p>
              <p className="truncate text-[10.5px] text-teks-sekunder">{m.keterangan}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1" role="radiogroup" aria-label={`Modul ${m.label}`}>
            {PILIHAN_KEADAAN.map((k) => {
              const aktif = keadaan[m.kunci] === k.nilai;
              return (
                <button
                  key={k.nilai}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  disabled={disabled}
                  onClick={() => onUbah({ ...keadaan, [m.kunci]: k.nilai })}
                  className={cn(
                    "btn-tekan h-8 rounded-lg text-[11px] font-bold disabled:opacity-60",
                    aktif ? "text-white" : "glass text-teks-sekunder",
                  )}
                  style={
                    aktif
                      ? {
                          background:
                            k.nilai === "buka"
                              ? "linear-gradient(135deg, #10B981, #059669)"
                              : k.nilai === "tutup"
                                ? "linear-gradient(135deg, #DC2626, #B91C1C)"
                                : "linear-gradient(135deg, #64748B, #475569)",
                        }
                      : undefined
                  }
                >
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const KELAS_INPUT =
  "glass-input h-11 w-full rounded-xl px-3 text-sm text-teks-utama placeholder:text-teks-sekunder/70";

export function SeksiAkunBaru({ onSelesai }: { onSelesai: () => void }) {
  const [nama, setNama] = useState("");
  const [username, setUsername] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihatSandi, setLihatSandi] = useState(false);
  const [nomorWa, setNomorWa] = useState("");
  const [peran, setPeran] = useState<string>("anggota");
  const [jabatan, setJabatan] = useState("");
  const [bidang, setBidang] = useState("");
  // STRUKTUR GANDA (11 Sep 2026): yang pertama = struktur utama.
  const [strukturDaftar, setStrukturDaftar] = useState<NilaiStruktur[]>([]);
  const struktur: NilaiStruktur = strukturDaftar[0] ?? { divisi: "", sub_divisi: "", jabatan_sayap: "" };
  const [posisi, setPosisi] = useState<"anggota" | "kepala">("anggota");
  const [modul, setModul] = useState<Record<KunciModul, Keadaan>>(() => dariIzin(null));
  const [sibuk, setSibuk] = useState(false);

  const usernameSah = /^[a-z0-9._]{3,30}$/.test(username);
  const diSayap = struktur.divisi === DIVISI_SAYAP;
  const kekurangan: string[] = [];
  if (nama.trim().length < 3) kekurangan.push("Nama minimal 3 huruf");
  if (!usernameSah) kekurangan.push("Username 3–30 huruf kecil/angka/titik/garis bawah");
  if (sandi.length < 6) kekurangan.push("Sandi minimal 6 karakter");
  if (struktur.divisi && (struktur.divisi === "Divisi Zona" || struktur.divisi === DIVISI_SAYAP) && !struktur.sub_divisi) {
    kekurangan.push("Pilih zona/sayapnya");
  }
  if (diSayap && jabatan) kekurangan.push("Anggota Sayap Partai tidak memakai jabatan DPP");
  const sah = kekurangan.length === 0;

  async function kirim() {
    if (!sah || sibuk) return;
    setSibuk(true);
    try {
      const hasil = await aksiMasterHasil("buat_akun", {
        nama: nama.trim(),
        username: username.trim(),
        sandi,
        nomor_wa: nomorWa.trim(),
        role: peran,
        jabatan,
        bidang_jabatan: bidang.trim(),
        divisi: struktur.divisi,
        sub_divisi: struktur.sub_divisi,
        jabatan_sayap: diSayap ? (struktur.jabatan_sayap ?? "") : "",
        posisi_divisi: struktur.divisi ? posisi : "anggota",
        struktur_lain: strukturDaftar.slice(1),
        modul_izin: (keIzin(modul) as Record<string, boolean> | null) ?? {},
      });
      toast("sukses", "Akun dibuat", `@${String(hasil.username ?? username)} siap dipakai. Minta pemiliknya segera mengganti sandi.`);
      setNama("");
      setUsername("");
      setSandi("");
      setNomorWa("");
      setPeran("anggota");
      setJabatan("");
      setBidang("");
      setStrukturDaftar([]);
      setPosisi("anggota");
      setModul(dariIzin(null));
      onSelesai();
    } catch (e) {
      toast("error", "Gagal membuat akun", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <section aria-label="Buat akun baru">
      <SectionTitle judul="Buat Akun Baru" className="mt-6" />
      <p className="mb-2 text-[11px] leading-relaxed text-teks-sekunder">
        Akun langsung aktif tanpa persetujuan. Peran, jabatan, struktur, dan
        modul yang dibuka/ditutup bisa diatur di sini sekaligus.
      </p>
      <GlassCard className="flex flex-col gap-3 p-4">
        <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama lengkap" aria-label="Nama lengkap" className={KELAS_INPUT} maxLength={80} />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
            placeholder="username"
            aria-label="Username"
            autoCapitalize="none"
            className={KELAS_INPUT}
            maxLength={30}
          />
          <input value={nomorWa} onChange={(e) => setNomorWa(e.target.value)} placeholder="Nomor WA (opsional)" aria-label="Nomor WhatsApp" inputMode="tel" className={KELAS_INPUT} maxLength={20} />
        </div>
        <div className="relative">
          <input
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            type={lihatSandi ? "text" : "password"}
            placeholder="Sandi awal (min. 6)"
            aria-label="Sandi awal"
            autoComplete="new-password"
            className={cn(KELAS_INPUT, "pr-11")}
            maxLength={72}
          />
          <button
            type="button"
            onClick={() => setLihatSandi((v) => !v)}
            aria-label={lihatSandi ? "Sembunyikan sandi" : "Tampilkan sandi"}
            className="btn-tekan absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-teks-sekunder"
          >
            {lihatSandi ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold text-teks-sekunder">Peran</p>
          <div className="grid grid-cols-3 gap-2">
            {PERAN_BARU.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeran(p.id)}
                aria-pressed={peran === p.id}
                className={cn("btn-tekan h-10 rounded-xl px-2 text-[11.5px] font-bold", peran === p.id ? "text-white" : "glass text-teks-sekunder")}
                style={peran === p.id ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold text-teks-sekunder">
            Jabatan struktur partai (opsional)
            {diSayap ? " — tidak berlaku untuk anggota sayap" : ""}
          </p>
          <select value={jabatan} onChange={(e) => setJabatan(e.target.value)} aria-label="Jabatan" disabled={diSayap} className="glass-soft h-11 w-full rounded-xl px-3 text-sm text-teks-utama outline-none focus:ring-2 focus:ring-pri/50 disabled:opacity-50">
            <option value="">— Tanpa jabatan —</option>
            {JABATAN_PARTAI.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
          {jabatan && (
            <input value={bidang} onChange={(e) => setBidang(e.target.value)} placeholder="Bidang (opsional), mis. Bidang IT" aria-label="Bidang jabatan" className={cn(KELAS_INPUT, "mt-2")} maxLength={80} />
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] font-semibold text-teks-sekunder">Struktur: Zona · Sayap · Divisi (opsional)</p>
          <PilihStrukturBanyak
            daftar={strukturDaftar}
            onUbah={(baru) => {
              setStrukturDaftar(baru);
              // Masuk sayap = jabatan DPP dikosongkan (aturan 10 Sep 2026).
              if (baru[0]?.divisi === DIVISI_SAYAP) {
                setJabatan("");
                setBidang("");
              }
            }}
            bolehKosong
            bolehJabatanSayap
          />
          {struktur.divisi && !diSayap && (
            <div className="mt-2 flex gap-2">
              {(["anggota", "kepala"] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosisi(pos)}
                  aria-pressed={posisi === pos}
                  className={cn("btn-tekan h-10 flex-1 rounded-xl text-[12.5px] font-bold", posisi === pos ? "text-white" : "glass text-teks-sekunder")}
                  style={posisi === pos ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
                >
                  {pos === "kepala" ? "Kepala" : "Anggota"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-teks-sekunder">
            <ShieldPlus className="h-3.5 w-3.5 text-pri" aria-hidden="true" />
            Modul yang dibuka / ditutup untuk akun ini
          </p>
          <KontrolModul keadaan={modul} onUbah={setModul} disabled={sibuk} />
        </div>

        {!sah && (nama || username || sandi) && (
          <ul className="list-disc pl-5 text-[11px] text-gagal">
            {kekurangan.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void kirim()}
          disabled={!sah || sibuk}
          className="btn-tekan flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {sibuk ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          Buat Akun
        </button>
      </GlassCard>
    </section>
  );
}

/** Ubah modul akun yang sudah ada (tombol "Modul" di daftar Peran Istimewa). */
export function ModalModulAkun({
  pengguna,
  onTutup,
  onTersimpan,
}: {
  pengguna: PenggunaAdmin;
  onTutup: () => void;
  onTersimpan: () => void;
}) {
  const [modul, setModul] = useState<Record<KunciModul, Keadaan>>(() => dariIzin(pengguna.modul_izin));
  const [sibuk, setSibuk] = useState(false);

  async function simpan() {
    if (sibuk) return;
    setSibuk(true);
    try {
      await aksiMaster("ubah_modul", { user_id: pengguna.id, modul_izin: (keIzin(modul) as Record<string, boolean> | null) ?? {} });
      toast("sukses", "Modul akun disimpan", `${pengguna.nama} perlu memuat ulang aplikasi.`);
      onTersimpan();
      onTutup();
    } catch (e) {
      toast("error", "Gagal menyimpan modul", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={`Modul akun ${pengguna.nama}`}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onTutup} />
      <div className="glass-strong relative mx-auto flex max-h-[85dvh] w-full max-w-[440px] flex-col rounded-t-[2rem] px-5 pt-3 pb-8">
        <div className="mb-3 flex shrink-0 justify-center">
          <span className="h-1.5 w-12 rounded-full bg-teks-sekunder/40" aria-hidden="true" />
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold text-teks-utama">Modul untuk {pengguna.nama.split(" ")[0]}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-teks-sekunder">
              Ikut peran = seperti biasa. Dibuka/Ditutup memaksa modul itu tampil atau hilang khusus akun ini.
            </p>
          </div>
          <button type="button" onClick={onTutup} aria-label="Tutup" className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-teks-utama">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="scrollbar-tipis mt-3 overflow-y-auto">
          <KontrolModul keadaan={modul} onUbah={setModul} disabled={sibuk} />
        </div>
        <button
          type="button"
          onClick={() => void simpan()}
          disabled={sibuk}
          className="btn-tekan mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {sibuk && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Simpan Modul
        </button>
      </div>
    </div>
  );
}
