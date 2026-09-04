// /simpel — MODE SIMPEL PRI SUPERAPP (4 Sep 2026).
// Halaman terpisah dari "/" supaya pohon aplikasi lengkap (robot, running
// text, tutorial, chat realtime, polling) tidak ikut termuat sama sekali.
import { ModeSimpelApp } from "@/features/simpel/mode-simpel-app";

export const dynamic = "force-dynamic";

export default function HalamanSimpel() {
  return <ModeSimpelApp />;
}
