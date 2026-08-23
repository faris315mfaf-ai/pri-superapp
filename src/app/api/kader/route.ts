// GET /api/kader — roster 24 kader aktif
import { NextResponse } from "next/server";
import { kader } from "@/data/kader";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET() {
  await jeda();
  return NextResponse.json({ data: kader });
}
