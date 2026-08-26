// Chat internal 1-lawan-1 (teks + emoji; TANPA foto/video).
//
// GET                → daftar percakapan saya (+ cuplikan & belum dibaca)
// GET ?kontak=ID     → pesan satu percakapan (?sejak=ID utk polling
//                      tambahan saja, hemat kuota)
// GET ?kandidat=1    → daftar pengguna aktif yang bisa diajak chat
// POST {aksi:"mulai", target_id}         → ajukan percakapan baru
// POST {aksi:"terima"|"tolak", kontak_id} → jawab ajakan
// POST {aksi:"kirim", kontak_id, isi}     → kirim pesan
// PATCH {kontak_id}  → tandai semua pesan lawan sebagai dibaca
//
// Aturan accept: chat dengan orang lain baru terbuka setelah pihak
// yang diajak MENERIMA — tidak ada yang bisa membanjiri kotak masuk
// orang tanpa persetujuannya. Pengirim tetap boleh menulis pesan
// pertama saat mengajak (sebagai perkenalan), tapi berhenti di situ
// sampai diterima.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { userDariToken } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { after } from "next/server";

export const dynamic = "force-dynamic";

// Super admin & master berperan sebagai pengawas sistem: boleh
// memantau/menghapus percakapan, memulai chat tanpa menunggu
// persetujuan, melihat nomor WhatsApp anggota, dan mematikan fitur
// chat untuk semua orang. Kewenangan sebesar ini sengaja dibatasi
// ke dua peran itu saja dan diperiksa di server.
const PENGAWAS = new Set(["super_admin", "master"]);

const KUNCI_SAKELAR = "chat_aktif";

/** Batas panjang satu pesan (karakter). */
const BATAS_PESAN = 300;

/** Umur pesan sebelum dihapus permanen (hari). */
const RETENSI_HARI = 3;

/**
 * Hapus pesan yang lebih tua dari 3 hari.
 *
 * Dijalankan menumpang permintaan chat biasa (setelah balasan
 * terkirim, lewat after()), jadi tidak butuh cron dan tidak
 * memperlambat layar. Percakapannya sendiri TIDAK dihapus — hanya
 * isinya, supaya daftar kontak tetap utuh.
 */
async function bersihkanPesanLama() {
  try {
    const batas = new Date(Date.now() - RETENSI_HARI * 24 * 60 * 60 * 1000).toISOString();
    await supabase().from("chat_pesan").delete().lt("dibuat_pada", batas);
  } catch (e) {
    // Bersih-bersih gagal dicoba lagi pada pemakaian berikutnya.
    console.error("[chat] bersihkan pesan lama:", e);
  }
}

/** true bila fitur chat sedang dinyalakan (bawaan: nyala). */
async function chatAktif(): Promise<boolean> {
  try {
    const { data } = await supabase()
      .from("pengaturan_sistem")
      .select("nilai")
      .eq("kunci", KUNCI_SAKELAR)
      .maybeSingle();
    return data?.nilai !== "false";
  } catch {
    // Gagal membaca pengaturan tidak boleh mematikan chat diam-diam.
    return true;
  }
}

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function pastikanMasuk(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  return user;
}

/** Pasangan terurut supaya (A,B) dan (B,A) adalah satu percakapan. */
function pasangan(a: number, b: number): { kecil: number; besar: number } {
  return a < b ? { kecil: a, besar: b } : { kecil: b, besar: a };
}

/**
 * Bersihkan isi pesan: teks + emoji saja. Tautan data/blob (jalan
 * belakang menyelundupkan media) ditolak, bukan karena tautannya
 * berbahaya, tapi karena kebijakan chat ini memang teks murni.
 */
function bersihkanIsi(mentah: string): string {
  const isi = String(mentah ?? "").trim();
  if (!isi) throw Object.assign(new Error("Pesan kosong."), { status: 400 });
  if (isi.length > BATAS_PESAN) {
    throw Object.assign(
      new Error(`Pesan maksimal ${BATAS_PESAN} karakter.`),
      { status: 400 },
    );
  }
  if (/data:|blob:/i.test(isi)) {
    throw Object.assign(new Error("Chat hanya untuk teks dan emoji."), { status: 400 });
  }
  return isi;
}

type BarisKontak = {
  id: number;
  user_kecil: number;
  user_besar: number;
  diminta_oleh: number;
  status: string;
  dibuat_pada: string;
};

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const url = new URL(request.url);
    const db = supabase();

    const pengawas = PENGAWAS.has(user.role);
    after(bersihkanPesanLama);

    // --- Pemantauan seluruh percakapan (khusus pengawas) ---
    if (url.searchParams.get("pantau") === "1") {
      if (!pengawas) {
        throw Object.assign(new Error("Hanya super admin yang boleh memantau chat."), {
          status: 403,
        });
      }
      const kontakId = Number(url.searchParams.get("kontak") ?? 0);
      if (kontakId) {
        const { data: pesan } = await db
          .from("chat_pesan")
          .select("id, pengirim_id, isi, dibaca, dibuat_pada")
          .eq("kontak_id", kontakId)
          .order("id", { ascending: true })
          .limit(300);
        return {
          data: (pesan ?? []).map((p) => ({
            id: String(p.id),
            pengirim_id: String(p.pengirim_id),
            isi: p.isi,
            dibaca: p.dibaca,
            dibuat_pada: p.dibuat_pada,
          })),
        };
      }

      const { data: semua } = await db
        .from("chat_kontak")
        .select(
          "id, user_kecil, user_besar, status, dibuat_pada, kecil:app_user!chat_kontak_user_kecil_fkey(nama), besar:app_user!chat_kontak_user_besar_fkey(nama)",
        )
        .order("id", { ascending: false })
        .limit(200);
      return {
        chat_aktif: await chatAktif(),
        data: (semua ?? []).map((k) => {
          const a = Array.isArray(k.kecil) ? k.kecil[0] : k.kecil;
          const b = Array.isArray(k.besar) ? k.besar[0] : k.besar;
          return {
            id: String(k.id),
            nama_a: a?.nama ?? "",
            nama_b: b?.nama ?? "",
            status: k.status,
            dibuat_pada: k.dibuat_pada,
          };
        }),
      };
    }

    // --- Kandidat: semua pengguna aktif selain saya ---
    if (url.searchParams.get("kandidat") === "1") {
      const { data } = await db
        .from("app_user")
        .select("id, nama, jabatan, avatar_url, role, nomor_wa")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("id", idKu)
        .neq("role", "master")
        .order("nama")
        .limit(200);
      return {
        data: (data ?? []).map((u) => ({
          id: String(u.id),
          nama: u.nama,
          jabatan: u.jabatan ?? "",
          avatar_url: u.avatar_url ?? "",
          // Nomor WhatsApp hanya dibuka untuk pengawas — bagi anggota
          // biasa, daftar kontak tidak boleh jadi buku telepon.
          nomor_wa: pengawas ? (u.nomor_wa ?? "") : null,
        })),
      };
    }

    // --- Pesan satu percakapan ---
    const kontakId = Number(url.searchParams.get("kontak") ?? 0);
    if (kontakId) {
      const { data: kontak } = await db
        .from("chat_kontak")
        .select("id, user_kecil, user_besar, diminta_oleh, status")
        .eq("id", kontakId)
        .maybeSingle();
      if (!kontak || (Number(kontak.user_kecil) !== idKu && Number(kontak.user_besar) !== idKu)) {
        throw Object.assign(new Error("Percakapan tidak ditemukan."), { status: 404 });
      }

      const sejak = Number(url.searchParams.get("sejak") ?? 0);
      let q = db
        .from("chat_pesan")
        .select("id, pengirim_id, isi, dibaca, dibuat_pada")
        .eq("kontak_id", kontakId)
        .order("id", { ascending: true })
        .limit(200);
      if (sejak) q = q.gt("id", sejak);
      const { data: pesan } = await q;

      return {
        status: kontak.status,
        diminta_oleh: String(kontak.diminta_oleh),
        data: (pesan ?? []).map((p) => ({
          id: String(p.id),
          pengirim_id: String(p.pengirim_id),
          isi: p.isi,
          dibaca: p.dibaca,
          dibuat_pada: p.dibuat_pada,
        })),
      };
    }

    // --- Daftar percakapan saya ---
    const { data: kontakSemua } = await db
      .from("chat_kontak")
      .select(
        "id, user_kecil, user_besar, diminta_oleh, status, dibuat_pada, kecil:app_user!chat_kontak_user_kecil_fkey(nama, avatar_url), besar:app_user!chat_kontak_user_besar_fkey(nama, avatar_url)",
      )
      .or(`user_kecil.eq.${idKu},user_besar.eq.${idKu}`)
      .order("id", { ascending: false })
      .limit(100);

    const daftarKontak = (kontakSemua ?? []) as unknown as (BarisKontak & {
      kecil?: { nama?: string; avatar_url?: string } | { nama?: string; avatar_url?: string }[];
      besar?: { nama?: string; avatar_url?: string } | { nama?: string; avatar_url?: string }[];
    })[];

    // Cuplikan terakhir + jumlah belum dibaca, sekali kueri per kolom.
    const ids = daftarKontak.map((k) => k.id);
    const cuplikanPer = new Map<number, { isi: string; dibuat_pada: string; pengirim_id: number }>();
    const belumPer = new Map<number, number>();
    if (ids.length > 0) {
      const { data: terakhir } = await db
        .from("chat_pesan")
        .select("kontak_id, isi, dibuat_pada, pengirim_id, dibaca")
        .in("kontak_id", ids)
        .order("id", { ascending: false })
        .limit(500);
      for (const p of terakhir ?? []) {
        const kid = Number(p.kontak_id);
        if (!cuplikanPer.has(kid)) {
          cuplikanPer.set(kid, {
            isi: p.isi as string,
            dibuat_pada: p.dibuat_pada as string,
            pengirim_id: Number(p.pengirim_id),
          });
        }
        if (!p.dibaca && Number(p.pengirim_id) !== idKu) {
          belumPer.set(kid, (belumPer.get(kid) ?? 0) + 1);
        }
      }
    }

    return {
      chat_aktif: await chatAktif(),
      pengawas,
      data: daftarKontak.map((k) => {
        const lawanEmbed = Number(k.user_kecil) === idKu ? k.besar : k.kecil;
        const lawan = Array.isArray(lawanEmbed) ? lawanEmbed[0] : lawanEmbed;
        const cuplikan = cuplikanPer.get(k.id);
        return {
          id: String(k.id),
          lawan_id: String(Number(k.user_kecil) === idKu ? k.user_besar : k.user_kecil),
          lawan_nama: lawan?.nama ?? "",
          lawan_avatar: lawan?.avatar_url ?? "",
          status: k.status,
          diminta_oleh: String(k.diminta_oleh),
          cuplikan: cuplikan?.isi ?? "",
          waktu_terakhir: cuplikan?.dibuat_pada ?? k.dibuat_pada,
          belum_dibaca: belumPer.get(k.id) ?? 0,
        };
      }),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      target_id?: string;
      kontak_id?: string;
      isi?: string;
      nyala?: boolean;
    };
    const db = supabase();
    const pengawas = PENGAWAS.has(user.role);

    // --- Sakelar fitur chat (khusus pengawas) ---
    if (body.aksi === "sakelar") {
      if (!pengawas) {
        throw Object.assign(new Error("Hanya super admin yang boleh mengatur fitur chat."), {
          status: 403,
        });
      }
      const nyala = body.nyala !== false;
      await db.from("pengaturan_sistem").upsert(
        {
          kunci: KUNCI_SAKELAR,
          nilai: nyala ? "true" : "false",
          diubah_pada: new Date().toISOString(),
        },
        { onConflict: "kunci" },
      );
      return { sukses: true, chat_aktif: nyala };
    }

    // Chat yang dimatikan berlaku untuk semua KECUALI pengawas —
    // supaya jalur komunikasi darurat tidak ikut terkunci.
    if (!pengawas && (body.aksi === "mulai" || body.aksi === "kirim")) {
      if (!(await chatAktif())) {
        throw Object.assign(
          new Error("Fitur chat sedang dimatikan sementara oleh super admin."),
          { status: 403 },
        );
      }
    }

    // --- Mulai percakapan (butuh accept lawan) ---
    if (body.aksi === "mulai") {
      const targetId = Number(body.target_id);
      if (!targetId || targetId === idKu) {
        throw Object.assign(new Error("Pilih lawan bicara."), { status: 400 });
      }
      const { data: target } = await db
        .from("app_user")
        .select("id, nama, aktif, status")
        .eq("id", targetId)
        .maybeSingle();
      if (!target || !target.aktif || target.status !== "aktif") {
        throw Object.assign(new Error("Pengguna tidak ditemukan."), { status: 404 });
      }

      const { kecil, besar } = pasangan(idKu, targetId);
      const { data: kontak, error } = await db
        .from("chat_kontak")
        .insert({
          user_kecil: kecil,
          user_besar: besar,
          diminta_oleh: idKu,
          // Pengawas tidak perlu menunggu persetujuan: percakapannya
          // langsung terbuka supaya bisa menghubungi siapa pun seketika.
          status: pengawas ? "diterima" : "menunggu",
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") {
          throw Object.assign(
            new Error("Percakapan dengan orang ini sudah ada — buka dari daftar chat."),
            { status: 409 },
          );
        }
        console.error("[chat] mulai:", error.message);
        throw new Error("Gagal memulai percakapan.");
      }

      // Pesan perkenalan opsional ikut terkirim bersama ajakan.
      if ((body.isi ?? "").trim()) {
        const isi = bersihkanIsi(body.isi ?? "");
        await db
          .from("chat_pesan")
          .insert({ kontak_id: kontak.id, pengirim_id: idKu, isi });
      }

      await kirimKabar({
        judul: pengawas ? `Pesan dari ${user.nama}` : `Ajakan chat dari ${user.nama}`,
        isi: pengawas
          ? "Buka tab Chat untuk membalas."
          : "Buka tab Chat untuk menerima atau menolak.",
        kategori: "info",
        jenis_peristiwa: "chat",
        target: "chat",
        untukUserIds: [targetId],
      });
      return { sukses: true, kontak_id: String(kontak.id) };
    }

    // --- Terima / tolak ajakan ---
    if (body.aksi === "terima" || body.aksi === "tolak") {
      const kontakId = Number(body.kontak_id);
      const { data: kontak } = await db
        .from("chat_kontak")
        .select("id, user_kecil, user_besar, diminta_oleh, status")
        .eq("id", kontakId)
        .maybeSingle();
      const pesertanya =
        kontak && (Number(kontak.user_kecil) === idKu || Number(kontak.user_besar) === idKu);
      if (!kontak || !pesertanya) {
        throw Object.assign(new Error("Percakapan tidak ditemukan."), { status: 404 });
      }
      if (kontak.status !== "menunggu") {
        throw Object.assign(new Error("Ajakan ini sudah dijawab."), { status: 409 });
      }
      // Hanya pihak yang DIAJAK yang boleh menjawab.
      if (Number(kontak.diminta_oleh) === idKu) {
        throw Object.assign(new Error("Menunggu jawaban lawan bicara."), { status: 403 });
      }

      if (body.aksi === "terima") {
        await db.from("chat_kontak").update({ status: "diterima" }).eq("id", kontakId);
        await kirimKabar({
          judul: `${user.nama} menerima ajakan chat Anda`,
          isi: "Percakapan sudah terbuka.",
          kategori: "sukses",
          jenis_peristiwa: "chat",
          target: "chat",
          untukUserIds: [Number(kontak.diminta_oleh)],
        });
      } else {
        await db.from("chat_kontak").delete().eq("id", kontakId);
      }
      return { sukses: true };
    }

    // --- Kirim pesan ---
    if (body.aksi === "kirim") {
      const kontakId = Number(body.kontak_id);
      const isi = bersihkanIsi(body.isi ?? "");
      const { data: kontak } = await db
        .from("chat_kontak")
        .select("id, user_kecil, user_besar, status")
        .eq("id", kontakId)
        .maybeSingle();
      const pesertanya =
        kontak && (Number(kontak.user_kecil) === idKu || Number(kontak.user_besar) === idKu);
      if (!kontak || !pesertanya) {
        throw Object.assign(new Error("Percakapan tidak ditemukan."), { status: 404 });
      }
      if (kontak.status !== "diterima") {
        throw Object.assign(
          new Error("Percakapan belum diterima lawan bicara."),
          { status: 403 },
        );
      }

      const { data: pesan, error } = await db
        .from("chat_pesan")
        .insert({ kontak_id: kontakId, pengirim_id: idKu, isi })
        .select("id, dibuat_pada")
        .single();
      if (error) {
        console.error("[chat] kirim:", error.message);
        throw new Error("Gagal mengirim pesan.");
      }

      // Push saja — riwayat pesan hidup di layar Chat, bukan di daftar
      // notifikasi (hanyaPush mencegah daftar itu kebanjiran).
      const lawanId =
        Number(kontak.user_kecil) === idKu ? Number(kontak.user_besar) : Number(kontak.user_kecil);
      await kirimKabar({
        judul: user.nama,
        isi: isi.slice(0, 120),
        kategori: "info",
        jenis_peristiwa: "chat",
        target: "chat",
        untukUserIds: [lawanId],
        hanyaPush: true,
      });

      after(bersihkanPesanLama);
      return { sukses: true, id: String(pesan.id), dibuat_pada: pesan.dibuat_pada };
    }

    throw Object.assign(new Error("Aksi tidak dikenali."), { status: 400 });
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as { kontak_id?: string };
    const kontakId = Number(body.kontak_id);
    if (!kontakId) throw Object.assign(new Error("Percakapan tidak disebutkan."), { status: 400 });

    const db = supabase();
    const { data: kontak } = await db
      .from("chat_kontak")
      .select("id, user_kecil, user_besar")
      .eq("id", kontakId)
      .maybeSingle();
    if (!kontak || (Number(kontak.user_kecil) !== idKu && Number(kontak.user_besar) !== idKu)) {
      throw Object.assign(new Error("Percakapan tidak ditemukan."), { status: 404 });
    }

    await db
      .from("chat_pesan")
      .update({ dibaca: true })
      .eq("kontak_id", kontakId)
      .neq("pengirim_id", idKu)
      .eq("dibaca", false);
    return { sukses: true };
  });
}

/**
 * DELETE — hapus satu percakapan beserta pesannya.
 *
 * Dua pintu:
 * - PESERTA percakapan boleh menghapus percakapannya sendiri.
 * - PENGAWAS (super admin/master) boleh menghapus percakapan siapa pun.
 * Pesan ikut terhapus lewat ON DELETE CASCADE.
 */
export async function DELETE(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const idKu = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as { kontak_id?: string };
    const kontakId = Number(body.kontak_id);
    if (!kontakId) throw Object.assign(new Error("Percakapan tidak disebutkan."), { status: 400 });

    const db = supabase();
    const { data: kontak } = await db
      .from("chat_kontak")
      .select("id, user_kecil, user_besar")
      .eq("id", kontakId)
      .maybeSingle();
    if (!kontak) throw Object.assign(new Error("Percakapan tidak ditemukan."), { status: 404 });

    const peserta =
      Number(kontak.user_kecil) === idKu || Number(kontak.user_besar) === idKu;
    if (!peserta && !PENGAWAS.has(user.role)) {
      throw Object.assign(new Error("Anda tidak berwenang menghapus percakapan ini."), {
        status: 403,
      });
    }

    const { error } = await db.from("chat_kontak").delete().eq("id", kontakId);
    if (error) {
      console.error("[chat] hapus:", error.message);
      throw new Error("Gagal menghapus percakapan.");
    }
    return { sukses: true };
  });
}
