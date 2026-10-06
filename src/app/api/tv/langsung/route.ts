// RUANG TIM TV RAKYAT OFFICIAL — LANGSUNG (7 Okt 2026, lib/tv-langsung).
//
// GET  /api/tv/langsung?hadir=1,5,9&sejak_pesan=123
//   → { aktivitas, pesan, orang, saya }
//   aktivitas : 40 aksi tim terbaru (edit, kirim, posting, tandai manual…)
//               dari audit_aktivitas — 7 hari terakhir
//   pesan     : Obrolan Tim = grup chat "Divisi TV Rakyat" (sama dengan
//               modul Chat); sejak_pesan → hanya yang lebih baru
//   orang     : nama & foto untuk id yang sedang hadir (presence Realtime
//               hanya membawa id)
// POST /api/tv/langsung { isi } → kirim pesan Obrolan Tim (+ siaran)
import { bungkus } from "@/lib/api-helper";
import { supabase } from "@/lib/supabase";
import { pastikanMasuk } from "@/lib/sesi";
import { pastikanTidakMelebihiBatas } from "@/lib/rate-limit";
import { bolehRuangTv, DIVISI_OBROLAN_TV, siarkanTv } from "@/lib/tv-langsung";

export const dynamic = "force-dynamic";

const JENIS_TV = ["stok_tim", "unggah_official", "tv_riwayat", "tv_official_up"];
const HARI_AKTIVITAS = 7;

type Orang = { nama: string; avatar_url: string };

async function petaOrang(ids: number[]): Promise<Record<string, Orang>> {
  const unik = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))].slice(0, 200);
  if (unik.length === 0) return {};
  const { data } = await supabase().from("app_user").select("id, nama, avatar_url").in("id", unik);
  return Object.fromEntries((data ?? []).map((o) => [String(o.id), { nama: String(o.nama ?? ""), avatar_url: String(o.avatar_url ?? "") }]));
}

async function pastikanTim(request: Request) {
  const user = await pastikanMasuk(request);
  if (!(await bolehRuangTv(user))) {
    throw Object.assign(new Error("Ruang ini khusus tim TV Rakyat Official."), { status: 403 });
  }
  return user;
}

export async function GET(request: Request) {
  return bungkus(async () => {
    const user = await pastikanTim(request);
    const url = new URL(request.url);
    const hadir = (url.searchParams.get("hadir") ?? "")
      .split(",")
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 60);
    const sejakPesan = Math.max(0, Number(url.searchParams.get("sejak_pesan")) || 0);
    const db = supabase();
    const batas = new Date(Date.now() - HARI_AKTIVITAS * 86_400_000).toISOString();

    let kueriPesan = db
      .from("chat_pesan_grup")
      .select("id, pengirim_id, isi, gambar_url, dibuat_pada")
      .eq("divisi", DIVISI_OBROLAN_TV)
      .is("dihapus_pada", null)
      .order("id", { ascending: false })
      .limit(40);
    if (sejakPesan) kueriPesan = kueriPesan.gt("id", sejakPesan);

    const [{ data: akt }, { data: psn }] = await Promise.all([
      db
        .from("audit_aktivitas")
        .select("id, user_id, jenis, ringkasan, detail, dibuat_pada")
        .gte("dibuat_pada", batas)
        .or(`jenis.in.(${JENIS_TV.join(",")}),detail->>tim.eq.true`)
        .order("dibuat_pada", { ascending: false })
        .limit(40),
      kueriPesan,
    ]);

    const aktivitas = (akt ?? []).map((a) => {
      const d = (a.detail ?? {}) as Record<string, unknown>;
      return {
        id: Number(a.id),
        user_id: String(a.user_id),
        jenis: String(a.jenis),
        ringkasan: String(a.ringkasan ?? ""),
        // Hanya rincian yang perlu tampil — bukan IP/perangkat.
        gagal: Array.isArray(d.gagal) ? (d.gagal as unknown[]).map(String) : [],
        waktu: String(a.dibuat_pada),
      };
    });
    const pesan = (psn ?? [])
      .map((p) => ({
        id: Number(p.id),
        user_id: String(p.pengirim_id),
        isi: String(p.isi ?? ""),
        gambar_url: p.gambar_url ? String(p.gambar_url) : null,
        waktu: String(p.dibuat_pada),
      }))
      .reverse();

    const orang = await petaOrang([
      ...hadir,
      ...aktivitas.map((a) => Number(a.user_id)),
      ...pesan.map((p) => Number(p.user_id)),
      Number(user.id),
    ]);
    return { aktivitas, pesan, orang, saya: String(user.id) };
  });
}

export async function POST(request: Request) {
  const tolak = await pastikanTidakMelebihiBatas(request, "tv-obrolan", 30, 60);
  if (tolak) return tolak;
  return bungkus(async () => {
    const user = await pastikanTim(request);
    const body = (await request.json().catch(() => ({}))) as { isi?: string };
    const isi = String(body.isi ?? "").trim();
    if (!isi) throw Object.assign(new Error("Pesan kosong."), { status: 400 });
    if (isi.length > 1000) throw Object.assign(new Error("Pesan maksimal 1000 karakter."), { status: 400 });
    const { data, error } = await supabase()
      .from("chat_pesan_grup")
      .insert({ divisi: DIVISI_OBROLAN_TV, pengirim_id: Number(user.id), isi })
      .select("id, dibuat_pada")
      .single();
    if (error) throw new Error("Pesan gagal dikirim.");
    siarkanTv("obrolan");
    return { sukses: true, id: Number(data.id), waktu: String(data.dibuat_pada) };
  });
}
