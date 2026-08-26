// GET  /api/versi — rilis terbaru (versi, catatan fitur, wajib, tautan)
// POST /api/versi — umumkan rilis baru (khusus master/super admin):
//        menyimpan catatan rilis + push notifikasi ke SEMUA perangkat
//        berisi fitur-fitur barunya.
//
// Sisi aplikasi membandingkan versi terbaru dengan VERSI_APLIKASI yang
// tertanam di build-nya: bila server lebih baru, muncul menu "Update
// aplikasi" (web cukup dimuat ulang; APK diarahkan ke tautan unduhan).
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

export async function GET() {
  return bungkus(async () => {
    const { data, error } = await supabase()
      .from("rilis_aplikasi")
      .select("versi, catatan, wajib, url_unduhan, dibuat_pada")
      .order("dibuat_pada", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Gagal membaca info versi.");
    return { terbaru: data ?? null };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const h = request.headers.get("authorization") ?? "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    const user = await userDariToken(token);
    if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
    if (user.role !== "master" && user.role !== "super_admin") {
      throw Object.assign(new Error("Hanya super admin yang boleh mengumumkan rilis."), {
        status: 403,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      versi?: string;
      catatan?: string[];
      wajib?: boolean;
      url_unduhan?: string;
    };
    const versi = (body.versi ?? "").trim();
    if (!/^\d+\.\d+(\.\d+)?$/.test(versi)) {
      throw Object.assign(new Error("Versi harus berbentuk angka, mis. 2.4.0"), { status: 400 });
    }
    const catatan = (body.catatan ?? [])
      .map((c) => String(c ?? "").trim())
      .filter((c) => c.length >= 3)
      .slice(0, 15);
    if (catatan.length === 0) {
      throw Object.assign(new Error("Tulis minimal satu catatan fitur baru."), { status: 400 });
    }

    const { error } = await supabase().from("rilis_aplikasi").insert({
      versi,
      catatan,
      wajib: Boolean(body.wajib),
      url_unduhan: (body.url_unduhan ?? "").trim() || null,
    });
    if (error) {
      if (error.code === "23505") {
        throw Object.assign(new Error(`Versi ${versi} sudah pernah diumumkan.`), { status: 409 });
      }
      console.error("[versi] simpan:", error.message);
      throw new Error("Gagal menyimpan rilis.");
    }

    // Kabar ke SEMUA: notifikasi dalam aplikasi + push berisi fitur baru.
    await kirimKabar({
      judul: `PRI SuperApp ${versi} sudah tersedia`,
      isi: `Fitur baru: ${catatan.join(" · ")}`.slice(0, 400),
      kategori: "info",
      jenis_peristiwa: "rilis_aplikasi",
    });

    return { sukses: true };
  });
}
