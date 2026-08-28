"use client";

// ============================================================
// AnggotaTanpaAkunPanel — daftar anggota yang BELUM menautkan akun
// sosmednya (spek 1.18/2.1c). Komentar mereka tidak akan pernah
// terhitung analisis sampai akunnya didaftarkan — daftar ini memberi
// HR siapa saja yang perlu diingatkan.
// ============================================================

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton } from "@/components/pri-ui";
import { getAnggotaTanpaAkun, type AnggotaTanpaAkun } from "@/services";

export function AnggotaTanpaAkunPanel() {
  const [daftar, setDaftar] = useState<AnggotaTanpaAkun[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const hasil = await getAnggotaTanpaAkun();
        if (hidup) setDaftar(hasil);
      } catch {
        if (hidup) setDaftar([]);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-teks-sekunder uppercase">
        <UserX className="h-3.5 w-3.5" aria-hidden="true" />
        Anggota Tanpa Akun Sosmed {daftar ? `(${daftar.length})` : ""}
      </p>
      {daftar === null ? (
        <GlassSkeleton className="h-14 rounded-xl" />
      ) : daftar.length === 0 ? (
        <GlassCard className="p-3">
          <p className="text-center text-[11.5px] text-teks-sekunder">
            Semua anggota aktif sudah menautkan akun sosmednya. 🎉
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="p-2">
          <div className="scrollbar-tipis flex max-h-56 flex-col gap-1 overflow-y-auto">
            {daftar.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <AvatarInisial nama={a.nama} ukuran={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-teks-utama">{a.nama}</p>
                  {a.divisi && (
                    <p className="truncate text-[10px] text-teks-sekunder">{a.divisi}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-gagal/10 px-2 py-0.5 text-[9.5px] font-bold text-gagal">
                  belum tertaut
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
