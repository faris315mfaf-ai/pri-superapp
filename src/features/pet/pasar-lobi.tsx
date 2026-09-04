"use client";

// ============================================================
// PASAR TRADING & LOBI ROBOT (5 Sep 2026) — fondasi.
//
// PASAR: tawarkan barang (aksesoris/sparepart/skin) untuk KOIN atau BARANG,
// terima/tolak/batalkan, riwayat. LOBI: ruangan 1000×600 tempat robot
// berjalan — joystick virtual (HP) atau WASD/panah (PC). Posisi sendiri
// digerakkan di layar lewat requestAnimationFrame HANYA saat ada input dan
// dikirim ke server paling cepat tiap 3 detik (satu permintaan yang sekaligus
// mengambil robot lain). Robot lain meluncur ke posisi barunya lewat
// transisi CSS — tanpa pustaka animasi, ringan untuk server & HP.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Coins, Handshake, MessageCircle, Package, Store, Users, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { AvatarInisial, GlassSkeleton, StatusBadge } from "@/components/pri-ui";
import { FotoBulat } from "@/components/foto-bulat";
import { toast } from "@/hooks/use-app-store";
import { getLobi, getPasar, keluarLobi, kirimPosisiLobi, pasarAksi, type DataLobi, type DataPasar, type ItemTradable, type RobotLobi, type TawaranPasar } from "@/services";
import { aksesorisDariKode, KATALOG_AKSESORIS, KATALOG_SKIN, KATALOG_SPAREPART, skinDariKode, sparepartDariKode, type BagianSparepart, type SlotAksesoris } from "@/lib/pet";
import { waktuJelasWIB } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RobotSvg } from "./robot-svg";

const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";
const LEBAR = 1000;
const TINGGI = 600;
const KECEPATAN = 240; // unit/detik
const KIRIM_MS = 3000;

/** Pratinjau robot polos yang memakai SATU barang (untuk kartu pasar). */
function PratinjauItem({ kode, jenis, ukuran = 56 }: { kode: string; jenis: "aksesoris" | "sparepart" | "skin"; ukuran?: number }) {
  const a = jenis === "aksesoris" ? aksesorisDariKode(kode) : undefined;
  const s = jenis === "sparepart" ? sparepartDariKode(kode) : undefined;
  return (
    <RobotSvg
      jenis="pria"
      suasana="senang"
      terpasang={a ? { [a.slot as SlotAksesoris]: kode } : {}}
      sparepart={s ? { [s.bagian as BagianSparepart]: kode } : {}}
      skin={jenis === "skin" ? kode : null}
      ukuran={ukuran}
      animasi={false}
    />
  );
}

/** Semua barang katalog yang bisa jadi penukar (untuk pilihan "tukar barang"). */
const PILIHAN_BARANG: { kode: string; nama: string }[] = [
  ...KATALOG_AKSESORIS.map((a) => ({ kode: a.kode, nama: `${a.nama} (aksesoris)` })),
  ...KATALOG_SPAREPART.map((s) => ({ kode: s.kode, nama: `${s.nama} (sparepart)` })),
  ...KATALOG_SKIN.map((s) => ({ kode: s.kode, nama: `${s.nama} (skin)` })),
];

type Imbalan = { jenis: "koin" | "barang"; koin: string; item: string };
const IMBALAN_AWAL: Imbalan = { jenis: "koin", koin: "", item: "" };

function FormImbalan({ nilai, onUbah, pilihanBarang }: { nilai: Imbalan; onUbah: (v: Imbalan) => void; pilihanBarang?: { kode: string; nama: string }[] }) {
  const daftar = pilihanBarang ?? PILIHAN_BARANG;
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
        {(
          [
            ["koin", "Koin", Coins],
            ["barang", "Tukar barang", ArrowLeftRight],
          ] as const
        ).map(([k, label, Ikon]) => (
          <button key={k} type="button" onClick={() => onUbah({ ...nilai, jenis: k })} aria-pressed={nilai.jenis === k} className={cn("btn-tekan flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11.5px] font-bold", nilai.jenis === k ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder")}>
            <Ikon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {nilai.jenis === "koin" ? (
        <input value={nilai.koin} onChange={(e) => onUbah({ ...nilai, koin: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="Jumlah koin (1–1.000.000)" aria-label="Jumlah koin" className="glass-input mt-2 h-10 w-full rounded-xl px-3 text-[12.5px] text-teks-utama" />
      ) : (
        <select value={nilai.item} onChange={(e) => onUbah({ ...nilai, item: e.target.value })} aria-label="Barang penukar" className="glass-input mt-2 h-10 w-full rounded-xl px-2 text-[12px] text-teks-utama">
          <option value="">Pilih barang penukar…</option>
          {daftar.map((b) => (
            <option key={b.kode} value={b.kode}>
              {b.nama}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function imbalanKeData(v: Imbalan): { minta_koin?: number; minta_item?: string } | null {
  if (v.jenis === "koin") {
    const n = Number(v.koin);
    if (!Number.isFinite(n) || n < 1) return null;
    return { minta_koin: n };
  }
  return v.item ? { minta_item: v.item } : null;
}

function labelImbalan(t: TawaranPasar): string {
  return t.minta_koin != null ? `${t.minta_koin} koin` : `tukar ${t.nama_minta_item ?? t.minta_item}`;
}

// ------------------------------------------------------------
// PASAR
// ------------------------------------------------------------
function KartuTawaran({ t, sibuk, onAksi }: { t: TawaranPasar; sibuk: string; onAksi: (aksi: "terima" | "tolak" | "batal", t: TawaranPasar) => void }) {
  const selesai = t.status !== "buka";
  return (
    <div className="glass-soft flex items-center gap-2.5 rounded-xl p-2.5">
      <PratinjauItem kode={t.kode_item} jenis={t.jenis_item} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-teks-utama">{t.nama_item}</p>
        <p className="text-[10.5px] text-teks-sekunder">
          {t.arah === "jual" ? (t.saya_pemilik ? "Anda menawarkan" : `${t.pemilik_nama} menawarkan`) : t.saya_pemilik ? `${t.pihak_nama} meminta barang Anda` : "Anda meminta"} · <span className="font-bold text-teks-utama">{labelImbalan(t)}</span>
          {t.pihak_id && t.arah === "jual" ? ` · khusus ${t.saya_pemilik ? t.pihak_nama : "Anda"}` : ""}
        </p>
        {t.pesan ? <p className="truncate text-[10.5px] italic text-teks-sekunder">“{t.pesan}”</p> : null}
        {selesai ? <p className="text-[10px] text-teks-sekunder">{t.status} · {t.selesai_pada ? waktuJelasWIB(t.selesai_pada) : ""}</p> : null}
      </div>
      {selesai ? (
        <StatusBadge label={t.status} warna={t.status === "selesai" ? "hijau" : t.status === "ditolak" ? "merah" : "netral"} />
      ) : t.bisa_terima ? (
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" onClick={() => onAksi("terima", t)} disabled={Boolean(sibuk)} className="btn-tekan h-8 rounded-lg px-2.5 text-[11px] font-bold text-white disabled:opacity-40" style={{ background: MERAH }}>
            {sibuk === `terima:${t.id}` ? "…" : "Terima"}
          </button>
          {t.pihak_id || t.arah === "minta" ? (
            <button type="button" onClick={() => onAksi("tolak", t)} disabled={Boolean(sibuk)} className="btn-tekan h-8 rounded-lg bg-black/5 px-2.5 text-[11px] font-bold text-teks-utama disabled:opacity-40 dark:bg-white/10">
              Tolak
            </button>
          ) : null}
        </div>
      ) : t.saya_pembuat ? (
        <button type="button" onClick={() => onAksi("batal", t)} disabled={Boolean(sibuk)} className="btn-tekan h-8 shrink-0 rounded-lg bg-black/5 px-2.5 text-[11px] font-bold text-gagal disabled:opacity-40 dark:bg-white/10">
          {sibuk === `batal:${t.id}` ? "…" : "Batalkan"}
        </button>
      ) : (
        <StatusBadge label="menunggu" warna="kuning" />
      )}
    </div>
  );
}

function PanelPasar({ onBerubah }: { onBerubah: () => void }) {
  const [data, setData] = useState<DataPasar | null>(null);
  const [sibuk, setSibuk] = useState("");
  const [formBuka, setFormBuka] = useState(false);
  const [itemPilih, setItemPilih] = useState("");
  const [imbalan, setImbalan] = useState<Imbalan>(IMBALAN_AWAL);
  const [pesan, setPesan] = useState("");

  useEffect(() => {
    let hidup = true;
    getPasar()
      .then((d) => hidup && setData(d))
      .catch((e) => hidup && toast("error", "Pasar gagal dimuat", e instanceof Error ? e.message : ""));
    return () => {
      hidup = false;
    };
  }, []);

  async function aksi(nama: string, kunci: string, isi: Record<string, unknown>, pesanSukses: string) {
    if (sibuk) return;
    setSibuk(kunci);
    try {
      const r = await pasarAksi(nama, isi);
      setData(r);
      toast("sukses", pesanSukses);
      onBerubah();
      return r;
    } catch (e) {
      toast("peringatan", "Tidak bisa", e instanceof Error ? e.message : "");
      return null;
    } finally {
      setSibuk("");
    }
  }

  if (!data) return <GlassSkeleton className="mt-3 h-40 rounded-2xl" />;
  const item = data.inventori.find((i) => i.kode === itemPilih);
  return (
    <div className="mt-3 flex flex-col gap-3">
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-bold text-teks-utama">Tawarkan barang Anda</p>
          <span className="flex items-center gap-1 text-[11px] font-bold text-teks-utama">
            <img src="/KMP.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" /> {data.saldo}
          </span>
        </div>
        {!data.punya_robot ? (
          <p className="mt-1 text-[11px] text-teks-sekunder">Adopsi robot dulu untuk ikut trading.</p>
        ) : data.inventori.length === 0 ? (
          <p className="mt-1 text-[11px] text-teks-sekunder">Belum ada barang yang bisa diperdagangkan — beli aksesoris/sparepart/skin di Toko.</p>
        ) : !formBuka ? (
          <button type="button" onClick={() => setFormBuka(true)} className="btn-tekan mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-bold text-white" style={{ background: MERAH }}>
            <Package className="h-4 w-4" aria-hidden="true" /> Pasang tawaran ({data.inventori.length} barang)
          </button>
        ) : (
          <div className="mt-2">
            <select value={itemPilih} onChange={(e) => setItemPilih(e.target.value)} aria-label="Barang yang ditawarkan" className="glass-input h-10 w-full rounded-xl px-2 text-[12px] text-teks-utama">
              <option value="">Pilih barang milik Anda…</option>
              {data.inventori.map((i) => (
                <option key={i.kode} value={i.kode}>
                  {i.nama} · {i.jenis}
                  {i.terpasang ? " (terpasang)" : ""}
                </option>
              ))}
            </select>
            {item ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-black/[0.03] p-2 dark:bg-white/[0.05]">
                <PratinjauItem kode={item.kode} jenis={item.jenis} />
                <p className="text-[11px] text-teks-sekunder">
                  Harga katalog {item.harga} koin. {item.terpasang ? "Sedang terpasang — akan dilepas otomatis saat laku." : ""}
                </p>
              </div>
            ) : null}
            <FormImbalan nilai={imbalan} onUbah={setImbalan} />
            <input value={pesan} onChange={(e) => setPesan(e.target.value)} maxLength={140} placeholder="Pesan singkat (opsional)" aria-label="Pesan tawaran" className="glass-input mt-2 h-10 w-full rounded-xl px-3 text-[12px] text-teks-utama" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setFormBuka(false)} className="btn-tekan glass h-10 flex-1 rounded-xl text-[12px] font-bold text-teks-utama">
                Batal
              </button>
              <button
                type="button"
                disabled={!item || !imbalanKeData(imbalan) || Boolean(sibuk)}
                onClick={() => {
                  const d = imbalanKeData(imbalan);
                  if (!item || !d) return;
                  void aksi("tawar", "tawar", { kode_item: item.kode, ...d, pesan }, "Tawaran dipasang di pasar").then((r) => {
                    if (r) {
                      setFormBuka(false);
                      setItemPilih("");
                      setImbalan(IMBALAN_AWAL);
                      setPesan("");
                    }
                  });
                }}
                className="btn-tekan h-10 flex-1 rounded-xl text-[12px] font-bold text-white disabled:opacity-40"
                style={{ background: MERAH }}
              >
                {sibuk === "tawar" ? "…" : "Pasang"}
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {data.saya.length > 0 ? (
        <GlassCard className="p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">Tawaran & permintaan Anda</p>
          <div className="mt-2 flex flex-col gap-2">
            {data.saya.map((t) => (
              <KartuTawaran key={t.id} t={t} sibuk={sibuk} onAksi={(a, x) => void aksi(a, `${a}:${x.id}`, { id: x.id }, a === "terima" ? "Trading selesai — cek Lemari" : a === "tolak" ? "Tawaran ditolak" : "Tawaran dibatalkan")} />
            ))}
          </div>
        </GlassCard>
      ) : null}

      <GlassCard className="p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
          <Store className="h-4 w-4 text-pri" aria-hidden="true" /> Pasar ({data.tawaran.length})
        </p>
        {data.tawaran.length === 0 ? (
          <p className="mt-1 text-[11px] text-teks-sekunder">Belum ada tawaran publik. Jadilah yang pertama!</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {data.tawaran.map((t) => (
              <KartuTawaran key={t.id} t={t} sibuk={sibuk} onAksi={(a, x) => void aksi(a, `${a}:${x.id}`, { id: x.id }, "Trading selesai — cek Lemari")} />
            ))}
          </div>
        )}
      </GlassCard>

      {data.riwayat.length > 0 ? (
        <GlassCard className="p-4">
          <p className="text-[12.5px] font-bold text-teks-utama">Riwayat</p>
          <div className="mt-2 flex flex-col gap-2">
            {data.riwayat.map((t) => (
              <KartuTawaran key={t.id} t={t} sibuk={sibuk} onAksi={() => undefined} />
            ))}
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------
// LOBI
// ------------------------------------------------------------
function PanelLobi({ onBerubah }: { onBerubah: () => void }) {
  const [robot, setRobot] = useState<RobotLobi[] | null>(null);
  const [pesan, setPesan] = useState("");
  const [pilih, setPilih] = useState<RobotLobi | null>(null);
  const pos = useRef({ x: 500, y: 320, arah: "kanan" as "kiri" | "kanan" });
  const arah = useRef({ dx: 0, dy: 0 });
  const tombol = useRef<Set<string>>(new Set());
  const elSaya = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number | null>(null);
  const lastT = useRef(0);
  const pesanRef = useRef("");
  const timerKirim = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kirimSibuk = useRef(false);
  const joystick = useRef<{ aktif: boolean; pusatX: number; pusatY: number }>({ aktif: false, pusatX: 0, pusatY: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [bergerak, setBergerak] = useState(false);

  const terapkanPosisi = useCallback(() => {
    const el = elSaya.current;
    if (!el) return;
    el.style.left = `${(pos.current.x / LEBAR) * 100}%`;
    el.style.top = `${(pos.current.y / TINGGI) * 100}%`;
    const svg = el.querySelector("[data-robot]") as HTMLElement | null;
    if (svg) svg.style.transform = pos.current.arah === "kiri" ? "scaleX(-1)" : "";
  }, []);

  const kirim = useCallback(async () => {
    if (kirimSibuk.current) return;
    kirimSibuk.current = true;
    try {
      const d = await kirimPosisiLobi(Math.round(pos.current.x), Math.round(pos.current.y), pos.current.arah, pesanRef.current);
      setRobot(d.robot);
    } catch (e) {
      toast("error", "Lobi terputus", e instanceof Error ? e.message : "");
    } finally {
      kirimSibuk.current = false;
    }
  }, []);

  // Masuk lobi: kirim posisi awal, lalu tiap 3 detik; keluar saat unmount.
  useEffect(() => {
    let hidup = true;
    getLobi()
      .then((d: DataLobi) => {
        if (!hidup) return;
        const saya = d.robot.find((r) => r.saya);
        if (saya) pos.current = { x: saya.x, y: saya.y, arah: saya.arah };
        terapkanPosisi();
        void kirim();
      })
      .catch(() => hidup && void kirim());
    const t = setInterval(() => void kirim(), KIRIM_MS);
    return () => {
      hidup = false;
      clearInterval(t);
      if (raf.current) cancelAnimationFrame(raf.current);
      if (timerKirim.current) clearTimeout(timerKirim.current);
      void keluarLobi();
    };
  }, [kirim, terapkanPosisi]);

  // Mesin gerak: rAF hanya hidup saat ada input.
  const langkah = useCallback(
    (t: number) => {
      const dt = Math.min(0.05, (t - lastT.current) / 1000 || 0);
      lastT.current = t;
      const { dx, dy } = arah.current;
      if (dx === 0 && dy === 0) {
        raf.current = null;
        setBergerak(false);
        return;
      }
      const p = pos.current;
      p.x = Math.max(0, Math.min(LEBAR, p.x + dx * KECEPATAN * dt));
      p.y = Math.max(40, Math.min(TINGGI, p.y + dy * KECEPATAN * dt));
      if (dx < 0) p.arah = "kiri";
      if (dx > 0) p.arah = "kanan";
      terapkanPosisi();
      raf.current = requestAnimationFrame(langkah);
    },
    [terapkanPosisi],
  );
  const mulaiGerak = useCallback(() => {
    if (raf.current == null) {
      lastT.current = performance.now();
      setBergerak(true);
      raf.current = requestAnimationFrame(langkah);
    }
  }, [langkah]);

  // Keyboard WASD / panah.
  useEffect(() => {
    const peta: Record<string, [number, number]> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0] };
    const hitung = () => {
      let dx = 0;
      let dy = 0;
      for (const k of tombol.current) {
        const v = peta[k];
        if (v) {
          dx += v[0];
          dy += v[1];
        }
      }
      const n = Math.hypot(dx, dy) || 1;
      arah.current = { dx: dx / n, dy: dy / n };
      if (dx || dy) mulaiGerak();
    };
    const turun = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in peta)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      tombol.current.add(k);
      hitung();
    };
    const naik = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!tombol.current.has(k)) return;
      tombol.current.delete(k);
      hitung();
    };
    window.addEventListener("keydown", turun);
    window.addEventListener("keyup", naik);
    return () => {
      window.removeEventListener("keydown", turun);
      window.removeEventListener("keyup", naik);
    };
  }, [mulaiGerak]);

  // Joystick virtual (pointer events → dukung sentuh & mouse).
  function joyMulai(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    joystick.current = { aktif: true, pusatX: r.left + r.width / 2, pusatY: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    joyGerak(e);
  }
  function joyGerak(e: React.PointerEvent<HTMLDivElement>) {
    if (!joystick.current.aktif) return;
    const dx = e.clientX - joystick.current.pusatX;
    const dy = e.clientY - joystick.current.pusatY;
    const jarak = Math.hypot(dx, dy);
    const maks = 40;
    const skala = jarak > maks ? maks / jarak : 1;
    const kx = dx * skala;
    const ky = dy * skala;
    setKnob({ x: kx, y: ky });
    if (jarak < 6) {
      arah.current = { dx: 0, dy: 0 };
      return;
    }
    arah.current = { dx: dx / jarak, dy: dy / jarak };
    mulaiGerak();
  }
  function joySelesai() {
    joystick.current.aktif = false;
    arah.current = { dx: 0, dy: 0 };
    setKnob({ x: 0, y: 0 });
  }

  function kirimPesan() {
    pesanRef.current = pesan.trim().slice(0, 60);
    void kirim();
  }

  const lain = useMemo(() => (robot ?? []).filter((r) => !r.saya), [robot]);
  const saya = useMemo(() => (robot ?? []).find((r) => r.saya) ?? null, [robot]);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <GlassCard className="p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-teks-utama">
            <Users className="h-4 w-4 text-pri" aria-hidden="true" /> Lobi · {robot ? robot.length : "…"} robot hadir
          </p>
          <p className="text-[10.5px] text-teks-sekunder">WASD / panah · joystick di HP</p>
        </div>

        {/* Ruangan */}
        <div
          className="relative mt-2 w-full select-none overflow-hidden rounded-2xl border border-black/10 dark:border-white/10"
          style={{
            aspectRatio: "5 / 3",
            backgroundColor: "#F1F5F9",
            backgroundImage: "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(180deg, rgba(220,38,38,0.08), transparent 45%)",
            backgroundSize: "10% 16.66%, 10% 16.66%, 100% 100%",
            touchAction: "none",
          }}
        >
          {robot === null ? <GlassSkeleton className="absolute inset-3 rounded-xl" /> : null}
          {/* robot lain: meluncur ke posisi baru lewat transisi CSS */}
          {lain.map((r) => (
            <button
              key={r.user_id}
              type="button"
              onClick={() => setPilih(r)}
              className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
              style={{ left: `${(r.x / LEBAR) * 100}%`, top: `${(r.y / TINGGI) * 100}%`, transition: "left 1.2s linear, top 1.2s linear" }}
              aria-label={`Robot ${r.nama_robot} milik ${r.nama_pemilik}, ketuk untuk trading`}
            >
              {r.pesan ? <span className="mb-0.5 max-w-[140px] truncate rounded-full bg-white/90 px-2 py-0.5 text-[9.5px] font-semibold text-slate-800 shadow-sm">{r.pesan}</span> : null}
              <span style={{ transform: r.arah === "kiri" ? "scaleX(-1)" : undefined }}>
                <RobotSvg jenis={r.jenis} skin={r.skin} warna={r.warna} terpasang={r.terpasang as Partial<Record<SlotAksesoris, string>>} sparepart={r.sparepart as Partial<Record<BagianSparepart, string>>} suasana="senang" ukuran={54} animasi={false} />
              </span>
              <span className="rounded-full bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">{r.nama_robot} · Lv{r.level}</span>
            </button>
          ))}
          {/* robot saya: posisi diatur langsung lewat style (tanpa render ulang React) */}
          {saya ? (
            <div ref={elSaya} className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: `${(pos.current.x / LEBAR) * 100}%`, top: `${(pos.current.y / TINGGI) * 100}%` }}>
              {pesanRef.current ? <span className="mb-0.5 max-w-[140px] truncate rounded-full bg-amber-300/95 px-2 py-0.5 text-[9.5px] font-semibold text-slate-900 shadow-sm">{pesanRef.current}</span> : null}
              <span data-robot="saya" className={cn(bergerak && "pet-melangkah")}>
                <RobotSvg jenis={saya.jenis} skin={saya.skin} warna={saya.warna} terpasang={saya.terpasang as Partial<Record<SlotAksesoris, string>>} sparepart={saya.sparepart as Partial<Record<BagianSparepart, string>>} suasana="senang" ukuran={58} animasi={false} />
              </span>
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: "#DC2626" }}>
                {saya.nama_robot} (Anda)
              </span>
            </div>
          ) : null}

          {/* Joystick virtual */}
          <div
            onPointerDown={joyMulai}
            onPointerMove={joyGerak}
            onPointerUp={joySelesai}
            onPointerCancel={joySelesai}
            className="absolute bottom-3 left-3 flex h-[104px] w-[104px] items-center justify-center rounded-full border-2 border-white/70 bg-slate-900/25"
            role="slider"
            aria-label="Joystick gerak robot"
            aria-valuenow={0}
          >
            <div className="h-11 w-11 rounded-full bg-white/90 shadow-md" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
          </div>
        </div>

        {/* Pesan singkat di atas kepala */}
        <div className="mt-2 flex gap-2">
          <input value={pesan} onChange={(e) => setPesan(e.target.value)} onKeyDown={(e) => e.key === "Enter" && kirimPesan()} maxLength={60} placeholder="Pesan singkat di atas robot…" aria-label="Pesan lobi" className="glass-input h-10 min-w-0 flex-1 rounded-xl px-3 text-[12px] text-teks-utama" />
          <button type="button" onClick={kirimPesan} className="btn-tekan flex h-10 items-center gap-1 rounded-xl px-3 text-[12px] font-bold text-white" style={{ background: MERAH }}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Kirim
          </button>
        </div>
        {lain.length === 0 && robot !== null ? <p className="mt-2 text-[10.5px] text-teks-sekunder">Belum ada robot lain di lobi. Ajak teman masuk Pet Robot → Pasar → Lobi.</p> : null}
      </GlassCard>

      {pilih ? <PanelTrading target={pilih} onTutup={() => setPilih(null)} onBerubah={onBerubah} /> : null}
    </div>
  );
}

/** Panel trading langsung dengan robot yang diketuk di lobi. */
function PanelTrading({ target, onTutup, onBerubah }: { target: RobotLobi; onTutup: () => void; onBerubah: () => void }) {
  const [mode, setMode] = useState<"minta" | "tawar">("minta");
  const [inventori, setInventori] = useState<ItemTradable[] | null>(null);
  const [itemMereka, setItemMereka] = useState("");
  const [itemSaya, setItemSaya] = useState("");
  const [imbalan, setImbalan] = useState<Imbalan>(IMBALAN_AWAL);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    getPasar()
      .then((d) => hidup && setInventori(d.inventori))
      .catch(() => hidup && setInventori([]));
    return () => {
      hidup = false;
    };
  }, []);

  async function kirim() {
    if (sibuk) return;
    const d = imbalanKeData(imbalan);
    if (!d) return toast("peringatan", "Lengkapi imbalan", "Isi jumlah koin atau pilih barang.");
    setSibuk(true);
    try {
      if (mode === "minta") {
        if (!itemMereka) throw new Error("Pilih barang yang Anda minta.");
        await pasarAksi("minta", { pemilik_id: target.user_id, kode_item: itemMereka, ...d, pesan });
        toast("sukses", "Permintaan terkirim", `${target.nama_pemilik} akan mendapat notifikasi.`);
      } else {
        if (!itemSaya) throw new Error("Pilih barang Anda yang ditawarkan.");
        await pasarAksi("tawar", { kode_item: itemSaya, pihak_id: target.user_id, ...d, pesan });
        toast("sukses", "Tawaran terkirim", `${target.nama_pemilik} bisa menerimanya di Pasar.`);
      }
      onBerubah();
      onTutup();
    } catch (e) {
      toast("peringatan", "Tidak bisa", e instanceof Error ? e.message : "");
    } finally {
      setSibuk(false);
    }
  }

  const pilihanMerekaSaya = (inventori ?? []).map((i) => ({ kode: i.kode, nama: `${i.nama} (${i.jenis})` }));
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-4.5 w-4.5 text-pri" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-teks-utama">
          Trading dengan {target.nama_pemilik} · {target.nama_robot} Lv{target.level}
        </p>
        <button type="button" onClick={onTutup} aria-label="Tutup panel trading" className="glass btn-tekan flex h-8 w-8 items-center justify-center rounded-full text-teks-utama">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
        {(
          [
            ["minta", "Minta barangnya"],
            ["tawar", "Tawarkan barang saya"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k} className={cn("btn-tekan rounded-lg py-1.5 text-[11.5px] font-bold", mode === k ? "bg-white text-teks-utama shadow-sm dark:bg-white/15" : "text-teks-sekunder")}>
            {label}
          </button>
        ))}
      </div>
      {mode === "minta" ? (
        <>
          <select value={itemMereka} onChange={(e) => setItemMereka(e.target.value)} aria-label="Barang mereka" className="glass-input mt-2 h-10 w-full rounded-xl px-2 text-[12px] text-teks-utama">
            <option value="">Barang {target.nama_pemilik} yang Anda inginkan…</option>
            {target.tradable.map((i) => (
              <option key={i.kode} value={i.kode}>
                {i.nama} · {i.jenis}
              </option>
            ))}
          </select>
          {target.tradable.length === 0 ? <p className="mt-1 text-[10.5px] text-teks-sekunder">Robot ini belum punya barang yang bisa diperdagangkan.</p> : null}
          <p className="mt-2 text-[11px] font-bold text-teks-utama">Imbalan dari Anda</p>
          <FormImbalan nilai={imbalan} onUbah={setImbalan} pilihanBarang={pilihanMerekaSaya} />
        </>
      ) : (
        <>
          <select value={itemSaya} onChange={(e) => setItemSaya(e.target.value)} aria-label="Barang saya" className="glass-input mt-2 h-10 w-full rounded-xl px-2 text-[12px] text-teks-utama">
            <option value="">Barang Anda yang ditawarkan…</option>
            {(inventori ?? []).map((i) => (
              <option key={i.kode} value={i.kode}>
                {i.nama} · {i.jenis}
                {i.terpasang ? " (terpasang)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] font-bold text-teks-utama">Imbalan yang Anda minta</p>
          <FormImbalan nilai={imbalan} onUbah={setImbalan} pilihanBarang={target.tradable.map((i) => ({ kode: i.kode, nama: `${i.nama} (${i.jenis})` }))} />
        </>
      )}
      <input value={pesan} onChange={(e) => setPesan(e.target.value)} maxLength={140} placeholder="Pesan (opsional)" aria-label="Pesan trading" className="glass-input mt-2 h-10 w-full rounded-xl px-3 text-[12px] text-teks-utama" />
      <button type="button" onClick={() => void kirim()} disabled={sibuk} className="btn-tekan mt-2 h-11 w-full rounded-xl text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: MERAH }}>
        {sibuk ? "Mengirim…" : mode === "minta" ? "Kirim permintaan" : "Kirim tawaran"}
      </button>
    </GlassCard>
  );
}

// ------------------------------------------------------------
// Akar: tab Pasar | Lobi
// ------------------------------------------------------------
export function PasarLobi({ onBerubah }: { onBerubah: () => void }) {
  const [bagian, setBagian] = useState<"pasar" | "lobi">("pasar");
  return (
    <div>
      <div className="glass mt-3 grid grid-cols-2 rounded-xl p-1">
        {(
          [
            ["pasar", "Pasar Trading", Store],
            ["lobi", "Lobi Robot", Users],
          ] as const
        ).map(([k, label, Ikon]) => (
          <button key={k} type="button" onClick={() => setBagian(k)} aria-pressed={bagian === k} className={cn("btn-tekan flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold", bagian === k ? "text-white" : "text-teks-sekunder")} style={bagian === k ? { background: MERAH } : undefined}>
            <Ikon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {bagian === "pasar" ? <PanelPasar onBerubah={onBerubah} /> : <PanelLobi onBerubah={onBerubah} />}
    </div>
  );
}

export function AvatarKecil({ nama, src }: { nama: string; src: string }) {
  return src ? <FotoBulat src={src} ukuran={24} alt={nama} /> : <AvatarInisial nama={nama} ukuran={24} />;
}

export { skinDariKode };
