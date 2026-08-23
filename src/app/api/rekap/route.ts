// GET /api/rekap — rekap kepatuhan 288 baris
// Query: ?id_postingan=IG-DPP-01 (opsional) atau ?periode= (opsional)
// Jika ?id_postingan diberikan, respons menyertakan ringkasan
// { sudah, belum, persen } untuk postingan tersebut.
import { NextRequest, NextResponse } from "next/server";
import { rekap } from "@/data/rekap";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET(request: NextRequest) {
  await jeda();

  const { searchParams } = new URL(request.url);
  const idPostingan = searchParams.get("id_postingan");
  const periode = searchParams.get("periode");

  let data = rekap;
  if (idPostingan) data = data.filter((r) => r.id_postingan === idPostingan);
  if (periode) data = data.filter((r) => r.periode === periode);

  const payload: {
    data: typeof data;
    ringkasan?: { sudah: number; belum: number; persen: number };
  } = { data };

  if (idPostingan) {
    const sudah = data.filter((r) => r.sudah_komentar).length;
    const belum = data.length - sudah;
    const persen = data.length > 0 ? Math.round((sudah / data.length) * 100) : 0;
    payload.ringkasan = { sudah, belum, persen };
  }

  return NextResponse.json(payload);
}
