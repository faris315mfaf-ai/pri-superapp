"use client";

// ============================================================
// KelolaBotScreen (14 Okt 2026) — Profil → Kelola Bot (khusus master).
// Satu tempat untuk menyiapkan bot tanpa terminal:
//   1. Akun Bot        — buat bot baru (akun superapp di Divisi BOT + profil perilakunya) dan ubah profilnya
//   2. Profil Upload-Post — hubungkan profil upload-post (akun sosmed) ke bot
//   3. Otak (API Key)  — hubungkan bot ke model LLM lewat API key, lengkap dengan tutorial memasangnya
// Memakai ulang komponen yang sudah ada (OtakBot, TautanProfilMaster, ModalTautkanProfil).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, ExternalLink, Layers, Link2, Loader2, Pencil, Plus, UserPlus } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { GlassSkeleton, ScreenHeader, SectionTitle } from "@/components/pri-ui";
import { toast, useAppStore } from "@/hooks/use-app-store";
import { useVersiSegar } from "@/hooks/use-segar-otomatis";
import { ModalTautkanProfil } from "@/features/dashboard/modal-tautkan-profil";
import { PotretBot } from "@/features/ruang-bot/potret-bot";
import { OtakBot } from "@/features/tvr-ku/otak-bot";
import { TautanProfilMaster } from "@/features/tvr-ku/tautan-profil-master";
import { TemplateBot } from "@/features/tvr-ku/template-bot";
import { masukSebagai } from "@/lib/kendali-klien";
import { KonteksTimAutoEdit, tandaAkunBot } from "@/features/auto-edit/tim";
import { EditOtomatisTvr } from "@/features/tvr-ku/edit-otomatis-tvr";
import {
  HANDLE_BOT_MAKS,
  MAKS_BOT,
  NAMA_BOT_MAKS,
  PERAN_MAKS,
  PERSONA_MAKS,
  WAJAH_BOT,
  WARNA_BOT_PILIHAN,
  normalkanProfilBot,
  rupaBot,
} from "@/lib/bot-akun-murni";
import type { BotRingkas, StatusBot } from "@/lib/bot-tipe";
import { getStatusBot, kirimAkunBot } from "@/services";
import { cn } from "@/lib/utils";

type Tab = "akun" | "profil" | "otak" | "template";

const TAB: { kunci: Tab; label: string }[] = [
  { kunci: "akun", label: "Akun Bot" },
  { kunci: "profil", label: "Profil Upload-Post" },
  { kunci: "otak", label: "Otak (API Key)" },
  { kunci: "template", label: "Template Auto Edit" },
];

type Isian = { nama: string; peran: string; persona: string; warna: string; handle: string; rupa: number; rupaDiubah?: boolean };
const ISIAN_KOSONG: Isian = { nama: "", peran: "", persona: "", warna: WARNA_BOT_PILIHAN[0], handle: "", rupa: 0 };

// ---------- form profil bot (buat / ubah) ----------

function FormBot({
  awal,
  tombol,
  sibuk,
  onKirim,
  onBatal,
}: {
  awal: Isian;
  tombol: string;
  sibuk: boolean;
  onKirim: (i: Isian) => void;
  onBatal?: () => void;
}) {
  const [i, setI] = useState<Isian>(awal);
  const ubah = (b: Partial<Isian>) => setI((s) => ({ ...s, ...b }));
  const sah = normalkanProfilBot({ ...i });
  const pratinjau = useMemo(() => rupaBot(i.rupa, i.warna), [i.rupa, i.warna]);
  // 10 pilihan rupa digambar ulang hanya saat warna berganti, bukan tiap ketikan.
  const daftarRupa = useMemo(() => WAJAH_BOT.map((_, n) => rupaBot(n, i.warna)), [i.warna]);
  const kelasInput = "glass-input h-11 w-full rounded-xl px-3 text-sm text-teks-utama";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (sah.ok && !sibuk) onKirim(i);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-teks-sekunder">
          Nama bot
          <input value={i.nama} onChange={(e) => ubah({ nama: e.target.value })} maxLength={NAMA_BOT_MAKS} placeholder="mis. Raka" className={kelasInput} disabled={sibuk} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-teks-sekunder">
          Peran
          <input value={i.peran} onChange={(e) => ubah({ peran: e.target.value })} maxLength={PERAN_MAKS} placeholder="mis. Redaktur Pencari" className={kelasInput} disabled={sibuk} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-teks-sekunder">
        Watak / cara berpikir (memengaruhi gaya tulisan & obrolannya, bukan aturan keselamatan)
        <textarea
          value={i.persona}
          onChange={(e) => ubah({ persona: e.target.value })}
          maxLength={PERSONA_MAKS}
          rows={3}
          placeholder="mis. Teliti membaca situasi. Mengejar berita yang baru terbit dan paling cepat naik tayangannya."
          className="glass-input w-full rounded-xl px-3 py-2 text-sm text-teks-utama"
          disabled={sibuk}
        />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-teks-sekunder">
        Nama akun sosmed (tampilan, opsional)
        <input value={i.handle} onChange={(e) => ubah({ handle: e.target.value })} maxLength={HANDLE_BOT_MAKS} placeholder="mis. @tvr.raka" autoCapitalize="none" className={kelasInput} disabled={sibuk} />
        <span className="text-[10.5px] font-normal">Platform tujuan posting tidak perlu diisi: mengikuti akun sosmed yang Anda tautkan di tab Profil Upload-Post.</span>
      </label>

      <div>
        <p className="mb-1.5 text-[11.5px] font-semibold text-teks-sekunder">Warna bot</p>
        <div className="flex flex-wrap gap-2">
          {WARNA_BOT_PILIHAN.map((w) => (
            <button
              key={w}
              type="button"
              aria-label={`Warna ${w}`}
              aria-pressed={i.warna === w}
              onClick={() => ubah({ warna: w })}
              className={cn("h-8 w-8 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pri", i.warna === w ? "border-teks-utama" : "border-transparent")}
              style={{ background: w }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11.5px] font-semibold text-teks-sekunder">Tampilan karakter</p>
        <div className="flex flex-wrap gap-1.5">
          {daftarRupa.map((rupa, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Rupa ${n + 1}`}
              aria-pressed={i.rupa === n}
              onClick={() => ubah({ rupa: n, rupaDiubah: true })}
              className={cn(
                "rounded-xl border-2 bg-black/5 p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pri dark:bg-white/10",
                i.rupa === n ? "border-pri" : "border-transparent",
              )}
            >
              <PotretBot rupa={rupa} lencana={i.warna} skala={2} label={`Rupa ${n + 1}`} />
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-teks-sekunder">
          <PotretBot rupa={pratinjau} lencana={i.warna} skala={3} label="Pratinjau bot" className="rounded-xl bg-black/5 dark:bg-white/10" />
          <span>Pratinjau di Ruang Bot</span>
        </div>
      </div>

      {!sah.ok && (i.nama || i.peran || i.persona) && <p className="text-[11.5px] text-amber-600 dark:text-amber-400">{sah.pesan}</p>}

      <div className="flex gap-2">
        {onBatal && (
          <button type="button" onClick={onBatal} disabled={sibuk} className="glass btn-tekan h-11 rounded-xl px-4 text-[13px] font-bold text-teks-utama disabled:opacity-50">
            Batal
          </button>
        )}
        <button
          type="submit"
          disabled={!sah.ok || sibuk}
          className="btn-tekan flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
        >
          {sibuk ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {tombol}
        </button>
      </div>
    </form>
  );
}

const isianDari = (b: BotRingkas): Isian => {
  const cocok = WAJAH_BOT.findIndex((w) => w.kulit === b.rupa.kulit && w.rambut === b.rupa.rambut && w.gayaRambut === b.rupa.gayaRambut);
  return { nama: b.nama, peran: b.peran, persona: b.persona, warna: b.warna, handle: b.handle, rupa: cocok >= 0 ? cocok : 0 };
};

// ---------- tab: akun bot ----------

function TabAkun({ status, onSegar }: { status: StatusBot | null; onSegar: () => void }) {
  const [tambah, setTambah] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [ubahId, setUbahId] = useState<number | null>(null);

  const buat = async (i: Isian) => {
    setSibuk(true);
    try {
      const r = await kirimAkunBot({ aksi: "buat", nama: i.nama, peran: i.peran, persona: i.persona, warna: i.warna, handle: i.handle, rupa_indeks: i.rupa });
      toast("sukses", "Bot dibuat", "username" in r ? `Akun ${r.username} siap. Lanjut: hubungkan profil upload-post dan API key.` : "");
      setTambah(false);
      onSegar();
    } catch (e) {
      toast("error", "Gagal membuat bot", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  };

  const simpan = async (botId: number, i: Isian) => {
    setSibuk(true);
    try {
      // Rupa dikirim hanya bila Anda memilihnya; bila tidak, tampilan yang sudah ada (mis. hasil skrip) tidak ditimpa.
      await kirimAkunBot({
        aksi: "ubah",
        bot_id: botId,
        nama: i.nama,
        peran: i.peran,
        persona: i.persona,
        warna: i.warna,
        handle: i.handle,
        ...(i.rupaDiubah ? { rupa_indeks: i.rupa } : {}),
      });
      toast("sukses", "Profil bot disimpan");
      setUbahId(null);
      onSegar();
    } catch (e) {
      toast("error", "Gagal menyimpan", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  };

  const bots = status?.bots ?? [];
  const tabelAda = status?.tabel_ada !== false;

  return (
    <section className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <p className="text-[12px] leading-relaxed text-teks-sekunder">
          Setiap bot punya <b className="text-teks-utama">akun superapp sendiri</b> di Divisi BOT dan dihitung sebagai anggota. Akun ini dibuat otomatis (username
          bot1, bot2, …) dan <b className="text-teks-utama">tidak bisa login</b>; Anda mengendalikannya lewat layar ini, Ruang Bot, atau TVR Saya → Kendali Akun BOT.
        </p>
      </GlassCard>

      {!tabelAda && (
        <GlassCard className="p-4 text-[12px] text-amber-700 dark:text-amber-300">Migrasi Bot Redaksi (sql/67) belum dijalankan, jadi bot belum bisa dibuat.</GlassCard>
      )}

      {status === null ? (
        <GlassSkeleton className="h-28 rounded-2xl" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {bots.map((b) => (
            <li key={b.id}>
              <GlassCard className="p-3.5">
                <div className="flex items-start gap-3">
                  <PotretBot rupa={b.rupa} lencana={b.warna} skala={3} label={`Potret ${b.nama}`} className="shrink-0 rounded-xl bg-black/5 dark:bg-white/10" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <b className="text-[14px] text-teks-utama">{b.nama}</b>
                      <span className="text-[11px] text-teks-sekunder">@{b.username}</span>
                    </p>
                    <p className="text-[12px] text-teks-utama">{b.peran}</p>
                    <p className="truncate text-[11.5px] text-teks-sekunder">
                      {b.platform || "platform mengikuti profil upload-post"}
                      {b.handle ? ` · ${b.handle}` : ""}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] font-bold">
                      <span className={cn("rounded-full px-2 py-0.5", b.akun_tertaut > 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400")}>
                        {b.akun_tertaut > 0 ? `${b.akun_tertaut} akun sosmed tertaut` : "belum ada akun sosmed"}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5", b.punya_otak ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400")}>
                        {b.punya_otak ? "punya API key" : "tidur (belum punya API key)"}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUbahId(ubahId === b.id ? null : b.id)}
                    aria-label={`Ubah profil ${b.nama}`}
                    aria-expanded={ubahId === b.id}
                    className="glass btn-tekan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-teks-utama"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {ubahId === b.id && (
                  <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
                    <FormBot awal={isianDari(b)} tombol="Simpan perubahan" sibuk={sibuk} onKirim={(i) => void simpan(b.id, i)} onBatal={() => setUbahId(null)} />
                  </div>
                )}
              </GlassCard>
            </li>
          ))}
          {bots.length === 0 && tabelAda && <li className="text-center text-[12px] text-teks-sekunder">Belum ada bot. Buat yang pertama di bawah.</li>}
        </ul>
      )}

      {tabelAda &&
        (tambah ? (
          <GlassCard className="p-4">
            <SectionTitle judul="Bot baru" />
            <div className="mt-2.5">
              <FormBot awal={ISIAN_KOSONG} tombol="Buat bot & akun superapp" sibuk={sibuk} onKirim={(i) => void buat(i)} onBatal={() => setTambah(false)} />
            </div>
          </GlassCard>
        ) : (
          <button
            type="button"
            onClick={() => setTambah(true)}
            disabled={bots.length >= MAKS_BOT}
            className="btn-tekan flex h-12 items-center justify-center gap-2 rounded-2xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #DC2626, #B91C1C)" }}
          >
            <UserPlus className="h-4.5 w-4.5" aria-hidden="true" />
            Tambah bot{bots.length >= MAKS_BOT ? ` (batas ${MAKS_BOT} tercapai)` : ""}
          </button>
        ))}
    </section>
  );
}

// ---------- tab: profil upload-post ----------

function TabProfil({ status, onSegar }: { status: StatusBot | null; onSegar: () => void }) {
  const [modal, setModal] = useState<{ userId: number } | null>(null);
  const bots = status?.bots ?? [];

  return (
    <section className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <p className="text-[12px] leading-relaxed text-teks-sekunder">
          Bot memposting lewat <b className="text-teks-utama">profil upload-post</b>. Satu profil berisi akun sosmed (Instagram, TikTok, YouTube, dst.) yang sudah login di
          upload-post. Ada dua cara: <b className="text-teks-utama">(a)</b> buat profil bernama baru untuk bot lalu kirim tautan login ke pemilik akun sosmed supaya ia
          menyambungkannya, atau <b className="text-teks-utama">(b)</b> tautkan profil yang sudah ada di dashboard upload-post ke bot (daftar di bawah).
        </p>
      </GlassCard>

      <GlassCard className="p-4">
        <SectionTitle judul="Per bot" />
        {status === null ? (
          <GlassSkeleton className="mt-2.5 h-20 rounded-2xl" />
        ) : bots.length === 0 ? (
          <p className="mt-2.5 text-[12px] text-teks-sekunder">Belum ada bot. Buat dulu di tab Akun Bot.</p>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-2">
            {bots.map((b) => (
              <li key={b.id} className="flex items-center gap-2.5 rounded-xl bg-black/[0.03] px-2.5 py-2 dark:bg-white/5">
                <PotretBot rupa={b.rupa} lencana={b.warna} skala={2} label={`Potret ${b.nama}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold text-teks-utama">{b.nama}</span>
                  <span className={cn("block text-[11px]", b.akun_tertaut > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                    {b.akun_tertaut > 0 ? `${b.akun_tertaut} akun sosmed tertaut` : "belum ada akun sosmed"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setModal({ userId: b.user_id })}
                  className="btn-tekan flex shrink-0 items-center gap-1 rounded-full bg-pri/12 px-3 py-1.5 text-[11px] font-bold text-pri"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Profil baru
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <TautanProfilMaster />

      {modal && (
        <ModalTautkanProfil
          permintaan={{ mode: "buat" }}
          userIdAwal={modal.userId}
          onTutup={() => setModal(null)}
          onSelesai={() => {
            setModal(null);
            onSegar();
          }}
        />
      )}
    </section>
  );
}

// ---------- tab: otak (API key) + tutorial ----------

function Langkah({ children }: { children: React.ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

function TautanLuar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-pri underline">
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function TutorialApiKey() {
  const kelas = "mt-1.5 list-decimal space-y-1 pl-5 text-[11.5px] leading-relaxed text-teks-sekunder";
  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pri/10 text-pri">
          <BrainCircuit className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-teks-sekunder">
          <b className="text-teks-utama">Otak bot = model bahasa (LLM)</b> yang menulis hook, caption, jawaban obrolan, dan (untuk Nara) usulan penugasan. Tiap bot
          dihubungkan ke model lewat <b className="text-teks-utama">API key</b> milik Anda. Bot tanpa key <b className="text-teks-utama">tidur di kamar tidur</b> dan tidak
          bekerja. Pilih salah satu penyedia di bawah, ikuti langkahnya, lalu tempel key di kartu bot.
        </p>
      </div>

      <details className="mt-3 rounded-xl bg-black/[0.03] p-3 dark:bg-white/5" open>
        <summary className="cursor-pointer text-[12.5px] font-bold text-teks-utama">Cara mendapatkan API key DeepSeek</summary>
        <ol className={kelas}>
          <Langkah>
            Buka <TautanLuar href="https://platform.deepseek.com">platform.deepseek.com</TautanLuar>, daftar atau masuk dengan akun Anda.
          </Langkah>
          <Langkah>Isi saldo (menu Top up / Billing). Pemakaian dihitung per token dan murah; tanpa saldo key tidak bisa dipakai.</Langkah>
          <Langkah>
            Buka menu <b>API keys</b> → <b>Create new API key</b>, beri nama (mis. &quot;bot-raka&quot;).
          </Langkah>
          <Langkah>
            <b>Salin key-nya sekarang</b> (diawali <code>sk-</code>). DeepSeek hanya menampilkannya sekali.
          </Langkah>
          <Langkah>Kembali ke sini, pilih penyedia <b>DeepSeek</b> di kartu bot, tempel key, tekan <b>Simpan</b>, lalu <b>Uji</b>.</Langkah>
        </ol>
      </details>

      <details className="mt-2 rounded-xl bg-black/[0.03] p-3 dark:bg-white/5">
        <summary className="cursor-pointer text-[12.5px] font-bold text-teks-utama">Cara mendapatkan API key Google Gemini</summary>
        <ol className={kelas}>
          <Langkah>
            Buka <TautanLuar href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</TautanLuar> dan masuk dengan akun Google.
          </Langkah>
          <Langkah>
            Tekan <b>Create API key</b>, pilih proyek Google Cloud yang ada atau buat yang baru.
          </Langkah>
          <Langkah>
            <b>Salin key-nya</b> (diawali <code>AIza</code>). Anda bisa membukanya lagi di halaman yang sama.
          </Langkah>
          <Langkah>Ada jatah gratis dengan batas per menit/hari; bila bot sering terkena batas, aktifkan penagihan di proyek Google Cloud-nya.</Langkah>
          <Langkah>Kembali ke sini, pilih penyedia <b>Google Gemini</b> di kartu bot, tempel key, tekan <b>Simpan</b>, lalu <b>Uji</b>.</Langkah>
        </ol>
      </details>

      <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300">
        <b>Aman:</b> key disimpan terenkripsi di server, tidak pernah ditampilkan lagi (hanya empat karakter terakhir), dan tidak dikirim ke Rumah Bot. Jangan menempel
        key di chat atau dokumen. Satu key boleh dipakai beberapa bot, tetapi key terpisah per bot memudahkan melacak pemakaian dan mencabut satu bot saja. Bila tombol
        Simpan nonaktif, server belum punya <code>BOT_KUNCI_INDUK</code>. Tidak menemukan bot di bawah? Buat dulu di tab Akun Bot. Nara (koordinator) punya kartu
        sendiri di paling atas.
      </div>
    </GlassCard>
  );
}

// ---------- tab: template auto edit ----------

function TabTemplate({ status }: { status: StatusBot | null }) {
  const namaAdmin = useAppStore((s) => s.user?.nama ?? "");
  const bots = useMemo(() => status?.bots ?? [], [status]);
  const [pilihId, setPilihId] = useState<number | null>(null);
  const [beralih, setBeralih] = useState(false);
  // Bot terpilih: pilihan Anda, atau bot pertama.
  const bot = bots.find((b) => b.user_id === pilihId) ?? bots[0] ?? null;

  const masuk = async (b: BotRingkas) => {
    setBeralih(true);
    try {
      toast("info", `Masuk sebagai ${b.nama}…`, "Aplikasi dimuat ulang sebagai akun bot. Tekan \"Kembali ke akun saya\" di pita atas untuk pulang.");
      await masukSebagai({ id: String(b.user_id), nama: b.nama }, namaAdmin);
    } catch (e) {
      toast("error", "Gagal beralih akun", e instanceof Error ? e.message : "");
      setBeralih(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <p className="text-[12px] leading-relaxed text-teks-sekunder">
          Bot membuat video lewat <b className="text-teks-utama">Auto Edit</b> memakai <b className="text-teks-utama">template milik akunnya</b>. Editor di bawah ini sama persis
          dengan Edit Otomatis di TVR Saya dan menyimpan ke tempat yang sama (template akun bot di mesin Auto Edit) — bedanya Anda tidak perlu beralih akun.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11.5px] leading-relaxed text-teks-sekunder">
          <li>Pilih bot.</li>
          <li>
            Tekan tombol <b className="text-teks-utama">template</b> di kartu Edit Otomatis: atur kanvas, overlay, kotak teks hook, dan badge kategori, unggah aset, lalu{" "}
            <b className="text-teks-utama">tetapkan</b>.
          </li>
          <li>Opsional: buat satu video uji dari tautan untuk memastikan hasilnya (masuk Stok Video akun bot).</li>
          <li>
            Simpan template itu ke <b className="text-teks-utama">pustaka</b> di bagian Template Bot (bawah), lalu pasang ke bot lain atau semua bot tanpa membuat ulang.
          </li>
        </ol>
      </GlassCard>

      {status === null ? (
        <GlassSkeleton className="h-24 rounded-2xl" />
      ) : bots.length === 0 ? (
        <GlassCard className="p-4 text-[12px] text-teks-sekunder">Belum ada bot. Buat dulu di tab Akun Bot.</GlassCard>
      ) : (
        <>
          <div role="radiogroup" aria-label="Pilih bot" className="flex flex-wrap gap-2">
            {bots.map((b) => {
              const aktif = bot?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={aktif}
                  onClick={() => setPilihId(b.user_id)}
                  className={cn("glass btn-tekan flex min-h-11 items-center gap-2 rounded-xl py-1 pl-1.5 pr-3 text-left", aktif && "ring-2 ring-pri")}
                >
                  <PotretBot rupa={b.rupa} lencana={b.warna} skala={1.5} label={`Potret ${b.nama}`} />
                  <span className="text-[12.5px] font-bold text-teks-utama">{b.nama}</span>
                </button>
              );
            })}
          </div>

          {bot && (
            <>
              <KonteksTimAutoEdit.Provider value={tandaAkunBot(bot.user_id)}>
                {/* key = akun bot: ganti bot memuat ulang editor dengan template bot itu. */}
                <EditOtomatisTvr key={bot.user_id} />
              </KonteksTimAutoEdit.Provider>
              <p className="text-[11px] text-teks-sekunder">
                Menyunting template <b className="text-teks-utama">{bot.nama}</b> (@{bot.username}).{" "}
                <button type="button" onClick={() => void masuk(bot)} disabled={beralih} className="font-semibold text-pri underline disabled:opacity-50">
                  Atau masuk sebagai {bot.nama}
                </button>{" "}
                untuk memakai seluruh TVR Saya akun itu.
              </p>
            </>
          )}
        </>
      )}

      <TemplateBot />
    </section>
  );
}

// ---------- layar ----------

export function KelolaBotScreen({ onKembali }: { onKembali: () => void }) {
  const versiSegar = useVersiSegar();
  const [tab, setTab] = useState<Tab>("akun");
  const [status, setStatus] = useState<StatusBot | null>(null);
  const [galat, setGalat] = useState("");
  const [tik, setTik] = useState(0);
  const nomor = useRef(0);
  const segar = useCallback(() => setTik((t) => t + 1), []);

  useEffect(() => {
    const ini = ++nomor.current;
    getStatusBot()
      .then((d) => {
        if (ini !== nomor.current) return;
        setStatus(d);
        setGalat("");
      })
      .catch((e) => {
        if (ini !== nomor.current) return;
        // Gagal memuat BUKAN "migrasi belum jalan": tampilkan galat sebenarnya dan data terakhir dipertahankan.
        const pesan = e instanceof Error && e.message ? e.message : "Gagal memuat daftar bot";
        setGalat(pesan);
        toast("error", "Daftar bot gagal dimuat", pesan);
      });
    return () => {
      nomor.current++;
    };
  }, [versiSegar, tik]);

  return (
    <div className="kolom-aplikasi kolom-lebar px-4 pb-32">
      <ScreenHeader judul="Kelola Bot" onKembali={onKembali} />
      <div role="tablist" aria-label="Bagian Kelola Bot" className="tanpa-scrollbar glass mb-4 flex gap-1 overflow-x-auto rounded-2xl p-1">
        {TAB.map((t) => (
          <button
            key={t.kunci}
            role="tab"
            type="button"
            aria-selected={tab === t.kunci}
            onClick={() => setTab(t.kunci)}
            className={cn("btn-tekan flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold", tab === t.kunci ? "bg-pri/15 text-pri" : "text-teks-sekunder")}
          >
            {t.kunci === "profil" && <Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {t.kunci === "template" && <Layers className="h-3.5 w-3.5" aria-hidden="true" />}
            {t.label}
          </button>
        ))}
      </div>
      {galat && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-800 dark:text-amber-200">
          <span className="min-w-0">Daftar bot gagal dimuat: {galat}</span>
          <button type="button" onClick={segar} className="btn-tekan shrink-0 rounded-full bg-pri/15 px-3 py-1 text-[11px] font-bold text-pri">
            Coba lagi
          </button>
        </div>
      )}
      {tab === "akun" && <TabAkun status={status} onSegar={segar} />}
      {tab === "profil" && <TabProfil status={status} onSegar={segar} />}
      {tab === "template" && <TabTemplate status={status} />}
      {tab === "otak" && (
        <div className="flex flex-col gap-3">
          <TutorialApiKey />
          <OtakBot />
        </div>
      )}
    </div>
  );
}
