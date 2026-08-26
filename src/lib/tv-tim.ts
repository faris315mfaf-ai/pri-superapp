// ============================================================
// Wewenang TV Rakyat (KHUSUS SISI SERVER).
//
// Sumber tunggal untuk tiga pertanyaan:
//   - bolehModulTv   : siapa yang melihat modul TV Rakyat?
//   - bolehAccVideo   : siapa yang boleh menyetujui/menolak video?
//   - bolehUploadVideo: siapa yang boleh mengunggah ke sosmed?
//
// Aturannya berjenjang: Pimred (jabatan) & master selalu penuh; admin_tv
// (peran lama) tetap dihormati; sisanya bergantung baris di tabel
// tv_tim yang ditunjuk Pimred. Dibuat satu tempat supaya tidak ada
// gerbang yang memakai aturan berbeda dari yang lain.
// ============================================================
import { supabase } from "@/lib/supabase";
import { adalahPimred } from "@/lib/jabatan";
import { bolehProsesVideo } from "@/types";
import type { UserPublik } from "@/lib/sesi";

export type WewenangTv = {
  anggota: boolean; // masuk modul TV Rakyat
  acc: boolean; // menyetujui/menolak video
  upload: boolean; // mengunggah ke sosmed
  proses: boolean; // memproses/mengedit video
};

/**
 * Hitung wewenang TV seseorang. Satu query ke tv_tim; Pimred/master/
 * admin_tv tidak butuh baris di sana.
 */
export async function wewenangTv(user: {
  id: string | number;
  role?: string;
  jabatan?: string | null;
}): Promise<WewenangTv> {
  const penuh = adalahPimred(user) || bolehProsesVideo((user.role ?? "") as never);
  if (penuh) {
    return { anggota: true, acc: true, upload: true, proses: true };
  }

  const { data } = await supabase()
    .from("tv_tim")
    .select("boleh_acc, boleh_upload")
    .eq("user_id", Number(user.id))
    .maybeSingle();

  if (!data) {
    return { anggota: false, acc: false, upload: false, proses: false };
  }
  // Anggota tim TV boleh memproses video; ACC & upload menyusul
  // penunjukan Pimred.
  return {
    anggota: true,
    proses: true,
    acc: data.boleh_acc === true,
    upload: data.boleh_upload === true,
  };
}

/** true bila user berhak menyetujui video (dipakai /api/tv/persetujuan). */
export async function bolehAccVideo(user: UserPublik): Promise<boolean> {
  return (await wewenangTv(user)).acc;
}

/** true bila user berhak mengunggah ke sosmed (dipakai /api/tv/unggah). */
export async function bolehUploadVideo(user: UserPublik): Promise<boolean> {
  return (await wewenangTv(user)).upload;
}
