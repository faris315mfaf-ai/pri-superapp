// GET /api/berita — berita terbaru dari Nusantara TV
import { NextResponse } from "next/server";
import { berita } from "@/data/beritaNtv";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET() {
  await jeda();
  return NextResponse.json({ data: berita });
}
