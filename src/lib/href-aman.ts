// Penjaga skema tautan buatan pengguna (pertahanan lapis-kedua XSS).
//
// Banyak URL (video/postingan/bukti) datang dari isian anggota lalu
// dirender ke `href`/`window.open`. Tanpa saringan, seseorang bisa
// menyimpan `javascript:...` atau `data:...` yang dieksekusi saat admin
// mengkliknya. CSP sudah memblokir eksekusinya, tapi jangan bergantung
// pada satu lapis: `hrefAman` hanya meloloskan http(s) (dan tautan
// internal yang diawali "/"); selain itu → undefined (anchor tanpa href,
// tak bisa diklik). Bukan pengganti `urlAman` di tautan-video.ts yang
// tugasnya menormalkan URL untuk ekstraksi id, bukan menjaga skema.
export function hrefAman(u: unknown): string | undefined {
  const s = String(u ?? "").trim();
  if (!s) return undefined;
  // Tautan internal relatif (tidak membawa skema) aman.
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
}
