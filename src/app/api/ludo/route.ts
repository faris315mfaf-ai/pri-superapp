// /api/ludo — LUDO ROBOT multipemain (3 Sep 2026; TERBUKA untuk semua pengguna).
// Server OTORITATIF: dadu diacak di sini, setiap langkah divalidasi mesin
// aturan lib/ludo.ts, dan pembaruan memakai `versi` (optimistic) supaya dua
// permintaan bersamaan tidak saling menimpa. Klien hanya polling GET ?id=.
//
// Siapa boleh apa:
//   • BUAT ruang: siapa pun yang login.
//   • GABUNG lewat kode / undangan: siapa pun yang login (2–4 pemain).
//   • Karakter tiap pemain = robot pet-nya (fallback robot bawaan bila belum punya).
//
// GET ?daftar=1          → ruang saya (host / ikut / diundang), 10 terakhir
// GET ?cari=<nama>        → calon pemain untuk diundang (maks 20; semua yang login)
// GET ?id=<id>           → satu ruang (giliran kedaluwarsa → langkah otomatis)
// POST { aksi, ... }     → buat | undang | gabung | keluar | mulai | lempar | gerak | batalkan
import { randomInt, randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { bungkus } from "@/lib/api-helper";
import { pastikanMasuk, type UserPublik } from "@/lib/sesi";
import { kirimKabar } from "@/lib/notifikasi";
import {
  BATAS_GILIRAN_MS,
  MAKS_PEMAIN,
  pilihanOtomatis,
  stateAwal,
  terapkanGerak,
  terapkanLemparan,
  type Pemain,
  type RobotPemain,
  type RuangLudo,
  type StateLudo,
} from "@/lib/ludo";

export const dynamic = "force-dynamic";

type Baris = {
  id: number;
  kode: string;
  host_id: number;
  status: "menunggu" | "berjalan" | "selesai";
  pemain: Pemain[] | null;
  undangan: number[] | null;
  state: StateLudo | null;
  versi: number;
  pemenang_id: number | null;
  dibuat_pada: string;
  diperbarui_pada: string;
};
const KOLOM =
  "id, kode, host_id, status, pemain, undangan, state, versi, pemenang_id, dibuat_pada, diperbarui_pada";

function galat(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

/** Kode ruang 6 karakter tanpa huruf/angka yang mirip (0/O, 1/I). */
function buatKode(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(6))
    .map((b) => A[b % A.length])
    .join("");
}

/** Robot pet pemain sebagai karakter; bila belum punya → robot bawaan. */
async function robotPemain(
  db: ReturnType<typeof supabase>,
  userId: number,
  nama: string,
): Promise<RobotPemain> {
  const { data } = await db
    .from("pet_robot")
    .select(
      "jenis, nama, aksesoris_terpasang, sparepart_terpasang, skin_terpasang, warna_custom",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (data) {
    return {
      jenis: data.jenis === "wanita" ? "wanita" : "pria",
      nama: String(data.nama ?? "Robo"),
      terpasang: (data.aksesoris_terpasang as Record<string, string>) ?? {},
      sparepart: (data.sparepart_terpasang as Record<string, string>) ?? {},
      skin: (data.skin_terpasang as string | null) ?? null,
      warna: (data.warna_custom as string | null) ?? null,
    };
  }
  return {
    jenis: userId % 2 === 0 ? "pria" : "wanita",
    nama: `Robo ${nama.split(" ")[0] || ""}`.trim(),
    terpasang: {},
    sparepart: {},
    skin: null,
    warna: null,
  };
}

async function bacaRuang(
  db: ReturnType<typeof supabase>,
  id: number,
): Promise<Baris | null> {
  const { data } = await db
    .from("ludo_game")
    .select(KOLOM)
    .eq("id", id)
    .maybeSingle();
  return (data as Baris | null) ?? null;
}

/** Simpan dengan pemeriksaan versi; gagal = ada pembaruan lain barusan. */
async function simpan(
  db: ReturnType<typeof supabase>,
  b: Baris,
  patch: Partial<Baris>,
): Promise<Baris> {
  const { data, error } = await db
    .from("ludo_game")
    .update({
      ...patch,
      versi: b.versi + 1,
      diperbarui_pada: new Date().toISOString(),
    })
    .eq("id", b.id)
    .eq("versi", b.versi)
    .select(KOLOM)
    .maybeSingle();
  if (error) throw new Error("Gagal menyimpan permainan.");
  if (!data) galat("Permainan baru saja berubah — coba lagi.", 409);
  return data as Baris;
}

async function keRuang(
  db: ReturnType<typeof supabase>,
  b: Baris,
  uid: number,
): Promise<RuangLudo> {
  const pemain = b.pemain ?? [];
  const undanganIds = (b.undangan ?? []).filter(
    (x) => !pemain.some((p) => Number(p.user_id) === Number(x)),
  );
  let undangan: { user_id: string; nama: string }[] = [];
  if (undanganIds.length > 0) {
    const { data } = await db
      .from("app_user")
      .select("id, nama")
      .in("id", undanganIds);
    undangan = (data ?? []).map((u) => ({
      user_id: String(u.id),
      nama: String(u.nama ?? ""),
    }));
  }
  return {
    id: String(b.id),
    kode: b.kode,
    host_id: String(b.host_id),
    status: b.status,
    pemain,
    undangan,
    state: b.state && Object.keys(b.state).length > 0 ? b.state : null,
    versi: b.versi,
    pemenang_id: b.pemenang_id == null ? null : String(b.pemenang_id),
    saya_host: Number(b.host_id) === uid,
    saya_ikut: pemain.some((p) => Number(p.user_id) === uid),
    dibuat_pada: b.dibuat_pada,
  };
}

/** Setelah state berubah: tandai selesai bila ada pemenang. */
function patchState(b: Baris, st: StateLudo): Partial<Baris> {
  const pemain = b.pemain ?? [];
  if (st.pemenang !== null) {
    return {
      state: st,
      status: "selesai",
      pemenang_id: Number(pemain[st.pemenang]?.user_id ?? 0) || null,
    };
  }
  return { state: st };
}

/** Giliran kedaluwarsa → langkah otomatis (dipanggil saat GET). */
async function langkahOtomatisBilaPerlu(
  db: ReturnType<typeof supabase>,
  b: Baris,
): Promise<Baris> {
  if (b.status !== "berjalan" || !b.state) return b;
  const st = b.state;
  if (Date.now() < Date.parse(st.batas)) return b;
  const pemain = b.pemain ?? [];
  try {
    let baru: StateLudo;
    if (st.fase === "lempar") {
      baru = terapkanLemparan(st, pemain, randomInt(1, 7));
      if (baru.fase === "pilih" && baru.pemenang === null)
        baru = terapkanGerak(baru, pemain, pilihanOtomatis(baru));
    } else {
      baru = terapkanGerak(st, pemain, pilihanOtomatis(st));
    }
    baru.log = [
      ...baru.log.slice(-29),
      "(waktu habis — langkah dijalankan otomatis)",
    ];
    return await simpan(db, b, patchState(b, baru));
  } catch {
    // konflik versi = orang lain sudah bergerak; kirim data yang ada
    return (await bacaRuang(db, b.id)) ?? b;
  }
}

function indeksSaya(b: Baris, uid: number): number {
  return (b.pemain ?? []).findIndex((p) => Number(p.user_id) === uid);
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const uid = Number(user.id);
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id") ?? 0);

    // Cari calon pemain untuk diundang. Hanya data tampilan (nama, jabatan,
    // divisi, avatar) — tidak ada nomor WA / email — supaya aman dibuka untuk
    // semua pengguna, bukan hanya pengelola.
    const cari = (url.searchParams.get("cari") ?? "").trim().slice(0, 60);
    if (cari.length > 0) {
      if (cari.length < 2) return { hasil: [] };
      const pola = `%${cari.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const { data } = await db
        .from("app_user")
        .select("id, nama, username, jabatan, divisi, avatar_url")
        .eq("aktif", true)
        .eq("status", "aktif")
        .neq("id", uid)
        .or(`nama.ilike.${pola},username.ilike.${pola}`)
        .order("nama", { ascending: true })
        .limit(20);
      const hasil = ((data ?? []) as Record<string, unknown>[]).map((o) => ({
        id: String(o.id),
        nama: String(o.nama ?? ""),
        username: String(o.username ?? ""),
        jabatan: String(o.jabatan ?? ""),
        divisi: String(o.divisi ?? ""),
        avatar_url: String(o.avatar_url ?? ""),
      }));
      return { hasil };
    }

    if (id > 0) {
      let b = await bacaRuang(db, id);
      if (!b) galat("Ruang tidak ditemukan.", 404);
      b = await langkahOtomatisBilaPerlu(db, b);
      return keRuang(db, b, uid);
    }

    // Daftar ruang saya: host / ikut / diundang — 50 ruang terbaru disaring di sini.
    const { data } = await db
      .from("ludo_game")
      .select(KOLOM)
      .order("diperbarui_pada", { ascending: false })
      .limit(50);
    const milik = ((data ?? []) as Baris[]).filter(
      (b) =>
        Number(b.host_id) === uid ||
        (b.pemain ?? []).some((p) => Number(p.user_id) === uid) ||
        (b.undangan ?? []).some((x) => Number(x) === uid),
    );
    const daftar: RuangLudo[] = [];
    for (const b of milik.slice(0, 10)) daftar.push(await keRuang(db, b, uid));
    return { boleh_buat: true, daftar };
  });
}

async function undangPemain(
  db: ReturnType<typeof supabase>,
  b: Baris,
  host: UserPublik,
  targetId: number,
): Promise<Baris> {
  if (!Number.isFinite(targetId) || targetId <= 0)
    galat("Pemain tidak disebutkan.");
  if (targetId === Number(host.id))
    galat("Tidak bisa mengundang diri sendiri.");
  const { data: orang } = await db
    .from("app_user")
    .select("id, nama, aktif, status")
    .eq("id", targetId)
    .maybeSingle();
  if (!orang || orang.aktif !== true || orang.status !== "aktif")
    galat("Pengguna tidak ditemukan / tidak aktif.", 404);
  if ((b.pemain ?? []).some((p) => Number(p.user_id) === targetId))
    galat(`${orang.nama} sudah ada di ruang.`, 409);
  const undangan = [...new Set([...(b.undangan ?? []).map(Number), targetId])];
  const baru = await simpan(db, b, { undangan });
  await kirimKabar({
    judul: "Undangan main Ludo Robot 🎲",
    isi: `${host.nama} mengundang Anda bermain Ludo Robot. Kode ruang: ${b.kode}. Buka Profil → Ludo Robot, lalu Gabung.`,
    kategori: "info",
    jenis_peristiwa: "ludo",
    untukUserIds: [targetId],
  });
  return baru;
}

export async function POST(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    const db = supabase();
    const uid = Number(user.id);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const aksi = String(body.aksi ?? "");

    if (aksi === "buat") {
      const robot = await robotPemain(db, uid, user.nama);
      const pemain: Pemain[] = [
        {
          user_id: uid,
          nama: user.nama,
          avatar_url: user.avatar_url ?? "",
          warna: 0,
          robot,
        },
      ];
      for (let coba = 0; coba < 5; coba++) {
        const { data, error } = await db
          .from("ludo_game")
          .insert({
            kode: buatKode(),
            host_id: uid,
            status: "menunggu",
            pemain,
            undangan: [],
            state: {},
          })
          .select(KOLOM)
          .maybeSingle();
        if (!error && data) return keRuang(db, data as Baris, uid);
        if (error && error.code !== "23505")
          throw new Error("Gagal membuat ruang.");
      }
      throw new Error("Gagal membuat kode ruang unik.");
    }

    if (aksi === "gabung") {
      const kode = String(body.kode ?? "")
        .trim()
        .toUpperCase();
      if (kode.length !== 6) galat("Kode ruang harus 6 karakter.");
      const { data } = await db
        .from("ludo_game")
        .select(KOLOM)
        .eq("kode", kode)
        .maybeSingle();
      const b = (data as Baris | null) ?? null;
      if (!b) galat("Ruang dengan kode itu tidak ada.", 404);
      const pemain = b.pemain ?? [];
      // Sudah jadi pemain → langsung diantar ke ruangnya (idempoten), apa pun statusnya.
      if (pemain.some((p) => Number(p.user_id) === uid))
        return keRuang(db, b, uid);
      if (b.status !== "menunggu")
        galat("Permainan di ruang itu sudah dimulai / selesai.", 409);
      if (pemain.length >= MAKS_PEMAIN)
        galat("Ruang sudah penuh (4 pemain).", 409);
      const terpakai = new Set(pemain.map((p) => p.warna));
      const warna = [0, 1, 2, 3].find((w) => !terpakai.has(w)) ?? pemain.length;
      const robot = await robotPemain(db, uid, user.nama);
      const baru = await simpan(db, b, {
        pemain: [
          ...pemain,
          {
            user_id: uid,
            nama: user.nama,
            avatar_url: user.avatar_url ?? "",
            warna,
            robot,
          },
        ],
        undangan: (b.undangan ?? []).filter((x) => Number(x) !== uid),
      });
      return keRuang(db, baru, uid);
    }

    const id = Number(body.id ?? 0);
    if (!id) galat("Ruang tidak disebutkan.");
    const b = await bacaRuang(db, id);
    if (!b) galat("Ruang tidak ditemukan.", 404);
    const sayaHost = Number(b.host_id) === uid;
    const pemain = b.pemain ?? [];

    if (aksi === "undang") {
      if (!sayaHost) galat("Hanya host yang bisa mengundang.", 403);
      if (b.status !== "menunggu")
        galat("Undangan hanya sebelum permainan dimulai.");
      if (pemain.length >= MAKS_PEMAIN) galat("Ruang sudah penuh (4 pemain).");
      const baru = await undangPemain(db, b, user, Number(body.user_id));
      return keRuang(db, baru, uid);
    }

    if (aksi === "batalkan") {
      if (!sayaHost) galat("Hanya host yang bisa membatalkan.", 403);
      if (b.status === "berjalan")
        galat("Permainan sedang berjalan — pakai Keluar.");
      await db.from("ludo_game").delete().eq("id", id);
      return { sukses: true };
    }

    if (aksi === "keluar") {
      const saya = indeksSaya(b, uid);
      if (saya < 0) galat("Anda tidak ada di ruang ini.");
      if (b.status === "menunggu") {
        if (sayaHost) {
          await db.from("ludo_game").delete().eq("id", id);
          return { sukses: true, dihapus: true };
        }
        const baru = await simpan(db, b, {
          pemain: pemain.filter((p) => Number(p.user_id) !== uid),
        });
        return keRuang(db, baru, uid);
      }
      if (b.status === "berjalan" && b.state) {
        // Menyerah: permainan berakhir; bila tinggal satu lawan, dia pemenangnya.
        const st: StateLudo = structuredClone(b.state);
        const sisa = pemain.filter((p) => Number(p.user_id) !== uid);
        st.log = [...st.log.slice(-29), `${user.nama} keluar dari permainan.`];
        st.pemenang =
          sisa.length === 1
            ? pemain.findIndex(
                (p) => Number(p.user_id) === Number(sisa[0].user_id),
              )
            : null;
        st.fase = "lempar";
        st.boleh = [];
        const baru = await simpan(db, b, {
          state: st,
          status: "selesai",
          pemenang_id: sisa.length === 1 ? Number(sisa[0].user_id) : null,
        });
        return keRuang(db, baru, uid);
      }
      return keRuang(db, b, uid);
    }

    if (aksi === "mulai") {
      if (!sayaHost) galat("Hanya host yang bisa memulai.", 403);
      if (b.status !== "menunggu") galat("Permainan sudah dimulai.");
      if (pemain.length < 2) galat("Butuh minimal 2 pemain.");
      // Segarkan karakter robot tiap pemain (bisa berubah sejak bergabung).
      const segar: Pemain[] = [];
      for (const p of pemain)
        segar.push({
          ...p,
          robot: await robotPemain(db, Number(p.user_id), p.nama),
        });
      const baru = await simpan(db, b, {
        pemain: segar,
        status: "berjalan",
        state: stateAwal(segar.length),
        undangan: [],
      });
      return keRuang(db, baru, uid);
    }

    if (aksi === "lempar" || aksi === "gerak") {
      if (b.status !== "berjalan" || !b.state)
        galat("Permainan tidak sedang berjalan.");
      const saya = indeksSaya(b, uid);
      if (saya < 0) galat("Anda bukan pemain di ruang ini.", 403);
      const st = b.state;
      if (st.giliran !== saya) galat("Bukan giliran Anda.");
      let baru: StateLudo;
      if (aksi === "lempar") {
        if (st.fase !== "lempar") galat("Pilih token dulu.");
        baru = terapkanLemparan(st, pemain, randomInt(1, 7));
      } else {
        if (st.fase !== "pilih") galat("Lempar dadu dulu.");
        const token = Number(body.token);
        if (!st.boleh.includes(token))
          galat("Token itu tidak bisa digerakkan.");
        baru = terapkanGerak(st, pemain, token);
      }
      const disimpan = await simpan(db, b, patchState(b, baru));
      return keRuang(db, disimpan, uid);
    }

    galat("aksi tidak dikenal.");
  });
}
