// Room chat bot (13 Okt 2026) — KHUSUS SISI SERVER.
//
// Master menulis di room; agen yang disebut (@Raka) menjawab dengan OTAK-nya sendiri (API key + kepribadian
// miliknya, lib/bot-otak). Jawaban hanyalah teks: agen TIDAK bisa memulai/mengubah tugas lewat chat (tahap 3
// menambahkan koordinator dengan kosakata aksi tertutup). Tidak ada bot-membalas-bot; maksimal JAWABAN_MAKS
// jawaban per pesan; jawaban berpijak pada keadaan NYATA bot (ringkasKeadaan).
import { supabase } from "@/lib/supabase";
import { tabelBelumAda } from "@/lib/api-helper";
import { awalHariWibIso, bacaJedaGlobal } from "@/lib/bot-data";
import { siarkanBot } from "@/lib/bot-realtime";
import { GalatOtak, botPunyaOtak, tanyaOtakBot } from "@/lib/bot-otak";
import { KEBIJAKAN_CHAT } from "@/lib/bot-chat-konstan";
import { koordinatorPunyaOtak, tanggapiPesan, usulanMenurutId } from "@/lib/bot-koordinator";
import {
  ID_KOORDINATOR_CHAT,
  SISTEM_CHAT,
  bangunPromptChat,
  cariSebutan,
  menyebutKoordinator,
  pesanTakBisaMenjawab,
  rapikanBalasan,
  ringkasKeadaan,
  type PesanChat,
  type PesanKonteks,
  type StatusChat,
} from "@/lib/bot-chat-murni";

const skemaBelumSiap = (e: { code?: string } | null | undefined) => tabelBelumAda(e) || e?.code === "42703" || e?.code === "PGRST204";

type BarisChat = { id: number; pengirim: PesanChat["pengirim"]; user_id: number | null; bot_id: number | null; teks: string; menyebut: number[] | null; usulan_id?: number | null; dibuat_pada: string };
type BarisBot = { id: number; user_id: number; nama: string; warna: string; aktif: boolean | null; jeda: boolean | null; mode: string | null; kuota_harian: number | null };
const KOLOM_CHAT = "id, pengirim, user_id, bot_id, teks, menyebut, dibuat_pada";
const KOLOM_CHAT_USULAN = `${KOLOM_CHAT}, usulan_id`;

export class GalatChat extends Error {
  constructor(
    pesan: string,
    public status: number,
  ) {
    super(pesan);
  }
}

/** Pesan terbaru (urut lama→baru). `sejakId` = hanya yang lebih baru dari id itu. */
export async function muatStatusChat(sejakId = 0): Promise<StatusChat> {
  const db = supabase();
  const kosong: StatusChat = { tabel_ada: false, pesan: [], usulan: [], bots: [] };
  const ambil = (kolom: string) => {
    const q = db.from("bot_chat").select(kolom);
    return sejakId > 0 ? q.gt("id", sejakId).order("id", { ascending: true }).limit(KEBIJAKAN_CHAT.MUAT_PESAN) : q.order("id", { ascending: false }).limit(KEBIJAKAN_CHAT.MUAT_PESAN);
  };
  // Kolom usulan_id (sql/74) mungkin belum ada: ulangi tanpa itu.
  let r = await ambil(KOLOM_CHAT_USULAN);
  if (r.error && skemaBelumSiap(r.error)) r = await ambil(KOLOM_CHAT);
  if (r.error) {
    if (skemaBelumSiap(r.error)) return kosong;
    console.error("[bot-chat] muat:", r.error.message);
    throw new GalatChat("Gagal memuat chat.", 500);
  }
  const baris = ((r.data ?? []) as unknown as BarisChat[]).slice();
  if (sejakId <= 0) baris.reverse();

  const [rBot, rOtak] = await Promise.all([
    db.from("bot_redaksi").select("id, user_id, nama, warna, aktif, jeda, mode, kuota_harian").order("id"),
    db.from("bot_otak").select("bot_id"),
  ]);
  const bots = ((rBot.data ?? []) as unknown as BarisBot[]);
  const punya = new Set(((rOtak.data ?? []) as { bot_id: number }[]).map((o) => Number(o.bot_id)));
  const botPer = new Map(bots.map((b) => [Number(b.id), b]));
  const idMaster = [...new Set(baris.filter((b) => b.pengirim === "master" && b.user_id != null).map((b) => Number(b.user_id)))];
  const { data: orang } = idMaster.length ? await db.from("app_user").select("id, nama").in("id", idMaster) : { data: [] as { id: number; nama: string }[] };
  const namaMaster = new Map((orang ?? []).map((o) => [Number(o.id), String(o.nama ?? "Master")]));

  const pesan: PesanChat[] = baris.map((b) => {
    const bot = b.bot_id != null ? botPer.get(Number(b.bot_id)) : undefined;
    return {
      id: Number(b.id),
      pengirim: b.pengirim,
      nama: b.pengirim === "master" ? (namaMaster.get(Number(b.user_id)) ?? "Master") : b.pengirim === "sistem" ? "Sistem" : b.pengirim === "koordinator" ? "Nara" : String(bot?.nama ?? "Bot"),
      bot_id: b.bot_id != null ? Number(b.bot_id) : null,
      warna: b.pengirim === "koordinator" ? "#fb7185" : String(bot?.warna ?? ""),
      teks: String(b.teks ?? ""),
      menyebut: (b.menyebut ?? []).map(Number),
      usulan_id: b.usulan_id != null ? Number(b.usulan_id) : null,
      dibuat_pada: String(b.dibuat_pada ?? ""),
    };
  });
  const usulan = await usulanMenurutId([...new Set(pesan.map((p) => p.usulan_id).filter((x): x is number => x != null))]);
  return {
    tabel_ada: true,
    pesan,
    usulan,
    bots: [
      { id: ID_KOORDINATOR_CHAT, nama: "Nara", warna: "#fb7185", punya_otak: await koordinatorPunyaOtak(), aktif: true },
      ...bots.map((b) => ({ id: Number(b.id), nama: String(b.nama ?? ""), warna: String(b.warna ?? ""), punya_otak: punya.has(Number(b.id)), aktif: b.aktif !== false })),
    ],
  };
}

/** Simpan pesan master dan kembalikan id + bot yang disebut. Jawaban agen dijalankan terpisah (jawabPesan). */
export async function kirimPesanMaster(userId: number, teks: string): Promise<{ id: number; menyebut: number[] }> {
  const db = supabase();
  const { data: bots, error: eBot } = await db.from("bot_redaksi").select("id, nama, user_id");
  if (eBot) {
    if (skemaBelumSiap(eBot)) throw new GalatChat("Migrasi 73 (room chat bot) belum dijalankan.", 503);
    throw new GalatChat("Gagal membaca daftar bot.", 500);
  }
  const ids = await Promise.all(
    ((bots ?? []) as { id: number; nama: string; user_id: number }[]).map(async (b) => {
      const { data: u } = await db.from("app_user").select("username").eq("id", b.user_id).maybeSingle();
      return { id: Number(b.id), nama: String(b.nama ?? ""), username: String(u?.username ?? "") };
    }),
  );
  // Koordinator (id 0) didahulukan; total tetap dibatasi JAWABAN_MAKS.
  const menyebut = [...(menyebutKoordinator(teks) ? [ID_KOORDINATOR_CHAT] : []), ...cariSebutan(teks, ids)].slice(0, KEBIJAKAN_CHAT.JAWABAN_MAKS);
  const { data, error } = await db.from("bot_chat").insert({ pengirim: "master", user_id: userId, teks, menyebut }).select("id").single();
  if (error || !data) {
    if (skemaBelumSiap(error)) throw new GalatChat("Migrasi 73 (room chat bot) belum dijalankan.", 503);
    console.error("[bot-chat] simpan pesan:", error?.message);
    throw new GalatChat("Gagal mengirim pesan.", 500);
  }
  siarkanBot("chat");
  return { id: Number(data.id), menyebut };
}

async function tulisBalasan(pengirim: "bot" | "sistem", botId: number | null, teks: string, menyebut: number[] = []): Promise<void> {
  const { error } = await supabase().from("bot_chat").insert({ pengirim, bot_id: botId, teks: teks.slice(0, 4000), menyebut });
  if (error) console.error("[bot-chat] simpan balasan:", error.message);
  else siarkanBot("chat");
}

/**
 * Agen yang disebut di pesan `pesanId` menjawab, satu per satu. Tidak pernah melempar (dipanggil di after()).
 * Bot tanpa API key / gagal → catatan sistem yang jelas, bukan diam.
 */
export async function jawabPesan(pesanId: number): Promise<void> {
  try {
    const db = supabase();
    const { data: pesan } = await db.from("bot_chat").select(KOLOM_CHAT).eq("id", pesanId).maybeSingle();
    const p = pesan as unknown as BarisChat | null;
    if (!p || p.pengirim !== "master") return;
    const sebut = (p.menyebut ?? []).map(Number).slice(0, KEBIJAKAN_CHAT.JAWABAN_MAKS);
    if (sebut.length === 0) return;

    const { data: master } = p.user_id != null ? await db.from("app_user").select("nama").eq("id", p.user_id).maybeSingle() : { data: null };
    const namaMaster = String(master?.nama ?? "Master");
    // Koordinator berpikir sendiri (usulan, bukan sekadar jawaban); id 0 tidak dilayani sebagai bot biasa.
    if (sebut.includes(ID_KOORDINATOR_CHAT)) await tanggapiPesan(pesanId);
    const jedaGlobal = await bacaJedaGlobal();

    for (const botId of sebut) {
      if (botId === ID_KOORDINATOR_CHAT) continue;
      const { data: b } = await db.from("bot_redaksi").select("id, user_id, nama, warna, aktif, jeda, mode, kuota_harian").eq("id", botId).maybeSingle();
      const bot = b as unknown as BarisBot | null;
      if (!bot) continue;
      const nama = String(bot.nama ?? "Bot");
      if (!(await botPunyaOtak(botId))) {
        await tulisBalasan("sistem", botId, pesanTakBisaMenjawab(nama, "tanpa_kunci"));
        continue;
      }
      const [{ count }, { data: tugas }, { data: riwayatRaw }] = await Promise.all([
        db.from("bot_tugas").select("id", { count: "exact", head: true }).eq("bot_id", botId).gte("dibuat_pada", awalHariWibIso()),
        db.from("bot_tugas").select("judul, tahap").eq("bot_id", botId).in("tahap", ["cari", "pilih", "unduh", "edit", "siap_ditinjau", "menunggu_acc", "disetujui", "posting"]).order("id", { ascending: false }).limit(1),
        db.from("bot_chat").select("id, pengirim, bot_id, teks").lt("id", pesanId).order("id", { ascending: false }).limit(KEBIJAKAN_CHAT.KONTEKS_PESAN),
      ]);
      const t = ((tugas ?? []) as { judul: string | null; tahap: string }[])[0];
      const keadaan = ringkasKeadaan({
        aktif: bot.aktif !== false,
        jeda: bot.jeda === true,
        jedaGlobal,
        mode: bot.mode === "otomatis" ? "otomatis" : "acc",
        kuotaHarian: Math.max(0, Number(bot.kuota_harian ?? 1)),
        dibuatHariIni: count ?? 0,
        tugas: t ? { judul: String(t.judul ?? "(tanpa judul)"), tahap: t.tahap } : null,
      });
      const { data: semuaBot } = await db.from("bot_redaksi").select("id, nama");
      const namaBot = new Map(((semuaBot ?? []) as { id: number; nama: string }[]).map((x) => [Number(x.id), String(x.nama)]));
      const riwayat: PesanKonteks[] = ((riwayatRaw ?? []) as { id: number; pengirim: string; bot_id: number | null; teks: string }[])
        .reverse()
        .filter((r) => r.pengirim !== "sistem")
        .map((r) => ({ pengirim: r.pengirim, nama: r.pengirim === "master" ? namaMaster : r.pengirim === "koordinator" ? "Koordinator" : (namaBot.get(Number(r.bot_id)) ?? "Bot"), teks: String(r.teks ?? "") }));
      try {
        const mentah = await tanyaOtakBot(botId, Number(bot.user_id), {
          sistem: SISTEM_CHAT,
          pengguna: bangunPromptChat({ nama, keadaan, riwayat, pesan: { pengirim: "master", nama: namaMaster, teks: String(p.teks ?? "") } }),
          json: false,
          fitur: "chat",
          maksToken: 400,
          batasMs: 25_000,
        });
        const balasan = rapikanBalasan(mentah, nama);
        if (balasan) await tulisBalasan("bot", botId, balasan);
        else await tulisBalasan("sistem", botId, pesanTakBisaMenjawab(nama, "gagal"));
      } catch (e) {
        await tulisBalasan("sistem", botId, pesanTakBisaMenjawab(nama, e instanceof GalatOtak ? e.kode : "gagal"));
      }
    }
  } catch (e) {
    console.error("[bot-chat] jawab pesan:", e instanceof Error ? e.message : e);
  }
}
