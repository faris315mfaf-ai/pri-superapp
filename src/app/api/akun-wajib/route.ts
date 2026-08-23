// GET /api/akun-wajib — daftar akun wajib + statistik kepatuhan
import { NextResponse } from "next/server";
import { akunWajib } from "@/data/akunWajib";
import { hitungStatistikAkun } from "@/data/rekap";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET() {
  await jeda();

  const data = akunWajib.map((a) => ({
    ...a,
    ...hitungStatistikAkun(a.akun_wajib),
  }));

  return NextResponse.json({ data });
}
