-- ============================================================
-- 64 — OTP WhatsApp ARAH MASUK (7 Okt 2026)
--
-- Gateway WhatsApp sendiri (GOWA) tidak boleh MEMULAI chat ke nomor yang
-- belum pernah berinteraksi (WhatsApp error 463 "reach-out timelock").
-- Maka verifikasi dibalik: aplikasi menampilkan kode + tautan wa.me,
-- PENGGUNA yang mengirim pesan ke nomor gateway, webhook gateway
-- (/api/wa/masuk) mencocokkan pengirim + kode lalu menandai baris ini
-- terkonfirmasi. Bukti kepemilikan = pesan datang DARI nomor itu.
--
--   arah              'keluar' (kode dikirim ke pengguna) | 'masuk'
--   token_hash        sha256 token acak untuk polling status oleh klien
--   dikonfirmasi_pada kapan pesan cocok diterima webhook
-- ============================================================

alter table otp_wa add column if not exists arah text not null default 'keluar';
alter table otp_wa add column if not exists token_hash text;
alter table otp_wa add column if not exists dikonfirmasi_pada timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'otp_wa_arah_cek') then
    alter table otp_wa add constraint otp_wa_arah_cek check (arah in ('keluar', 'masuk'));
  end if;
end $$;

create unique index if not exists idx_otp_wa_token on otp_wa (token_hash) where token_hash is not null;
