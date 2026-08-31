// ============================================================
// Katalog sub-dashboard (fitur 1.19/3.3) — AMAN untuk klien.
// Dipisah dari lib/dashboard-akses karena file itu menyentuh
// Supabase (kunci rahasia, khusus server) sedangkan katalognya
// dibutuhkan juga oleh layar di peramban.
// ============================================================
import {
  CalendarCheck,
  Globe2,
  Target,
  MessageSquareHeart,
  Tv,
  Users,
} from "lucide-react";
import type { KomponenIkon } from "@/types";

export const KATALOG_DASHBOARD: readonly {
  kunci: string;
  label: string;
  keterangan: string;
  ikon: KomponenIkon;
}[] = [
  {
    kunci: "absensi",
    label: "Absensi Hari Ini",
    keterangan: "Kehadiran seluruh anggota hari ini",
    ikon: CalendarCheck,
  },
  {
    kunci: "kpi",
    label: "KPI Anggota",
    keterangan: "Capaian target video per anggota",
    ikon: Target,
  },
  {
    kunci: "kepatuhan",
    label: "Kepatuhan Komen",
    keterangan: "Kepatuhan komentar akun wajib",
    ikon: MessageSquareHeart,
  },
  {
    kunci: "tv",
    label: "TV Rakyat",
    keterangan: "Analitik produksi & performa video",
    ikon: Tv,
  },
  {
    kunci: "anggota",
    label: "Database Anggota",
    keterangan: "Kelengkapan data seluruh anggota",
    ikon: Users,
  },
  // Dashboard TV Rakyat Nasional (1 Sep 2026): statistik gabungan
  // Official + seluruh akun pengguna, per sosmed + leaderboard.
  {
    kunci: "tvnasional",
    label: "TV Rakyat Nasional",
    keterangan: "Statistik gabungan Official + akun pengguna per sosmed",
    ikon: Globe2,
  },
];

export type KunciDashboard =
  | "absensi"
  | "kpi"
  | "kepatuhan"
  | "tv"
  | "anggota"
  | "tvnasional";

export const KUNCI_DASHBOARD_SAH = new Set<string>(
  KATALOG_DASHBOARD.map((d) => d.kunci),
);
