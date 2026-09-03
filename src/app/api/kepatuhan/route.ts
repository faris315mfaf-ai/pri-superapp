// /api/kepatuhan — rincian kepatuhan komen per orang + AJUAN komentar
// (3 Sep 2026). Dipakai pop-up di leaderboard "Kepatuhan Komen".
//
// GET  ?nama=<nama>[&periode=]  → semua postingan wajib periode itu untuk
//        orang tsb: sudah/belum komen, link, jam unggah, sosmed, akun; plus
//        daftar username terdaftar ORANG ITU (ditampilkan di atas pop-up dan
//        jadi pilihan saat "Ajukan") — berlaku untuk siapa pun yang membuka.
// GET  ?ajuan=1                  → (Divisi PALUGODAM / pengurus) antrean ajuan.
// POST { id_postingan, periode?, username_komentar, catatan?, nama? }
//        → mengajukan "sudah komen tapi belum tercatat". `nama` kosong =
//        diri sendiri; terisi = atas nama orang lain (3 Sep 2026: fitur
//        berlaku untuk semua pengguna; pengaju dicatat di diajukan_oleh).
// PATCH { id, aksi: setuju|tolak, catatan? }
//        → PALUGODAM memutuskan; setuju = rekap dipaksa Comply.
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { adalahPalugodam, DIVISI_PALUGODAM } from "@/lib/struktur";
import { periodeMasihBerjalan, periodeSaatIni } from "@/lib/periode-qc";
import { kirimKabar } from "@/lib/notifikasi";

export const dynamic = "force-dynamic";

const PLATFORM_SAH = new Set(["instagram", "tiktok", "youtube", "facebook", "threads", "twitter"]);

function bersihUsername(u: string): string {
  return u.trim().toLowerCase().replace(/^@+/, "");
}

/** id app_user aktif berdasarkan nama (nama = kunci yang dipakai rekap.nama_kader). */
async function idUserDariNama(db: ReturnType<typeof supabase>, nama: string): Promise<number | null> {
  const { data } = await db.from("app_user").select("id").eq("nama", nama).eq("aktif", true).limit(1).maybeSingle();
  return data ? Number(data.id) : null;
}

/** Username terdaftar (aktif) milik satu pengguna, urut platform. */
async function akunTerdaftar(db: ReturnType<typeof supabase>, userId: number | null) {
  if (!userId) return [] as { platform: string; username: string }[];
  const { data } = await db
    .from("akun_sosmed_user")
    .select("platform, username")
    .eq("user_id", userId)
    .eq("aktif", true)
    .order("platform");
  return (data ?? []).map((a) => ({ platform: String(a.platform), username: String(a.username) }));
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const url = new URL(request.url);

    // ---------- Antrean ajuan (PALUGODAM / pengurus) ----------
    if (url.searchParams.get("ajuan") === "1") {
      if (!adalahPalugodam(user)) {
        throw Object.assign(new Error("Khusus Divisi PALUGODAM / pengurus."), { status: 403 });
      }
      const [{ data: menunggu }, { data: terakhir }] = await Promise.all([
        db
          .from("komentar_ajuan")
          .select("*")
          .eq("status", "menunggu")
          .order("dibuat_pada", { ascending: true })
          .limit(200),
        db
          .from("komentar_ajuan")
          .select("*")
          .neq("status", "menunggu")
          .order("diputus_pada", { ascending: false })
          .limit(20),
      ]);
      const semua = [...(menunggu ?? []), ...(terakhir ?? [])];
      const ids = [...new Set(semua.map((a) => Number(a.user_id)))];
      const postIds = [...new Set(semua.map((a) => String(a.id_postingan)))];
      const [{ data: orang }, { data: post }] = await Promise.all([
        ids.length ? db.from("app_user").select("id, avatar_url").in("id", ids) : Promise.resolve({ data: [] as { id: unknown; avatar_url: unknown }[] }),
        postIds.length
          ? db.from("postingan").select("id_postingan, waktu_posting, caption_asli").in("id_postingan", postIds)
          : Promise.resolve({ data: [] as { id_postingan: unknown; waktu_posting: unknown; caption_asli: unknown }[] }),
      ]);
      const avatarPer = new Map((orang ?? []).map((o) => [Number(o.id), String(o.avatar_url ?? "")]));
      const postPer = new Map((post ?? []).map((p) => [String(p.id_postingan), p]));
      const rapikan = (a: Record<string, unknown>) => ({
        id: String(a.id),
        periode: String(a.periode),
        nama_kader: String(a.nama_kader),
        user_id: String(a.user_id),
        avatar_url: avatarPer.get(Number(a.user_id)) ?? "",
        id_postingan: String(a.id_postingan),
        platform: String(a.platform),
        akun_wajib: String(a.akun_wajib ?? ""),
        url_postingan: String(a.url_postingan ?? ""),
        username_komentar: String(a.username_komentar),
        catatan: String(a.catatan ?? ""),
        status: String(a.status),
        catatan_putusan: String(a.catatan_putusan ?? ""),
        diputus_oleh: a.diputus_oleh == null ? null : String(a.diputus_oleh),
        diajukan_oleh: String(a.diajukan_oleh ?? ""),
        dibuat_pada: String(a.dibuat_pada),
        waktu_posting: postPer.get(String(a.id_postingan))?.waktu_posting ?? null,
        caption: String(postPer.get(String(a.id_postingan))?.caption_asli ?? "").slice(0, 160),
      });
      return { menunggu: (menunggu ?? []).map(rapikan), terakhir: (terakhir ?? []).map(rapikan) };
    }

    // ---------- Rincian satu orang ----------
    const nama = (url.searchParams.get("nama") ?? "").trim() || user.nama;
    const periode = (url.searchParams.get("periode") ?? "").trim() || periodeSaatIni();
    const milikSendiri = nama === user.nama;
    // Akun terdaftar ORANG ITU — siapa pun yang membuka pop-up melihatnya dan
    // bisa memakainya untuk mengajukan atas nama orang tersebut.
    const targetId = milikSendiri ? Number(user.id) : await idUserDariNama(db, nama);
    const [{ data: rekap }, { data: ajuan }, akun] = await Promise.all([
      db
        .from("rekap")
        .select("id_postingan, platform, akun_wajib, url_postingan, jumlah_komentar, status, keterangan")
        .eq("periode", periode)
        .eq("nama_kader", nama)
        .limit(500),
      db
        .from("komentar_ajuan")
        .select("id, id_postingan, status, username_komentar, catatan_putusan")
        .eq("periode", periode)
        .eq("nama_kader", nama),
      akunTerdaftar(db, targetId),
    ]);
    const postIds = [...new Set((rekap ?? []).map((r) => String(r.id_postingan)))];
    const { data: post } = postIds.length
      ? await db
          .from("postingan")
          .select("id_postingan, waktu_posting, caption_asli, thumbnail_url")
          .in("id_postingan", postIds)
      : { data: [] as { id_postingan: unknown; waktu_posting: unknown; caption_asli: unknown; thumbnail_url: unknown }[] };
    const postPer = new Map((post ?? []).map((p) => [String(p.id_postingan), p]));
    const ajuanPer = new Map((ajuan ?? []).map((a) => [String(a.id_postingan), a]));

    const daftar = (rekap ?? [])
      .map((r) => {
        const p = postPer.get(String(r.id_postingan));
        const a = ajuanPer.get(String(r.id_postingan));
        return {
          id_postingan: String(r.id_postingan),
          platform: String(r.platform),
          akun_wajib: String(r.akun_wajib ?? ""),
          url_postingan: String(r.url_postingan ?? ""),
          waktu_posting: p?.waktu_posting ? String(p.waktu_posting) : null,
          caption: String(p?.caption_asli ?? "").slice(0, 160),
          thumbnail_url: String(p?.thumbnail_url ?? ""),
          sudah: String(r.status) === "Comply",
          jumlah: Number(r.jumlah_komentar ?? 0),
          keterangan: String(r.keterangan ?? ""),
          ajuan: a
            ? {
                id: String(a.id),
                status: String(a.status),
                username_komentar: String(a.username_komentar),
                catatan_putusan: String(a.catatan_putusan ?? ""),
              }
            : null,
        };
      })
      .sort((x, y) => (y.waktu_posting ?? "").localeCompare(x.waktu_posting ?? ""));
    return {
      periode,
      nama,
      milik_sendiri: milikSendiri,
      terdaftar: targetId != null,
      akun,
      total: daftar.length,
      sudah: daftar.filter((d) => d.sudah).length,
      daftar,
    };
  });
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const body = (await request.json().catch(() => ({}))) as {
      id_postingan?: string;
      periode?: string;
      username_komentar?: string;
      catatan?: string;
      nama?: string;
    };
    const idPost = String(body.id_postingan ?? "").trim();
    const periode = String(body.periode ?? "").trim() || periodeSaatIni();
    const username = bersihUsername(String(body.username_komentar ?? ""));
    const catatan = String(body.catatan ?? "").trim().slice(0, 300);
    // Atas nama siapa: kosong / sama dengan diri sendiri = diri sendiri.
    const namaTarget = String(body.nama ?? "").trim() || user.nama;
    const atasNamaLain = namaTarget !== user.nama;
    const sebutan = atasNamaLain ? namaTarget : "Anda";
    if (!idPost) throw Object.assign(new Error("Postingan tidak disebutkan."), { status: 400 });
    if (!username) throw Object.assign(new Error(`Pilih username yang ${sebutan} pakai berkomentar.`), { status: 400 });
    if (!periodeMasihBerjalan(periode)) {
      throw Object.assign(new Error("Periode itu sudah lewat — ajuan hanya untuk periode berjalan."), { status: 400 });
    }
    const targetId = atasNamaLain ? await idUserDariNama(db, namaTarget) : Number(user.id);
    if (!targetId) throw Object.assign(new Error(`Pengguna "${namaTarget}" tidak ditemukan / tidak aktif.`), { status: 404 });

    const { data: baris } = await db
      .from("rekap")
      .select("platform, akun_wajib, url_postingan, status")
      .eq("periode", periode)
      .eq("nama_kader", namaTarget)
      .eq("id_postingan", idPost)
      .maybeSingle();
    if (!baris) throw Object.assign(new Error(`Postingan ini tidak ada dalam kewajiban ${sebutan}.`), { status: 404 });
    if (String(baris.status) === "Comply") {
      throw Object.assign(new Error(`Komentar ${sebutan} di postingan ini sudah tercatat.`), { status: 409 });
    }
    const platform = String(baris.platform);
    if (!PLATFORM_SAH.has(platform)) throw Object.assign(new Error("Platform tidak dikenal."), { status: 400 });

    // Username harus salah satu akun sosmed terdaftar milik ORANG YANG DIAJUKAN
    // di platform itu (bukan milik pengaju bila atas nama orang lain).
    const { data: akun } = await db
      .from("akun_sosmed_user")
      .select("username")
      .eq("user_id", targetId)
      .eq("platform", platform)
      .eq("aktif", true);
    const terdaftar = (akun ?? []).map((a) => bersihUsername(String(a.username)));
    if (!terdaftar.includes(username)) {
      throw Object.assign(
        new Error(
          atasNamaLain
            ? `@${username} belum terdaftar sebagai akun ${platform} ${namaTarget}. Minta yang bersangkutan mendaftarkannya di Profil → Akun Media Sosial.`
            : `@${username} belum terdaftar sebagai akun ${platform} Anda. Daftarkan dulu di Profil → Akun Media Sosial.`,
        ),
        { status: 400 },
      );
    }

    const { data: lama } = await db
      .from("komentar_ajuan")
      .select("id, status")
      .eq("periode", periode)
      .eq("user_id", targetId)
      .eq("id_postingan", idPost)
      .maybeSingle();
    if (lama && String(lama.status) === "menunggu") {
      throw Object.assign(new Error("Ajuan untuk postingan ini masih menunggu pemeriksaan."), { status: 409 });
    }
    if (lama && String(lama.status) === "disetujui") {
      throw Object.assign(new Error("Ajuan untuk postingan ini sudah disetujui."), { status: 409 });
    }
    const kolom = {
      periode,
      user_id: targetId,
      nama_kader: namaTarget,
      diajukan_oleh: atasNamaLain ? user.nama : "",
      id_postingan: idPost,
      platform,
      akun_wajib: String(baris.akun_wajib ?? ""),
      url_postingan: String(baris.url_postingan ?? ""),
      username_komentar: username,
      catatan,
      status: "menunggu",
      diputus_oleh: null,
      diputus_pada: null,
      catatan_putusan: "",
      dibuat_pada: new Date().toISOString(),
    };
    const { error } = lama
      ? await db.from("komentar_ajuan").update(kolom).eq("id", lama.id)
      : await db.from("komentar_ajuan").insert(kolom);
    if (error) throw new Error("Gagal menyimpan ajuan.");

    // Kabari seluruh anggota aktif Divisi PALUGODAM.
    const { data: palugodam } = await db
      .from("app_user")
      .select("id")
      .eq("divisi", DIVISI_PALUGODAM)
      .eq("aktif", true)
      .eq("status", "aktif");
    const ids = (palugodam ?? []).map((p) => Number(p.id));
    if (ids.length > 0) {
      await kirimKabar({
        judul: "Ajuan komentar menunggu QC",
        isi: atasNamaLain
          ? `${user.nama} mengajukan atas nama ${namaTarget}: sudah berkomentar (@${username}) di ${platform} ${baris.akun_wajib}. Periksa di TV Rakyat Saya → ACC Ajuan Komentar.`
          : `${user.nama} mengajukan sudah berkomentar (@${username}) di ${platform} ${baris.akun_wajib}. Periksa di TV Rakyat Saya → ACC Ajuan Komentar.`,
        kategori: "info",
        jenis_peristiwa: "komentar_ajuan",
        untukUserIds: ids,
      });
    }
    // Orang yang diajukan ikut diberi tahu supaya tidak kaget saat ada putusan.
    if (atasNamaLain) {
      await kirimKabar({
        judul: "Ajuan komentar atas nama Anda",
        isi: `${user.nama} mengajukan bahwa Anda sudah berkomentar (@${username}) di ${platform} ${baris.akun_wajib}. Menunggu pemeriksaan Divisi PALUGODAM.`,
        kategori: "info",
        jenis_peristiwa: "komentar_ajuan",
        untukUserIds: [targetId],
      });
    }
    return { sukses: true };
  });
}

export async function PATCH(request: Request) {
  return bungkus(async () => {
    const admin = await pastikanMasuk(request);
    if (!adalahPalugodam(admin)) {
      throw Object.assign(new Error("Khusus Divisi PALUGODAM / pengurus."), { status: 403 });
    }
    const db = supabase();
    const body = (await request.json().catch(() => ({}))) as { id?: string; aksi?: string; catatan?: string };
    const id = Number(body.id);
    const aksi = body.aksi === "setuju" ? "setuju" : body.aksi === "tolak" ? "tolak" : "";
    const catatan = String(body.catatan ?? "").trim().slice(0, 300);
    if (!id || !aksi) throw Object.assign(new Error("Permintaan tidak lengkap."), { status: 400 });
    if (aksi === "tolak" && !catatan) {
      throw Object.assign(new Error("Tulis alasan penolakan (dibaca pengajunya)."), { status: 400 });
    }
    const { data: a } = await db.from("komentar_ajuan").select("*").eq("id", id).eq("status", "menunggu").maybeSingle();
    if (!a) throw Object.assign(new Error("Ajuan sudah diputus / tidak ada."), { status: 404 });

    const kini = new Date().toISOString();
    if (aksi === "setuju") {
      // Rekap dipaksa Comply. Mesin analisis juga menghormati ajuan disetujui,
      // jadi sinkron realtime berikutnya tidak menimpa keputusan ini.
      const idUnik = `${a.periode}|||${a.nama_kader}|||${a.platform}|||${a.akun_wajib}|||${a.id_postingan}`;
      const { data: lama } = await db.from("rekap").select("jumlah_komentar, nomor_wa").eq("id_unik", idUnik).maybeSingle();
      const { error } = await db.from("rekap").upsert(
        {
          id_unik: idUnik,
          periode: a.periode,
          nama_kader: a.nama_kader,
          nomor_wa: String(lama?.nomor_wa ?? ""),
          platform: a.platform,
          akun_wajib: a.akun_wajib,
          id_postingan: a.id_postingan,
          url_postingan: a.url_postingan,
          jumlah_komentar: Math.max(Number(lama?.jumlah_komentar ?? 0), 1),
          target: 1,
          status: "Comply",
          keterangan: `ACC ajuan (@${a.username_komentar}) oleh ${admin.nama}`,
          updated_at: kini,
        },
        { onConflict: "id_unik" },
      );
      if (error) throw new Error("Gagal memperbarui rekap.");
    }
    await db
      .from("komentar_ajuan")
      .update({
        status: aksi === "setuju" ? "disetujui" : "ditolak",
        diputus_oleh: admin.nama,
        diputus_pada: kini,
        catatan_putusan: catatan,
      })
      .eq("id", id);
    await kirimKabar({
      judul: aksi === "setuju" ? "Ajuan komentar disetujui" : "Ajuan komentar ditolak",
      isi:
        aksi === "setuju"
          ? `Komentar Anda (@${a.username_komentar}) di ${a.platform} ${a.akun_wajib} diakui ${admin.nama} dan sudah dihitung.`
          : `Ajuan komentar Anda di ${a.platform} ${a.akun_wajib} ditolak ${admin.nama}: ${catatan}`,
      kategori: aksi === "setuju" ? "sukses" : "peringatan",
      jenis_peristiwa: "komentar_ajuan",
      untukUserIds: [Number(a.user_id)],
    });
    return { sukses: true };
  });
}
