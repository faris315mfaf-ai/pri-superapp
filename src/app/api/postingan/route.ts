// GET /api/postingan — daftar postingan terpantau
// Query: ?akun_wajib=dpp.pri (opsional), ?periode= (opsional)
// Setiap postingan diberi field terhitung sudah_komentar_kader &
// belum_komentar_kader (dari data rekap).
import { NextRequest, NextResponse } from "next/server";
import { postingan } from "@/data/postingan";
import { rekap } from "@/data/rekap";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET(request: NextRequest) {
  await jeda();

  const { searchParams } = new URL(request.url);
  const akunWajib = searchParams.get("akun_wajib");
  const periode = searchParams.get("periode");

  let daftar = postingan;
  if (akunWajib) daftar = daftar.filter((p) => p.akun_wajib === akunWajib);
  if (periode) daftar = daftar.filter((p) => p.periode === periode);

  const data = daftar.map((p) => {
    const baris = rekap.filter((r) => r.id_postingan === p.id_postingan);
    const sudah = baris.filter((r) => r.sudah_komentar).length;
    return {
      ...p,
      sudah_komentar_kader: sudah,
      belum_komentar_kader: baris.length - sudah,
    };
  });

  return NextResponse.json({ data });
}
