// ============================================================
// PRI SuperApp — Pengirim kabar (KHUSUS SISI SERVER)
//
// Satu pintu untuk "beri tahu orang": tulis baris notifikasi dalam
// aplikasi DAN bunyikan push ke perangkat yang berhak. Dipakai oleh
// penugasan, perizinan, keanggotaan tim, dan pengumuman rilis.
//
// Sengaja TIDAK melempar error ke pemanggil: gagal mengirim kabar
// tidak boleh menggagalkan tindakan utamanya (tugas sudah dibuat,
// izin sudah diputuskan). Kegagalan cukup dicatat di log server.
// ============================================================
import webpush from "web-push";
import { supabase } from "@/lib/supabase";

type Kabar = {
  judul: string;
  isi: string;
  kategori?: string;
  jenis_peristiwa?: string;
  /** Target navigasi di aplikasi (dipakai banner/notifikasi) */
  target?: string | null;
  /** Kirim ke peran tertentu (null/kosong = semua peran) */
  untukRole?: string[] | null;
  /** Kirim ke ORANG tertentu — satu baris notifikasi per orang */
  untukUserIds?: number[] | null;
  /**
   * true = hanya bunyikan push TANPA menulis baris notifikasi.
   * Dipakai chat: tiap pesan membunyikan ponsel penerima, tapi
   * riwayatnya hidup di layar Chat — menyalinnya ke daftar notifikasi
   * hanya membuat daftar itu banjir.
   */
  hanyaPush?: boolean;
};

function vapidSiap(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

type BarisLangganan = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  email_user: string | null;
};


// ------------------------------------------------------------
// Pengiriman berkelompok
// ------------------------------------------------------------

/** Banyaknya perangkat yang ditembak bersamaan dalam satu kelompok. */
export const UKURAN_KELOMPOK_PUSH = 50;

/** Jeda antar kelompok, memberi napas pada server maupun ponsel. */
export const JEDA_KELOMPOK_MS = 1500;

/**
 * Kirim ke banyak perangkat dalam kelompok berukuran tetap, dengan jeda
 * di antaranya.
 *
 * KENAPA: sebelumnya seluruh langganan ditembak sekaligus lewat satu
 * Promise.all. Untuk ratusan perangkat itu berarti ratusan permintaan
 * keluar serentak, DAN — yang lebih memberatkan — ratusan orang membuka
 * aplikasi dalam detik yang sama, sehingga server dihantam lonjakan
 * yang sebenarnya kita sendiri yang memicunya.
 *
 * Catatan: jeda hanya terasa bila penerimanya lebih dari satu kelompok.
 * Notifikasi tersasar ke satu-dua orang (kasus paling sering) tetap
 * terkirim tanpa penundaan sama sekali.
 */
export async function kirimBerkelompok<T>(
  daftar: T[],
  kirimSatu: (butir: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < daftar.length; i += UKURAN_KELOMPOK_PUSH) {
    const kelompok = daftar.slice(i, i + UKURAN_KELOMPOK_PUSH);
    await Promise.all(kelompok.map(kirimSatu));
    if (i + UKURAN_KELOMPOK_PUSH < daftar.length) {
      await new Promise((lanjut) => setTimeout(lanjut, JEDA_KELOMPOK_MS));
    }
  }
}

/** Bunyikan push ke daftar langganan; endpoint mati langsung dicabut. */
async function kirimPush(daftar: BarisLangganan[], muatan: string): Promise<void> {
  if (daftar.length === 0 || !vapidSiap()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@pri.id",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const perluDicabut: number[] = [];
  await kirimBerkelompok(daftar, async (baris) => {
    try {
      await webpush.sendNotification(
        { endpoint: baris.endpoint, keys: { p256dh: baris.p256dh, auth: baris.auth } },
        muatan,
      );
    } catch (e: unknown) {
      // 404/410 = izin dicabut / aplikasi dicopot — buang barisnya
      // supaya daftar tidak menumpuk endpoint mati.
      const kode = (e as { statusCode?: number })?.statusCode;
      if (kode === 404 || kode === 410) perluDicabut.push(baris.id);
    }
  });
  if (perluDicabut.length > 0) {
    await supabase().from("langganan_push").delete().in("id", perluDicabut);
  }
}

/**
 * Kirim kabar: baris notifikasi + push.
 *
 * Aturan sasaran push mengikuti pemilik perangkat (email_user):
 * - untukUserIds terisi → hanya perangkat milik orang-orang itu.
 * - untukRole terisi    → hanya perangkat yang pemiliknya berperan itu.
 * - keduanya kosong     → semua perangkat terdaftar.
 * Perangkat tanpa pemilik dikenal TIDAK dikirimi kabar tersasar —
 * lebih baik satu notifikasi terlewat daripada bocor ke orang lain.
 */
export async function kirimKabar(kabar: Kabar): Promise<void> {
  try {
    const db = supabase();
    const kode = `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // --- 1. Baris notifikasi dalam aplikasi (kecuali hanyaPush) ---
    const dasar = {
      judul: kabar.judul,
      isi: kabar.isi,
      kategori: kabar.kategori ?? "info",
      target: kabar.target ?? null,
      jenis_peristiwa: kabar.jenis_peristiwa ?? "kabar_aplikasi",
      dibaca: false,
    };

    if (!kabar.hanyaPush) {
      if (kabar.untukUserIds && kabar.untukUserIds.length > 0) {
        await db.from("notifikasi").insert(
          kabar.untukUserIds.map((uid, i) => ({
            ...dasar,
            kode: `${kode}-${i}`,
            untuk_user: uid,
          })),
        );
      } else {
        await db.from("notifikasi").insert({
          ...dasar,
          kode,
          untuk_role: kabar.untukRole && kabar.untukRole.length > 0 ? kabar.untukRole : null,
        });
      }
    }

    // --- 2. Push ke perangkat yang berhak ---
    const { data } = await db
      .from("langganan_push")
      .select("id, endpoint, p256dh, auth, email_user");
    let daftar = (data ?? []) as BarisLangganan[];
    if (daftar.length === 0) return;

    if (kabar.untukUserIds && kabar.untukUserIds.length > 0) {
      const { data: orang } = await db
        .from("app_user")
        .select("email")
        .in("id", kabar.untukUserIds);
      const emailSet = new Set((orang ?? []).map((o) => o.email as string));
      daftar = daftar.filter((d) => d.email_user && emailSet.has(d.email_user));
    } else if (kabar.untukRole && kabar.untukRole.length > 0) {
      const email = daftar.map((d) => d.email_user).filter(Boolean) as string[];
      const { data: orang } = await db
        .from("app_user")
        .select("email, role")
        .in("email", email);
      const peranPer = new Map((orang ?? []).map((o) => [o.email as string, o.role as string]));
      daftar = daftar.filter((d) => {
        const r = d.email_user ? peranPer.get(d.email_user) : undefined;
        return r ? kabar.untukRole!.includes(r) : false;
      });
    }

    await kirimPush(
      daftar,
      JSON.stringify({
        judul: kabar.judul,
        isi: kabar.isi,
        target: kabar.target ?? null,
        url: "/",
      }),
    );
  } catch (e) {
    console.error("[notifikasi] kirim kabar:", e);
  }
}
