// POST   /api/push/langganan — daftarkan perangkat agar bisa menerima notifikasi
// DELETE /api/push/langganan — cabut langganan perangkat ini
//
// Satu baris = satu perangkat. `endpoint` dijadikan kunci unik supaya
// memasang ulang aplikasi di ponsel yang sama memperbarui baris lama,
// bukan menumpuk duplikat yang membuat notifikasi datang berkali-kali.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";

export const dynamic = "force-dynamic";

type Langganan = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  email_user?: string;
};

export async function POST(request: Request) {
  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as Langganan;

    const endpoint = (body.endpoint ?? "").trim();
    const p256dh = (body.keys?.p256dh ?? "").trim();
    const auth = (body.keys?.auth ?? "").trim();

    if (!endpoint || !p256dh || !auth) {
      throw Object.assign(new Error("Data langganan tidak lengkap"), { status: 400 });
    }

    const { error } = await supabase()
      .from("langganan_push")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          email_user: body.email_user ?? null,
          dipakai_pada: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );

    if (error) throw new Error("Gagal menyimpan langganan notifikasi");
    return { sukses: true };
  });
}

export async function DELETE(request: Request) {
  return bungkus(async () => {
    const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
    const endpoint = (body.endpoint ?? "").trim();
    if (!endpoint) {
      throw Object.assign(new Error("Endpoint tidak disebutkan"), { status: 400 });
    }

    const { error } = await supabase()
      .from("langganan_push")
      .delete()
      .eq("endpoint", endpoint);

    if (error) throw new Error("Gagal mencabut langganan notifikasi");
    return { sukses: true };
  });
}
