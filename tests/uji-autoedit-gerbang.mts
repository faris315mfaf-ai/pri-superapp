// Uji gerbang Auto Edit (lib/autoedit): penjaga peran + penerusan ke socket.
// Layanan Python ditiru server HTTP kecil di socket lokal (named pipe di
// Windows), jadi yang diuji adalah aliran sungguhan, tanpa database.
// Jalankan: npx tsx tests/uji-autoedit-gerbang.mts
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const SOCKET =
  process.platform === "win32" ? `\\\\.\\pipe\\pri-autoedit-uji-${process.pid}` : join(tmpdir(), `autoedit-uji-${process.pid}.sock`);
process.env.AUTOEDIT_SOCKET = SOCKET;
const { bolehAutoEdit, teruskanAutoEdit } = await import("@/lib/autoedit");

let lulus = 0;
let gagal = 0;
const cek = (n: string, ok: boolean, i?: unknown) => {
  if (ok) {
    lulus++;
    console.log("  ✔", n);
  } else {
    gagal++;
    console.log("  ✘", n, i !== undefined ? JSON.stringify(i) : "");
  }
};

console.log("\n[A] Siapa yang boleh");
cek("master boleh", bolehAutoEdit({ id: "12", role: "master" }));
cek("superadmin (peran efektif master) boleh", bolehAutoEdit({ id: "251", role: "master", superadmin: true } as never));
cek("anggota tidak", !bolehAutoEdit({ id: "13", role: "anggota" }));
cek("super_admin (Ketua Umum) tidak", !bolehAutoEdit({ id: "14", role: "super_admin" }));
cek("pengguna uji beban tidak", !bolehAutoEdit({ id: "15", role: "master", ujiBeban: true }));
cek("id bukan angka tidak", !bolehAutoEdit({ id: "uji-1", role: "master" }));
cek("tanpa pengguna tidak", !bolehAutoEdit(null));

// ---- Layanan tiruan ----
type Catatan = { method?: string; url?: string; header: Record<string, unknown>; byte: number };
const catatan: Catatan[] = [];
const BESAR = 30 * 1024 * 1024;
const layanan = createServer((req, res) => {
  const c: Catatan = { method: req.method, url: req.url, header: { ...req.headers }, byte: 0 };
  catatan.push(c);
  req.on("data", (b: Buffer) => (c.byte += b.length));
  req.on("end", () => {
    if (req.url?.startsWith("/api/video/kosong")) {
      res.writeHead(204).end();
    } else if (req.url?.startsWith("/api/video/berkas")) {
      res.writeHead(206, {
        "content-type": "video/mp4",
        "content-length": String(BESAR),
        "content-range": `bytes 0-${BESAR - 1}/${BESAR}`,
        "set-cookie": "rahasia=1",
        "x-internal": "jangan-bocor",
      });
      const potong = Buffer.alloc(1024 * 1024, 7);
      for (let i = 0; i < BESAR / potong.length; i++) res.write(potong);
      res.end();
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, byte: c.byte }));
    }
  });
});
await new Promise<void>((r) => layanan.listen(SOCKET, r));

const minta = (jalur: string[], init: RequestInit & { cari?: string } = {}) =>
  teruskanAutoEdit(
    new Request(`http://localhost/api/autoedit/${jalur.join("/")}${init.cari ?? ""}`, {
      ...init,
      ...(init.body ? { duplex: "half" } : {}),
    } as RequestInit),
    jalur,
    "12",
  );

console.log("\n[B] Penerusan");
let r = await minta(["video", "templates"], {
  cari: "?limit=5",
  headers: { authorization: "Bearer token-rahasia", cookie: "a=b", "x-autoedit-pengguna": "999" },
});
let akhir = catatan.at(-1)!;
cek("GET diteruskan ke /api/video/templates?limit=5", r.status === 200 && akhir.url === "/api/video/templates?limit=5", akhir.url);
cek("id akun dari sesi, bukan dari peramban", akhir.header["x-autoedit-pengguna"] === "12", akhir.header);
cek("token & cookie peramban TIDAK ikut", !("authorization" in akhir.header) && !("cookie" in akhir.header));
cek("jawaban tanpa cache", r.headers.get("cache-control") === "no-store");

const isi = new Uint8Array(BESAR).fill(3);
r = await minta(["video", "sources"], {
  method: "POST",
  headers: { "content-type": "application/octet-stream", "content-length": String(BESAR) },
  body: new Blob([isi]).stream(),
});
const hasil = (await r.json()) as { byte: number };
cek("unggahan 30 MB sampai utuh (dialirkan)", hasil.byte === BESAR, hasil);

r = await minta(["video", "berkas", "a.mp4"], { headers: { range: "bytes=0-" } });
cek("header Range diteruskan", catatan.at(-1)!.header["range"] === "bytes=0-");
const unduh = new Uint8Array(await r.arrayBuffer());
cek("unduhan 30 MB utuh, status 206", r.status === 206 && unduh.length === BESAR, { status: r.status, n: unduh.length });
cek("content-range ikut, set-cookie & header internal tidak", !!r.headers.get("content-range") && !r.headers.get("set-cookie") && !r.headers.get("x-internal"));

r = await minta(["video", "kosong"], { method: "DELETE" });
cek("204 tanpa isi", r.status === 204 && (await r.text()) === "");

console.log("\n[C] Jalur terlarang");
const sebelum = catatan.length;
for (const jalur of [["admin", "users"], ["auth", "login"], ["video", "..", "..", "health"], [], ["video", ".", "x"]]) {
  r = await minta(jalur);
  cek(`${JSON.stringify(jalur)} -> 404`, r.status === 404, r.status);
}
cek("tidak satu pun sampai ke layanan", catatan.length === sebelum, catatan.slice(sebelum));
r = await minta(["video", "templates", "a b%2F..%2F"]);
cek("segmen di-encode, tidak bisa keluar dari /api/video", catatan.at(-1)!.url === "/api/video/templates/a%20b%252F..%252F", catatan.at(-1)!.url);

console.log("\n[D] Layanan mati");
await new Promise<void>((r) => layanan.close(() => r()));
if (process.platform !== "win32") rmSync(SOCKET, { force: true });
r = await minta(["video", "templates"]);
const galat = (await r.json()) as { detail: string };
cek("503 dengan pesan jelas", r.status === 503 && galat.detail.includes("tidak aktif"), { status: r.status, galat });

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
