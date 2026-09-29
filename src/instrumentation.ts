// Dipanggil Next.js SEKALI saat server menyala (bukan per permintaan).
// Kode khusus Node dipisah (pola resmi Next.js) supaya pemeriksa runtime
// Edge tidak ikut menelusurinya — lihat instrumentation-node.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
