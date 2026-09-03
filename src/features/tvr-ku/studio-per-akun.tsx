"use client";

// ============================================================
// StudioPerAkun (4 Sep 2026) — MODE PER AKUN Studio PALUGODAM.
// Satu baris untuk tiap akun anggota PALUGODAM, masing-masing punya:
// LINK sendiri (diambil lewat TikHub), CAPTION sendiri, JUDUL sendiri, dan
// HIGHLIGHT sendiri (bisa digenerate DeepSeek per akun atau sekaligus).
// Tombol RENDER baru hidup setelah SEMUA akun lengkap — penjaga yang sama
// juga ada di server (/api/studio aksi "render").
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { StatusBadge } from "@/components/pri-ui";
import { toast } from "@/hooks/use-app-store";
import { studioPost, type StudioItem, type StudioProyek } from "@/services";
import { cn } from "@/lib/utils";

const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";
const UNGU = "linear-gradient(135deg, #7C3AED, #4F46E5)";

const LABEL_KURANG: Record<string, string> = {
  link: "link",
  judul: "judul",
  caption: "caption",
  highlight: "highlight",
  template: "template",
};

/** Teks bebas yang disimpan saat pengguna berhenti mengetik (bukan tiap huruf). */
function useSimpanTertunda(nilaiAwal: string, simpan: (v: string) => void) {
  const [nilai, setNilai] = useState(nilaiAwal);
  const awalRef = useRef(nilaiAwal);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Nilai dari server menang bila baris ini diperbarui di tempat lain (mis. generate).
  useEffect(() => {
    if (nilaiAwal !== awalRef.current) {
      awalRef.current = nilaiAwal;
      setNilai(nilaiAwal);
    }
  }, [nilaiAwal]);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  return {
    nilai,
    ubah: (v: string) => {
      setNilai(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => simpan(v), 700);
    },
  };
}

function BarisAkun({
  item,
  sibuk,
  onLink,
  onSimpan,
  onGenerate,
  onHapus,
}: {
  item: StudioItem;
  sibuk: string;
  onLink: (profil: string, link: string) => Promise<void>;
  onSimpan: (
    profil: string,
    kolom: "judul" | "highlight" | "caption",
    nilai: string,
  ) => void;
  onGenerate: (profil: string) => Promise<void>;
  onHapus: (profil: string) => Promise<void>;
}) {
  const [buka, setBuka] = useState(false);
  // Kotak link memakai pola yang sama dengan kotak teks: nilai server menang
  // hanya bila berubah (tidak menimpa ketikan admin tiap kali data disegarkan).
  const linkBox = useSimpanTertunda(item.sumber_link, () => {});
  const link = linkBox.nilai;
  const setLink = linkBox.ubah;
  const judul = useSimpanTertunda(item.judul, (v) =>
    onSimpan(item.profil, "judul", v),
  );
  const highlight = useSimpanTertunda(item.highlight, (v) =>
    onSimpan(item.profil, "highlight", v),
  );
  const caption = useSimpanTertunda(item.caption, (v) =>
    onSimpan(item.profil, "caption", v),
  );

  const kurang = item.kurang ?? [];
  const siap = kurang.length === 0;
  const sedangRender = item.render_status === "rendering";
  const kunci = `${item.profil}:`;
  const sibukBaris = sibuk.startsWith(kunci);

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        siap
          ? "border-emerald-500/40 bg-emerald-500/[0.06]"
          : "border-black/10 dark:border-white/15",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setBuka((b) => !b)}
          className="btn-tekan flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-teks-sekunder transition-transform",
              buka && "rotate-180",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-bold text-teks-utama">
              {item.nama || item.profil}
            </span>
            <span className="block truncate text-[10px] text-teks-sekunder">
              @{item.profil}
            </span>
          </span>
        </button>
        {item.render_status === "sukses" ? (
          <StatusBadge label="video jadi" warna="hijau" />
        ) : sedangRender ? (
          <StatusBadge label="dirender" warna="kuning" />
        ) : siap ? (
          <StatusBadge label="siap" warna="hijau" />
        ) : (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9.5px] font-bold text-amber-600 dark:text-amber-400">
            kurang: {kurang.map((k) => LABEL_KURANG[k] ?? k).join(", ")}
          </span>
        )}
      </div>

      {buka && (
        <div className="mt-2.5 flex flex-col gap-2">
          {/* LINK sendiri */}
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-teks-sekunder" />
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Link TikTok / Instagram untuk akun ini"
              inputMode="url"
              className="glass-input h-9 min-w-0 flex-1 rounded-lg px-2.5 text-[11.5px] text-teks-utama"
            />
            <button
              type="button"
              onClick={() => void onLink(item.profil, link.trim())}
              disabled={Boolean(sibuk) || !link.trim() || sedangRender}
              className="btn-tekan h-9 shrink-0 rounded-lg px-2.5 text-[11px] font-bold text-white disabled:opacity-40"
              style={{ background: MERAH }}
            >
              {sibuk === `${kunci}link` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Ambil"
              )}
            </button>
          </div>
          {item.sumber_url ? (
            <video
              src={item.sumber_url}
              controls
              playsInline
              className="max-h-56 w-full rounded-lg bg-black"
            />
          ) : null}
          {item.sumber_caption ? (
            <p className="rounded-lg bg-black/5 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-teks-sekunder dark:bg-white/10">
              <span className="font-bold">Caption asli:</span>{" "}
              {item.sumber_caption}
              {item.sumber_akun ? ` · @${item.sumber_akun}` : ""}
            </p>
          ) : null}

          {/* Teks sendiri */}
          <input
            value={judul.nilai}
            onChange={(e) => judul.ubah(e.target.value)}
            maxLength={100}
            placeholder="Judul (tampil di video)"
            className="glass-input h-9 w-full rounded-lg px-2.5 text-[11.5px] text-teks-utama"
          />
          <input
            value={highlight.nilai}
            onChange={(e) => highlight.ubah(e.target.value.toUpperCase())}
            maxLength={40}
            placeholder="HIGHLIGHT (1–3 kata)"
            className="glass-input h-9 w-full rounded-lg px-2.5 text-[11.5px] font-bold text-teks-utama"
          />
          <textarea
            value={caption.nilai}
            onChange={(e) => caption.ubah(e.target.value)}
            rows={2}
            maxLength={2200}
            placeholder="Caption unggahan akun ini"
            className="glass-input w-full rounded-lg px-2.5 py-2 text-[11.5px] text-teks-utama"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onGenerate(item.profil)}
              disabled={Boolean(sibuk) || sedangRender}
              title="DeepSeek menulis judul, highlight & caption dari video akun ini"
              className="btn-tekan flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-bold text-white disabled:opacity-40"
              style={{ background: UNGU }}
            >
              {sibuk === `${kunci}generate` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate teks akun ini
            </button>
            <button
              type="button"
              onClick={() => void onHapus(item.profil)}
              disabled={Boolean(sibuk) || sedangRender}
              aria-label={`Keluarkan ${item.profil} dari proyek`}
              className="btn-tekan shrink-0 rounded-lg p-2 text-teks-sekunder/70 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {item.render_url ? (
            <a
              href={item.render_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10.5px] font-bold text-pri"
            >
              Lihat video hasil render →
            </a>
          ) : null}
          {item.pesan ? (
            <p className="text-[10.5px] text-gagal">{item.pesan}</p>
          ) : null}
          {sibukBaris && sibuk === `${kunci}link` ? (
            <p className="text-[10.5px] text-teks-sekunder">Mengambil video…</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function StudioPerAkun({
  data,
  sibuk,
  setSibuk,
  onSegarkan,
  onRender,
}: {
  data: StudioProyek;
  sibuk: string;
  setSibuk: (s: string) => void;
  onSegarkan: () => void;
  onRender: () => Promise<void>;
}) {
  const item = data.item;
  const siapSemua =
    item.length > 0 && item.every((i) => (i.kurang ?? []).length === 0);
  const jumlahSiap = item.filter((i) => (i.kurang ?? []).length === 0).length;
  const adaRendering = item.some((i) => i.render_status === "rendering");
  const proyekId = data.proyek.id;

  async function jalankan(
    kunci: string,
    aksi: string,
    body: Record<string, unknown>,
  ) {
    if (sibuk) return null;
    setSibuk(kunci);
    try {
      const r = await studioPost(aksi, { proyek_id: proyekId, ...body });
      onSegarkan();
      return r;
    } catch (e) {
      toast("error", "Gagal", e instanceof Error ? e.message : "");
      return null;
    } finally {
      setSibuk("");
    }
  }

  async function ambilLink(profil: string, link: string) {
    const r = await jalankan(`${profil}:link`, "item_sumber_link", {
      profil,
      link,
    });
    if (r)
      toast(
        "sukses",
        `Video ${profil} siap`,
        String(r.caption ?? "").slice(0, 90) ||
          "Caption asli kosong — tulis caption sendiri.",
      );
  }

  function simpanTeks(
    profil: string,
    kolom: "judul" | "highlight" | "caption",
    nilai: string,
  ) {
    const asal = item.find((i) => i.profil === profil);
    if (!asal) return;
    // Simpan diam-diam (tanpa indikator sibuk) supaya mengetik tidak tersendat.
    void studioPost("item_simpan", {
      proyek_id: proyekId,
      item: [
        {
          profil,
          judul: asal.judul,
          highlight: asal.highlight,
          caption: asal.caption,
          [kolom]: nilai,
        },
      ],
    })
      .then(() => onSegarkan())
      .catch((e) =>
        toast("error", "Gagal menyimpan", e instanceof Error ? e.message : ""),
      );
  }

  async function generateSatu(profil: string) {
    const r = await jalankan(`${profil}:generate`, "item_generate", {
      profil,
      jenis: "semua",
    });
    if (r)
      toast(
        "sukses",
        `Teks ${profil} dibuat`,
        "Judul, highlight & caption diisi DeepSeek — boleh diedit lagi.",
      );
  }

  async function generateSemua() {
    const r = await jalankan("generate-semua", "item_generate", {
      jenis: "semua",
    });
    if (!r) return;
    const gagal =
      (r.gagal as { profil: string; pesan: string }[] | undefined) ?? [];
    toast(
      gagal.length ? "peringatan" : "sukses",
      `Teks dibuat untuk ${r.ditulis ?? 0} akun`,
      gagal.length
        ? `${gagal.length} gagal: ${gagal.map((g) => g.profil).join(", ")}`
        : "Semua akun dapat judul, highlight & caption sendiri.",
    );
  }

  async function hapusAkun(profil: string) {
    const r = await jalankan(`${profil}:hapus`, "item_hapus", { profil });
    if (r) toast("sukses", `${profil} dikeluarkan dari proyek`);
  }

  const tanpaLink = item.filter((i) => !i.sumber_url).length;

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12.5px] font-bold text-teks-utama">
            Satu akun, satu link sendiri
          </p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-extrabold",
              siapSemua
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {jumlahSiap}/{item.length} siap
          </span>
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-teks-sekunder">
          Tiap akun mengisi link, caption, judul, dan highlight-nya sendiri.
          Tombol RENDER hidup setelah semuanya lengkap.
        </p>
        <button
          type="button"
          onClick={() => void generateSemua()}
          disabled={Boolean(sibuk) || tanpaLink === item.length}
          className="btn-tekan mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-40"
          style={{ background: UNGU }}
          title={
            tanpaLink === item.length
              ? "Isi minimal satu link dulu"
              : "DeepSeek menulis teks untuk semua akun yang linknya sudah ada"
          }
        >
          {sibuk === "generate-semua" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate teks semua akun yang linknya sudah ada
        </button>
      </GlassCard>

      <GlassCard className="p-4">
        <p className="text-[12.5px] font-bold text-teks-utama">
          Akun PALUGODAM ({item.length})
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {item.map((i) => (
            <BarisAkun
              key={i.profil}
              item={i}
              sibuk={sibuk}
              onLink={ambilLink}
              onSimpan={simpanTeks}
              onGenerate={generateSatu}
              onHapus={hapusAkun}
            />
          ))}
          {item.length === 0 ? (
            <p className="text-[11.5px] text-teks-sekunder">
              Belum ada akun di proyek ini.
            </p>
          ) : null}
        </div>
      </GlassCard>

      <button
        type="button"
        onClick={() => void onRender()}
        disabled={!siapSemua || Boolean(sibuk) || adaRendering}
        className="btn-tekan flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white disabled:opacity-50"
        style={{ background: MERAH }}
        title={
          siapSemua
            ? "Render semua video"
            : `Masih ada ${item.length - jumlahSiap} akun yang belum lengkap`
        }
      >
        {sibuk === "render" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : siapSemua ? (
          <Check className="h-4 w-4" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        {adaRendering
          ? "Sedang merender…"
          : siapSemua
            ? `RENDER ${item.length} VIDEO`
            : `Lengkapi dulu ${item.length - jumlahSiap} akun`}
      </button>
    </div>
  );
}
