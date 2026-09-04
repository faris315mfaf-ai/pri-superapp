// /api/tvr/laporan-harian — LAPORAN LIST NAMA YANG UPLOAD pada satu tanggal
// (4 Sep 2026), untuk Admin PALUGODAM / pengurus.
//
// GET ?tanggal=YYYY-MM-DD[&format=json|csv|pdf]
//   json (bawaan) → data terkelompok per orang → platform → link, plus TEKS
//                   yang sudah dirender memakai template format dari Panel
//                   Master (lib/template-laporan) — siap disalin/dibagikan.
//   csv           → berkas CSV (Excel) disimpan ke bucket privat "rekap",
//                   dikembalikan sebagai tautan unduh 24 jam.
//   pdf           → sama, berbentuk PDF (jsPDF + autoTable).
// Sumber: laporan_video (otomatis dari unggahan + laporan manual disetujui).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { adalahAdminStudio } from "@/lib/struktur";
import { semuaBaris } from "@/lib/semua-baris";
import { KUNCI_FORMAT_LAPORAN, renderTemplate, TEMPLATE_LAPORAN_BAWAAN, type DataLaporan, type OrangLaporan } from "@/lib/template-laporan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const URUTAN_PLATFORM = ["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"];
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
function csvSel(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

type BarisLaporan = { user_id: number; platform: string; url_video: string; dibuat_pada: string };

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!adalahAdminStudio(user)) {
      throw Object.assign(new Error("Laporan upload harian hanya untuk Admin PALUGODAM / pengurus."), { status: 403 });
    }
    const url = new URL(request.url);
    const mentah = (url.searchParams.get("tanggal") ?? "").trim();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(mentah) ? mentah : tanggalWib();
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    const db = supabase();

    const [baris, { data: tplRow }] = await Promise.all([
      semuaBaris<BarisLaporan>((dari, sampai) =>
        db
          .from("laporan_video")
          .select("user_id, platform, url_video, dibuat_pada")
          .eq("tanggal_wib", tanggal)
          .order("dibuat_pada", { ascending: true })
          .range(dari, sampai),
      ),
      db.from("pengaturan_sistem").select("nilai").eq("kunci", KUNCI_FORMAT_LAPORAN).maybeSingle(),
    ]);

    // Nama & divisi tiap pengguna (satu kueri).
    const ids = [...new Set(baris.map((b) => Number(b.user_id)))];
    const orangPer = new Map<number, { nama: string; username: string; divisi: string }>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await db.from("app_user").select("id, nama, username, divisi").in("id", ids.slice(i, i + 500));
      for (const o of data ?? []) orangPer.set(Number(o.id), { nama: String(o.nama ?? ""), username: String(o.username ?? ""), divisi: String(o.divisi ?? "") });
    }

    // Kelompokkan: orang → platform → link (unik).
    const perOrang = new Map<number, Map<string, Set<string>>>();
    for (const b of baris) {
      const u = Number(b.user_id);
      const pf = String(b.platform ?? "").toLowerCase();
      const link = String(b.url_video ?? "").trim();
      if (!link) continue;
      if (!perOrang.has(u)) perOrang.set(u, new Map());
      const m = perOrang.get(u)!;
      if (!m.has(pf)) m.set(pf, new Set());
      m.get(pf)!.add(link);
    }
    const orang: OrangLaporan[] = [...perOrang.entries()]
      .map(([uid, m]) => {
        const info = orangPer.get(uid) ?? { nama: `#${uid}`, username: "", divisi: "" };
        const platform = [...m.entries()]
          .sort((a, b) => (URUTAN_PLATFORM.indexOf(a[0]) + 100) % 100 - ((URUTAN_PLATFORM.indexOf(b[0]) + 100) % 100))
          .map(([pf, set]) => ({ platform: pf, PLATFORM: pf.toUpperCase(), jumlah: set.size, link: [...set].map((u) => ({ url: u })) }));
        return { nama: info.nama, username: info.username, divisi: info.divisi, jumlah: platform.reduce((n, p) => n + p.jumlah, 0), platform };
      })
      .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama));
    const jumlahLink = orang.reduce((n, o) => n + o.jumlah, 0);
    const data: DataLaporan = {
      tanggal,
      tanggal_panjang: tanggalPanjang(tanggal),
      jam: jamWib(),
      dibuat_oleh: user.nama,
      jumlah_orang: orang.length,
      jumlah_link: jumlahLink,
      orang,
    };
    const template = String(tplRow?.nilai ?? "").trim() || TEMPLATE_LAPORAN_BAWAAN;
    const teks = renderTemplate(template, data as unknown as Record<string, never>);

    if (format === "json") return { ...data, teks, template_bawaan: !tplRow?.nilai };

    // ---- Berkas unduhan (CSV / PDF) → bucket privat "rekap", tautan 24 jam ----
    const namaFile = `laporan-upload-${tanggal}-${Date.now()}`;
    let byte: Buffer;
    let tipe: string;
    let jalur: string;
    if (format === "csv") {
      const barisCsv = [["No", "Nama", "Username", "Divisi", "Platform", "Link"].join(";")];
      let no = 0;
      for (const o of orang) {
        no += 1;
        for (const p of o.platform) for (const l of p.link) barisCsv.push([String(no), o.nama, o.username, o.divisi, p.PLATFORM, l.url].map(csvSel).join(";"));
        if (o.platform.length === 0) barisCsv.push([String(no), o.nama, o.username, o.divisi, "", ""].map(csvSel).join(";"));
      }
      // BOM supaya Excel membaca UTF-8 (nama berhuruf khusus) dengan benar; pemisah ';' cocok Excel Indonesia.
      byte = Buffer.from("\uFEFF" + barisCsv.join("\r\n"), "utf8");
      tipe = "text/csv";
      jalur = `${namaFile}.csv`;
    } else if (format === "pdf") {
      const pdf = new jsPDF();
      pdf.setFontSize(14);
      pdf.text("Laporan Upload Video — PRI SuperApp", 14, 16);
      pdf.setFontSize(10);
      pdf.text(`${data.tanggal_panjang}  ·  ${orang.length} orang  ·  ${jumlahLink} link  ·  dibuat ${data.jam} WIB oleh ${user.nama}`, 14, 23);
      const isi: string[][] = [];
      orang.forEach((o, i) => {
        for (const p of o.platform) for (const l of p.link) isi.push([String(i + 1), o.nama, p.PLATFORM, l.url]);
      });
      autoTable(pdf, {
        startY: 28,
        head: [["No", "Nama", "Platform", "Link"]],
        body: isi,
        styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 40 }, 2: { cellWidth: 24 } },
        headStyles: { fillColor: [220, 38, 38] },
      });
      if (isi.length === 0) pdf.text("Belum ada video yang diunggah pada tanggal ini.", 14, 34);
      byte = Buffer.from(pdf.output("arraybuffer"));
      tipe = "application/pdf";
      jalur = `${namaFile}.pdf`;
    } else {
      throw Object.assign(new Error("format harus json / csv / pdf."), { status: 400 });
    }
    const { error: eUnggah } = await db.storage.from("rekap").upload(jalur, byte, { contentType: tipe, upsert: false });
    if (eUnggah) throw new Error(`Gagal menyimpan berkas laporan: ${eUnggah.message}`);
    const { data: tanda, error: eTanda } = await db.storage.from("rekap").createSignedUrl(jalur, 24 * 3600);
    if (eTanda || !tanda?.signedUrl) throw new Error("Gagal membuat tautan unduhan.");
    return { tanggal, format, url: tanda.signedUrl, nama_file: jalur, jumlah_orang: orang.length, jumlah_link: jumlahLink };
  });
}
