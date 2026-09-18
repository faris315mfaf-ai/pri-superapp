---
type: project
status: active
area: PRI
tags: [project, pri, superapp, integrasi]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp.
     Sunting di sini akan tertimpa — ubah di catatan-obsidian/ pada repo. -->

Layanan luar yang dipakai [[PRI SuperApp]], dan untuk apa masing-masing.

## Peta cepat
| Layanan | Untuk apa | Keadaan |
|---|---|---|
| [[Supabase]] | database, penyimpanan, realtime | dipasang sendiri di VPS |
| [[SADAR]] | absensi | **sumber resmi** sejak 14 Sep 2026 |
| [[upload-post]] | unggah sosmed anggota (6 platform) | aktif |
| [[Ayrshare]] | akun TV Rakyat Official + komentar QC | aktif, sebagian digantikan |
| [[TikHub]] | ambil video tanpa watermark, angka per video | aktif |
| [[Chocodata]] | angka per video 6 sosmed | **kunci belum dipasang** |
| [[Cloudinary]] | kompresi video >50 MB, tempat singgah | aktif (kredit terlampaui) |
| [[Creatomate]] | render overlay judul/highlight | aktif |
| [[DeepSeek]] | menulis judul/caption otomatis | aktif |
| Gemini | asisten AI teks & suara | aktif |
| [[Luxand]] | pengenalan wajah | aktif, belum tuntas teruji |
| [[Fonnte & Convia]] | WhatsApp | Fonnte aktif, Convia dorman |
| Gmail SMTP | OTP email, lupa sandi | aktif |
| [[Cloudflare R2]] | penyimpanan video | **tidak dipakai di produksi** |
| [[n8n]] | otomasi QC & TV Rakyat | aktif, terpisah |
| [[Vercel]] | pengalih ke alamat utama | sisa peralihan |

## Aturan yang berlaku untuk semuanya

> [!danger] Kunci hanya hidup di env server
> Tidak pernah di kode, tidak pernah di Git, tidak pernah di catatan ini,
> tidak pernah di chat. Tempatnya `/opt/pri-superapp/aplikasi/env.txt` di VPS.
> Mengubahnya: edit berkas itu lalu `pri-perbarui --tanpa-tarik`.

**Kontrak API diverifikasi, tidak ditebak.** Beberapa bug nyata di proyek ini
lahir dari menebak bentuk data layanan luar — nama kolom akun sosial, satuan
waktu, nama parameter. Kalau ragu, panggil endpoint-nya dan lihat jawabannya.

**Gagal anggun.** Layanan luar yang mati tidak boleh mematikan fitur lain.
Contoh: SADAR tak terjangkau → tampilkan cerminan terakhir; komentar X tak
terbaca → tandai "perlu cek manual", **bukan** "belum komen".

**Daftarkan alamat luar baru.** Fitur klien yang memanggil domain luar wajib
didaftarkan di aturan keamanan aplikasi dulu. Gejala kalau lupa: "Failed to
fetch" tanpa satu pun log di server.

## Semua nama kunci yang dibaca kode
Nama saja — nilainya tidak pernah ditulis di sini.

<!-- otomatis:env -->
<!-- /otomatis -->

## Yang perlu diketahui tentang beberapa di antaranya

**Kunci yang hanya ada di server.** Beberapa kunci tidak pernah ada di
komputer user (dulu hanya di Vercel, kini di `env.txt` VPS). Jadi menjalankan
aplikasi di komputer sendiri tidak bisa menguji semua fitur.

**Dua dunia sosmed sengaja dipisah.** Akun TV Rakyat **Official** memakai
Ayrshare; akun **pribadi anggota** memakai upload-post. Ini bukan warisan
yang belum dirapikan — memang keputusan, supaya perubahan di satu sisi tidak
menjatuhkan sisi lain.

**Facebook tidak bisa diperiksa komentarnya.** Pengomentarnya hanya
menampilkan nama, bukan nama pengguna yang bisa dicocokkan ke kader.

**X butuh kunci milik user sendiri** sejak aturan Ayrshare berubah 31 Mar 2026.

## Terkait
- [[PRI SuperApp]] · [[PRI SuperApp - Arsitektur]] · [[PRI SuperApp - Tugas Menunggu]]

<!-- otomatis:diperbarui -->
<!-- /otomatis -->
