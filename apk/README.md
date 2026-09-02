# APK PRI SuperApp

APK ini **Trusted Web Activity (TWA)** — cangkang Android tipis yang menampilkan
`https://pri-superapp.vercel.app` secara layar penuh. Isinya diambil langsung dari
web, jadi setiap `vercel --prod` otomatis ikut ter-update di ponsel **tanpa
memasang ulang APK**.

## Membangun ulang

```bash
node scripts/bangun-apk.mjs
```

Hasil: `apk/app-release-signed.apk`

Perkakas yang dibutuhkan (sudah terpasang di mesin ini):
JDK 17 di `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`,
Android SDK di `C:\Users\Admin\android-sdk`, jalurnya tercatat di
`~/.bubblewrap/config.json`.

## Menaikkan versi

Sebelum membangun rilis baru, naikkan **keduanya** di `apk/twa-manifest.json`:

```json
"appVersionName": "1.0.1",
"appVersionCode": 2
```

`appVersionCode` harus selalu naik — Android menolak memasang APK dengan
angka yang sama atau lebih kecil dari yang sudah terpasang.

## Kalau ganti kunci penanda tangan

Sidik jari kunci tertanam di dua tempat dan **wajib sama**:

1. `apk/pri-superapp.keystore` (kunci itu sendiri)
2. `src/app/.well-known/assetlinks.json/route.ts` → konstanta `SIDIK_JARI_APK`

Ambil sidik jari barunya:

```bash
"/c/Program Files/Microsoft/jdk-17.0.20.101-hotspot/bin/keytool.exe" -list -v \
  -keystore apk/pri-superapp.keystore -alias pri-superapp | grep "SHA256:"
```

Lalu perbarui konstanta di route tersebut dan deploy. Kalau tidak cocok,
aplikasi tetap jalan tapi memunculkan bilah alamat Chrome di atas —
terlihat seperti peramban, bukan aplikasi.

## Yang TIDAK boleh hilang

`apk/pri-superapp.keystore` dan `apk/KUNCI-PENTING.txt` (berisi sandinya).
Tanpa keduanya, APK versi berikutnya tidak bisa dipasang menimpa yang lama —
Android menolak APK bertanda tangan berbeda, dan pengguna harus mencopot
aplikasi lama dulu. Tidak ada cara memulihkan kunci yang hilang.

Keduanya sudah masuk `.gitignore`. Simpan salinannya di pengelola sandi atau
drive pribadi.
