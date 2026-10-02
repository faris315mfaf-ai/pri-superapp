// Kunci per akun (pengganti threading.Lock di tvr_api.py): simpan template
// dan kirim job tidak boleh balapan (klik ganda, dua perangkat). Node satu
// utas, tapi di antara dua await permintaan lain bisa menyela.
const rantai = new Map<string, Promise<void>>();

export async function denganKunci<T>(akun: string, kerja: () => Promise<T> | T): Promise<T> {
  const sebelum = rantai.get(akun) ?? Promise.resolve();
  let lepas!: () => void;
  const giliran = new Promise<void>((ok) => (lepas = ok));
  const ekor = sebelum.then(() => giliran);
  rantai.set(akun, ekor);
  await sebelum;
  try {
    return await kerja();
  } finally {
    lepas();
    if (rantai.get(akun) === ekor) rantai.delete(akun);
  }
}
