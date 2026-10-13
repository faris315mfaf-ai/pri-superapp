// /api/bot/template — pustaka template TVR untuk bot (13 Okt 2026). HANYA master.
//
//   GET                                   → StatusTemplateBot (pustaka + keadaan tiap bot + akun sumber)
//   POST { aksi:"simpan", nama, dari }    → salin template TVR akun `dari` (master sendiri atau akun bot)
//                                           ke pustaka dengan nama itu
//   POST { aksi:"pasang", template_id, bot_id | "semua" } → pasang salinan pustaka ke akun bot
//   POST { aksi:"hapus", template_id }    → buang dari pustaka (template yang sudah terpasang di bot tetap)
//
// Berkasnya disalin di mesin (rute /api/tvr/pustaka/*, hanya terbuka bagi server ini
// lewat panggilMesinPustaka). Data nama/penanda ada di sql/68_bot_template.sql.
import { bungkus, tabelBelumAda } from "@/lib/api-helper";
import { pastikanMasuk } from "@/lib/sesi";
import { bolehRuangBot } from "@/lib/peran";
import { modulAktifServer } from "@/lib/sakelar";
import { supabase } from "@/lib/supabase";
import { catatAudit } from "@/lib/audit";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { siarkanBot } from "@/lib/bot-realtime";
import { mintaJsonMesin, panggilMesinPustaka } from "@/lib/autoedit";
import { DIVISI_BOT } from "@/lib/struktur";
import {
  TEMPLATE_MAKS_JUMLAH,
  buatKodePustaka,
  normalkanNamaTemplate,
  pesanDariMesin,
  type AkunSumberTemplate,
  type BotTemplateBaris,
  type HasilPasang,
  type KeadaanTemplateMesin,
  type StatusTemplateBot,
  type TemplatePustaka,
} from "@/lib/bot-template-murni";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KODE_DUPLIKAT = "23505";

function tolak(pesan: string, status = 400): never {
  throw Object.assign(new Error(pesan), { status });
}

/** Tabel/kolom migrasi 68 belum ada (tabel hilang atau kolom bot_redaksi.template_id hilang). */
function migrasiBelumAda(error: { code?: string; message?: string } | null | undefined): boolean {
  return tabelBelumAda(error) || error?.code === "42703" || error?.code === "PGRST204";
}

function galatTulis(error: { code?: string; message?: string }, pesanGagal: string): never {
  if (migrasiBelumAda(error)) tolak("Migrasi 68 (pustaka template bot) belum dijalankan.", 503);
  console.error("[bot-template]", pesanGagal, error.message ?? "");
  tolak(pesanGagal, 500);
}

const idPositif = (v: unknown, nama: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) tolak(`${nama} tidak sah.`);
  return n;
};

/** Keadaan template TVR di mesin untuk satu akun; null bila mesin tak terjangkau. */
async function keadaanMesin(userId: number): Promise<KeadaanTemplateMesin> {
  try {
    const j = await mintaJsonMesin<{ template?: { ada?: boolean; siap?: boolean } }>("/api/tvr/ringkas", String(userId), 8_000);
    return { ada: j.template?.ada === true, siap: j.template?.siap === true };
  } catch {
    return null;
  }
}

async function bacaStatus(masterId: number, masterNama: string, masterUsername: string): Promise<StatusTemplateBot> {
  const db = supabase();
  const [rBot, rTemplate] = await Promise.all([
    db.from("bot_redaksi").select("id, user_id, nama, template_id, template_dipasang_pada").order("id"),
    db.from("bot_template").select("id, nama, ukuran_byte, dibuat_pada, sumber_user_id").order("dibuat_pada", { ascending: false }),
  ]);
  if (rBot.error || rTemplate.error) {
    const e = rBot.error ?? rTemplate.error;
    if (migrasiBelumAda(e)) return { tabel_ada: false, template: [], bot: [], akun_sumber: [] };
    galatTulis(e as { code?: string; message?: string }, "Gagal membaca pustaka template.");
  }
  const bots = rBot.data ?? [];
  const templates = rTemplate.data ?? [];

  const idOrang = [...new Set([...bots.map((b) => Number(b.user_id)), ...templates.map((t) => Number(t.sumber_user_id)).filter((n) => n > 0)])];
  const { data: orang } = idOrang.length
    ? await db.from("app_user").select("id, nama, username").in("id", idOrang)
    : { data: [] as { id: number; nama: string; username: string }[] };
  const orangPer = new Map((orang ?? []).map((o) => [Number(o.id), o as { nama: string; username: string }]));
  const namaTemplate = new Map(templates.map((t) => [Number(t.id), String(t.nama)]));

  const idAkun = [masterId, ...bots.map((b) => Number(b.user_id))];
  const keadaan = await Promise.all(idAkun.map((id) => keadaanMesin(id)));
  const keadaanPer = new Map(idAkun.map((id, i) => [id, keadaan[i]]));

  const bot: BotTemplateBaris[] = bots.map((b) => {
    const o = orangPer.get(Number(b.user_id));
    const tid = b.template_id == null ? null : Number(b.template_id);
    return {
      bot_id: Number(b.id),
      user_id: Number(b.user_id),
      nama: String(b.nama ?? ""),
      username: String(o?.username ?? ""),
      template_id: tid,
      template_nama: tid != null ? (namaTemplate.get(tid) ?? "") : "",
      dipasang_pada: (b.template_dipasang_pada as string | null) ?? null,
      mesin: keadaanPer.get(Number(b.user_id)) ?? null,
    };
  });
  const template: TemplatePustaka[] = templates.map((t) => ({
    id: Number(t.id),
    nama: String(t.nama ?? ""),
    ukuran_byte: Number(t.ukuran_byte ?? 0),
    dibuat_pada: String(t.dibuat_pada ?? ""),
    sumber: t.sumber_user_id == null ? "" : String(orangPer.get(Number(t.sumber_user_id))?.nama ?? ""),
  }));
  const akun_sumber: AkunSumberTemplate[] = [
    { user_id: masterId, nama: masterNama, username: masterUsername, jenis: "master", mesin: keadaanPer.get(masterId) ?? null },
    ...bot.map((b) => ({ user_id: b.user_id, nama: b.nama, username: b.username, jenis: "bot" as const, mesin: b.mesin })),
  ];
  return { tabel_ada: true, template, bot, akun_sumber };
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) tolak("Template bot hanya untuk master.", 403);
    if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
    return bacaStatus(Number(user.id), String(user.nama ?? ""), String(user.username ?? ""));
  });
}

export async function POST(request: Request) {
  const terlalu = await pastikanTidakMelebihiBatas(request, "bot-template", 30, 60);
  if (terlalu) return terlalu;

  return bungkus(async () => {
    const user = await pastikanMasuk(request);
    if (!bolehRuangBot(user)) tolak("Template bot hanya untuk master.", 403);
    if (!(await modulAktifServer("ruangbot"))) tolak("Modul Ruang Bot sedang dinonaktifkan.", 423);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = supabase();

    // ---------------------------------------------------------- simpan
    if (b.aksi === "simpan") {
      const nm = normalkanNamaTemplate(b.nama);
      if (!nm.ok) tolak(nm.pesan);
      const dari = idPositif(b.dari, "dari");
      // Sumber hanya akun master ini sendiri atau akun bot (bukan anggota lain).
      if (dari !== Number(user.id)) {
        const { data: sah, error } = await db.from("app_user").select("id, divisi, aktif").eq("id", dari).maybeSingle();
        if (error) tolak("Gagal memeriksa akun sumber.", 500);
        if (!sah || sah.aktif !== true || String(sah.divisi ?? "").trim() !== DIVISI_BOT) {
          tolak("Template hanya bisa diambil dari akun Anda sendiri atau akun bot.", 403);
        }
      }
      const { count, error: eHitung } = await db.from("bot_template").select("id", { count: "exact", head: true });
      if (eHitung) galatTulis(eHitung, "Gagal menghitung pustaka.");
      if ((count ?? 0) >= TEMPLATE_MAKS_JUMLAH) tolak(`Pustaka maksimal ${TEMPLATE_MAKS_JUMLAH} template. Hapus yang tidak dipakai.`);

      const kode = buatKodePustaka();
      // Catat nama dulu (indeks unik lower(nama) = pagar nama kembar), baru salin berkas.
      const { data: baris, error } = await db
        .from("bot_template")
        .insert({ kode, nama: nm.nama, sumber_user_id: dari, dibuat_oleh: Number(user.id) })
        .select("id")
        .single();
      if (error) {
        if (error.code === KODE_DUPLIKAT) tolak(`Nama “${nm.nama}” sudah dipakai template lain.`, 409);
        galatTulis(error, "Gagal menyimpan template.");
      }
      const id = Number(baris?.id);
      let jawab: { status: number; json: unknown };
      try {
        jawab = await panggilMesinPustaka("POST", "/api/tvr/pustaka/simpan", String(dari), { kode });
      } catch (e) {
        await db.from("bot_template").delete().eq("id", id);
        tolak(e instanceof Error ? e.message : "Mesin Auto Edit tidak terjangkau.", 502);
      }
      if (jawab.status !== 200) {
        await db.from("bot_template").delete().eq("id", id);
        const pesan = pesanDariMesin(jawab.json, "Mesin menolak menyimpan template.");
        tolak(jawab.status === 404 ? "Akun sumber belum punya template TVR yang siap. Buat dan tetapkan dulu." : pesan, jawab.status === 404 ? 409 : 502);
      }
      const byte = Number((jawab.json as { byte?: unknown } | null)?.byte ?? 0);
      await db.from("bot_template").update({ ukuran_byte: byte }).eq("id", id);
      catatAudit(user.id, "bot_template", `Menyimpan template bot “${nm.nama}”`, {
        request,
        detail: { template_id: id, kode, dari, ukuran_byte: byte },
      });
      siarkanBot("kendali");
      return { sukses: true, id };
    }

    // ---------------------------------------------------------- pasang
    if (b.aksi === "pasang") {
      const tid = idPositif(b.template_id, "template_id");
      const { data: tpl, error: eTpl } = await db.from("bot_template").select("id, kode, nama").eq("id", tid).maybeSingle();
      if (eTpl) galatTulis(eTpl, "Gagal membaca template.");
      if (!tpl) tolak("Template tidak ditemukan.", 404);

      let q = db.from("bot_redaksi").select("id, user_id, nama");
      if (b.bot_id !== "semua") q = q.eq("id", idPositif(b.bot_id, "bot_id"));
      const { data: sasaran, error: eBot } = await q.order("id");
      if (eBot) galatTulis(eBot, "Gagal membaca bot.");
      if (!sasaran?.length) tolak("Bot tidak ditemukan.", 404);

      // Berurutan: tiap salinan menyentuh disk mesin; tidak perlu paralel.
      const hasil: HasilPasang[] = [];
      for (const s of sasaran) {
        const botId = Number(s.id);
        const nama = String(s.nama ?? "");
        try {
          const j = await panggilMesinPustaka("POST", "/api/tvr/pustaka/pasang", String(s.user_id), { kode: tpl.kode });
          if (j.status === 200) {
            const { error } = await db
              .from("bot_redaksi")
              .update({ template_id: tid, template_dipasang_pada: new Date().toISOString() })
              .eq("id", botId);
            if (error) console.error("[bot-template] catat pemasangan:", error.message);
            hasil.push({ bot_id: botId, nama, ok: true, pesan: "Terpasang." });
          } else {
            hasil.push({ bot_id: botId, nama, ok: false, pesan: pesanDariMesin(j.json, "Mesin menolak memasang template.") });
          }
        } catch (e) {
          hasil.push({ bot_id: botId, nama, ok: false, pesan: e instanceof Error ? e.message : "Mesin tidak terjangkau." });
        }
      }
      catatAudit(user.id, "bot_template", `Memasang template bot “${String(tpl.nama)}” ke ${hasil.filter((h) => h.ok).map((h) => h.nama).join(", ") || "(tidak ada)"}`, {
        request,
        detail: { template_id: tid, hasil },
      });
      siarkanBot("kendali");
      return { sukses: hasil.every((h) => h.ok), hasil };
    }

    // ---------------------------------------------------------- hapus
    if (b.aksi === "hapus") {
      const tid = idPositif(b.template_id, "template_id");
      const { data: tpl, error: eTpl } = await db.from("bot_template").select("id, kode, nama").eq("id", tid).maybeSingle();
      if (eTpl) galatTulis(eTpl, "Gagal membaca template.");
      if (!tpl) tolak("Template tidak ditemukan.", 404);
      // Berkas mesin dihapus dulu; bila mesin tak terjangkau, baris DIPERTAHANKAN (tidak jadi yatim).
      try {
        const j = await panggilMesinPustaka("DELETE", `/api/tvr/pustaka/${encodeURIComponent(String(tpl.kode))}`, String(user.id));
        if (j.status !== 200) tolak(pesanDariMesin(j.json, "Mesin menolak menghapus template."), 502);
      } catch (e) {
        if ((e as { status?: number }).status) throw e;
        tolak(e instanceof Error ? e.message : "Mesin tidak terjangkau.", 502);
      }
      const { error } = await db.from("bot_template").delete().eq("id", tid);
      if (error) galatTulis(error, "Gagal menghapus template.");
      catatAudit(user.id, "bot_template", `Menghapus template bot “${String(tpl.nama)}”`, { request, detail: { template_id: tid } });
      siarkanBot("kendali");
      return { sukses: true };
    }

    return tolak("aksi tidak dikenal.");
  });
}
