---
type: platform
category: messaging-api
status: active
pricing: Fonnte paket Max · Convia berbayar
tags: [platform, pri, whatsapp]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Dua gerbang WhatsApp yang dipakai berdampingan — **bukan** karena belum
dirapikan, tapi karena masing-masing bisa melakukan hal yang tidak bisa
dilakukan yang lain.

| | Fonnte | Convia |
|---|---|---|
| Jenis | tidak resmi | resmi (WABA) |
| Kirim ke nomor baru | **bisa** | hanya lewat template disetujui Meta |
| Kirim ke **grup** | **bisa** | tidak bisa |
| Risiko | akun bisa diblokir | aman |

## Kenapa Convia belum menggantikan Fonnte
> [!danger] Bloker: template harus disetujui Meta
> Convia hanya boleh mengirim teks bebas ke orang yang **sudah pernah chat
> duluan**. Untuk OTP — yang menurut definisinya kontak pertama — wajib pakai
> template resmi. Template OTP yang diajukan user **ditolak Meta berulang**.
>
> Kalau Fonnte dicabut sekarang, **OTP semua pengguna baru gagal**. Jadi
> kode Convia sudah siap tapi sengaja dimatikan lewat sakelar env, dan
> OTP tetap lewat Fonnte.

Fitur **Pengumuman → WhatsApp** juga sudah jadi tapi dorman, menunggu
template "pengumuman" disetujui. Sementara itu pengumuman tetap sampai lewat
notifikasi dalam aplikasi.

Tips penolakan template: kategori harus **Authentication** untuk OTP (format
sudah ditetapkan Meta), bukan kategori lain dengan teks OTP karangan sendiri.

## Cara pakai / integrasi
- Fonnte: header tanpa kata "Bearer"; membalas 200 walau gagal → periksa isi
  jawabannya, jangan percaya kode statusnya.
- Convia: header dengan "Bearer"; memakai kode status HTTP dengan benar.

Kenyataan lapangan: hanya ±115 dari 129 anggota aktif punya nomor WA.

## Autentikasi
- `env.txt` pada VPS — `FONNTE_TOKEN`, `CONVIA_API_KEY`,
  `CONVIA_OTP_AKTIF`, `CONVIA_PENGUMUMAN_AKTIF`

## Project/area terkait
- [[PRI SuperApp]] — OTP, rekap absensi PDF, pengumuman, laporan grup
- [[AUTOMATION TV RAKYAT]] — notifikasi tim redaksi lewat Fonnte

## Catatan & troubleshooting
- Parameter template Meta **tidak boleh mengandung baris baru** — teks
  dipadatkan dulu sebelum dikirim.
- Untuk siaran massal, sengaja **tidak** memakai Fonnte (risiko blokir).
