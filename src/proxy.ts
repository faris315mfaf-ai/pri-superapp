// ============================================================
// Proxy (dulu bernama "middleware" — di Next.js versi ini konvensi
// file middleware.ts DEPRECATED dan berganti nama menjadi proxy.ts;
// lihat node_modules/next/dist/docs/.../file-conventions/proxy.md).
//
// Tugasnya satu: memasang Content-Security-Policy berbasis NONCE
// untuk setiap permintaan halaman, mengikuti pola resmi Next.js.
// Nonce ikut dikirim sebagai header `x-nonce` supaya Server
// Components bisa membubuhkannya ke <script> bila perlu.
//
// Sumber daya eksternal DIPETAKAN dari kode nyata (bukan template):
// - connect-src https://api.cloudinary.com : unggah video manual
//   langsung dari peramban (XHR di kirim-video-manual.tsx).
// - connect-src <origin SUPABASE_URL> : unggah video TVR Saya langsung
//   peramban→storage (URL tertandatangan, unggah-sosmed-saya.tsx).
// - connect-src (https+wss) generativelanguage.googleapis.com : mode
//   suara Asisten AI (Gemini Live, fitur 1.20/3) — peramban menyambung
//   WebSocket memakai token sementara dari server, bukan kunci asli.
// - img-src/media-src https: : avatar & surat dari Supabase Storage,
//   thumbnail berita hasil pindaian (CDN Instagram/TikTok yang
//   host-nya berubah-ubah), thumbnail Ayrshare, video Cloudinary,
//   dan placeholder picsum — host gambarnya terlalu beragam untuk
//   didaftar satu per satu, sedangkan risiko CSP memang berpusat
//   di script-src, bukan img.
// - worker-src 'self' blob: : Service Worker (public/sw.js) untuk
//   push notification & mode offline — push-nya sendiri diterima
//   peramban di luar CSP halaman, jadi tidak butuh origin tambahan.
// - Nominatim & Fonnte TIDAK masuk: keduanya dipanggil dari server.
// - Font: next/font (self-host) → font-src 'self' cukup.
// - style-src 'unsafe-inline': atribut style inline dipakai luas
//   (framer-motion, gradien komponen); menutupnya akan merusak
//   seluruh tampilan tanpa menambah perlindungan XSS yang berarti.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { adalahTokenUji, ruteUjiBoleh } from "@/lib/uji-beban-skenario";

// Origin Supabase untuk connect-src: unggah video TVR Saya naik LANGSUNG
// peramban→storage lewat URL tertandatangan (unggah-sosmed-saya.tsx).
// Tanpa origin ini CSP memblokir PUT-nya → "Failed to fetch" (bug 1 Sep
// 2026). Diambil dari env supaya tidak hardcode; dihitung sekali saja.
const ASAL_SUPABASE = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();
// Supabase Realtime (lobi robot, 5 Sep 2026) memakai WebSocket ke host yang
// sama — CSP membedakan skema, jadi wss:// harus disebut tersendiri.
const ASAL_SUPABASE_WSS = ASAL_SUPABASE ? ASAL_SUPABASE.replace(/^https:/, "wss:") : "";
// Database dipasang sendiri (alih 30 Sep 2026) SELALU diizinkan, di samping
// SUPABASE_URL: tab yang dibuka SEBELUM alih memegang CSP lamanya sampai
// dimuat ulang — tanpa baris ini unggahan langsung & Realtime tab itu diblokir
// begitu database pindah.
const ASAL_DB_TETAP = ["https://db.pri-superapp.com", "wss://db.pri-superapp.com"];
const ASAL_DB = [...new Set([ASAL_SUPABASE, ASAL_SUPABASE_WSS, ...ASAL_DB_TETAP].filter(Boolean))].join(" ");

// Origin Cloudflare R2 (1 Sep 2026): video TVR Saya diunggah LANGSUNG
// peramban→R2 lewat URL bertanda tangan. Tanpa origin ini CSP memblokir
// PUT-nya — persis pelajaran bug "Failed to fetch" Supabase kemarin.
const ASAL_R2 = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : "";

export function proxy(request: NextRequest) {
  // Token UJI BEBAN (29 Sep 2026, lib/uji-beban): pengguna virtual hanya
  // boleh MEMBACA rute uji. Apa pun selain GET/HEAD ke daftar itu ditolak
  // di pintu depan — sebelum menyentuh rute mana pun.
  if (
    adalahTokenUji(request.headers.get("authorization")) &&
    !ruteUjiBoleh(request.method, request.nextUrl.pathname)
  ) {
    return NextResponse.json({ error: "Token uji beban hanya boleh membaca rute uji." }, { status: 403 });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Di development React memakai eval untuk membangun stack trace;
  // produksi tidak membutuhkannya.
  const dev = process.env.NODE_ENV === "development";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' https: data: blob:;
    media-src 'self' https: blob:;
    font-src 'self' data:;
    connect-src 'self' https://api.cloudinary.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com ${ASAL_DB}${ASAL_R2 ? ` ${ASAL_R2}` : ""}${dev ? " ws:" : ""};
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-src 'self' https://www.instagram.com https://www.tiktok.com https://www.youtube.com https://www.youtube-nocookie.com https://www.facebook.com;
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const headerPermintaan = new Headers(request.headers);
  headerPermintaan.set("x-nonce", nonce);
  headerPermintaan.set("Content-Security-Policy", csp);

  const respons = NextResponse.next({ request: { headers: headerPermintaan } });
  respons.headers.set("Content-Security-Policy", csp);
  return respons;
}

export const config = {
  matcher: [
    // Semua halaman KECUALI aset statis & prefetch — pola resmi Next.
    // /api/autoedit ikut dikecualikan (30 Sep 2026): proxy menyalin isi
    // permintaan ke memori dan MEMOTONGNYA di 10 MB, padahal rute itu
    // meneruskan unggahan video ratusan MB. Rute itu menjaga dirinya sendiri
    // (sesi + peran master) dan tidak menyajikan halaman, jadi tidak butuh CSP.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|sw.js|ikon/|logo|robots.txt|cek.html|manifest|api/autoedit).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
