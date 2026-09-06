"use client";

// Pita tetap di atas layar saat admin PALUGODAM sedang MASUK sebagai akun
// anggota (6 Sep 2026). Tampil di semua tab/modul supaya tidak ada yang
// lupa sedang memakai akun siapa; satu tombol untuk kembali.
import { useEffect, useState } from "react";
import { LogOut, UserCog } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { infoKendali, kembaliKeAkunAsal, type InfoKendali } from "@/lib/kendali-klien";

export function BannerKendali({ namaAktif }: { namaAktif?: string }) {
  const [info, setInfo] = useState<InfoKendali | null>(null);
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    // Dibaca setelah mount (localStorage tidak ada saat render server).
    const t = setTimeout(() => setInfo(infoKendali()), 0);
    return () => clearTimeout(t);
  }, []);
  if (!info) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[95] flex items-center gap-2 px-3 py-1.5 text-white" style={{ background: "linear-gradient(90deg, #B45309, #DC2626)", paddingTop: "max(0.375rem, env(safe-area-inset-top))" }} role="status">
      <UserCog className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">
        Masuk sebagai <b>{namaAktif || info.target_nama}</b>
        {info.admin_nama ? <span className="opacity-90"> · kendali oleh {info.admin_nama}</span> : null}
      </p>
      <button
        type="button"
        disabled={sibuk}
        onClick={() => {
          setSibuk(true);
          kembaliKeAkunAsal().catch((e) => {
            setSibuk(false);
            toast("error", "Gagal kembali", e instanceof Error ? e.message : "");
          });
        }}
        className="btn-tekan flex h-7 shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 text-[11px] font-bold disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        {sibuk ? "Kembali…" : "Kembali ke akun saya"}
      </button>
    </div>
  );
}
