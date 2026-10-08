# Strix — pentest AI untuk PRI SuperApp

[Strix](https://github.com/usestrix/strix) adalah alat *penetration testing* bertenaga
agen AI (open source, Apache-2.0). Dia membaca kode/menjelajah aplikasi, mencari
kerentanan (OWASP Top 10: injeksi, IDOR, XSS, SSRF, dll.), lalu **membuktikan**
temuan dengan *proof-of-concept* yang benar-benar dieksekusi di sandbox Docker —
bukan sekadar peringatan analisis statis.

Status di Mac ini (per 8 Okt 2026):

- CLI `strix` v1.7.0 (versi terbaru GitHub) di `~/.local/bin/strix`.
  Perbarui kapan pun dengan `strix --update`.
- Konfigurasi model di `~/.strix/cli-config.json` (di **luar** repo — patuh aturan
  tanpa-rahasia-di-repo): model `deepseek/deepseek-v4-pro`, kunci disalin dari
  `DEEPSEEK_API_KEY` di `.env.local`. **Jika kunci DeepSeek dirotasi, salin ulang
  ke berkas itu** (format: `{"env": {"STRIX_LLM": "...", "LLM_API_KEY": "..."}}`,
  permission 0600).
- Image sandbox `ghcr.io/usestrix/strix-sandbox:1.3.0` sudah ditarik ke Docker lokal.
  Docker harus berjalan sebelum scan.
- Skill agen terpasang global (ZCode + Claude): `find-security-vulnerabilities-in-code`,
  `fix-security-vulnerabilities-with-strix`, `web-app-penetration-testing`,
  `api-security-testing`.

## Menjalankan scan

White-box scan kode proyek ini (paling murah, dari akar repo):

```bash
strix --target . \
  --instruction "Abaikan isi .env.local dan berkas .env* lainnya; jangan pernah memakai, memuat, atau menyalin kunci API apa pun ke dalam laporan."
```

Peringatan di `--instruction` itu penting: folder target dimount utuh ke sandbox,
termasuk `.env.local` yang berisi kunci produksi. Kalau mau lebih ketat lagi,
pindahkan dulu `.env.local` keluar folder sebelum scan.

Mode & batasan yang sering dipakai:

| Kebutuhan                 | Opsi                                            |
| ------------------------- | ----------------------------------------------- |
| Tanpa TUI (untuk cron/CI) | `-n` (non-interaktif)                           |
| Scan cepat                | `-m quick` (pilihan: quick/standard/deep)       |
| Batas biaya               | `--max-budget 5` (USD, memakai kredit DeepSeek) |
| Gagal hanya jika kritis   | `--fail-on high` (headless saja)                |
| Lanjutkan scan terhenti   | `--resume <nama-run>`                           |

Hasil scan tersimpan di `strix_runs/<nama-run>/` — **sudah di-gitignore** karena
berisi detail kerentanan. Buka laporannya dengan `strix view`.

## Target lain (semuanya milik sendiri — sah diuji)

- Aplikasi produksi: `strix --target https://<domain-produksi>` — lakukan saat
  sepi; scan menimbulkan lalu-lintas dan log seperti pengguna nyata.
- API internal: berikan berkas OpenAPI/Postman, atau target URL + instruksi
  endpoint yang mau diuji.
- JANGAN pernah menarget `72.61.143.158` (VPS mesin Auto Edit) atau VPS aplikasi
  tanpa koordinasi — render berjalan di sana.

## Mengganti model

`~/.strix/cli-config.json` memakai format LiteLLM `provider/model`. Alternatif
yang kuncinya sudah ada di `.env.local`:

- Gemini: `gemini/gemini-2.5-pro` + `GEMINI_API_KEY` (nama env `LLM_API_KEY` tetap).
- Rekomendasi resmi Strix bila punya akun lain: `openrouter/z-ai/glm-5.3`,
  `openai/gpt-5.4`, `anthropic/claude-sonnet-4-6`.
