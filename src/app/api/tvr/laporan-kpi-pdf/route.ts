// /api/tvr/laporan-kpi-pdf?tanggal=YYYY-MM-DD — LAPORAN KPI VIDEO SUPERAPPS
// berbentuk TABEL PDF (6 Sep 2026), untuk HR / Pimpinan Redaksi / pengurus.
//
// Kolom: No | Nama Pengguna | Akun TV Rakyat pribadi (semua platform) |
//        Jumlah Upload | Rekap Link (per platform, bernomor — format yang
//        sama dengan laporan upload harian / template laporan).
// Sumber: laporan_video (otomatis dari unggahan + manual yang disetujui HR)
// + akun_tvr_user (akun tertaut). Berkas disimpan ke bucket privat "rekap"
// dan dikembalikan sebagai tautan unduh 24 jam (pola laporan-harian).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { adalahHR } from "@/lib/hr";
import { adalahPimred } from "@/lib/jabatan";
import { semuaBaris } from "@/lib/semua-baris";
import { susunBarisKpi, teksAkunKpi, teksRekapKpi, type BarisLaporanKpi } from "@/lib/laporan-kpi-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function tanggalWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function tanggalPanjang(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+07:00`);
  if (!Number.isFinite(d.getTime())) return ymd;
  const wib = new Date(d.getTime() + 7 * 3600_000);
  return `${NAMA_HARI[wib.getUTCDay()]}, ${wib.getUTCDate()} ${NAMA_BULAN[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
}
function jamWib(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function bolehLihat(u: { role?: string; jabatan?: string | null; divisi?: string | null }): boolean {
  return u.role === "master" || u.role === "super_admin" || u.role === "superadmin" || adalahHR(u) || adalahPimred(u);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehLihat(user)) {
      throw Object.assign(new Error("Laporan KPI video hanya untuk HR, Pimpinan Redaksi, atau pengurus."), { status: 403 });
    }
    const url = new URL(request.url);
    const mentah = (url.searchParams.get("tanggal") ?? "").trim();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(mentah) ? mentah : tanggalWib();
    const hanyaData = url.searchParams.get("format") === "json";
    const db = supabase();

    const laporan = await semuaBaris<BarisLaporanKpi>((dari, sampai) =>
      db.from("laporan_video").select("user_id, platform, url_video, dibuat_pada").eq("tanggal_wib", tanggal).order("dibuat_pada", { ascending: true }).range(dari, sampai),
    );
    const ids = [...new Set(laporan.map((b) => Number(b.user_id)))];
    const orangPer = new Map<number, { nama: string; divisi: string }>();
    const akunPer = new Map<number, { platform: string; username: string }[]>();
    for (let i = 0; i < ids.length; i += 300) {
      const potong = ids.slice(i, i + 300);
      const [{ data: orang }, { data: akun }] = await Promise.all([
        db.from("app_user").select("id, nama, divisi").in("id", potong),
        db.from("akun_tvr_user").select("user_id, platform, username").in("user_id", potong).eq("aktif", true).order("id", { ascending: true }),
      ]);
      for (const o of orang ?? []) orangPer.set(Number(o.id), { nama: String(o.nama ?? ""), divisi: String(o.divisi ?? "") });
      for (const a of akun ?? []) {
        const uid = Number(a.user_id);
        if (!akunPer.has(uid)) akunPer.set(uid, []);
        const u = String(a.username ?? "").trim();
        if (u && !akunPer.get(uid)!.some((x) => x.platform === a.platform && x.username === u)) akunPer.get(uid)!.push({ platform: String(a.platform), username: u });
      }
    }
    const baris = susunBarisKpi(laporan, orangPer, akunPer);
    const jumlahLink = baris.reduce((n, b) => n + b.jumlah, 0);
    if (hanyaData) return { tanggal, tanggal_panjang: tanggalPanjang(tanggal), jumlah_orang: baris.length, jumlah_link: jumlahLink, baris };

    // ---- PDF (landscape supaya kolom link lega) ----
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("LAPORAN KPI VIDEO SUPERAPPS", 14, 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Tanggal: ${tanggalPanjang(tanggal)}`, 14, 20);
    pdf.setFontSize(8.5);
    pdf.text(`${baris.length} pengguna · ${jumlahLink} link video · dibuat ${jamWib()} WIB oleh ${user.nama}`, 14, 25);
    autoTable(pdf, {
      startY: 29,
      head: [["No", "Nama Pengguna", "Akun TV Rakyat Pribadi", "Jumlah Upload", "Rekap Link Upload"]],
      body: baris.map((b) => [String(b.no), `${b.nama}${b.divisi ? `\n${b.divisi}` : ""}`, teksAkunKpi(b), String(b.jumlah), teksRekapKpi(b)]),
      styles: { fontSize: 7, cellPadding: 1.6, overflow: "linebreak", valign: "top" },
      columnStyles: { 0: { cellWidth: 9, halign: "center" }, 1: { cellWidth: 40 }, 2: { cellWidth: 52 }, 3: { cellWidth: 18, halign: "center" }, 4: { cellWidth: "auto" } },
      headStyles: { fillColor: [220, 38, 38], fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 245, 245] },
      didDrawPage: (d) => {
        pdf.setFontSize(7);
        pdf.text(`Halaman ${d.pageNumber}`, pdf.internal.pageSize.getWidth() - 14, pdf.internal.pageSize.getHeight() - 6, { align: "right" });
      },
    });
    if (baris.length === 0) pdf.text("Belum ada video yang tercatat pada tanggal ini.", 14, 36);
    const byte = Buffer.from(pdf.output("arraybuffer"));
    const jalur = `laporan-kpi-video-${tanggal}-${Date.now()}.pdf`;
    const { error: eUnggah } = await db.storage.from("rekap").upload(jalur, byte, { contentType: "application/pdf", upsert: false });
    if (eUnggah) throw new Error(`Gagal menyimpan berkas laporan: ${eUnggah.message}`);
    const { data: tanda, error: eTanda } = await db.storage.from("rekap").createSignedUrl(jalur, 24 * 3600);
    if (eTanda || !tanda?.signedUrl) throw new Error("Gagal membuat tautan unduhan.");
    return { tanggal, url: tanda.signedUrl, nama_file: jalur, jumlah_orang: baris.length, jumlah_link: jumlahLink, ukuran: byte.length };
  });
}
