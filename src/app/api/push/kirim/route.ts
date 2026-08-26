// POST /api/push/kirim — kirim notifikasi Android ke semua perangkat terdaftar.
//
// Dipanggil workflow n8n saat render video selesai atau gagal. Endpoint
// ini bisa membunyikan ponsel semua pengurus, jadi dilindungi rahasia
// bersama (N8N_WEBHOOK_SECRET) lewat header x-pri-secret. Tanpa itu,
// siapa pun yang menemukan alamatnya bisa mengirim notifikasi palsu.
//
// Body: { judul, isi, target?, tag?, url? }
import webpush from "web-push";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";

export const dynamic = "force-dynamic";

type BarisLangganan = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  email_user: string | null;
};

/** Siapkan kunci VAPID; melempar bila konfigurasinya belum lengkap. */
function siapkanVapid() {
  const publik = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privat = process.env.VAPID_PRIVATE_KEY;
  const subjek = process.env.VAPID_SUBJECT || "mailto:admin@pri.id";

  if (!publik || !privat) {
    throw Object.assign(
      new Error(
        "Kunci VAPID belum diatur di server. Isi NEXT_PUBLIC_VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY.",
      ),
      { status: 503 },
    );
  }
  webpush.setVapidDetails(subjek, publik, privat);
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const rahasia = process.env.N8N_WEBHOOK_SECRET;
    if (rahasia && request.headers.get("x-pri-secret") !== rahasia) {
      throw Object.assign(new Error("Tidak berwenang"), { status: 401 });
    }

    siapkanVapid();

    const body = (await request.json().catch(() => ({}))) as {
      judul?: string;
      isi?: string;
      target?: string;
      tag?: string;
      url?: string;
      /** Peran yang berhak menerima. Kosong = semua perangkat. */
      untuk_role?: string[] | null;
    };

    const judul = (body.judul ?? "").trim();
    if (!judul) {
      throw Object.assign(new Error("Judul notifikasi wajib diisi"), { status: 400 });
    }

    const db = supabase();
    const { data, error } = await db
      .from("langganan_push")
      .select("id, endpoint, p256dh, auth, email_user");

    if (error) throw new Error("Gagal membaca daftar perangkat");
    let daftar = (data ?? []) as BarisLangganan[];

    // Saring per peran: tim TV Rakyat tidak perlu dibangunkan laporan
    // QC tengah malam, dan sebaliknya. Perangkat yang pemiliknya tidak
    // dikenali sengaja TIDAK dikirimi — lebih baik satu notifikasi
    // terlewat daripada bocor ke peran yang tidak berkepentingan.
    const peran = body.untuk_role;
    if (Array.isArray(peran) && peran.length > 0) {
      const email = daftar.map((d) => d.email_user).filter(Boolean) as string[];
      if (email.length === 0) {
        daftar = [];
      } else {
        const { data: pengguna } = await db
          .from("app_user")
          .select("email, role")
          .in("email", email);

        const peranPer = new Map(
          (pengguna ?? []).map((u) => [u.email as string, u.role as string]),
        );
        daftar = daftar.filter((d) => {
          const r = d.email_user ? peranPer.get(d.email_user) : undefined;
          return r ? peran.includes(r) : false;
        });
      }
    }
    if (daftar.length === 0) return { sukses: true, terkirim: 0, dicabut: 0 };

    const muatan = JSON.stringify({
      judul,
      isi: body.isi ?? "",
      target: body.target ?? null,
      tag: body.tag ?? undefined,
      url: body.url ?? "/",
    });

    let terkirim = 0;
    const perluDicabut: number[] = [];

    await Promise.all(
      daftar.map(async (baris) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: baris.endpoint,
              keys: { p256dh: baris.p256dh, auth: baris.auth },
            },
            muatan,
          );
          terkirim += 1;
        } catch (e: unknown) {
          // 404/410 = perangkat mencabut izin atau aplikasi dicopot.
          // Baris seperti ini harus dibuang, kalau tidak daftar akan
          // terus menumpuk endpoint mati dan pengiriman makin lambat.
          const kode = (e as { statusCode?: number })?.statusCode;
          if (kode === 404 || kode === 410) perluDicabut.push(baris.id);
        }
      }),
    );

    if (perluDicabut.length > 0) {
      await db.from("langganan_push").delete().in("id", perluDicabut);
    }

    return { sukses: true, terkirim, dicabut: perluDicabut.length };
  });
}
