// GET /api/dashboard — data lengkap dashboard super admin
// { kpi, tren, kepatuhanAkun, aktivitas, peringkat, ringkasanVideo, ringkasan }
import { NextResponse } from "next/server";
import {
  kpiDashboard,
  trenKepatuhan,
  kepatuhanAkun,
  aktivitasTerbaru,
} from "@/data/dashboard";
import { peringkatKader } from "@/data/kader";
import { hitungRingkasanVideo } from "@/data/videoAntrian";
import { hitungRingkasan } from "@/data/rekap";

export const dynamic = "force-dynamic";

const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function GET() {
  await jeda();

  return NextResponse.json({
    kpi: kpiDashboard,
    tren: trenKepatuhan,
    kepatuhanAkun,
    aktivitas: aktivitasTerbaru,
    peringkat: peringkatKader,
    ringkasanVideo: hitungRingkasanVideo(),
    ringkasan: hitungRingkasan(),
  });
}
