# PRI SuperApp — Worklog Bersama

Proyek: Aplikasi fullstack PRI SuperApp (adaptasi Next.js 16 dari prompt React/Vite).
Pengguna hanya dapat melihat route `/` (src/app/page.tsx). Semua interaksi via API routes.

## Arsitektur yang disepakati
- **Frontend**: SPA client-side di `/` — pergantian layar via state (bukan routing Next), animasi framer-motion.
- **Backend**: API routes di `src/app/api/*` yang membaca data dari `src/data/*`.
- **Lapisan data**: `src/services/*` (async, jeda 300–800ms, memanggil API routes) — komponen TIDAK BOLEH import `src/data` langsung.
- **Tipe data**: `src/types/index.ts` — penamaan field persis skema Supabase (akun_wajib, nama_kader, id_postingan, dst).
- **Desain**: Glassmorphism penuh, mesh gradient animasi, light/dark mode, Bahasa Indonesia.
- **Warna**: merah #DC2626, emas #F59E0B, hijau #10B981, merah gagal #EF4444, info #3B82F6.
- **Peran**: super_admin (semua), admin_hr (QC saja), admin_tv (TV saja).
- **Tanggal jangkar data demo**: 2026-08-23 (PERIODE_AKTIF = "2026-08-23 17:00-15:59").

## Status Task
- Task 1 (foundation types): SELESAI — `src/types/index.ts` berisi semua tipe + PERIODE_AKTIF + APP_TODAY_ISO.

- Task 2 (data + API + services): SELESAI — 3 lapisan backend penuh: `src/data/*` (10 file data deterministik), `src/app/api/*` (11 route), `src/services/index.ts` (satu pintu untuk UI). Lint bersih, tsc bersih di lingkup, semua endpoint sudah diuji curl, LLM proses-video live-tested.

## Task 2 — Rincian Lapisan Backend

### Data (`src/data/`) — murni data + helper, tanpa React
| File | Isi |
|---|---|
| `users.ts` | 3 pengguna (u-super/u-hr/u-tv, password `demo123` di tipe internal `UserInternal`, TIDAK pernah dikirim via API — helper `keUserPublik()` melepas password). |
| `akunWajib.ts` | 3 akun IG (dpp.pri, muhammad.nazaruddin_, tvrakyat.official) + `platformTersedia` (6 platform). |
| `kader.ts` | 24 kader k-01..k-24 + `peringkatKader` (12,12,11,11,10 — angka tampilan leaderboard sesuai spesifikasi). |
| `postingan.ts` | 12 postingan IG-DPP-01..05 / IG-MN-01..04 / IG-TV-01..03, periode aktif, thumbnail picsum seed = id_postingan. |
| `komentar.ts` | `komentarByPostingan` — kader selaras rekap + 2–3 warga/postingan (nama_kader null), deterministik via string-hash. |
| `rekap.ts` | 288 baris; `hitungStatistikAkun()`, `hitungRingkasan()`, `persenKepatuhanAkun` (82/76/71). |
| `videoAntrian.ts` | 8 video (3 selesai / 1 proses / 3 tunggu doksli / 1 gagal) + `hitungRingkasanVideo()`. |
| `beritaNtv.ts` | 6 berita Nusantara TV. |
| `notifikasi.ts` | 10 notifikasi (HARI_INI 4 / KEMARIN 3 / LEBIH_LAMA 3; 2 teratas belum dibaca). |
| `dashboard.ts` | 4 KPI, tren 7 hari (…80,73,78), kepatuhanAkun, 6 aktivitas. |

### Angka terverifikasi (skrip verifikasi 100+ asersi, semua LULUS)
- Rekap 288 baris, id_unik unik; per postingan sudah = 18,20,24,19,18 / 20,18,17,19 / 17,16,18 → total 224 (78%). IG-DPP-03 = 24/24 (Lengkap).
- Pasangan patuh penuh: dpp 16 + nazar 15 + tv 14 = 45 → `hitungRingkasan()` = `{ total_postingan: 12, kader_patuh: "45 / 72", perlu_ditindak: 27, persen_kepatuhan: 78 }`.
- 5 kader teratas patuh penuh di 3 akun; komentar kader di `komentar.ts` == baris rekap sudah per postingan; waktu komentar selalu antara waktu_posting dan 15:30 WIB.
- Catatan spesifikasi: leaderboard `peringkatKader` memakai angka harfiah 12/12/11/11/10 (tampilan dashboard), sedangkan baris rekap 5 kader teratas otomatis 12 karena dipatok patuh penuh — pakai `peringkat` dari api/dashboard apa adanya di UI.

### API routes (`src/app/api/*/route.ts`) — semua `dynamic = "force-dynamic"`, NextResponse.json, jeda 300–800ms
`login` (POST, 401 "Email atau kata sandi salah"), `akun-wajib`, `kader`, `postingan` (?akun_wajib=&periode=, + sudah/belum_komentar_kader), `komentar` (?id_postingan=), `rekap` (?id_postingan= | ?periode=, +`ringkasan` bila id_postingan), `video-antrian` (+ringkasan status), `berita`, `notifikasi`, `dashboard` ({kpi,tren,kepatuhanAkun,aktivitas,peringkat,ringkasanVideo,ringkasan}), `proses-video` (POST: validasi domain tiktok/instagram → 400 pesan Indonesia; z-ai-web-dev-sdk LLM `thinking: disabled`, parse JSON tahan code fence, field user menang atas LLM, fallback template — tidak pernah 500; live test OK).

## KONTRAK SERVICES UNTUK AGENT UI (Task 3)
Import SATU-SATUNYA dari `@/services` (JANGAN import `@/data` dari komponen). Semua async, jeda 300–800ms, error berbahasa Indonesia (throw `Error`).
```ts
login(email: string, password: string): Promise<User>                       // 401 → throw Error("Email atau kata sandi salah")
getAkunWajib(): Promise<AkunWajibWithStats[]>                               // + {total_postingan, sudah, belum, persen, kader_patuh_penuh}
getKader(): Promise<Kader[]>                                                // 24 kader
getPostinganByAkun(akun_wajib: string, periode?: string): Promise<PostinganWithKepatuhan[]>  // + {sudah_komentar_kader, belum_komentar_kader}
getKomentarByPostingan(id_postingan: string): Promise<Komentar[]>           // nama_kader null = warga
getRekapPostingan(id_postingan: string): Promise<{ rekap: Rekap[]; ringkasan: {sudah, belum, persen} }>
getVideoAntrian(): Promise<{ data: VideoAntrian[]; ringkasan: Record<string, number> }>
getBeritaTerbaru(): Promise<Berita[]>
getNotifikasi(): Promise<NotifikasiItem[]>
getDashboard(): Promise<DashboardData>                                      // {kpi, tren, kepatuhanAkun, aktivitas, peringkat, ringkasanVideo, ringkasan}
prosesVideo(payload: { link: string; judul_overlay?: string; highlight?: string }): Promise<HasilProsesVideo>
getPeriodeList(): Promise<string[]>                                         // 7 periode, [0] = PERIODE_AKTIF
```
Tipe tambahan yang di-export dari `@/services`: `AkunWajibWithStats`, `PostinganWithKepatuhan`, `PeringkatKader`, `RingkasanPostingan`, `RingkasanGlobal`, `DashboardData`. Tipe domain lain dari `@/types` (`User`, `Kader`, `Postingan`, `Komentar`, `Rekap`, `VideoAntrian`, `Berita`, `NotifikasiItem`, `KpiItem`, `Aktivitas`, `HasilProsesVideo`, `PERIODE_AKTIF`).
Status video yang mungkin: "MENUNGGU DOKSLI" | "SEDANG DIPROSES" | "SUDAH DIPROSES" | "GAGAL". Akun demo: super@pri.id / hr@pri.id / tv@pri.id (password `demo123`).

## KONTRAK DESIGN SYSTEM UNTUK AGENT FITUR (Task 3 selesai)

### Store global — `import { useAppStore, toast } from "@/hooks/use-app-store"`
```ts
useAppStore((s) => s.user)            // User | null — {id, nama, email, role, avatar_url, jabatan}
useAppStore((s) => s.tema)            // "light" | "dark"
toast(jenis, judul, isi?)             // helper non-React: jenis = "sukses"|"error"|"info"|"peringatan"
useAppStore.getState().pushToast({jenis, judul, isi})
```
State lain (toasts, pushBanners, notifikasi + tandaiDibaca/tandaiSemuaDibaca/hapusNotifikasi, setNotifikasi) sudah tersedia. Notifikasi pusat dikelola page.tsx (memuat via getNotifikasi) — fitur notifikasi cukup pakai store.

### Komponen design system
| Komponen | Import | Props penting |
|---|---|---|
| `MeshBackground` | `@/components/mesh-background` | tanpa props — render sekali di root |
| `GlassCard` | `@/components/glass-card` | `{children, className?, onClick?, kuat?, ariaLabel?}` — ada onClick = otomatis jadi tombol dengan efek tekan |
| `ProgressRing` | `@/components/progress-ring` | `{value: 0-100, size?, strokeWidth?, color?: "auto"\|string, children?}` — color "auto" = hijau≥80/kuning50-79/merah<50; children = isi tengah |
| `PlatformIcon` + `labelPlatform` | `@/components/platform-icon` | `{platform: string, size?, denganWadah?}` |
| `ToastViewport` | `@/components/toast-viewport` | tanpa props — render sekali di root |
| `PushBannerStack` | `@/components/push-banner` | `{onTarget: (target) => void}` — render sekali di root |
| `BottomNav` | `@/components/bottom-nav` | `{role, tabAktif, onTab, belumBaca?}` — render oleh page.tsx |
| `GlassSkeleton`, `EmptyState`, `AvatarInisial`, `ScreenHeader`, `ThemeToggle`, `StatusBadge`, `FadeInUp`, `SectionTitle` | `@/components/pri-ui` (semua dalam SATU file) | lihat bawah |

Detail `@/components/pri-ui`:
- `GlassSkeleton({className})` — shimmer kaca.
- `EmptyState({ikon, judul, keterangan, labelAksi?, onAksi?, className?})`.
- `AvatarInisial({nama, ukuran?: "sm"|"md"|"lg"|"xl"|number, className?})` — warna otomatis dari hash nama.
- `ScreenHeader({judul, onKembali?, kanan?, className?})` — sticky, tombol kembali lingkaran kaca. Untuk halaman sub (detail), WAJIB pakai ini.
- `ThemeToggle({className?})`.
- `StatusBadge({label, warna?: "hijau"|"kuning"|"merah"|"biru"|"netral"|"pri", berkedip?, className?})` — berkedip = dot animasi ping (untuk "Sedang Diproses").
- `FadeInUp({delay?, className?, children})` — animasi fade-in-up stagger.
- `SectionTitle({judul, aksi?, className?})`.

### Utilitas format — `import {...} from "@/lib/format"`
`formatAngka(n)` (1.247), `jamWIB(iso)` ("09.42"), `tanggalIndonesia(iso)` ("Minggu, 23 Agustus 2026"), `sapaanHari()`, `inisial(nama)`, `warnaAvatar(nama)`, `warnaKepatuhan(persen)`, `linkWhatsApp(nomorWa, pesan)`, `pesanPengingat(namaKader, akunWajib, linkPostingan)` (template WhatsApp lengkap dari prompt).

### Konvensi visual (WAJIB)
- Warna token Tailwind: `text-pri` (merah), `text-emas`, `text-sukses`, `text-gagal`, `text-info`, `text-teks-utama`, `text-teks-sekunder`, `bg-app-bg`. Gradient merah: `style={{background: "linear-gradient(135deg, #DC2626, #B91C1C)"}}`.
- Judul pakai `font-heading` (Plus Jakarta Sans), isi `font-sans` (Inter). Angka statistik: class `angka-tab`.
- Konten halaman dalam wrapper `<div className="kolom-aplikasi px-4 pb-32">` (kolom-aplikasi = max-w-480px terpusat; pb-32 beri ruang bottom nav). Root scroll ada di body.
- Semua file fitur WAJIB `"use client"` di baris pertama. Skeleton saat loading (GlassSkeleton), EmptyState saat kosong, error → toast("error", ...).
- Tombol utama: gradient merah + shadow `0 8px 20px rgba(220,38,38,0.35)` + class `btn-tekan` + `font-heading font-bold`.
- Gambar picsum: `<img>` biasa (bukan next/image) + `loading="lazy"` + fallback onError sembunyikan (opsional).
- Ikon lucide-react. Chart: recharts (AreaChart/PieChart) — ResponsiveContainer tinggi tetap.
- LARANGAN: jangan import `@/data`; jangan pakai warna indigo/blue sebagai identitas (info #3B82F6 hanya untuk status proses); jangan tulis teks Inggris di UI; jangan buat route baru; jangan edit `src/app/page.tsx`, `globals.css`, `layout.tsx`, komponen design system, atau file agent lain.

### Status Task (terbaru)
- Task 1 & 3 (foundation + design system + auth): SELESAI — types, globals.css (token kaca + mesh + shimmer), layout (font Jakarta+Inter), store zustand, 9 komponen design system, login screen + splash.

## Task 5 (Agent B — Dashboard Super Admin): SELESAI
Lingkup: hanya `src/features/dashboard/` — 8 file baru, semua `"use client"` di baris pertama. `bun run lint` (eslint) bersih untuk folder ini; `tsc --noEmit` 0 error untuk folder ini. Semua data via `getDashboard()` dari `@/services`, tidak ada angka hardcoded di JSX, tidak import `@/data`. Import hanya dari modul yang diizinkan kontrak.

### File + ekspor
| File | Ekspor | Props |
|---|---|---|
| `dashboard-screen.tsx` | `DashboardScreen` | `{ user: User; onBukaModulQc: () => void; onBukaModulTv: () => void; onBukaNotifikasi: () => void; jumlahBelumBaca: number }` |
| `kpi-card.tsx` | `KpiCard` | `{ kpi: KpiItem; delay?: number }` |
| `trend-chart.tsx` | `TrendChart` | `{ data: { hari: string; nilai: number }[] }` |
| `kepatuhan-akun-card.tsx` | `KepatuhanAkunCard` | `{ data: { akun_wajib: string; persen: number }[] }` |
| `pipeline-video-card.tsx` | `PipelineVideoCard` | `{ ringkasan: Record<string, number> }` |
| `top-kader-card.tsx` | `TopKaderCard` | `{ peringkat: PeringkatKader[] }` |
| `akses-cepat-panel.tsx` | `AksesCepatPanel` | `{ onBukaModulQc: () => void; onBukaModulTv: () => void }` |
| `aktivitas-feed.tsx` | `AktivitasFeed` | `{ aktivitas: Aktivitas[] }` |

### Perilaku penting
- **Header**: `{sapaanHari()}, {user.nama.split(" ")[0]}` + `tanggalIndonesia(APP_TODAY_ISO)`; kanan: `AvatarInisial` ukuran "lg" + tombol lonceng kaca (badge merah gradient, nilai `jumlahBelumBaca`, >99 → "99+", onClick `onBukaNotifikasi`) + `ThemeToggle`.
- **Loading**: 4 GlassSkeleton kartu KPI + 1 skeleton chart. **Error**: `toast("error", "Gagal memuat dashboard", pesan)` + EmptyState dengan tombol "Coba Lagi" (memanggil ulang `getDashboard()`).
- Seksi dirender `FadeInUp` delay 0 / 0.06 / 0.12 / 0.18 / 0.24 / 0.3 / 0.36 (a–g); KpiCard punya stagger internal `delay = 0.06 + i*0.05`.
- **KpiCard**: ikon per label (Target=kepatuhan→pri, Eye=postingan→emas, MessageCircleOff=belum komentar→info, Video=video→sukses) dalam lingkaran kaca lembut; tren panah + delta, hijau `text-sukses` bila membaik — untuk "Kader Belum Komentar" TURUN = membaik.
- **TrendChart**: AreaChart gradient `#gradTren` (merah 0.35→transparan), stroke 2.5, XAxis tick fontSize 10 fill `var(--text-secondary)`, YAxis [0,100] hide, grid putus "3 6", tooltip kaca kustom (hari + nilai + "%"), `ReferenceDot` titik akhir r=6 + label nilai position top, angka besar terakhir + "Hari ini" di pojok kanan atas kartu.
- **KepatuhanAkunCard**: baris `@akun_wajib` + persen (`warnaKepatuhan`), bar track kaca h-2.5 rounded-full, fill gradient + `motion.div` width 0→`${persen}%` delay stagger 0.12s.
- **PipelineVideoCard**: donut PieChart 110px (innerRadius 32, outerRadius 48, paddingAngle 3, stroke none) warna [emas menunggu, info diproses, sukses selesai, gagal merah] + overlay total di tengah; legenda 4 baris label Indonesia ("Menunggu Doksli", "Sedang Diproses", "Sudah Diposting", "Gagal") + angka kanan.
- **TopKaderCard**: 3 teratas lingkaran gradient emas #F59E0B→#FBBF24 / perak #CBD5E1→#E2E8F0 / perunggu #D97706→#F59E0B (ikon Medal hanya peringkat 1), 4–5 lingkaran polos kaca; AvatarInisial "sm"; nama + subteks "komentar"; jumlah komentar `angka-tab font-bold` kanan.
- **AksesCepatPanel**: `SectionTitle` "Akses Cepat" + grid-cols-2 tombol GlassCard min-h-[84px] "Modul QC Konten" (ShieldCheck, gradient merah) & "Otomatisasi TV" (Tv, gradient emas), class btn-tekan.
- **AktivitasFeed**: timeline vertikal 6 item; titik + ikon per jenis (QC=merah ShieldCheck, VIDEO=emas Video, ROSTER=hijau Users, SISTEM=abu Settings2); garis vertikal kaca tipis; teks `text-sm` + waktu relatif `text-xs text-teks-sekunder`.
- Semua kartu punya EmptyState cadangan bila datanya kosong.

### Catatan untuk agent lain (PENTING)
1. **Error TS milik file lain (bukan scope saya)**: `src/features/auth/login-screen.tsx(11,10): Module '"@/components/pri-ui"' has no exported member 'GlassCard'` — GlassCard diekspor dari `@/components/glass-card`, BUKAN dari `@/components/pri-ui`. Saya tidak boleh mengedit file itu; mohon agent auth/koordinator membenahi impor tersebut agar build penuh lulus. (4 error `tsc` lain ada di `examples/` & `skills/` — bawaan sandbox, di luar `src/`.)
2. `/api/dashboard` diverifikasi live: kpi 4 item, tren 7 hari berakhir 78 ("Min"), kepatuhanAkun 82/76/71, ringkasanVideo `{SUDAH DIPROSES: 3, SEDANG DIPROSES: 1, MENUNGGU DOKSLI: 3, GAGAL: 1}` (total 8), peringkat 5 kader (12/12/11/11/10).
3. `DashboardScreen` belum dipasang di `page.tsx` (tugas integrasi koordinator): `<DashboardScreen user={user} onBukaModulQc={...} onBukaModulTv={...} onBukaNotifikasi={...} jumlahBelumBaca={...} />` — `jumlahBelumBaca` bisa dihitung dari `useAppStore((s) => s.notifikasi.filter(n => !n.dibaca).length)`.

## Task 8 (Agent E — Notifikasi + Profil): SELESAI
Lingkup: hanya `src/features/notifikasi/` dan `src/features/profil/` — 3 file baru, semua `"use client"` di baris pertama. `eslint` bersih untuk ketiga file; `tsc --noEmit` 0 error untuk kedua folder. Tidak import `@/data`, hanya modul kontrak (pri-ui, use-app-store, @/types, @/lib/utils) + framer-motion + lucide-react. Diverifikasi tambahan lewat smoke test SSR (render ketiga layar + aksi store tandaiDibaca/tandaiSemuaDibaca/hapusNotifikasi lulus semua, skrip lalu dihapus).

### File + ekspor
| File | Ekspor | Props |
|---|---|---|
| `src/features/notifikasi/notifikasi-screen.tsx` | `NotifikasiScreen` | `{ onTarget: (target: "qc" \| "tv" \| "dashboard" \| null) => void }` |
| `src/features/profil/profil-screen.tsx` | `ProfilScreen` | `{ user: User; onLogout: () => void }` |
| `src/features/profil/switch-kaca.tsx` | `SwitchKaca` | `{ aktif: boolean; onUbah: () => void; labelAria: string; disabled?: boolean }` — toggle kaca `role="switch"` w-11 h-6, knob putih shadow, aktif gradient merah |

### Perilaku NotifikasiScreen
- **Sumber data**: murni store (`useAppStore((s) => s.notifikasi)`); page.tsx memuat via `getNotifikasi()` + `setNotifikasi`. Bila array kosong DAN belum pernah terisi → 5 skeleton baris list (GlassSkeleton lingkaran + 2 garis). Pembanding "pernah terisi" memakai flag level-modul `sudahAdaDataNotifikasi` (di-set via effect) supaya remount tab tidak salah menampilkan skeleton setelah semua notifikasi terhapus → EmptyState (BellOff, "Tidak Ada Notifikasi").
- **Header** (tab utama, tanpa tombol kembali, sticky): judul "Notifikasi" `font-heading text-2xl` + `ThemeToggle`; di bawah judul kanan: tombol kaca kecil "Tandai semua dibaca" (CheckCheck, teks xs) → `tandaiSemuaDibaca()` + `toast("sukses", "Semua notifikasi ditandai dibaca")`; `disabled` bila tak ada yang belum dibaca.
- **Pengelompokan**: SectionTitle "Hari Ini" (HARI_INI) / "Kemarin" (KEMARIN) / "Lebih Lama" (LEBIH_LAMA), seksi kosong tidak dirender, tiap seksi FadeInUp stagger.
- **Baris**: kartu kaca `motion.button` drag="x" `dragConstraints {left:-120,right:0}` `dragMomentum={false}`. Titik biru #3B82F6 + ring lembut kiri bila belum dibaca (ruang dot selalu dicadangkan agar rata); ikon kategori dalam lingkaran kaca lembut (QC=ShieldCheck #DC2626, VIDEO=Video #F59E0B, SISTEM=Settings2 #10B981); judul bold text-sm + isi text-xs line-clamp-2; waktu relatif text-[11px] kanan sejajar judul.
- **Swipe hapus**: di belakang baris ada aksi merah `bg-gagal` (Trash2 + "Hapus") yang muncul via `useTransform(x, [-16,-56],[0,1])`; `onDragEnd` offset < -80 (atau velocity < -500) → `animate(x, -(lebar+60))` lalu `hapusNotifikasi(id)` + `toast("sukses", "Notifikasi dihapus")`; baris dibungkus `AnimatePresence` exit collapse height. Tap vs drag dibedakan cek offset (|x| > 6 diabaikan). Klik baris → `tandaiDibaca(id)` + `onTarget(targetLayar(item.target))` — target "notifikasi" dipetakan ke null.
- Aksesibilitas: aria-label per baris menyertakan waktu + status "belum dibaca", aksi hapus aria-label (tabIndex -1, gesture tambahan).

### Perilaku ProfilScreen
- **Header**: "Profil" + ThemeToggle (pola sama, sticky).
- **Kartu profil kaca**: `AvatarInisial` ukuran 72 + nama `font-heading` extrabold + email `text-teks-sekunder` + badge peran pill gradient lembut + ikon (super_admin=Zap merah-emas "Super Admin", admin_hr=ShieldCheck emas "Admin HR", admin_tv=Tv hijau "Admin TV") + baris jabatan kecil.
- **Daftar pengaturan** (SectionTitle "Pengaturan", baris kartu kaca min-h-[54px], ikon kiri lingkaran lembut): 1) "Mode Tema" Sun/Moon dinamis + SwitchKaca sinkron `tema`/`toggleTema`; 2) "Notifikasi Push" Bell + switch state lokal (default aktif; mati → `toast("info", "Notifikasi push dimatikan")`); 3) "Notifikasi WhatsApp" MessageCircle + switch lokal; 4) "Bahasa" Globe, kanan "Indonesia" + StatusBadge netral "nonaktif", baris redup cursor-default, klik → `toast("info", "Bahasa lain segera hadir")`; 5) "Tentang Aplikasi" Info, kanan "Versi 1.0.0" → modal kaca (logo PRI gradient, "PRI SuperApp v1.0.0", tagline, kredit singkat, tombol Tutup); 6) "Keluar" baris merah (LogOut, label `text-gagal font-semibold`) → modal konfirmasi "Keluar dari PRI SuperApp?" / "Anda akan kembali ke halaman masuk." + Batal netral / "Ya, Keluar" gradient merah → `onLogout()`.
- **ModalKaca** lokal reusable: overlay `fixed inset-0 bg-black/50 backdrop-blur-md z-[70]`, kartu `glass-strong rounded-2xl` scale-up spring; Escape + klik backdrop menutup; body scroll dikunci saat terbuka; `role="dialog" aria-modal`.
- Footer: "PRI SuperApp · © 2026 Partai Rakyat Indonesia".

### Catatan untuk koordinator (integrasi page.tsx)
1. Pasang: `<NotifikasiScreen onTarget={(t) => ...} />` (t = "qc" | "tv" | "dashboard" | null; null = tetap) dan `<ProfilScreen user={user} onLogout={...} />`. Pastikan page.tsx memuat `getNotifikasi()` → `setNotifikasi` (kontrak Task 3) — layar ini tidak memanggil services sama sekali.
2. **Error milik file lain (bukan scope saya)**: `tsc` — `src/features/auth/login-screen.tsx(11,10)` GlassCard dari pri-ui (sudah dicatat Task 5) dan `src/features/tv-rakyat/preview-modal.tsx(374,24)` `Loader2` tidak diimpor; `eslint` — `src/features/tv-rakyat/kirim-video-panel.tsx(48)` react-hooks/set-state-in-effect. Semuanya di luar lingkup saya, dibiarkan utuh.

---
Task ID: 9 & 10
Agent: Koordinator Utama (Z.ai Code)
Task: Integrasi app shell (page.tsx) + verifikasi end-to-end penuh

Work Log:
- Membangun src/app/page.tsx: cangkang SPA dengan fase login → splash (0,8 dtk) → aplikasi
- Navigasi: tab bottom-nav per role (state terjaga antar tab via mount permanen + toggle visibility), sub-layar QC (detail akun → detail postingan) sebagai overlay slide-dari-kanan via AnimatePresence
- Membangun modul QC Konten sendiri (Agent C gagal karena rate limit): qc-screen (analisis 7 tahap beranimasi + ring persen + ringkasan + chip platform + daftar akun), account-detail-screen, post-detail-screen (tab belum/sudah komentar + pencarian + WhatsApp + modal Ingatkan Semua), whatsapp-icon
- Perbaiki import GlassCard/ProgressRing lint & tsc bersih; refactor mount-detection dengan useSyncExternalStore (lolos aturan React 19 set-state-in-effect)
- Simulasi push notification: 2 banner (3,5 dtk & 9 dtk setelah login + notifikasi termuat), klik banner → navigasi ke modul target
- Verifikasi agent-browser (viewport 400×850 + 1280×800): login+validasi+shake, 3 role, dashboard lengkap, analisis QC, detail akun/postingan, tab komentar, modal, TV Rakyat end-to-end (berita → proses video LLM live 2,3 dtk → pratinjau → unggah 3 platform + toast), notifikasi (kelompok, tandai dibaca, badge), profil, logout, dark mode persist, desktop 480px terpusat
- QA visual VLM: dashboard light 8/10, profil dark 9/10, desktop OK

Stage Summary:
- Aplikasi PRI SuperApp SELESAI dan terverifikasi browser end-to-end: lint 0 error, tsc 0 error, semua API 200, LLM proses-video live
- Lapisan migrasi Supabase/n8n siap: ganti isi src/services/index.ts saja, UI & data tidak tersentuh
- Struktur sesuai prompt: src/data (dummy), src/services, src/features/{auth,dashboard,qc-konten,tv-rakyat,notifikasi,profil}, src/components, src/hooks, src/types, token desain di globals.css
