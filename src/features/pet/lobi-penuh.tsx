"use client";

// ============================================================
// LobiPenuh — LOBI ROBOT LAYAR PENUH (5 Sep 2026), halaman /lobi.
//
// • Dunia 3200×2000 SATUAN DUNIA (lib/pet-lobi DUNIA_LOBI). Semua jarak,
//   kecepatan (280 satuan/detik), dan ritme kirim SAMA di desktop & HP —
//   yang berbeda hanya kamera: skala = viewport ÷ 1100 (dijepit 0,6–1), jadi
//   HP melihat area yang mirip, bukan robot yang lebih cepat/lambat.
// • Realtime: Supabase Realtime (lobi-realtime.ts) — presence untuk hadir/
//   rupa, broadcast "gerak" ≤5×/detik hanya saat bergerak; penerima
//   memprediksi dari kecepatan lalu meluncur halus (dead reckoning + lerp).
//   Bila kunci realtime tidak ada / gagal → polling database 2 detik.
// • Semua posisi ditulis LANGSUNG ke style elemen (tanpa render ulang React
//   tiap frame); React hanya merender daftar peserta saat ada yang
//   datang/pergi. Joystick virtual (sentuh) + WASD/panah (keyboard).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Gamepad2, MessageCircle, Users, Wifi, WifiOff } from "lucide-react";
import { toast } from "@/hooks/use-app-store";
import { getLobiKonfig, keluarLobi, kirimPosisiLobi, masukOtomatis, type KonfigLobi, type RobotLobi } from "@/services";
import { bolehPet } from "@/lib/pet-akses";
import type { BagianSparepart, SlotAksesoris } from "@/lib/pet";
import { cn } from "@/lib/utils";
import { RobotSvg } from "./robot-svg";
import { PanelTrading } from "./pasar-lobi";
import { hubungkanLobi, type MetaRobot, type PaketGerak, type SambunganLobi, type StatusKanal } from "./lobi-realtime";

const KECEPATAN = 280; // satuan dunia / detik — sama di semua perangkat
const KIRIM_MS = 200; // ≤5 pesan/detik saat bergerak
const POLL_MS = 2000; // cadangan tanpa realtime
const UKURAN_ROBOT = 72; // satuan dunia
const TINGGI_ROBOT = Math.round((UKURAN_ROBOT * 300) / 220);
const MERAH = "linear-gradient(135deg, #DC2626, #B91C1C)";

type Peer = {
  meta: MetaRobot;
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  t: number;
  arah: "kiri" | "kanan";
  pesanSampai: number;
};

function metaDariRobot(r: RobotLobi): MetaRobot {
  return {
    id: r.user_id,
    nama_pemilik: r.nama_pemilik,
    nama_robot: r.nama_robot,
    jenis: r.jenis,
    level: r.level,
    skin: r.skin,
    warna: r.warna,
    terpasang: r.terpasang,
    sparepart: r.sparepart,
    tradable: r.tradable.map((i) => ({ kode: i.kode, jenis: i.jenis, nama: i.nama })),
    x: r.x,
    y: r.y,
    arah: r.arah,
    pesan: r.pesan,
  };
}

function robotDariMeta(m: MetaRobot, p?: Peer): RobotLobi {
  return {
    user_id: m.id,
    nama_pemilik: m.nama_pemilik,
    nama_robot: m.nama_robot,
    jenis: m.jenis,
    level: m.level,
    skin: m.skin,
    warna: m.warna,
    terpasang: m.terpasang,
    sparepart: m.sparepart,
    tradable: m.tradable.map((i) => ({ ...i, harga: 0, terpasang: false })),
    x: p?.x ?? m.x,
    y: p?.y ?? m.y,
    arah: p?.arah ?? m.arah,
    pesan: m.pesan,
    saya: false,
  };
}

/** Dekorasi dunia — beberapa elemen statis ringan. */
function Dekorasi({ lebar, tinggi }: { lebar: number; tinggi: number }) {
  const pohon = [
    [260, 260], [420, 330], [600, 250], [760, 380], [340, 520], [560, 560], [780, 620], [200, 660],
  ];
  return (
    <>
      {/* Taman */}
      <div className="absolute rounded-[48px]" style={{ left: 140, top: 160, width: 760, height: 580, background: "radial-gradient(circle at 30% 30%, #BBF7D0, #86EFAC 70%)", boxShadow: "inset 0 0 0 6px rgba(22,101,52,0.25)" }} />
      {pohon.map(([x, y]) => (
        <div key={`${x}-${y}`} className="absolute" style={{ left: x, top: y }}>
          <div style={{ width: 16, height: 40, marginLeft: 22, background: "#92400E", borderRadius: 4 }} />
          <div style={{ width: 60, height: 60, marginTop: -70, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #4ADE80, #15803D)" }} />
        </div>
      ))}
      <p className="absolute text-[28px] font-extrabold text-emerald-900/70" style={{ left: 420, top: 690 }}>Taman</p>
      {/* Alun-alun */}
      <div className="absolute rounded-full" style={{ left: lebar / 2 - 300, top: tinggi / 2 - 300, width: 600, height: 600, background: "radial-gradient(circle, #FEE2E2 0%, #FECACA 55%, transparent 72%)", border: "6px dashed rgba(220,38,38,0.35)" }} />
      <div className="absolute rounded-full" style={{ left: lebar / 2 - 60, top: tinggi / 2 - 60, width: 120, height: 120, background: "radial-gradient(circle, #FFFFFF, #FCA5A5)", border: "4px solid #DC2626" }} />
      <p className="absolute text-[30px] font-extrabold text-red-700/70" style={{ left: lebar / 2 - 90, top: tinggi / 2 + 200 }}>Alun-alun</p>
      {/* Pasar */}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="absolute rounded-xl" style={{ left: 2320 + (i % 2) * 300, top: 320 + Math.floor(i / 2) * 220, width: 240, height: 160, background: "#FDE68A", boxShadow: "0 8px 0 #B45309" }}>
          <div className="rounded-t-xl" style={{ height: 44, background: `repeating-linear-gradient(90deg, ${i % 2 ? "#DC2626" : "#2563EB"} 0 28px, #FFFFFF 28px 56px)` }} />
        </div>
      ))}
      <p className="absolute text-[28px] font-extrabold text-amber-800/70" style={{ left: 2540, top: 780 }}>Pasar</p>
      {/* Arena */}
      <div className="absolute rounded-[40px]" style={{ left: 1120, top: 1400, width: 960, height: 440, background: "radial-gradient(circle at 50% 50%, #FDBA74, #F97316 80%)", boxShadow: "inset 0 0 0 8px rgba(154,52,18,0.35)" }} />
      <p className="absolute text-[28px] font-extrabold text-orange-900/70" style={{ left: 1540, top: 1600 }}>Arena</p>
      {/* Kolam */}
      <div className="absolute rounded-full" style={{ left: 320, top: 1320, width: 620, height: 420, background: "radial-gradient(circle at 40% 35%, #BAE6FD, #38BDF8 80%)", boxShadow: "inset 0 0 0 8px rgba(3,105,161,0.3)" }} />
      <p className="absolute text-[26px] font-extrabold text-sky-900/70" style={{ left: 560, top: 1500 }}>Kolam</p>
    </>
  );
}

export function LobiPenuh() {
  const [keadaan, setKeadaan] = useState<"memeriksa" | "siap" | "tanpa_robot" | "dilarang">("memeriksa");
  const [konfig, setKonfig] = useState<KonfigLobi | null>(null);
  const [status, setStatus] = useState<StatusKanal | "polling">("menyambung");
  const [latensi, setLatensi] = useState<number | null>(null);
  const [daftarPeer, setDaftarPeer] = useState<MetaRobot[]>([]);
  const [mini, setMini] = useState<{ id: string; x: number; y: number; saya: boolean }[]>([]);
  const [pilih, setPilih] = useState<RobotLobi | null>(null);
  const [pesan, setPesan] = useState("");
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [skala, setSkala] = useState(1);
  const [sentuh, setSentuh] = useState(false);

  const peers = useRef<Map<string, Peer>>(new Map());
  const peerEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const worldEl = useRef<HTMLDivElement | null>(null);
  const elSaya = useRef<HTMLDivElement | null>(null);
  const pos = useRef({ x: 1600, y: 1000, arah: "kanan" as "kiri" | "kanan" });
  const arah = useRef({ dx: 0, dy: 0 });
  const tombol = useRef<Set<string>>(new Set());
  const bergerakRef = useRef(false);
  const lastKirim = useRef(0);
  const sambungan = useRef<SambunganLobi | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pesanSaya = useRef("");
  const skalaRef = useRef(1);
  const duniaRef = useRef({ lebar: 3200, tinggi: 2000 });
  const joystick = useRef({ aktif: false, pusatX: 0, pusatY: 0 });

  // ---- pengaturan kamera (skala) mengikuti lebar layar ----
  useEffect(() => {
    const hitung = () => {
      const s = Math.min(1, Math.max(0.6, window.innerWidth / 1100));
      skalaRef.current = s;
      setSkala(s);
      setSentuh(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900);
    };
    hitung();
    window.addEventListener("resize", hitung);
    return () => window.removeEventListener("resize", hitung);
  }, []);

  const terapkanKamera = useCallback(() => {
    const w = worldEl.current;
    if (!w) return;
    const s = skalaRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { lebar, tinggi } = duniaRef.current;
    let tx = vw / 2 - pos.current.x * s;
    let ty = vh / 2 - pos.current.y * s;
    tx = Math.min(0, Math.max(vw - lebar * s, tx));
    ty = Math.min(0, Math.max(vh - tinggi * s, ty));
    w.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
  }, []);

  const letakkan = useCallback((el: HTMLElement | null, x: number, y: number, arahRobot: "kiri" | "kanan") => {
    if (!el) return;
    el.style.transform = `translate3d(${x - UKURAN_ROBOT / 2}px, ${y - TINGGI_ROBOT}px, 0)`;
    el.dataset.x = String(Math.round(x));
    el.dataset.y = String(Math.round(y));
    const svg = el.querySelector("[data-robot]") as HTMLElement | null;
    if (svg) svg.style.transform = arahRobot === "kiri" ? "scaleX(-1)" : "";
  }, []);

  const tampilkanPesan = useCallback((el: HTMLElement | null, teks: string) => {
    const b = el?.querySelector("[data-bubble]") as HTMLElement | null;
    if (!b) return;
    b.textContent = teks;
    b.hidden = !teks;
  }, []);

  // ---- terima data peserta ----
  const terapkanHadir = useCallback((hadir: Record<string, MetaRobot>) => {
    const m = peers.current;
    for (const id of [...m.keys()]) if (!hadir[id]) m.delete(id);
    for (const [id, meta] of Object.entries(hadir)) {
      const ada = m.get(id);
      if (ada) {
        ada.meta = meta;
        // Presence menyimpan posisi terakhir saat DIAM; pakai bila peer sedang tak bergerak.
        if (ada.vx === 0 && ada.vy === 0 && Date.now() - ada.t > 1500) {
          ada.tx = meta.x;
          ada.ty = meta.y;
        }
      } else {
        m.set(id, { meta, x: meta.x, y: meta.y, tx: meta.x, ty: meta.y, vx: 0, vy: 0, t: 0, arah: meta.arah, pesanSampai: 0 });
      }
    }
    setDaftarPeer([...m.values()].map((p) => p.meta));
  }, []);

  const terimaGerak = useCallback((p: PaketGerak) => {
    const peer = peers.current.get(p.id);
    if (!peer) return;
    peer.tx = p.x;
    peer.ty = p.y;
    peer.vx = p.vx;
    peer.vy = p.vy;
    peer.t = Date.now();
    peer.arah = p.arah;
  }, []);

  const terimaPesan = useCallback(
    (id: string, teks: string) => {
      const peer = peers.current.get(id);
      if (!peer) return;
      peer.meta.pesan = teks;
      peer.pesanSampai = Date.now() + 7000;
      tampilkanPesan(peerEls.current.get(id) ?? null, teks);
    },
    [tampilkanPesan],
  );

  // ---- cadangan polling (tanpa realtime) ----
  const mulaiPolling = useCallback(() => {
    if (pollTimer.current) return;
    setStatus("polling");
    const tik = async () => {
      try {
        const d = await kirimPosisiLobi(Math.round(pos.current.x), Math.round(pos.current.y), pos.current.arah, pesanSaya.current);
        const hadir: Record<string, MetaRobot> = {};
        for (const r of d.robot) if (!r.saya) hadir[r.user_id] = metaDariRobot(r);
        terapkanHadir(hadir);
        for (const r of d.robot) {
          if (r.saya) continue;
          const peer = peers.current.get(r.user_id);
          if (peer) {
            peer.tx = r.x;
            peer.ty = r.y;
            peer.vx = 0;
            peer.vy = 0;
            peer.t = Date.now();
            peer.arah = r.arah;
            if (r.pesan && r.pesan !== peer.meta.pesan) terimaPesan(r.user_id, r.pesan);
          }
        }
      } catch {
        // coba lagi pada detak berikutnya
      }
    };
    void tik();
    pollTimer.current = setInterval(() => void tik(), POLL_MS);
  }, [terapkanHadir, terimaPesan]);

  // ---- sesi + konfigurasi + sambungan ----
  useEffect(() => {
    let hidup = true;
    void (async () => {
      const u = await masukOtomatis();
      if (!hidup) return;
      if (!u || u === "perbaikan") {
        window.location.replace("/");
        return;
      }
      if (!bolehPet(u)) {
        setKeadaan("dilarang");
        return;
      }
      let k: KonfigLobi;
      try {
        k = await getLobiKonfig();
      } catch (e) {
        if (!hidup) return;
        setKeadaan((e as { status?: number })?.status === 404 || /adopsi/i.test(e instanceof Error ? e.message : "") ? "tanpa_robot" : "dilarang");
        return;
      }
      if (!hidup) return;
      duniaRef.current = k.dunia;
      pos.current = { x: k.dunia.lebar / 2 + (Math.random() - 0.5) * 200, y: k.dunia.tinggi / 2 + 160 + (Math.random() - 0.5) * 120, arah: "kanan" };
      setKonfig(k);
      setKeadaan("siap");
      const meta: MetaRobot = {
        id: k.saya.user_id,
        nama_pemilik: k.saya.nama_pemilik,
        nama_robot: k.saya.nama_robot,
        jenis: k.saya.jenis,
        level: k.saya.level,
        skin: k.saya.skin,
        warna: k.saya.warna,
        terpasang: k.saya.terpasang,
        sparepart: k.saya.sparepart,
        tradable: k.saya.tradable.map((i) => ({ kode: i.kode, jenis: i.jenis, nama: i.nama })),
        x: pos.current.x,
        y: pos.current.y,
        arah: "kanan",
        pesan: "",
      };
      if (k.realtime) {
        try {
          const s = await hubungkanLobi({
            url: k.url,
            key: k.key,
            kanal: k.kanal,
            meta,
            onStatus: (st) => {
              if (!hidup) return;
              setStatus(st);
              if (st === "gagal") mulaiPolling();
            },
            onHadir: terapkanHadir,
            onGerak: terimaGerak,
            onPesan: terimaPesan,
            onLatensi: (ms) => hidup && setLatensi(ms),
          });
          if (!hidup) {
            void s.tutup();
            return;
          }
          sambungan.current = s;
        } catch {
          if (hidup) mulaiPolling();
        }
      } else mulaiPolling();
    })();
    return () => {
      hidup = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (sambungan.current) void sambungan.current.tutup();
      void keluarLobi();
    };
  }, [mulaiPolling, terapkanHadir, terimaGerak, terimaPesan]);

  // ---- mesin gerak + kamera + peer (rAF) ----
  useEffect(() => {
    if (keadaan !== "siap") return;
    let raf = 0;
    let last = performance.now();
    let sebelumnyaBergerak = false;
    const langkah = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000 || 0);
      last = t;
      const { dx, dy } = arah.current;
      const bergerak = dx !== 0 || dy !== 0;
      const p = pos.current;
      const { lebar, tinggi } = duniaRef.current;
      if (bergerak) {
        p.x = Math.max(40, Math.min(lebar - 40, p.x + dx * KECEPATAN * dt));
        p.y = Math.max(TINGGI_ROBOT, Math.min(tinggi - 10, p.y + dy * KECEPATAN * dt));
        if (dx < 0) p.arah = "kiri";
        if (dx > 0) p.arah = "kanan";
      }
      if (bergerak !== bergerakRef.current) {
        bergerakRef.current = bergerak;
        elSaya.current?.querySelector("[data-badan]")?.classList.toggle("pet-melangkah", bergerak);
      }
      letakkan(elSaya.current, p.x, p.y, p.arah);
      terapkanKamera();

      // kirim posisi: saat bergerak tiap 200 ms; sekali lagi saat berhenti
      const kini = Date.now();
      if (sambungan.current) {
        if (bergerak && kini - lastKirim.current >= KIRIM_MS) {
          lastKirim.current = kini;
          sambungan.current.kirimGerak({ x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(dx * KECEPATAN), vy: Math.round(dy * KECEPATAN), arah: p.arah });
        } else if (!bergerak && sebelumnyaBergerak) {
          lastKirim.current = kini;
          sambungan.current.kirimGerak({ x: Math.round(p.x), y: Math.round(p.y), vx: 0, vy: 0, arah: p.arah });
          void sambungan.current.perbaruiMeta({ x: Math.round(p.x), y: Math.round(p.y), arah: p.arah });
        }
      }
      sebelumnyaBergerak = bergerak;

      // peer: prediksi dari kecepatan, lalu meluncur halus
      for (const [id, peer] of peers.current) {
        const umur = peer.t ? Math.min(0.8, (kini - peer.t) / 1000) : 0;
        const px = peer.tx + peer.vx * umur;
        const py = peer.ty + peer.vy * umur;
        peer.x += (px - peer.x) * 0.22;
        peer.y += (py - peer.y) * 0.22;
        const el = peerEls.current.get(id);
        if (el) {
          letakkan(el, peer.x, peer.y, peer.arah);
          const gerak = Math.hypot(peer.vx, peer.vy) > 1 && umur < 0.8;
          el.querySelector("[data-badan]")?.classList.toggle("pet-melangkah", gerak);
          if (peer.pesanSampai && kini > peer.pesanSampai) {
            peer.pesanSampai = 0;
            tampilkanPesan(el, "");
          }
        }
      }
      raf = requestAnimationFrame(langkah);
    };
    raf = requestAnimationFrame(langkah);
    const miniTimer = setInterval(() => {
      setMini([{ id: "saya", x: pos.current.x, y: pos.current.y, saya: true }, ...[...peers.current.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y, saya: false }))]);
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(miniTimer);
    };
  }, [keadaan, letakkan, terapkanKamera, tampilkanPesan]);

  // ---- keyboard WASD / panah ----
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
    const lepasSemua = () => {
      tombol.current.clear();
      hitung();
    };
    window.addEventListener("keydown", turun);
    window.addEventListener("keyup", naik);
    window.addEventListener("blur", lepasSemua);
    return () => {
      window.removeEventListener("keydown", turun);
      window.removeEventListener("keyup", naik);
      window.removeEventListener("blur", lepasSemua);
    };
  }, []);

  // ---- joystick virtual ----
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
    const maks = 44;
    const skalaKnob = jarak > maks ? maks / jarak : 1;
    setKnob({ x: dx * skalaKnob, y: dy * skalaKnob });
    if (jarak < 8) {
      arah.current = { dx: 0, dy: 0 };
      return;
    }
    // Kecepatan penuh setelah 60% jarak, di bawahnya proporsional — sama di semua ukuran layar.
    const kuat = Math.min(1, jarak / (maks * 0.6));
    arah.current = { dx: (dx / jarak) * kuat, dy: (dy / jarak) * kuat };
  }
  function joySelesai() {
    joystick.current.aktif = false;
    arah.current = { dx: 0, dy: 0 };
    setKnob({ x: 0, y: 0 });
  }

  function kirimPesanLobi() {
    const teks = pesan.trim().slice(0, 60);
    pesanSaya.current = teks;
    tampilkanPesan(elSaya.current, teks);
    if (sambungan.current) {
      sambungan.current.kirimPesan(teks);
      void sambungan.current.perbaruiMeta({ pesan: teks });
    }
    setPesan("");
    setTimeout(() => {
      if (pesanSaya.current === teks) {
        pesanSaya.current = "";
        tampilkanPesan(elSaya.current, "");
      }
    }, 7000);
  }


  if (keadaan !== "siap" || !konfig) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-slate-100 px-6 text-center dark:bg-slate-950">
        {keadaan === "memeriksa" ? (
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Menyiapkan lobi…</p>
        ) : (
          <>
            <p className="text-lg font-extrabold text-slate-900 dark:text-white">{keadaan === "tanpa_robot" ? "Adopsi robot dulu" : "Lobi tidak tersedia"}</p>
            <p className="mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-300">
              {keadaan === "tanpa_robot" ? "Buka Profil → Pet Robot, adopsi robotmu, lalu kembali ke lobi." : "Fitur Pet Robot tidak tersedia untuk akun ini."}
            </p>
            <a href="/" className="mt-6 flex h-12 w-full max-w-xs items-center justify-center rounded-xl text-sm font-extrabold text-white" style={{ background: MERAH }}>
              Kembali ke aplikasi
            </a>
          </>
        )}
      </main>
    );
  }

  const { lebar, tinggi } = konfig.dunia;
  const jumlah = daftarPeer.length + 1;
  const realtime = status === "tersambung";

  return (
    <main className="fixed inset-0 select-none overflow-hidden bg-[#E2E8F0]" style={{ touchAction: "none" }}>
      {/* DUNIA (diskalakan & digeser kamera) */}
      <div
        ref={worldEl}
        className="absolute left-0 top-0 will-change-transform"
        style={{
          width: lebar,
          height: tinggi,
          transformOrigin: "0 0",
          backgroundColor: "#EEF2F7",
          backgroundImage: "linear-gradient(rgba(15,23,42,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.07) 1px, transparent 1px)",
          backgroundSize: "100px 100px",
          boxShadow: "inset 0 0 0 12px #CBD5E1",
        }}
      >
        <Dekorasi lebar={lebar} tinggi={tinggi} />

        {/* Peserta lain — posisi diperbarui langsung ke style (tanpa render ulang) */}
        {daftarPeer.map((m) => (
          <div
            key={m.id}
            ref={(el) => {
              if (el) {
                peerEls.current.set(m.id, el);
                const p = peers.current.get(m.id);
                if (p) letakkan(el, p.x, p.y, p.arah);
                tampilkanPesan(el, p?.pesanSampai && p.pesanSampai > Date.now() ? m.pesan : "");
              } else peerEls.current.delete(m.id);
            }}
            data-peer={m.id}
            className="absolute left-0 top-0 flex flex-col items-center will-change-transform"
            style={{ width: UKURAN_ROBOT }}
          >
            <span data-bubble hidden className="mb-1 max-w-[180px] truncate rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-slate-800 shadow" />
            <button type="button" onClick={() => setPilih(robotDariMeta(m, peers.current.get(m.id)))} aria-label={`Robot ${m.nama_robot} milik ${m.nama_pemilik}, ketuk untuk trading`} className="pointer-events-auto bg-transparent">
              <span data-badan className="inline-block">
                <span data-robot className="inline-block">
                  <RobotSvg jenis={m.jenis} skin={m.skin} warna={m.warna} terpasang={m.terpasang as Partial<Record<SlotAksesoris, string>>} sparepart={m.sparepart as Partial<Record<BagianSparepart, string>>} suasana="senang" ukuran={UKURAN_ROBOT} animasi={false} />
                </span>
              </span>
            </button>
            <span className="-mt-1 whitespace-nowrap rounded-full bg-slate-900/85 px-2 py-0.5 text-[11px] font-bold text-white">
              {m.nama_robot} · Lv{m.level}
            </span>
          </div>
        ))}

        {/* Robot saya */}
        <div ref={elSaya} data-saya className="pointer-events-none absolute left-0 top-0 flex flex-col items-center will-change-transform" style={{ width: UKURAN_ROBOT }}>
          <span data-bubble hidden className="mb-1 max-w-[180px] truncate rounded-full bg-amber-300/95 px-2.5 py-1 text-[12px] font-semibold text-slate-900 shadow" />
          <span data-badan className="inline-block">
            <span data-robot className="inline-block">
              <RobotSvg jenis={konfig.saya.jenis} skin={konfig.saya.skin} warna={konfig.saya.warna} terpasang={konfig.saya.terpasang as Partial<Record<SlotAksesoris, string>>} sparepart={konfig.saya.sparepart as Partial<Record<BagianSparepart, string>>} suasana="senang" ukuran={UKURAN_ROBOT} animasi={false} />
            </span>
          </span>
          <span className="-mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: "#DC2626" }}>
            {konfig.saya.nama_robot} (Anda)
          </span>
        </div>
      </div>

      {/* HUD atas */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <a href="/" className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-xl bg-white/90 px-3 text-[12.5px] font-extrabold text-slate-900 shadow">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali
        </a>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="flex h-10 items-center gap-1.5 rounded-xl bg-white/90 px-3 text-[12px] font-bold text-slate-900 shadow">
              <Users className="h-4 w-4 text-red-600" aria-hidden="true" /> {jumlah} online
            </span>
            <span className={cn("flex h-10 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold shadow", realtime ? "bg-emerald-500 text-white" : status === "polling" ? "bg-amber-400 text-slate-900" : "bg-white/90 text-slate-700")} title={realtime ? "Realtime (Supabase)" : status === "polling" ? "Cadangan polling 2 detik" : "Menyambung…"}>
              {realtime ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
              {realtime ? `Realtime${latensi != null ? ` · ${latensi} ms` : ""}` : status === "polling" ? "Polling 2 dtk" : status === "gagal" ? "Gagal" : "Menyambung…"}
            </span>
          </div>
          {/* Peta mini */}
          <div className="relative overflow-hidden rounded-lg border border-white/80 bg-slate-900/70 shadow" style={{ width: 132, height: Math.round((132 * tinggi) / lebar) }} aria-label="Peta mini">
            {mini.map((d) => (
              <span key={d.id} className="absolute rounded-full" style={{ left: `${(d.x / lebar) * 100}%`, top: `${(d.y / tinggi) * 100}%`, width: d.saya ? 8 : 6, height: d.saya ? 8 : 6, marginLeft: d.saya ? -4 : -3, marginTop: d.saya ? -4 : -3, background: d.saya ? "#F87171" : "#FDE68A", boxShadow: d.saya ? "0 0 0 2px rgba(255,255,255,0.8)" : undefined }} />
            ))}
          </div>
        </div>
      </div>

      {/* Joystick (sentuh / layar kecil) */}
      {sentuh ? (
        <div
          onPointerDown={joyMulai}
          onPointerMove={joyGerak}
          onPointerUp={joySelesai}
          onPointerCancel={joySelesai}
          className="absolute bottom-24 left-5 flex h-[124px] w-[124px] items-center justify-center rounded-full border-2 border-white/80 bg-slate-900/30 backdrop-blur-[2px]"
          role="slider"
          aria-label="Joystick gerak robot"
          aria-valuenow={0}
          style={{ touchAction: "none" }}
        >
          <div className="h-12 w-12 rounded-full bg-white/95 shadow-md" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-24 left-5 flex items-center gap-1.5 rounded-xl bg-white/85 px-3 py-2 text-[11.5px] font-bold text-slate-700 shadow">
          <Gamepad2 className="h-4 w-4" aria-hidden="true" /> Gerak: W A S D / panah · ketuk robot lain untuk trading
        </div>
      )}

      {/* Pesan singkat */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3" style={{ background: "linear-gradient(180deg, transparent, rgba(15,23,42,0.35))" }}>
        <input
          value={pesan}
          onChange={(e) => setPesan(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && kirimPesanLobi()}
          maxLength={60}
          placeholder="Pesan singkat di atas robot…"
          aria-label="Pesan lobi"
          className="h-11 min-w-0 flex-1 rounded-xl bg-white/95 px-3 text-[13px] text-slate-900 shadow outline-none"
        />
        <button type="button" onClick={kirimPesanLobi} className="flex h-11 items-center gap-1 rounded-xl px-3.5 text-[12.5px] font-extrabold text-white shadow" style={{ background: MERAH }}>
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> Kirim
        </button>
      </div>

      {/* Panel trading (lembar bawah) */}
      {pilih ? (
        <div className="absolute inset-0 z-20 flex items-end bg-black/40" onClick={() => setPilih(null)}>
          <div className="max-h-[78vh] w-full overflow-y-auto rounded-t-3xl bg-white p-3 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <PanelTrading
              target={pilih}
              onTutup={() => setPilih(null)}
              onBerubah={() => toast("info", "Cek Pet Robot → Pasar", "Tawaran/permintaan tercatat di tab Pasar.")}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
