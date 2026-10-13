// Siaran realtime Ruang Bot (13 Okt 2026). Payload HANYA {jenis, t}: topik
// bersifat publik, jadi detail selalu diambil lewat API berpagar master.
import { siarkanRealtime } from "@/lib/realtime-server";

export const TOPIK_BOT = "bot-ruang";
export const EVENT_BOT = "berubah";

export type JenisPerubahanBot = "denyut" | "kendali" | "log" | "tugas";

/** Siarkan perubahan; tidak pernah melempar & tidak ditunggu lama. */
export function siarkanBot(jenis: JenisPerubahanBot): void {
  void siarkanRealtime(TOPIK_BOT, EVENT_BOT, { jenis, t: Date.now() }).catch(() => false);
}
