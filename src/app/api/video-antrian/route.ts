// GET /api/video-antrian — antrian & riwayat video TV Rakyat
// + ringkasan jumlah video per status.
import { NextResponse } from "next/server";
import { videoAntrian, hitungRingkasanVideo } from "@/data/videoAntrian";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET() {
  await jeda();
  return NextResponse.json({
    data: videoAntrian,
    ringkasan: hitungRingkasanVideo(),
  });
}
