// ============================================================
// BOT REDAKSI — platform tujuan efektif sebuah bot (14 Okt 2026). KHUSUS SERVER.
// Bot dari Kelola Bot tidak punya platform tersimpan: ia mengikuti akun sosmed yang tertaut di profil
// upload-post-nya (akun_tvr_user). Aturan pilihnya murni di bot-posting-murni (pilihPlatformBot).
// ============================================================

import { supabase } from "@/lib/supabase";
import { pilihPlatformBot } from "@/lib/bot-posting-murni";

/** Kunci platform upload-post untuk bot ini, atau null bila belum ada akun tertaut. Tidak pernah melempar. */
export async function platformEfektif(db: ReturnType<typeof supabase>, bot: { user_id: number | string; platform?: string | null }): Promise<string | null> {
  const tersimpan = pilihPlatformBot(bot.platform, []);
  if (tersimpan) return tersimpan;
  try {
    const { data, error } = await db.from("akun_tvr_user").select("platform").eq("user_id", Number(bot.user_id)).eq("terhubung", true);
    if (error) return null;
    return pilihPlatformBot("", ((data ?? []) as { platform: string | null }[]).map((r) => r.platform));
  } catch {
    return null;
  }
}
