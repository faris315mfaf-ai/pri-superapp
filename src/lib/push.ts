// Helper Web Push sisi klien.
//
// Dipakai layar Profil (tombol "Notifikasi Push") dan pendaftaran
// otomatis setelah login. Semua fungsi aman dipanggil di peramban yang
// tidak mendukung push — mereka mengembalikan status, bukan melempar.

/** Ubah kunci VAPID base64url menjadi Uint8Array yang diminta browser. */
function kunciKeArray(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const mentah = atob(base64);
  const arr = new Uint8Array(mentah.length);
  for (let i = 0; i < mentah.length; i++) arr[i] = mentah.charCodeAt(i);
  return arr;
}

export type StatusPush =
  | "tidak-didukung"
  | "ditolak"
  | "belum-diminta"
  | "aktif";

/**
 * Berlangganan perubahan izin notifikasi, untuk useSyncExternalStore.
 *
 * Izin bisa diubah pengguna dari Pengaturan ponsel tanpa menyentuh
 * aplikasi. Permissions API memberi tahu saat itu terjadi; peramban yang
 * tidak mendukungnya cukup diam (fungsi pembatalan tetap dikembalikan).
 */
export function langgananIzinNotifikasi(saatBerubah: () => void): () => void {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return () => undefined;
  }
  let status: PermissionStatus | null = null;
  let dibatalkan = false;

  navigator.permissions
    .query({ name: "notifications" as PermissionName })
    .then((s) => {
      if (dibatalkan) return;
      status = s;
      s.addEventListener("change", saatBerubah);
    })
    .catch(() => undefined);

  return () => {
    dibatalkan = true;
    status?.removeEventListener("change", saatBerubah);
  };
}

/** Kondisi izin notifikasi saat ini, tanpa memunculkan dialog apa pun. */
export function statusPush(): StatusPush {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "tidak-didukung";
  }
  if (Notification.permission === "denied") return "ditolak";
  if (Notification.permission === "granted") return "aktif";
  return "belum-diminta";
}

/**
 * Minta izin lalu daftarkan perangkat ini ke server.
 *
 * Mengembalikan status akhir. Dipanggil dari aksi pengguna (klik tombol)
 * — Android menolak permintaan izin yang muncul tanpa interaksi.
 */
export async function aktifkanPush(emailUser?: string): Promise<StatusPush> {
  const awal = statusPush();
  if (awal === "tidak-didukung" || awal === "ditolak") return awal;

  const izin =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (izin !== "granted") return izin === "denied" ? "ditolak" : "belum-diminta";

  const kunciPublik = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!kunciPublik) throw new Error("Kunci notifikasi belum diatur di server");

  const registrasi = await navigator.serviceWorker.ready;

  // Pakai langganan yang sudah ada bila tersedia; membuat ulang tanpa
  // perlu hanya menghasilkan endpoint baru dan baris duplikat.
  const langganan =
    (await registrasi.pushManager.getSubscription()) ??
    (await registrasi.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: kunciKeArray(kunciPublik) as BufferSource,
    }));

  const res = await fetch("/api/push/langganan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...langganan.toJSON(), email_user: emailUser }),
  });
  if (!res.ok) throw new Error("Gagal mendaftarkan perangkat ke server");

  return "aktif";
}

/** Cabut langganan perangkat ini (izin browser tidak ikut dicabut). */
export async function matikanPush(): Promise<void> {
  if (statusPush() === "tidak-didukung") return;
  const registrasi = await navigator.serviceWorker.ready;
  const langganan = await registrasi.pushManager.getSubscription();
  if (!langganan) return;

  await fetch("/api/push/langganan", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: langganan.endpoint }),
  }).catch(() => undefined);

  await langganan.unsubscribe().catch(() => undefined);
}
