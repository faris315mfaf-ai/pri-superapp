// ============================================================
// Status keterlambatan absensi (spek 1.15) — dipakai UI dan server.
// Batas masuk 09:15 WIB: lebih awal/tepat = "Tepat Waktu", lewat =
// "Telat X Jam Y Menit" dihitung dari selisihnya.
// ============================================================

const BATAS_MENIT = 9 * 60 + 15; // 09:15 WIB

/** Menit-sejak-tengah-malam WIB dari sebuah waktu ISO. */
function menitWib(iso: string): number {
  const d = new Date(iso);
  return (
    Number(
      d.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }),
    ) *
      60 +
    Number(d.toLocaleString("en-US", { timeZone: "Asia/Jakarta", minute: "2-digit" }))
  );
}

/** "Tepat Waktu" / "Telat 1 Jam 5 Menit" dari jam masuk. */
export function statusTelat(waktuMasukIso: string): string {
  const menit = menitWib(waktuMasukIso);
  if (menit <= BATAS_MENIT) return "Tepat Waktu";
  const selisih = menit - BATAS_MENIT;
  const jam = Math.floor(selisih / 60);
  const mnt = selisih % 60;
  if (jam > 0 && mnt > 0) return `Telat ${jam} Jam ${mnt} Menit`;
  if (jam > 0) return `Telat ${jam} Jam`;
  return `Telat ${mnt} Menit`;
}

/** true bila jam masuknya tepat waktu (<= 09:15 WIB). */
export function tepatWaktu(waktuMasukIso: string): boolean {
  return menitWib(waktuMasukIso) <= BATAS_MENIT;
}
