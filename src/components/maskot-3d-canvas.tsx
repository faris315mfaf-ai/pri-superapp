"use client";

// ============================================================
// Maskot3DCanvas — badan asli "Gembul" dalam 3D (Three.js murni,
// dibangun dari primitif geometri, TANPA file model .glb eksternal).
//
// Kenapa primitif, bukan hasil generate AI text-to-3D (Meshy/Tripo3D/
// Rodin dkk)? Karena project ini belum punya API key/koneksi ke
// layanan itu (cek .env.example — tidak ada). Jadi "digenerate AI"
// di sini artinya: bentuk, proporsi, warna, dan animasinya disusun
// langsung sebagai kode oleh AI, bukan lewat mesh hasil AI eksternal.
// Kalau nanti mau upgrade ke mesh organik hasil AI generation asli,
// lihat catatan "JALUR UPGRADE" di paling bawah file ini.
//
// File ini SENGAJA dipisah dari maskot-3d.tsx supaya three.js /
// @react-three/fiber (lumayan berat) hanya ke-load lewat dynamic
// import saat komponen benar-benar dipakai, bukan ikut bundle utama.
// ============================================================

import { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type MaskotMood = "netral" | "senang" | "sedih";
export type MaskotTingkat = "merah" | "biru" | "hijau";

/** Warna aksesoris (syal leher) ikut sistem tingkatan streak yang sudah
 *  ada di spek (lihat spek-update-1.14.md §4.1) — merah → biru → hijau. */
const WARNA_TINGKAT: Record<MaskotTingkat, string> = {
  merah: "#DC2626",
  biru: "#2563EB",
  hijau: "#16A34A",
};

// Warna badan Gembul tetap konsisten (identitas maskot), hanya
// aksesorisnya yang berubah — supaya karakter tetap "dikenali" di
// semua layar (mode maintenance, profil, notifikasi pencapaian, dll).
const WARNA_BADAN = "#FBBF77";
const WARNA_PERUT = "#FEF3C7";

function Mata({ sisi, berkedip }: { sisi: 1 | -1; berkedip: number }) {
  return (
    <group position={[sisi * 0.26, 0.14, 0.83]} scale={[1, berkedip, 1]}>
      <mesh>
        <sphereGeometry args={[0.115, 16, 16]} />
        <meshStandardMaterial color="#292524" />
      </mesh>
      <mesh position={[-sisi * 0.03, 0.035, 0.09]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Pipi({ sisi }: { sisi: 1 | -1 }) {
  return (
    <mesh position={[sisi * 0.42, -0.06, 0.72]} rotation={[0, sisi * 0.5, 0]}>
      <circleGeometry args={[0.12, 16]} />
      <meshStandardMaterial color="#FCA5A5" transparent opacity={0.5} />
    </mesh>
  );
}

/** Mulut: lengkungan torus. Senyum kalau senang/netral, cemberut kalau sedih. */
function Mulut({ mood }: { mood: MaskotMood }) {
  const cemberut = mood === "sedih";
  return (
    <mesh
      position={[0, cemberut ? -0.16 : -0.2, 0.86]}
      rotation={[cemberut ? Math.PI : 0, 0, Math.PI]}
    >
      <torusGeometry args={[0.16, 0.032, 8, 16, Math.PI]} />
      <meshStandardMaterial color="#7C2D12" />
    </mesh>
  );
}

function Lengan({ sisi, target }: { sisi: 1 | -1; target: number }) {
  const grup = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!grup.current) return;
    grup.current.rotation.z = THREE.MathUtils.lerp(
      grup.current.rotation.z,
      target * sisi,
      0.12,
    );
  });
  // Lengan digambar menggantung LURUS ke bawah dari titik pivot
  // (0,0 lokal, bukan digeser ke samping) — supaya ujung atas kapsul
  // selalu melewati/menutupi titik pivot itu sendiri di SEMUA sudut
  // rotasi. Dikombinasikan dengan <BantalanBahu> yang dipasang persis
  // di titik pivot yang sama (lihat PIVOT_BAHU di bawah), sambungan
  // lengan-badan jadi tidak pernah renggang walau lengan diangkat
  // penuh untuk mood "senang".
  return (
    <group ref={grup} position={PIVOT_BAHU(sisi)}>
      <mesh position={[0, -0.22, 0]}>
        <capsuleGeometry args={[0.13, 0.36, 4, 8]} />
        <meshStandardMaterial color={WARNA_BADAN} />
      </mesh>
    </group>
  );
}

/** Titik pivot bahu — dipakai bareng oleh <Lengan> (sebagai origin
 *  rotasi) dan <BantalanBahu> (sebagai posisi tetap), supaya keduanya
 *  selalu match persis walau nilainya diubah nanti. */
function PIVOT_BAHU(sisi: 1 | -1): [number, number, number] {
  return [sisi * 0.68, 0.06, 0];
}

/** Bola kecil TEPAT di titik pivot bahu, tidak ikut rotasi Lengan —
 *  menutup sambungan lengan-badan di semua sudut, termasuk saat
 *  melambai penuh (mood "senang"). */
function BantalanBahu({ sisi }: { sisi: 1 | -1 }) {
  return (
    <mesh position={PIVOT_BAHU(sisi)}>
      <sphereGeometry args={[0.19, 12, 12]} />
      <meshStandardMaterial color={WARNA_BADAN} />
    </mesh>
  );
}

function Kaki({ sisi }: { sisi: 1 | -1 }) {
  return (
    <mesh position={[sisi * 0.32, -0.95, 0.05]}>
      <sphereGeometry args={[0.22, 12, 12]} />
      <meshStandardMaterial color={WARNA_BADAN} />
    </mesh>
  );
}

// Posisi percikan disusun sebagai kipas tetap DI DEPAN & DI ATAS
// kepala (bukan mengorbit keliling badan) — supaya selalu kelihatan
// dari kamera depan, tidak pernah lewat ke belakang kepala atau
// kepotong tepi kanvas sempit (mis. di kartu notifikasi kecil).
const TITIK_PERCIKAN: Array<[number, number]> = [
  [-0.6, 0.62],
  [-0.34, 0.88],
  [0, 0.98],
  [0.34, 0.88],
  [0.6, 0.62],
];

/** Percikan kecil yang berkelip saat mood "senang" — pengganti
 *  confetti 3D ringan, tanpa particle system/library tambahan. */
function Percikan({ aktif }: { aktif: boolean }) {
  const grup = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!grup.current) return;
    const t = state.clock.elapsedTime;
    grup.current.children.forEach((anak, i) => {
      const s = 0.55 + 0.45 * Math.sin(t * 5 + i * 1.3);
      anak.scale.setScalar(Math.max(s, 0.15));
    });
  });
  if (!aktif) return null;
  return (
    <group ref={grup}>
      {TITIK_PERCIKAN.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.55]}>
          <sphereGeometry args={[0.075, 8, 8]} />
          <meshStandardMaterial color="#FDE047" emissive="#FDE047" emissiveIntensity={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Custom hook (bukan komponen) — mengelola animasi & mengembalikan
 *  node JSX badan Gembul. Dipisah dari <Adegan> supaya logic animasi
 *  gampang dibaca terpisah dari setup scene (cahaya, kamera, dll). */
function useGembulBadan({ mood, tingkat }: { mood: MaskotMood; tingkat: MaskotTingkat }) {
  const grupUtama = useRef<THREE.Group>(null);
  const [berkedip, setBerkedip] = useState(1);
  const lompatWaktuRef = useRef(-10);

  // Kedipan mata acak, biar "hidup" — bukan cuma bengong.
  useEffect(() => {
    let batal = false;
    const jadwalkan = () => {
      const jeda = 2200 + Math.random() * 2600;
      window.setTimeout(() => {
        if (batal) return;
        setBerkedip(0.08);
        window.setTimeout(() => !batal && setBerkedip(1), 120);
        jadwalkan();
      }, jeda);
    };
    jadwalkan();
    return () => {
      batal = true;
    };
  }, []);

  const senang = mood === "senang";
  const sedih = mood === "sedih";
  const targetLengan = senang ? 0.9 : sedih ? -0.15 : 0.35;

  useFrame((state) => {
    if (!grupUtama.current) return;
    const t = state.clock.elapsedTime;

    // Melayang idle — frekuensi & amplitudo naik kalau lagi senang.
    const amplitudo = senang ? 0.18 : sedih ? 0.05 : 0.09;
    const frekuensi = senang ? 3.2 : 1.4;
    let y = Math.sin(t * frekuensi) * amplitudo;

    // Lompat sekali saat disentuh (lihat onSentuh di Canvas wrapper).
    const sejakLompat = t - lompatWaktuRef.current;
    if (sejakLompat >= 0 && sejakLompat < 0.5) {
      y += Math.sin((sejakLompat / 0.5) * Math.PI) * 0.4;
    }

    grupUtama.current.position.y = y - (sedih ? 0.12 : 0);
    grupUtama.current.rotation.z = THREE.MathUtils.lerp(
      grupUtama.current.rotation.z,
      sedih ? 0.06 : 0,
      0.1,
    );
    grupUtama.current.rotation.y = Math.sin(t * 0.5) * (senang ? 0.35 : 0.12);
  });

  return {
    lompatWaktuRef,
    node: (
      <group ref={grupUtama}>
        {/* Badan utama — satu blob bulat gembul */}
        <mesh scale={[1, 0.98, 0.94]}>
          <sphereGeometry args={[0.85, 32, 32]} />
          <meshStandardMaterial color={WARNA_BADAN} roughness={0.55} />
        </mesh>
        {/* Perut/dada terang */}
        <mesh position={[0, -0.15, 0.62]} scale={[0.62, 0.55, 0.4]}>
          <sphereGeometry args={[0.6, 24, 24]} />
          <meshStandardMaterial color={WARNA_PERUT} roughness={0.6} />
        </mesh>

        <Mata sisi={1} berkedip={berkedip} />
        <Mata sisi={-1} berkedip={berkedip} />
        <Pipi sisi={1} />
        <Pipi sisi={-1} />
        <Mulut mood={mood} />

        {/* Kalung/kerah — warnanya ikut tingkatan streak pengguna.
            Diposisikan di bagian bawah badan (dekat kaki), melingkari
            sumbu vertikal, supaya terbaca sebagai "kerah", bukan bando
            di kepala. Radius torus (0.6) dibuat pas menempel permukaan
            bola badan di ketinggian ini. */}
        <mesh position={[0, -0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.6, 0.075, 12, 32]} />
          <meshStandardMaterial color={WARNA_TINGKAT[tingkat]} roughness={0.4} />
        </mesh>

        <BantalanBahu sisi={1} />
        <BantalanBahu sisi={-1} />
        <Lengan sisi={1} target={targetLengan} />
        <Lengan sisi={-1} target={targetLengan} />
        <Kaki sisi={1} />
        <Kaki sisi={-1} />

        <Percikan aktif={senang} />
      </group>
    ),
  };
}

function Adegan({
  mood,
  tingkat,
  daftarSentuhRef,
}: {
  mood: MaskotMood;
  tingkat: MaskotTingkat;
  daftarSentuhRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { lompatWaktuRef, node } = useGembulBadan({ mood, tingkat });

  useEffect(() => {
    daftarSentuhRef.current = () => {
      lompatWaktuRef.current = performance.now() / 1000 - 0.001;
    };
  }, [daftarSentuhRef, lompatWaktuRef]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 4]} intensity={1.1} />
      <directionalLight position={[-2, 1, -2]} intensity={0.3} />
      <group
        onClick={() => daftarSentuhRef.current?.()}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        {node}
      </group>
    </>
  );
}

export type Maskot3DCanvasProps = {
  mood?: MaskotMood;
  tingkat?: MaskotTingkat;
  tinggi?: number;
};

/** Komponen inti — hanya di-mount di sisi klien lewat maskot-3d.tsx. */
export default function Maskot3DCanvas({
  mood = "netral",
  tingkat = "merah",
  tinggi = 220,
}: Maskot3DCanvasProps) {
  const sentuhRef = useRef<(() => void) | null>(null);
  return (
    <div style={{ height: tinggi, width: "100%" }}>
      <Canvas
        camera={{ position: [0, 0.1, 4.6], fov: 32 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, alpha: true }}
      >
        <Adegan mood={mood} tingkat={tingkat} daftarSentuhRef={sentuhRef} />
      </Canvas>
    </div>
  );
}

// ============================================================
// JALUR UPGRADE — kalau nanti mau ganti badan primitif ini dengan
// mesh organik hasil AI text-to-3D generation asli:
//
// 1. Pakai layanan seperti Meshy AI, Tripo3D, atau Rodin (Hyper3D) —
//    masukkan prompt (contoh ada di dokumen spek project), export
//    hasilnya sebagai .glb, taruh di /public/models/gembul.glb.
// 2. Kalau butuh animasi manusia penuh (jalan, menari), auto-rig
//    dulu lewat Mixamo (upload .glb/.fbx, pilih rig, download
//    animasi sebagai .fbx lalu convert ke .glb).
// 3. Ganti isi <GembulBadan> di atas dengan:
//      const { scene } = useGLTF("/models/gembul.glb");
//      return <primitive object={scene} />;
//    (import useGLTF dari "@react-three/drei")
// 4. Logic animasi mood/tingkat/lompat di file ini (posisi, rotasi,
//    warna syal) tetap bisa dipakai — tinggal diarahkan ke node/
//    material dari mesh baru, bukan primitif geometri.
// ============================================================
