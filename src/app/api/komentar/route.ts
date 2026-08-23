// GET /api/komentar — komentar tertangkap
// Query: ?id_postingan=IG-DPP-01 (tanpa parameter → semua komentar)
// nama_kader === null berarti komentar dari warga (bukan kader terdaftar).
import { NextRequest, NextResponse } from "next/server";
import { komentarByPostingan, getKomentarPostingan } from "@/data/komentar";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET(request: NextRequest) {
  await jeda();

  const idPostingan = new URL(request.url).searchParams.get("id_postingan");

  const data = idPostingan
    ? getKomentarPostingan(idPostingan)
    : Object.values(komentarByPostingan).flat();

  return NextResponse.json({ data });
}
