---
type: platform
category: ai-model
status: active
pricing: bayar per token — saldo terbaca di Panel Master
tags: [platform, pri, ai]
---

<!-- Catatan ini DISINKRON OTOMATIS dari repo pri-superapp. -->

## Apa ini & untuk apa
Menulis **judul, highlight, dan caption** otomatis dari caption asli sebuah
video. Dipakai Studio PALUGODAM di [[PRI SuperApp]] dan otomasi
[[AUTOMATION TV RAKYAT]] (di sana juga untuk mendeteksi video yang sama
diposting ulang di dua platform).

## Cara pakai / integrasi
Dipanggil dengan gaya yang sama seperti OpenAI, jawabannya diminta dalam
bentuk terstruktur supaya bisa langsung dipakai. Satu panggilan bisa
menghasilkan beberapa varian sekaligus, lalu dibagikan ke tiap akun — jadi
tiap akun dapat judul yang berbeda.

Pemakaian token dicatat aplikasi sendiri (tabel pemakaian AI) dan bisa
dilihat di Panel Master bersama sisa saldo.

## Autentikasi
- Key disimpan di: `env.txt` pada VPS — `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`
- Kunci pernah dikirim lewat chat → sebaiknya sudah diganti.

## Project/area terkait
- [[PRI SuperApp]] — Studio PALUGODAM, Panel Master (token AI)
- [[AUTOMATION TV RAKYAT]]

## Catatan & troubleshooting
- Uji nyata: 2 judul + highlight + caption dalam **3 detik**.
- Di otomasi n8n, perintah untuk deteksi duplikat sempat **kosong** di berkas
  workflow — terkirim tanpa isi, jadi hasilnya tidak masuk akal. Sekarang
  sudah diisi lengkap.
- Kalau jawabannya gagal dibaca, aplikasi punya jalur cadangan — tapi jalur
  itu pernah menunjuk ke bagian yang belum tentu sudah berjalan.
