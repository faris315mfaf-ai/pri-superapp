// Panel Master — kewenangan yang HANYA dimiliki peran 'master'.
//
// GET  → ringkasan sistem + log galat aplikasi + daftar akun wajib QC
// POST → { aksi }
//        "beri_peran_khusus"  : menetapkan peran tersembunyi
//                               (super_admin / admin_tv / admin_hr)
//        "tambah_akun_wajib"  : tambah akun yang wajib dikomentari
//        "hapus_akun_wajib"   : hapus akun wajib
//        "cabut_sesi"         : paksa satu pengguna keluar dari semua
//                               perangkatnya
//        "bersihkan_log"      : kosongkan log galat
//
// Kenapa terpisah dari /api/pengguna: sejak v1.7 panel super admin
// hanya boleh memberi peran Ketua/Anggota. Peran istimewa tetap perlu
// bisa diberikan — tetapi hanya oleh master, dan lewat pintu sendiri
// yang jelas terlihat di kode maupun di layar.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { hapusCacheUser, userDariToken, cabutSemuaSesi } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import { buatHashSandi } from "@/lib/sandi";

export const dynamic = "force-dynamic";

const PERAN_KHUSUS = ["super_admin", "admin_tv", "admin_hr", "ketua", "anggota"] as const;
const PLATFORM_QC = new Set(["instagram", "tiktok"]);

function tokenDari(request: Request): string {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** Hanya master. Bukan super admin, bukan siapa pun yang lain. */
async function pastikanMaster(request: Request) {
  const user = await userDariToken(tokenDari(request));
  if (!user) throw Object.assign(new Error("Sesi tidak berlaku"), { status: 401 });
  if (user.role !== "master") {
    // Pesan sengaja netral: keberadaan panel ini tidak perlu
    // diiklankan kepada peran lain.
    throw Object.assign(new Error("Halaman tidak ditemukan."), { status: 404 });
  }
  return user;
}

/** Bucket foto yang boleh dijelajahi master (spek 1.15). */
const BUCKET_FOTO = ["avatar", "absensi", "chat", "momen"] as const;

export async function GET(request: Request) {
  return bungkus(async () => {
    await pastikanMaster(request);
    const db = supabase();
    const url = new URL(request.url);

    // --- Database foto (spek 1.15): master menjelajah unggahan ---
    // Semua bucket diakses lewat signed URL 1 jam (termasuk yang
    // publik — satu jalur, satu perilaku), berhalaman 24 file.
    const bucketFoto = url.searchParams.get("foto");
    if (bucketFoto) {
      if (!(BUCKET_FOTO as readonly string[]).includes(bucketFoto)) {
        throw Object.assign(new Error("Bucket tidak dikenal."), { status: 400 });
      }
      const halaman = Math.max(1, Number(url.searchParams.get("halaman") ?? 1));
      const PER_HALAMAN = 24;

      // Storage Supabase menata file per folder — daftar folder level
      // atas dulu, lalu isi tiap folder, supaya file di dalam folder
      // (mis. avatar/<user_id>/x.jpg) ikut terlihat.
      const { data: level1 } = await db.storage
        .from(bucketFoto)
        .list("", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
      const jalurSemua: { path: string; dibuat: string }[] = [];
      const folder: string[] = [];
      for (const o of level1 ?? []) {
        if (o.id) jalurSemua.push({ path: o.name, dibuat: o.created_at ?? "" });
        else folder.push(o.name);
      }
      // Isi folder (maks 40 folder terbaru — cukup untuk penelusuran;
      // bucket sangat besar tetap terlayani lewat halaman berikutnya).
      for (const f of folder.slice(0, 40)) {
        const { data: isi } = await db.storage
          .from(bucketFoto)
          .list(f, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
        for (const o of isi ?? []) {
          if (o.id) jalurSemua.push({ path: `${f}/${o.name}`, dibuat: o.created_at ?? "" });
        }
      }
      jalurSemua.sort((a, b) => b.dibuat.localeCompare(a.dibuat));

      const potongan = jalurSemua.slice((halaman - 1) * PER_HALAMAN, halaman * PER_HALAMAN);
      const { data: tanda } = await db.storage
        .from(bucketFoto)
        .createSignedUrls(potongan.map((p) => p.path), 3600);
      const urlPer = new Map((tanda ?? []).map((t) => [t.path, t.signedUrl]));

      return {
        bucket: bucketFoto,
        total: jalurSemua.length,
        halaman,
        per_halaman: PER_HALAMAN,
        data: potongan.map((p) => ({
          path: p.path,
          dibuat: p.dibuat,
          url: urlPer.get(p.path) ?? "",
        })),
      };
    }

    const [
      { data: log },
      { data: akunWajib },
      { count: jumlahUser },
      { count: jumlahChat },
      { count: jumlahVideo },
      { data: pengaturan },
    ] = await Promise.all([
      db
        .from("log_klien")
        .select("id, waktu, jenis, pesan, versi, user_agent")
        .order("id", { ascending: false })
        .limit(30),
      db
        .from("akun_wajib")
        .select("id, username, platform, nama_tampilan, aktif")
        .order("platform")
        .order("username"),
      db.from("app_user").select("id", { count: "exact", head: true }).eq("aktif", true),
      db.from("chat_kontak").select("id", { count: "exact", head: true }),
      db.from("video_antrian").select("kode", { count: "exact", head: true }),
      db.from("pengaturan_sistem").select("kunci, nilai"),
    ]);

    return {
      ringkasan: {
        pengguna_aktif: jumlahUser ?? 0,
        percakapan: jumlahChat ?? 0,
        video: jumlahVideo ?? 0,
        galat: (log ?? []).filter((l) => l.jenis !== "uji").length,
      },
      log: (log ?? []).map((l) => ({
        id: String(l.id),
        waktu: l.waktu,
        jenis: l.jenis,
        pesan: String(l.pesan ?? "").slice(0, 300),
        versi: l.versi ?? "",
        perangkat: String(l.user_agent ?? "").slice(0, 60),
      })),
      akun_wajib: (akunWajib ?? []).map((a) => ({
        id: String(a.id),
        username: a.username,
        platform: a.platform,
        nama_tampilan: a.nama_tampilan ?? "",
        aktif: a.aktif,
      })),
      pengaturan: Object.fromEntries(
        (pengaturan ?? [])
          .filter((p) => !String(p.kunci).startsWith("ayrshare_"))
          .map((p) => [p.kunci, p.nilai]),
      ),
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const master = await pastikanMaster(request);
    const body = (await request.json().catch(() => ({}))) as {
      aksi?: string;
      nilai?: boolean | string;
      user_id?: string;
      role?: string;
      username?: string;
      platform?: string;
      id?: string;
    };
    const db = supabase();

    // --- Peran istimewa (tidak tersedia di panel super admin) ---
    if (body.aksi === "beri_peran_khusus") {
      const id = Number(body.user_id);
      const peran = String(body.role ?? "");
      if (!id) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });
      if (!(PERAN_KHUSUS as readonly string[]).includes(peran)) {
        throw Object.assign(new Error("Peran tidak dikenal."), { status: 400 });
      }
      if (String(id) === master.id) {
        throw Object.assign(new Error("Peran akun master tidak bisa diubah dari sini."), {
          status: 400,
        });
      }

      const { data: target } = await db
        .from("app_user")
        .select("id, nama, role")
        .eq("id", id)
        .maybeSingle();
      if (!target || target.role === "master") {
        throw Object.assign(new Error("Akun tidak ditemukan."), { status: 404 });
      }

      const { error } = await db
        .from("app_user")
        .update({ role: peran, status: "aktif", aktif: true })
        .eq("id", id);
      if (error) {
        console.error("[master] beri peran:", error.message);
        throw new Error("Gagal menetapkan peran.");
      }

      // Hak akses berubah → sesi lama harus dicabut, kalau tidak
      // perangkat yang sudah masuk tetap memegang hak yang lama.
      // (cabutSemuaSesi sudah membuang cache; hapusCacheUser di sini
      // menjaga bila urutannya berubah kelak.)
      await hapusCacheUser(id);
      await cabutSemuaSesi(id);
      await kirimKabar({
        judul: "Peran akun Anda diperbarui",
        isi: `Peran Anda kini ${peran}. Masuk kembali untuk memakai akses barunya.`,
        kategori: "info",
        jenis_peristiwa: "peran",
        untukUserIds: [id],
      });
      return { sukses: true };
    }

    // --- Akun wajib QC ---
    if (body.aksi === "tambah_akun_wajib") {
      const platform = String(body.platform ?? "").toLowerCase();
      const username = String(body.username ?? "")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase();
      if (!PLATFORM_QC.has(platform)) {
        throw Object.assign(new Error("Platform QC hanya Instagram atau TikTok."), {
          status: 400,
        });
      }
      if (!/^[a-z0-9._]{2,30}$/.test(username)) {
        throw Object.assign(new Error("Username tidak valid."), { status: 400 });
      }
      const { error } = await db
        .from("akun_wajib")
        .insert({ username, platform, nama_tampilan: username, aktif: true });
      if (error) {
        if (error.code === "23505") {
          throw Object.assign(new Error("Akun itu sudah ada di daftar wajib."), { status: 409 });
        }
        console.error("[master] tambah akun wajib:", error.message);
        throw new Error("Gagal menambahkan akun wajib.");
      }
      return { sukses: true };
    }

    if (body.aksi === "hapus_akun_wajib") {
      const id = Number(body.id);
      if (!id) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });
      const { error } = await db.from("akun_wajib").delete().eq("id", id);
      if (error) throw new Error("Gagal menghapus akun wajib.");
      return { sukses: true };
    }

    // --- Paksa keluar dari semua perangkat ---
    if (body.aksi === "cabut_sesi") {
      const id = Number(body.user_id);
      if (!id) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });
      await cabutSemuaSesi(id);
      return { sukses: true };
    }

    // --- Sakelar mode perbaikan: hanya master yang bisa masuk ---
    if (body.aksi === "mode_perbaikan") {
      const nyala = body.nilai === true;
      const { error } = await db.from("pengaturan_sistem").upsert(
        { kunci: "mode_perbaikan", nilai: nyala ? "true" : "false" },
        { onConflict: "kunci" },
      );
      if (error) throw new Error("Gagal menyimpan mode perbaikan.");
      return { sukses: true, mode_perbaikan: nyala };
    }

    // --- Reset sandi (spek 1.15 akses master) ---
    // Sandi TIDAK PERNAH bisa DIBACA siapa pun (tersimpan sebagai hash
    // satu-arah) — kemampuan master adalah MENGGANTINYA untuk membantu
    // pengguna yang lupa. Semua sesi lama dicabut demi keamanan, dan
    // pemiliknya diberi tahu lewat notifikasi.
    if (body.aksi === "reset_sandi") {
      const id = Number(body.user_id);
      const sandiBaru = String(body.nilai ?? "");
      if (!id) throw Object.assign(new Error("Akun tidak disebutkan."), { status: 400 });
      if (sandiBaru.length < 8) {
        throw Object.assign(new Error("Sandi baru minimal 8 karakter."), { status: 400 });
      }
      const { data: target } = await db
        .from("app_user")
        .select("id, nama, role")
        .eq("id", id)
        .maybeSingle();
      if (!target) throw Object.assign(new Error("Akun tidak ditemukan."), { status: 404 });
      // Master tidak bisa me-reset master lain lewat jalur ini —
      // mencegah pengambilalihan akun tertinggi secara diam-diam.
      if (target.role === "master" && String(id) !== String(master.id)) {
        throw Object.assign(new Error("Sandi sesama master tidak bisa di-reset."), {
          status: 403,
        });
      }

      const { error } = await db
        .from("app_user")
        .update({ password_hash: await buatHashSandi(sandiBaru) })
        .eq("id", id);
      if (error) throw new Error("Gagal mengganti sandi.");
      await cabutSemuaSesi(id);
      await hapusCacheUser(id);
      await kirimKabar({
        judul: "Sandi akun Anda di-reset",
        isi: "Master mengganti sandi akun Anda. Masuk lagi dengan sandi baru dari pengurus.",
        kategori: "peringatan",
        jenis_peristiwa: "keamanan",
        untukUserIds: [id],
      });
      return { sukses: true };
    }

    // --- Bersihkan log galat ---
    if (body.aksi === "bersihkan_log") {
      const { error } = await db.from("log_klien").delete().gt("id", 0);
      if (error) throw new Error("Gagal membersihkan log.");
      return { sukses: true };
    }

    throw Object.assign(new Error("Aksi tidak dikenali."), { status: 400 });
  });
}
