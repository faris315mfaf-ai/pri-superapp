import type { KunciTab } from "@/components/bottom-nav";

/** Warna ikon ala aplikasi macOS — tiap modul punya identitas sendiri. */
export const WARNA_DOCK: Record<KunciTab, [string, string]> = {
  beranda: ["#2E9BFF", "#0A63E0"],
  konten: ["#FFB340", "#FF7A00"],
  qc: ["#5EE6C9", "#0FA88F"],
  acara: ["#FF6482", "#E0234E"],
  tv: ["#FF6259", "#D7261D"],
  tvnas: ["#7D7AFF", "#4542D6"],
  tvrku: ["#FF4F6D", "#C8102E"],
  dashboard: ["#6BD3FF", "#1A8CFF"],
  asisten: ["#C77DFF", "#7B2CF0"],
  chat: ["#5BE07A", "#24A148"],
  notifikasi: ["#FF6961", "#E5322B"],
  profil: ["#A1A1A6", "#5B5B60"],
};
