// Koordinator bot "Nara" (tahap 3, 13 Okt 2026) — KHUSUS SISI SERVER.
//
// Nara berpikir dengan API key-nya sendiri (tabel bot_koordinator, sandi AES-GCM, AAD "bot:0").
// Ia hanya MENGUSULKAN: keluaran model diurai ketat menjadi aksi dari daftar tertutup
// (bot-koordinator-murni), dicek pagarnya, disimpan di bot_usulan, dan baru DIJALANKAN KODE setelah
// master menyetujui — lewat jalur dan pagar yang sama dengan kendali manual (jeda, kuota, anti-tabrakan,
// Antrean ACC). Nara tidak bisa memposting dan tidak bisa menyetujui usulannya sendiri.
import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { awalHariWibIso } from "@/lib/bot-data";
import { siarkanBot } from "@/lib/bot-realtime";
import { catatAudit } from "@/lib/audit";
import { catatPemakaianAi } from "@/lib/ai-pemakaian";
import { dekripsiKunci, kunciIndukSiap } from "@/lib/bot-rahasia";
import { GalatOtak, panggilPenyedia, type PermintaanOtak } from "@/lib/bot-otak";
import { PESAN_GALAT_OTAK, adalahPenyedia, samarkanKunci, sistemDenganKepribadian, type PenyediaOtak } from "@/lib/bot-otak-murni";
import { buatTugasDariUrl } from "@/lib/bot-kerja";
import { KUOTA_BOT_MAKS, KUOTA_BOT_MIN } from "@/lib/bot-tipe";
import {
  KOORDINATOR_KEBIJAKAN,
  LABEL_AKSI,
  PESAN_TANPA_OTAK,
  SISTEM_KOORDINATOR,
  alasanPagar,
  bangunPromptKoordinator,
  pagarUsulan,
  pesanKoordinatorGagal,
  uraiKeluaran,
  usulanKedaluwarsa,
  type AksiKoordinator,
  type KeadaanBotKoor,
  type ParamUsulan,
  type RiwayatKoor,
  type StatusKoordinator,
  type TandaPagar,
  type UsulanApi,
} from "@/lib/bot-koordinator-murni";

/** AAD enkripsi kunci koordinator (bukan baris bot_redaksi mana pun). */
export const ID_ENKRIPSI_KOORDINATOR = 0;

const skemaBelumSiap = (e: { code?: string } | null | undefined) => tabelBelumAda(e) || e?.code === "42703" || e?.code === "PGRST204";
const iso = (ms: number) => new Date(ms).toISOString();

export class GalatKoor extends Error {
  constructor(
    pesan: string,
    public status: number,
  ) {
    super(pesan);
  }
}

type BarisKoor = { nama: string; peran: string; persona: string; penyedia: string | null; kunci_sandi: string | null; akhir: string | null; diubah_pada: string | null; teruji_pada: string | null; hasil_uji: string | null };
const KOLOM_KOOR = "nama, peran, persona, penyedia, kunci_sandi, akhir, diubah_pada, teruji_pada, hasil_uji";

async function bacaKoordinator(): Promise<BarisKoor | null | "skema"> {
  const { data, error } = await supabase().from("bot_koordinator").select(KOLOM_KOOR).eq("id", 1).maybeSingle();
  if (error) {
    if (skemaBelumSiap(error)) return "skema";
    console.error("[bot-koordinator] baca:", error.message);
    return null;
  }
  return (data ?? null) as unknown as BarisKoor | null;
}

export async function koordinatorPunyaOtak(): Promise<boolean> {
  const r = await bacaKoordinator();
  return r !== null && r !== "skema" && adalahPenyedia(r.penyedia) && Boolean(r.kunci_sandi);
}

/** Tanya LLM dengan kunci milik Nara. Melempar GalatOtak (kode jelas). */
export async function tanyaKoordinator(p: PermintaanOtak): Promise<string> {
  const r = await bacaKoordinator();
  if (r === null || r === "skema" || !adalahPenyedia(r.penyedia) || !r.kunci_sandi) throw new GalatOtak("tanpa_kunci");
  const kunci = dekripsiKunci(r.kunci_sandi, ID_ENKRIPSI_KOORDINATOR);
  if (!kunci) throw new GalatOtak("kunci_rusak");
  const sistem = sistemDenganKepribadian(p.sistem, { nama: r.nama, peran: r.peran, persona: r.persona });
  const hasil = await panggilPenyedia(r.penyedia as PenyediaOtak, kunci, { ...p, sistem });
  catatPemakaianAi({ penyedia: r.penyedia as PenyediaOtak, model: hasil.model, fitur: `koordinator:${p.fitur}`, userId: null, tokenMasuk: hasil.masuk, tokenKeluar: hasil.keluar });
  return hasil.teks;
}

// ---------------------------------------------------------------- keadaan bot

const TAHAP_AKTIF = ["cari", "pilih", "unduh", "edit", "siap_ditinjau", "menunggu_acc", "disetujui", "posting"];
const TAHAP_BERJALAN = ["cari", "pilih", "unduh", "edit"];

export async function muatKeadaanBots(): Promise<KeadaanBotKoor[]> {
  const db = supabase();
  const { data: bots, error } = await db.from("bot_redaksi").select("id, user_id, nama, peran, aktif, jeda, kuota_harian").order("id");
  if (error) {
    if (skemaBelumSiap(error)) return [];
    throw new GalatKoor("Gagal membaca bot.", 500);
  }
  const daftar = (bots ?? []) as unknown as { id: number; nama: string; peran: string | null; aktif: boolean | null; jeda: boolean | null; kuota_harian: number | null }[];
  if (daftar.length === 0) return [];
  const [{ data: otak }, { data: tugas }, { data: hariIni }] = await Promise.all([
    db.from("bot_otak").select("bot_id"),
    db.from("bot_tugas").select("bot_id, judul, tahap, id").in("tahap", TAHAP_AKTIF).order("id", { ascending: false }),
    db.from("bot_tugas").select("bot_id").gte("dibuat_pada", awalHariWibIso()),
  ]);
  const punya = new Set(((otak ?? []) as { bot_id: number }[]).map((o) => Number(o.bot_id)));
  const tugasBaris = (tugas ?? []) as { bot_id: number; judul: string | null; tahap: string }[];
  const dibuat = new Map<number, number>();
  for (const t of (hariIni ?? []) as { bot_id: number }[]) dibuat.set(Number(t.bot_id), (dibuat.get(Number(t.bot_id)) ?? 0) + 1);
  return daftar.map((b) => {
    const mine = tugasBaris.filter((t) => Number(t.bot_id) === Number(b.id));
    // "tugas berjalan" mengikuti gerbang bot-mesin (cari/pilih/unduh/edit); menunggu ACC dihitung terpisah.
    const aktif = mine.find((t) => TAHAP_BERJALAN.includes(t.tahap));
    return {
      id: Number(b.id),
      nama: String(b.nama ?? ""),
      peran: String(b.peran ?? ""),
      aktif: b.aktif !== false,
      jeda: b.jeda === true,
      punyaOtak: punya.has(Number(b.id)),
      kuotaHarian: Math.max(0, Number(b.kuota_harian ?? 1)),
      dibuatHariIni: dibuat.get(Number(b.id)) ?? 0,
      tugas: aktif ? { judul: String(aktif.judul ?? "(tanpa judul)"), tahap: aktif.tahap } : null,
      antreAcc: mine.filter((t) => ["siap_ditinjau", "menunggu_acc"].includes(t.tahap)).length,
    };
  });
}

// ---------------------------------------------------------------- usulan: baca/ubah bentuk

type BarisUsulan = { id: number; aksi: string; bot_id: number; param: ParamUsulan | null; judul: string; alasan: string | null; pagar: TandaPagar[] | null; status: string; dibuat_pada: string; diputus_pada: string | null; hasil: string | null };
const KOLOM_USULAN = "id, aksi, bot_id, param, judul, alasan, pagar, status, dibuat_pada, diputus_pada, hasil";

function keApi(b: BarisUsulan, namaBot: string, tidur: boolean): UsulanApi {
  const aksi = (b.aksi in LABEL_AKSI ? b.aksi : "cari_sekarang") as AksiKoordinator;
  return {
    id: Number(b.id),
    aksi,
    aksi_label: LABEL_AKSI[aksi],
    bot_id: Number(b.bot_id),
    bot_nama: namaBot,
    param: b.param ?? {},
    judul: String(b.judul ?? ""),
    alasan: String(b.alasan ?? ""),
    pagar: Array.isArray(b.pagar) ? b.pagar : [],
    status: b.status as UsulanApi["status"],
    dibuat_pada: String(b.dibuat_pada ?? ""),
    diputus_pada: b.diputus_pada ?? null,
    hasil: String(b.hasil ?? ""),
    bot_tidur: tidur,
  };
}

/** Usulan yang menunggu terlalu lama dihanguskan (lazy, tiap baca/buat). */
async function hanguskanBasi(sekarangMs: number): Promise<void> {
  const batas = iso(sekarangMs - KOORDINATOR_KEBIJAKAN.KEDALUWARSA_MENIT * 60_000);
  const db = supabase();
  const { error } = await db.from("bot_usulan").update({ status: "kedaluwarsa", diputus_pada: iso(sekarangMs), hasil: "Kedaluwarsa tanpa keputusan." }).eq("status", "menunggu").lt("dibuat_pada", batas);
  if (error && !skemaBelumSiap(error)) console.error("[bot-koordinator] hanguskan basi:", error.message);
  // Usulan yang tertahan di "disetujui" (proses mati di tengah eksekusi): tandai gagal, jangan dibiarkan selamanya.
  const macet = iso(sekarangMs - 10 * 60_000);
  const { error: e2 } = await db.from("bot_usulan").update({ status: "gagal", hasil: "Terputus di tengah menjalankan; periksa keadaan bot sebelum mengusulkan lagi." }).eq("status", "disetujui").lt("diputus_pada", macet);
  if (e2 && !skemaBelumSiap(e2)) console.error("[bot-koordinator] pulihkan usulan macet:", e2.message);
}

export async function daftarUsulanApi(idUsulan?: number[]): Promise<{ terbuka: UsulanApi[]; riwayat: UsulanApi[] }> {
  const db = supabase();
  await hanguskanBasi(Date.now());
  const q = db.from("bot_usulan").select(KOLOM_USULAN);
  const r = idUsulan ? await q.in("id", idUsulan) : await q.order("id", { ascending: false }).limit(40);
  if (r.error) {
    if (skemaBelumSiap(r.error)) return { terbuka: [], riwayat: [] };
    throw new GalatKoor("Gagal membaca usulan.", 500);
  }
  const baris = (r.data ?? []) as unknown as BarisUsulan[];
  const bots = await muatKeadaanBots();
  const per = new Map(bots.map((b) => [b.id, b]));
  const semua = baris.map((b) => keApi(b, per.get(Number(b.bot_id))?.nama ?? "?", !(per.get(Number(b.bot_id))?.punyaOtak ?? false)));
  return { terbuka: semua.filter((u) => u.status === "menunggu").sort((a, b) => a.id - b.id), riwayat: semua.filter((u) => u.status !== "menunggu").slice(0, 15) };
}

/** Usulan menurut id (untuk kartu di chat), apa pun statusnya. */
export async function usulanMenurutId(ids: number[]): Promise<UsulanApi[]> {
  if (ids.length === 0) return [];
  const r = await supabase().from("bot_usulan").select(KOLOM_USULAN).in("id", ids);
  if (r.error) {
    if (!skemaBelumSiap(r.error)) console.error("[bot-koordinator] usulan menurut id:", r.error.message);
    return [];
  }
  const bots = await muatKeadaanBots();
  const per = new Map(bots.map((b) => [b.id, b]));
  return ((r.data ?? []) as unknown as BarisUsulan[]).map((b) => keApi(b, per.get(Number(b.bot_id))?.nama ?? "?", !(per.get(Number(b.bot_id))?.punyaOtak ?? false)));
}

export async function bacaStatusKoordinator(): Promise<StatusKoordinator> {
  const kosong: StatusKoordinator = { tabel_ada: false, induk_siap: kunciIndukSiap(), nama: "Nara", peran: "Koordinator Redaksi", persona: "", penyedia: null, kunci_samar: "", diubah_pada: null, teruji_pada: null, hasil_uji: null, terbuka: [], riwayat: [] };
  const r = await bacaKoordinator();
  if (r === "skema" || r === null) return kosong;
  const { terbuka, riwayat } = await daftarUsulanApi();
  return {
    tabel_ada: true,
    induk_siap: kunciIndukSiap(),
    nama: r.nama,
    peran: r.peran,
    persona: r.persona,
    penyedia: adalahPenyedia(r.penyedia) ? r.penyedia : null,
    kunci_samar: r.kunci_sandi ? samarkanKunci(String(r.akhir ?? "")) : "",
    diubah_pada: r.diubah_pada,
    teruji_pada: r.teruji_pada,
    hasil_uji: r.hasil_uji,
    terbuka,
    riwayat,
  };
}

// ---------------------------------------------------------------- chat

async function tulisChat(pengirim: "koordinator" | "sistem", teks: string, usulanId: number | null = null): Promise<void> {
  const db = supabase();
  const isi: Record<string, unknown> = { pengirim, teks: teks.slice(0, 4000), menyebut: [] as number[] };
  let { error } = await db.from("bot_chat").insert(usulanId ? { ...isi, usulan_id: usulanId } : isi);
  if (error && usulanId && skemaBelumSiap(error)) ({ error } = await db.from("bot_chat").insert(isi));
  if (error) console.error("[bot-koordinator] tulis chat:", error.message);
  else siarkanBot("chat");
}

/**
 * Master menyebut @Nara di pesan `pesanId`: Nara berpikir dan (mungkin) mengusulkan. Tidak pernah melempar
 * (dipanggil di after()); semua kegagalan menjadi catatan sistem yang jelas di room.
 */
export async function tanggapiPesan(pesanId: number): Promise<void> {
  try {
    const db = supabase();
    const { data: pesan } = await db.from("bot_chat").select("id, pengirim, user_id, teks").eq("id", pesanId).maybeSingle();
    if (!pesan || pesan.pengirim !== "master") return;
    if (!(await koordinatorPunyaOtak())) {
      await tulisChat("sistem", PESAN_TANPA_OTAK);
      return;
    }
    await hanguskanBasi(Date.now());
    const [bots, { data: master }, { data: riwayatRaw }, { count: terbukaN }] = await Promise.all([
      muatKeadaanBots(),
      pesan.user_id != null ? db.from("app_user").select("nama").eq("id", pesan.user_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("bot_chat").select("pengirim, bot_id, teks").lt("id", pesanId).order("id", { ascending: false }).limit(8),
      db.from("bot_usulan").select("id", { count: "exact", head: true }).eq("status", "menunggu"),
    ]);
    const namaMaster = String((master as { nama?: string } | null)?.nama ?? "Pimred");
    const namaBot = new Map(bots.map((b) => [b.id, b.nama]));
    const riwayat: RiwayatKoor[] = ((riwayatRaw ?? []) as { pengirim: string; bot_id: number | null; teks: string }[])
      .reverse()
      .filter((r) => r.pengirim !== "sistem")
      .map((r) => ({ nama: r.pengirim === "master" ? namaMaster : r.pengirim === "koordinator" ? "Nara" : (namaBot.get(Number(r.bot_id)) ?? "Agen"), teks: String(r.teks ?? "") }));

    let mentah: string;
    try {
      mentah = await tanyaKoordinator({
        sistem: SISTEM_KOORDINATOR,
        pengguna: bangunPromptKoordinator({ pesan: String(pesan.teks ?? ""), namaPemilik: namaMaster, riwayat, bots, terbuka: terbukaN ?? 0 }),
        json: true,
        fitur: "usulan",
        maksToken: 700,
        batasMs: 30_000,
      });
    } catch (e) {
      await tulisChat("sistem", pesanKoordinatorGagal(e instanceof GalatOtak ? e.kode : "gagal"));
      return;
    }

    const hasil = uraiKeluaran(mentah, bots, String(pesan.teks ?? ""));
    const per = new Map(bots.map((b) => [b.id, b]));
    const dibuat: { id: number }[] = [];
    const ditolakPagar: string[] = [];
    let gagalSimpan = false;
    let terbuka = terbukaN ?? 0;
    for (const u of hasil.usulan) {
      const bot = per.get(u.bot_id);
      if (!bot) continue;
      const pg = pagarUsulan(u, bot);
      if (!pg.boleh) {
        ditolakPagar.push(`${u.judul}: ${alasanPagar(pg.tanda)}`);
        continue;
      }
      if (terbuka >= KOORDINATOR_KEBIJAKAN.TERBUKA_MAKS) {
        ditolakPagar.push(`${u.judul}: sudah ada ${KOORDINATOR_KEBIJAKAN.TERBUKA_MAKS} usulan terbuka — putuskan salah satunya dulu`);
        continue;
      }
      const { data: baru, error } = await db.from("bot_usulan").insert({ aksi: u.aksi, bot_id: u.bot_id, param: u.param, judul: u.judul, alasan: u.alasan, pagar: pg.tanda }).select("id").single();
      if (error || !baru) {
        console.error("[bot-koordinator] simpan usulan:", error?.message);
        gagalSimpan = true;
        continue;
      }
      terbuka++;
      dibuat.push({ id: Number(baru.id) });
    }

    // Balasan model hanya ditampilkan bila konsisten dengan kenyataan: bila ada butir yang dibuang/gagal dan tidak
    // satu pun usulan jadi, jangan biarkan balasannya mengaku "saya tugaskan…" — tulis alasan yang dihitung KODE.
    const tanpaUsulan = dibuat.length === 0;
    const alasanKode = [...new Set(hasil.dibuang)];
    if (tanpaUsulan && (hasil.dibuang.length > 0 || gagalSimpan)) {
      await tulisChat("koordinator", gagalSimpan ? "Usulan tidak bisa disimpan sekarang. Coba lagi sebentar." : `Saya tidak bisa membuat usulan dari permintaan itu (${alasanKode.join("; ")}). Sebutkan agen, aksi, dan — untuk mengerjakan video — tuliskan tautannya utuh di pesan Anda.`);
    } else {
      const balasan = hasil.balasan || (dibuat.length > 0 ? "Berikut usulan saya." : "Saya belum menangkap tugasnya. Sebutkan agen, aksi, dan (untuk mengerjakan video) tautannya.");
      await tulisChat("koordinator", balasan);
    }
    for (const u of dibuat) await tulisChat("koordinator", `Usulan #${u.id} menunggu persetujuan Anda.`, u.id);
    if (ditolakPagar.length > 0) await tulisChat("koordinator", `Tidak saya usulkan — ${ditolakPagar.join(" · ")}`);
    if (pesan.user_id != null) for (const u of dibuat) catatAudit(Number(pesan.user_id), "bot_koordinator", `Nara mengusulkan #${u.id}`, { detail: { usulan_id: u.id } });
    siarkanBot("kendali");
  } catch (e) {
    console.error("[bot-koordinator] tanggapi pesan:", e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------- keputusan & eksekusi

export type PelakuKoor = { id: number; nama: string };

type HasilJalan = { ok: boolean; teks: string };

async function jalankanUsulan(u: BarisUsulan): Promise<HasilJalan> {
  const db = supabase();
  const param = u.param ?? {};
  const botId = Number(u.bot_id);
  switch (u.aksi) {
    case "kerjakan_url": {
      if (!param.url) return { ok: false, teks: "Usulan tanpa tautan." };
      const h = await buatTugasDariUrl(botId, param.url, param.topik ?? "");
      if (h.ok) return { ok: true, teks: `Tugas #${h.tugas_id} dibuat; bot mengerjakannya pada giliran berikutnya, hasil masuk Antrean ACC.` };
      const pesan: Record<string, string> = { bot_tidak_ada: "Bot tidak ditemukan.", ditutup: `Bot belum boleh memulai tugas (${h.alasan ?? "pagar"}).`, url_tak_sah: "Tautan tidak dikenal.", dipakai: `Tautan tidak bisa dipakai (${h.alasan ?? "sudah dipakai"}).`, tabel_belum_ada: "Migrasi bot belum dijalankan.", gagal: `Gagal membuat tugas (${h.alasan ?? "galat"}).` };
      return { ok: false, teks: pesan[h.kode] ?? "Gagal." };
    }
    case "cari_sekarang": {
      const { data, error } = await db.from("bot_sumber").update({ terakhir_ambil: null }).eq("bot_id", botId).eq("aktif", true).select("id");
      if (error) return { ok: false, teks: "Gagal menandai sumber untuk dipanen." };
      return { ok: true, teks: `${data?.length ?? 0} sumber ditandai; dipanen pada giliran berikutnya.` };
    }
    case "ubah_kuota": {
      const k = param.kuota;
      if (typeof k !== "number" || !Number.isInteger(k) || k < KUOTA_BOT_MIN || k > KUOTA_BOT_MAKS) return { ok: false, teks: "Kuota tidak sah." };
      const { error } = await db.from("bot_redaksi").update({ kuota_harian: k }).eq("id", botId);
      return error ? { ok: false, teks: "Gagal menyimpan kuota." } : { ok: true, teks: `Kuota harian menjadi ${k}.` };
    }
    case "jeda":
    case "lanjut": {
      const { error } = await db.from("bot_redaksi").update({ jeda: u.aksi === "jeda" }).eq("id", botId);
      return error ? { ok: false, teks: "Gagal menyimpan jeda." } : { ok: true, teks: u.aksi === "jeda" ? "Bot dijeda." : "Jeda dicabut." };
    }
    default:
      return { ok: false, teks: "Aksi tidak dikenal." };
  }
}

export async function putuskanUsulan(id: number, jenis: "setuju" | "tolak", pelaku: PelakuKoor, ktx: { request?: Request; sekarangMs?: number } = {}): Promise<{ ok: boolean; pesan: string }> {
  const db = supabase();
  const sekarangMs = ktx.sekarangMs ?? Date.now();
  const { data, error } = await db.from("bot_usulan").select(KOLOM_USULAN).eq("id", id).maybeSingle();
  if (error) {
    if (skemaBelumSiap(error)) throw new GalatKoor("Migrasi 74 (koordinator bot) belum dijalankan.", 503);
    throw new GalatKoor("Gagal membaca usulan.", 500);
  }
  if (!data) throw new GalatKoor("Usulan tidak ditemukan.", 404);
  const u = data as unknown as BarisUsulan;
  if (u.status !== "menunggu") throw new GalatKoor(`Usulan ini sudah ${u.status}.`, 409);
  if (usulanKedaluwarsa(u.dibuat_pada, sekarangMs)) {
    await db.from("bot_usulan").update({ status: "kedaluwarsa", diputus_pada: iso(sekarangMs), hasil: "Kedaluwarsa tanpa keputusan." }).eq("id", id).eq("status", "menunggu");
    throw new GalatKoor("Usulan ini sudah kedaluwarsa. Minta Nara mengusulkan lagi.", 409);
  }
  const bots = await muatKeadaanBots();
  const bot = bots.find((b) => b.id === Number(u.bot_id));
  const { data: botRow } = await db.from("bot_redaksi").select("user_id").eq("id", u.bot_id).maybeSingle();
  const userBot = Number((botRow as { user_id?: number } | null)?.user_id ?? 0);
  const aksi = u.aksi as AksiKoordinator;

  if (jenis === "tolak") {
    const { data: ok } = await db.from("bot_usulan").update({ status: "ditolak", diputus_oleh: pelaku.id, diputus_pada: iso(sekarangMs), hasil: "Ditolak master." }).eq("id", id).eq("status", "menunggu").select("id");
    if (!ok?.length) throw new GalatKoor("Usulan ini sudah diputuskan.", 409);
    await tulisChat("sistem", `Usulan #${id} (${LABEL_AKSI[aksi] ?? u.aksi}) ditolak ${pelaku.nama}. Tidak ada yang dijalankan.`);
    catatAudit(pelaku.id, "bot_koordinator", `Menolak usulan #${id} (${bot?.nama ?? "bot"})`, { request: ktx.request, detail: { usulan_id: id, bot_id: Number(u.bot_id), bot_user_id: userBot } });
    siarkanBot("kendali");
    return { ok: true, pesan: "Usulan ditolak." };
  }

  // Pagar DIPERIKSA ULANG pada keadaan terkini (bot bisa saja sudah berubah sejak diusulkan).
  if (!bot) throw new GalatKoor("Bot sasaran tidak ditemukan.", 404);
  const pg = pagarUsulan({ aksi, param: u.param ?? {} }, bot);
  if (!pg.boleh) throw new GalatKoor(`Tidak bisa dijalankan sekarang: ${alasanPagar(pg.tanda)}.`, 409);

  const { data: klaim } = await db.from("bot_usulan").update({ status: "disetujui", diputus_oleh: pelaku.id, diputus_pada: iso(sekarangMs) }).eq("id", id).eq("status", "menunggu").select("id");
  if (!klaim?.length) throw new GalatKoor("Usulan ini sudah diputuskan.", 409);

  let hasil: HasilJalan;
  try {
    hasil = await jalankanUsulan(u);
  } catch (e) {
    console.error("[bot-koordinator] jalankan usulan:", e instanceof Error ? e.message : e);
    hasil = { ok: false, teks: "Galat tak terduga saat menjalankan." };
  }
  // Status akhir WAJIB tercatat (ulangi sekali); kegagalan terakhir dilaporkan jujur, bukan ditelan.
  let catat = await db.from("bot_usulan").update({ status: hasil.ok ? "dijalankan" : "gagal", hasil: hasil.teks.slice(0, 500) }).eq("id", id).eq("status", "disetujui");
  if (catat.error) catat = await db.from("bot_usulan").update({ status: hasil.ok ? "dijalankan" : "gagal", hasil: hasil.teks.slice(0, 500) }).eq("id", id).eq("status", "disetujui");
  if (catat.error) console.error("[bot-koordinator] catat hasil usulan:", catat.error.message);
  await tulisChat("sistem", `Usulan #${id} (${LABEL_AKSI[aksi] ?? u.aksi} → ${bot.nama}) ${hasil.ok ? "dijalankan" : "gagal"}: ${hasil.teks}`);
  catatAudit(pelaku.id, "bot_koordinator", `${hasil.ok ? "Menjalankan" : "Gagal menjalankan"} usulan #${id}: ${LABEL_AKSI[aksi] ?? u.aksi} → ${bot.nama}`, { request: ktx.request, detail: { usulan_id: id, bot_id: Number(u.bot_id), bot_user_id: userBot, aksi, hasil: hasil.teks } });
  siarkanBot("tugas");
  siarkanBot("kendali");
  return { ok: hasil.ok, pesan: hasil.teks };
}

export { PESAN_GALAT_OTAK };
