// GET /api/notifikasi — daftar notifikasi dalam aplikasi
import { NextResponse } from "next/server";
import { notifikasi } from "@/data/notifikasi";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET() {
  await jeda();
  return NextResponse.json({ data: notifikasi });
}
