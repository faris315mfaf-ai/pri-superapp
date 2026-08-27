"use client";

// ============================================================
// VideoEmbedMini — daftar video sosmed ringkas: baris platform +
// tautan, diketuk berubah jadi iframe embed resmi (spek 1.15).
// Dipakai popup profil (video hari ini) & profil sendiri (terbaru).
// ============================================================

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { urlEmbedDari } from "@/lib/embed-sosmed";
import { labelPlatformBesar } from "@/lib/format";

export function VideoEmbedMini({
  video,
}: {
  video: { id: string; platform: string; url: string }[];
}) {
  const [dimuat, setDimuat] = useState<Set<string>>(new Set());

  if (video.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {video.map((v) => {
        const embed = urlEmbedDari(v.platform, v.url);
        if (dimuat.has(v.id) && embed) {
          return (
            <iframe
              key={v.id}
              src={embed}
              title={`Video ${v.platform}`}
              className="aspect-[4/5] w-full rounded-xl border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          );
        }
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              if (embed) setDimuat((s) => new Set(s).add(v.id));
              else window.open(v.url, "_blank", "noopener,noreferrer");
            }}
            aria-label={embed ? "Putar video" : "Buka video"}
            className="glass-soft btn-tekan flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
          >
            <PlatformIcon platform={v.platform} size={18} denganWadah />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold text-teks-utama">
                {labelPlatformBesar(v.platform)}
              </span>
              <span className="block truncate text-[10.5px] text-teks-sekunder">{v.url}</span>
            </span>
            {embed ? (
              <Play className="h-4 w-4 shrink-0 text-pri" aria-hidden="true" />
            ) : (
              <ExternalLink className="h-4 w-4 shrink-0 text-teks-sekunder" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
