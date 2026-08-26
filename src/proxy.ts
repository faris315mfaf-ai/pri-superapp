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

export function proxy(request: NextRequest) {
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
    connect-src 'self' https://api.cloudinary.com${dev ? " ws:" : ""};
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
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
    {
      source: "/((?!_next/static|_next/image|favicon.ico|sw.js|ikon/|logo|robots.txt|cek.html|manifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
