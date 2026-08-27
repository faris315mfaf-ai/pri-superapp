// POST /api/absensi/rekap — rekap absensi jadi PDF (spek 1.15).
//
// { dari: "YYYY-MM-DD", sampai: "YYYY-MM-DD", nomor_wa?: string }
// PDF dibangun DI SERVER (jsPDF), disimpan ke bucket privat 'rekap',
// lalu:
// - selalu mengembalikan signed URL 24 jam (untuk diunduh langsung),
// - bila nomor_wa diisi → PDF dikirim ke nomor itu via Fonnte
//   sebagai lampiran.
// Khusus pengurus (rekap berisi data kehadiran seluruh anggota).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { kirimWaDenganLampiran, nomorWaSah, normalkanNomorWa } from "@/lib/fonnte";
import { statusTelat } from "@/lib/absensi-status";

export const dynamic = "force-dynamic";

const PENGURUS = new Set(["master", "super_admin", "admin_hr"]);

/** Batas rentang hari — rekap setahun penuh bukan urusan endpoint ini. */
const MAKS_HARI = 62;

function jamWibDari(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const h = request.headers.get("authorization") ?? "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    const user = await userDariToken(token);
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (!PENGURUS.has(user.role)) {
      throw Object.assign(new Error("Hanya pengurus yang boleh membuat rekap absensi."), {
        status: 403,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      dari?: string;
      sampai?: string;
      nomor_wa?: string;
    };
    const dari = (body.dari ?? "").trim();
    const sampai = (body.sampai ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
      throw Object.assign(new Error("Pilih rentang tanggal rekap."), { status: 400 });
    }
    if (dari > sampai) {
      throw Object.assign(new Error("Tanggal awal harus sebelum tanggal akhir."), {
        status: 400,
      });
    }
    const jumlahHari = (Date.parse(sampai) - Date.parse(dari)) / 86_400_000 + 1;
    if (jumlahHari > MAKS_HARI) {
      throw Object.assign(new Error(`Rentang rekap maksimal ${MAKS_HARI} hari.`), {
        status: 400,
      });
    }

    const nomorTujuan = (body.nomor_wa ?? "").trim();
    if (nomorTujuan && !nomorWaSah(normalkanNomorWa(nomorTujuan))) {
      throw Object.assign(new Error("Nomor WhatsApp tujuan tidak benar."), { status: 400 });
    }

    // --- Data absensi rentang itu (+ perizinan sebagai keterangan) ---
    const db = supabase();
    const [{ data: baris }, { data: izin }] = await Promise.all([
      db
        .from("absensi")
        .select("user_id, jenis, waktu, tanggal_wib, app_user(nama)")
        .gte("tanggal_wib", dari)
        .lte("tanggal_wib", sampai)
        .order("tanggal_wib")
        .order("waktu")
        .limit(5000),
      db
        .from("perizinan")
        .select("user_id, jenis, tanggal_wib, status, app_user(nama)")
        .gte("tanggal_wib", dari)
        .lte("tanggal_wib", sampai)
        .eq("status", "disetujui")
        .limit(2000),
    ]);

    type BarisAbsen = {
      user_id: number;
      jenis: string;
      waktu: string;
      tanggal_wib: string;
      app_user?: { nama?: string } | { nama?: string }[];
    };
    const nama = (b: BarisAbsen) => {
      const a = Array.isArray(b.app_user) ? b.app_user[0] : b.app_user;
      return a?.nama ?? `#${b.user_id}`;
    };

    // Susun per (tanggal, orang): jam masuk, jam pulang, status telat.
    const peta = new Map<
      string,
      { tanggal: string; nama: string; masuk: string; pulang: string; status: string }
    >();
    for (const b of (baris ?? []) as BarisAbsen[]) {
      const kunci = `${b.tanggal_wib}|${b.user_id}`;
      const ada = peta.get(kunci) ?? {
        tanggal: b.tanggal_wib,
        nama: nama(b),
        masuk: "-",
        pulang: "-",
        status: "-",
      };
      if (b.jenis === "masuk") {
        ada.masuk = jamWibDari(b.waktu);
        ada.status = statusTelat(b.waktu);
      } else if (b.jenis === "pulang") {
        ada.pulang = jamWibDari(b.waktu);
      }
      peta.set(kunci, ada);
    }
    for (const i of (izin ?? []) as unknown as BarisAbsen[]) {
      const kunci = `${i.tanggal_wib}|${i.user_id}`;
      if (!peta.has(kunci)) {
        peta.set(kunci, {
          tanggal: i.tanggal_wib,
          nama: nama(i),
          masuk: "-",
          pulang: "-",
          status: i.jenis === "sakit" ? "Sakit (izin)" : "Izin",
        });
      }
    }

    const isi = Array.from(peta.values()).sort(
      (a, b) => a.tanggal.localeCompare(b.tanggal) || a.nama.localeCompare(b.nama),
    );

    // --- Bangun PDF ---
    const pdf = new jsPDF();
    pdf.setFontSize(14);
    pdf.text("Rekap Absensi — PRI SuperApp", 14, 16);
    pdf.setFontSize(10);
    pdf.text(`Periode: ${dari} s.d. ${sampai}  ·  Dibuat oleh: ${user.nama}`, 14, 23);
    autoTable(pdf, {
      startY: 28,
      head: [["Tanggal", "Nama", "Masuk", "Pulang", "Status"]],
      body: isi.map((r) => [r.tanggal, r.nama, r.masuk, r.pulang, r.status]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [220, 38, 38] },
    });
    if (isi.length === 0) {
      pdf.text("Tidak ada data absensi pada rentang ini.", 14, 34);
    }
    const byte = Buffer.from(pdf.output("arraybuffer"));

    // --- Simpan ke bucket privat + signed URL 24 jam ---
    const jalur = `rekap-absensi-${dari}-sd-${sampai}-${Date.now()}.pdf`;
    const { error: eUnggah } = await db.storage
      .from("rekap")
      .upload(jalur, byte, { contentType: "application/pdf", upsert: false });
    if (eUnggah) {
      console.error("[rekap] unggah:", eUnggah.message);
      throw new Error("Gagal menyimpan PDF rekap.");
    }
    const { data: tanda, error: eTanda } = await db.storage
      .from("rekap")
      .createSignedUrl(jalur, 24 * 3600);
    if (eTanda || !tanda?.signedUrl) {
      throw new Error("Gagal membuat tautan unduhan rekap.");
    }

    // --- Kirim ke WhatsApp bila diminta ---
    let terkirimWa = false;
    if (nomorTujuan) {
      await kirimWaDenganLampiran(
        nomorTujuan,
        `Rekap absensi PRI ${dari} s.d. ${sampai} (${isi.length} baris). Tautan berlaku 24 jam.`,
        tanda.signedUrl,
        `rekap-absensi-${dari}-sd-${sampai}.pdf`,
      );
      terkirimWa = true;
    }

    return {
      sukses: true,
      url: tanda.signedUrl,
      baris: isi.length,
      terkirim_wa: terkirimWa,
    };
  });
}
