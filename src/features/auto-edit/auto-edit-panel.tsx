"use client";

// ============================================================
// AutoEditPanel — alat Edit Video dan Outro dari GODAM, khusus master.
// Tinggal di TV Rakyat Saya (1 Okt 2026, sebelumnya layar sendiri dari
// Profil); video jadi bisa langsung diunggah lewat upload-post.
//
// Kedua alat bicara dengan layanan Auto Edit (Python) lewat penerus
// /api/autoedit milik SuperApp. Sebelum alatnya dipasang, layanan ditanya
// sekali: kalau mati atau akun ini tidak diizinkan, yang tampil satu pesan
// jelas — bukan dua alat yang diam-diam gagal di setiap tombolnya.
// ============================================================

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Film, RefreshCw, Scissors } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton } from "@/components/pri-ui";
import { cn } from "@/lib/utils";
import { apiFetch, bacaJson, bacaSimpanan, pesanGalat, simpanSimpanan } from "./api";

function Muat() {
  return <GlassSkeleton className="h-40 rounded-2xl" />;
}

// Edit Video saja lebih dari 2.000 baris; diunduh saat tabnya pertama dibuka.
const EditVideo = dynamic(() => import("./edit-video").then((m) => m.EditVideo), {
  ssr: false,
  loading: Muat,
});
const Outro = dynamic(() => import("./outro").then((m) => m.Outro), { ssr: false, loading: Muat });

type Tab = "edit" | "outro";

const DAFTAR_TAB: { id: Tab; label: string; ikon: typeof Scissors }[] = [
  { id: "edit", label: "Edit Video", ikon: Scissors },
  { id: "outro", label: "Outro", ikon: Film },
];

type Status = { jenis: "cek" } | { jenis: "siap" } | { jenis: "galat"; pesan: string };

function tabTersimpan(): Tab {
  const { tab } = bacaSimpanan("tab", { tab: "edit" });
  return tab === "outro" ? "outro" : "edit";
}

export function AutoEditPanel() {
  // Tab yang pernah dibuka tetap terpasang (disembunyikan saja), supaya
  // unggahan dan pemantauan render yang sedang berjalan tidak hilang hanya
  // karena pindah tab sebentar.
  const [tab, setTab] = useState(() => {
    const awal = tabTersimpan();
    return { aktif: awal, dibuka: [awal] };
  });
  const [status, setStatus] = useState<Status>({ jenis: "cek" });
  const [percobaan, setPercobaan] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      let hasil: Status;
      try {
        const res = await apiFetch("/api/video/info", { cache: "no-store" });
        if (res.ok) hasil = { jenis: "siap" };
        // 404 dari penerus = akun ini tidak diizinkan; isinya sengaja umum,
        // jadi kalimatnya ditulis di sini.
        else if (res.status === 404) hasil = { jenis: "galat", pesan: "Auto Edit hanya bisa dibuka akun master." };
        else {
          hasil = {
            jenis: "galat",
            pesan: pesanGalat(res.status, await bacaJson(res), "Layanan Auto Edit tidak bisa dihubungi."),
          };
        }
      } catch {
        hasil = { jenis: "galat", pesan: "Layanan Auto Edit tidak bisa dihubungi. Periksa sambungan internet." };
      }
      if (hidup) setStatus(hasil);
    })();
    return () => {
      hidup = false;
    };
  }, [percobaan]);

  function pilihTab(id: Tab) {
    setTab((lama) => ({ aktif: id, dibuka: lama.dibuka.includes(id) ? lama.dibuka : [...lama.dibuka, id] }));
    simpanSimpanan("tab", { tab: id });
  }

  function cobaLagi() {
    setStatus({ jenis: "cek" });
    setPercobaan((n) => n + 1);
  }

  return (
    <div>
      <div role="tablist" aria-label="Alat Auto Edit" className="flex gap-2">
        {DAFTAR_TAB.map(({ id, label, ikon: Ikon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab.aktif === id}
            onClick={() => pilihTab(id)}
            className={cn(
              "btn-tekan flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold",
              tab.aktif === id ? "text-white" : "glass text-teks-sekunder",
            )}
            style={tab.aktif === id ? { background: "linear-gradient(135deg, #DC2626, #B91C1C)" } : undefined}
          >
            <Ikon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {status.jenis === "cek" ? (
          <Muat />
        ) : status.jenis === "galat" ? (
          <GlassCard className="flex flex-col items-start gap-3 p-5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gagal" aria-hidden="true" />
              <p className="text-sm font-semibold text-teks-utama">{status.pesan}</p>
            </div>
            <button
              type="button"
              onClick={cobaLagi}
              className="glass btn-tekan flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-teks-utama"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Coba lagi
            </button>
          </GlassCard>
        ) : (
          <>
            {tab.dibuka.includes("edit") && (
              <div role="tabpanel" hidden={tab.aktif !== "edit"}>
                <EditVideo />
              </div>
            )}
            {tab.dibuka.includes("outro") && (
              <div role="tabpanel" hidden={tab.aktif !== "outro"}>
                <Outro />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
