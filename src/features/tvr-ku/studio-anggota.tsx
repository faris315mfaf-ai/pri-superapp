"use client";

// ============================================================
// TabAnggota — Studio PALUGODAM, tab "Anggota & Template" (3 Sep 2026).
// ATURAN: 1 anggota Divisi PALUGODAM = 1 profil upload-post + 1 template
// Creatomate; keduanya ditautkan & dikendalikan SATU admin di sini.
// Tiap kartu anggota: (a) profil upload-post — buat baru / tautkan yang ada /
// lepas / tautan login sosmed; (b) template Creatomate — ID + nama elemen.
// Di bawahnya: template "yatim" (profilnya tak tertaut ke siapa pun).
// ============================================================

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Plus, RefreshCw, Trash2, Unlink } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { PlatformIcon } from "@/components/platform-icon";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getStudioPengaturan, studioPost, type StudioAnggota, type StudioPengaturan } from "@/services";
import { cn } from "@/lib/utils";

const PLATFORM6 = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"] as const;
const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";
const HIJAU = "linear-gradient(135deg, #10B981, #059669)";

type EditTpl = {
  template_id: string;
  label: string;
  elemen_video: string;
  elemen_judul: string;
  elemen_highlight: string;
  elemen_sumber: string;
};

function editDari(a: StudioAnggota): EditTpl {
  return {
    template_id: a.template?.template_id ?? "",
    label: a.template?.label ?? "",
    elemen_video: a.template?.elemen_video ?? "video-1",
    elemen_judul: a.template?.elemen_judul ?? "judul",
    elemen_highlight: a.template?.elemen_highlight ?? "highlight",
    elemen_sumber: a.template?.elemen_sumber ?? "sumber",
  };
}

export function TabAnggota() {
  const [data, setData] = useState<StudioPengaturan | null>(null);
  const [edit, setEdit] = useState<Record<string, EditTpl>>({});
  const [namaBaru, setNamaBaru] = useState<Record<string, string>>({});
  const [pilihBebas, setPilihBebas] = useState<Record<string, string>>({});
  const [tautan, setTautan] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState("");

  function muat() {
    return getStudioPengaturan()
      .then((d) => {
        setData(d);
        const e: Record<string, EditTpl> = {};
        const n: Record<string, string> = {};
        for (const a of d.anggota) {
          e[a.user_id] = editDari(a);
          n[a.user_id] = a.usulan_profil;
        }
        setEdit(e);
        setNamaBaru((lama) => ({ ...n, ...lama }));
      })
      .catch((e) => toast("error", "Gagal memuat anggota", e instanceof Error ? e.message : ""));
  }
  useEffect(() => {
    void muat();
  }, []);

  async function jalankan(kunci: string, aksi: string, body: Record<string, unknown>, sukses: string) {
    if (sibuk) return null;
    setSibuk(kunci);
    try {
      const r = await studioPost(aksi, body);
      toast("sukses", sukses);
      await muat();
      return r;
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
      return null;
    } finally {
      setSibuk("");
    }
  }

  async function ambilTautan(a: StudioAnggota) {
    const r = await jalankan(`${a.user_id}:tautan`, "anggota_tautan", { user_id: a.user_id }, "Tautan login sosmed dibuat (berlaku 48 jam)");
    if (r?.url) setTautan((s) => ({ ...s, [a.user_id]: String(r.url) }));
  }

  async function salin(teks: string) {
    try {
      await navigator.clipboard.writeText(teks);
      toast("sukses", "Tautan disalin");
    } catch {
      toast("peringatan", "Tidak bisa menyalin otomatis — salin manual dari kotak tautan.");
    }
  }

  const anggota = data?.anggota ?? [];
  const lengkap = anggota.filter((a) => a.profil && a.template?.aktif).length;

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12.5px] font-bold text-teks-utama">Anggota PALUGODAM · profil & template</p>
          <button type="button" onClick={() => void muat()} aria-label="Segarkan" className="btn-tekan p-1 text-teks-sekunder">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
          Aturan: <b>1 anggota = 1 profil upload-post + 1 template Creatomate</b>, keduanya ditautkan di sini oleh
          admin. AUTO EDIT & AUTO UPLOAD hanya menyasar anggota yang <b>lengkap</b>. Nama elemen template bawaan:{" "}
          <b>video-1</b>, <b>judul</b>, <b>highlight</b>, <b>sumber</b> (kosongkan bila tidak ada).
        </p>
        {data ? (
          <p className="mt-2 text-[11.5px] font-bold text-teks-utama">
            {lengkap}/{anggota.length} anggota lengkap
            {data.kuota ? <span className="font-normal text-teks-sekunder"> · kuota profil upload-post {data.kuota}{data.paket ? ` (${data.paket})` : ""}</span> : null}
            {!data.siap.uploadpost ? <span className="font-normal text-gagal"> · upload-post belum tersambung</span> : null}
          </p>
        ) : null}
      </GlassCard>

      {data === null ? (
        <GlassSkeleton className="h-40 rounded-2xl" />
      ) : anggota.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-[12px] text-teks-sekunder">Belum ada anggota aktif di Divisi PALUGODAM.</p>
        </GlassCard>
      ) : (
        anggota.map((a) => {
          const d = edit[a.user_id] ?? editDari(a);
          const punyaProfil = Boolean(a.profil);
          const status = punyaProfil && a.template?.aktif ? "lengkap" : punyaProfil ? "tanpa template" : "tanpa profil";
          return (
            <GlassCard key={a.user_id} className="p-4">
              {/* Kepala kartu: identitas + status */}
              <div className="flex items-center gap-2.5">
                {a.avatar_url ? <FotoBulat src={a.avatar_url} ukuran={36} /> : <AvatarInisial nama={a.nama} ukuran={36} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-teks-utama">
                    {a.nama}
                    {a.posisi === "kepala" ? <span className="ml-1 text-[10px] font-semibold text-pri">kepala</span> : null}
                  </p>
                  <p className="truncate text-[10.5px] text-teks-sekunder">{a.username ? `@${a.username}` : "tanpa username aplikasi"}</p>
                </div>
                <StatusBadge label={status} warna={status === "lengkap" ? "hijau" : status === "tanpa template" ? "kuning" : "merah"} />
              </div>

              {/* (a) Profil upload-post */}
              <div className="mt-3 rounded-xl bg-black/[0.03] p-2.5 dark:bg-white/[0.05]">
                <p className="text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">Profil upload-post</p>
                {punyaProfil ? (
                  <>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-bold text-teks-utama">@{a.profil}</span>
                        <span className="flex items-center gap-1">
                          {PLATFORM6.map((pf) => (
                            <PlatformIcon key={pf} platform={pf} className={cn("h-3 w-3", a.akun[pf] ? "text-emerald-500" : "text-teks-sekunder/30")} />
                          ))}
                          <span className="ml-1 text-[10px] text-teks-sekunder">{a.tertaut}/6 sosmed tertaut</span>
                        </span>
                        {a.profil_hilang ? <span className="block text-[10px] text-gagal">Profil ini sudah tidak ada di upload-post — lepas lalu buat/tautkan lagi.</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => void ambilTautan(a)}
                        disabled={Boolean(sibuk)}
                        className="btn-tekan flex h-8 items-center gap-1 rounded-lg bg-pri/12 px-2 text-[10.5px] font-bold text-pri disabled:opacity-50"
                      >
                        {sibuk === `${a.user_id}:tautan` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                        Tautan login sosmed
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Lepas profil @${a.profil} dari ${a.nama}? Profil di upload-post tidak dihapus.`)) {
                            void jalankan(`${a.user_id}:lepas`, "anggota_profil_lepas", { user_id: a.user_id }, `Profil dilepas dari ${a.nama}`);
                          }
                        }}
                        disabled={Boolean(sibuk)}
                        aria-label="Lepas profil"
                        className="btn-tekan flex h-8 w-8 items-center justify-center rounded-lg bg-gagal/12 text-gagal disabled:opacity-50"
                      >
                        {sibuk === `${a.user_id}:lepas` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {tautan[a.user_id] ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <input readOnly value={tautan[a.user_id]} className="glass-input h-8 min-w-0 flex-1 rounded-lg px-2 text-[10.5px] text-teks-utama" />
                        <button
                          type="button"
                          onClick={() => void salin(tautan[a.user_id])}
                          className="btn-tekan flex h-8 items-center gap-1 rounded-lg bg-pri/12 px-2 text-[10.5px] font-bold text-pri"
                        >
                          <Copy className="h-3 w-3" /> Salin
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-[11px] text-teks-sekunder">Belum punya profil. Buat baru atau tautkan profil upload-post yang sudah ada.</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <input
                        value={namaBaru[a.user_id] ?? a.usulan_profil}
                        onChange={(e) => setNamaBaru((s) => ({ ...s, [a.user_id]: e.target.value.toLowerCase() }))}
                        placeholder="nama-profil-baru"
                        className="glass-input h-9 min-w-0 flex-1 rounded-lg px-2 text-[12px] text-teks-utama"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void jalankan(
                            `${a.user_id}:buat`,
                            "anggota_profil_buat",
                            { user_id: a.user_id, username: (namaBaru[a.user_id] ?? a.usulan_profil).trim() },
                            `Profil dibuat & ditautkan ke ${a.nama}`,
                          )
                        }
                        disabled={Boolean(sibuk) || !data.siap.uploadpost}
                        className="btn-tekan flex h-9 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-white disabled:opacity-50"
                        style={{ background: HIJAU }}
                      >
                        {sibuk === `${a.user_id}:buat` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Buat profil
                      </button>
                    </div>
                    {data.profil_bebas.length > 0 ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <select
                          value={pilihBebas[a.user_id] ?? ""}
                          onChange={(e) => setPilihBebas((s) => ({ ...s, [a.user_id]: e.target.value }))}
                          className="glass-input h-9 min-w-0 flex-1 rounded-lg px-2 text-[12px] text-teks-utama"
                        >
                          <option value="">— tautkan profil yang sudah ada —</option>
                          {data.profil_bebas.map((p) => (
                            <option key={p.profil} value={p.profil}>
                              @{p.profil} ({p.tertaut}/6 sosmed)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            void jalankan(
                              `${a.user_id}:tautkan`,
                              "anggota_profil_tautkan",
                              { user_id: a.user_id, profil: pilihBebas[a.user_id] ?? "" },
                              `Profil ditautkan ke ${a.nama}`,
                            )
                          }
                          disabled={Boolean(sibuk) || !(pilihBebas[a.user_id] ?? "")}
                          className="btn-tekan flex h-9 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-white disabled:opacity-50"
                          style={{ background: MERAH }}
                        >
                          {sibuk === `${a.user_id}:tautkan` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                          Tautkan
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {/* (b) Template Creatomate */}
              <div className={cn("mt-2 rounded-xl bg-black/[0.03] p-2.5 dark:bg-white/[0.05]", !punyaProfil && "opacity-60")}>
                <div className="flex items-center justify-between">
                  <p className="text-[10.5px] font-bold tracking-wide text-teks-sekunder uppercase">Template Creatomate</p>
                  {a.template ? <StatusBadge label={a.template.aktif ? "aktif" : "nonaktif"} warna={a.template.aktif ? "hijau" : "netral"} /> : null}
                </div>
                {!punyaProfil ? <p className="mt-1 text-[10.5px] text-teks-sekunder">Tautkan profil dulu, baru template bisa diisi.</p> : null}
                <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <input
                    value={d.template_id}
                    onChange={(e) => setEdit((s) => ({ ...s, [a.user_id]: { ...d, template_id: e.target.value } }))}
                    placeholder="ID template Creatomate"
                    disabled={!punyaProfil}
                    className="glass-input h-10 rounded-xl px-3 text-[12px] text-teks-utama disabled:opacity-60"
                  />
                  <input
                    value={d.label}
                    onChange={(e) => setEdit((s) => ({ ...s, [a.user_id]: { ...d, label: e.target.value } }))}
                    placeholder="Label (opsional)"
                    disabled={!punyaProfil}
                    className="glass-input h-10 rounded-xl px-3 text-[12px] text-teks-utama disabled:opacity-60"
                  />
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {(
                    [
                      ["elemen_video", "Elemen video"],
                      ["elemen_judul", "Elemen judul"],
                      ["elemen_highlight", "Elemen highlight"],
                      ["elemen_sumber", "Elemen sumber"],
                    ] as const
                  ).map(([k, ph]) => (
                    <input
                      key={k}
                      value={d[k]}
                      onChange={(e) => setEdit((s) => ({ ...s, [a.user_id]: { ...d, [k]: e.target.value } }))}
                      placeholder={ph}
                      disabled={!punyaProfil}
                      className="glass-input h-9 rounded-xl px-2 text-[11px] text-teks-utama disabled:opacity-60"
                    />
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!d.template_id.trim()) {
                        toast("peringatan", "Isi ID template Creatomate dulu");
                        return;
                      }
                      void jalankan(`${a.user_id}:tpl`, "template_simpan", { profil: a.profil, ...d, aktif: true }, `Template ${a.nama} tersimpan`);
                    }}
                    disabled={Boolean(sibuk) || !punyaProfil}
                    className="btn-tekan flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-50"
                    style={{ background: MERAH }}
                  >
                    {sibuk === `${a.user_id}:tpl` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Simpan template
                  </button>
                  {a.template ? (
                    <button
                      type="button"
                      onClick={() => void jalankan(`${a.user_id}:tplhapus`, "template_hapus", { profil: a.profil }, `Template ${a.nama} dilepas`)}
                      disabled={Boolean(sibuk)}
                      aria-label="Lepas template"
                      className="btn-tekan rounded-xl bg-gagal/12 px-3 text-[12px] font-bold text-gagal disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </GlassCard>
          );
        })
      )}

      {data && data.template_yatim.length > 0 ? (
        <GlassCard className="p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">Template tanpa pemilik</p>
          <p className="mt-1 text-[11px] leading-relaxed text-teks-sekunder">
            Profil di bawah ini punya template tetapi tidak tertaut ke anggota mana pun, jadi tidak dipakai AUTO EDIT.
            Tautkan profilnya ke anggota (kartu di atas) atau hapus templatenya.
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {data.template_yatim.map((t) => (
              <div key={t.profil} className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.05]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-teks-utama">@{t.profil}</span>
                  <span className="block truncate text-[10px] text-teks-sekunder">{t.template_id}{t.label ? ` · ${t.label}` : ""}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void jalankan(`yatim:${t.profil}`, "template_hapus", { profil: t.profil }, `Template @${t.profil} dihapus`)}
                  disabled={Boolean(sibuk)}
                  aria-label="Hapus template"
                  className="btn-tekan rounded-lg bg-gagal/12 px-2.5 py-1.5 text-[11px] font-bold text-gagal disabled:opacity-50"
                >
                  {sibuk === `yatim:${t.profil}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}
