// Alamat per layar (16 Okt 2026): /tvrsaya, /ruangbot, /chat, ... memakai cangkang aplikasi yang sama
// dengan "/". Layar yang dibuka ditentukan dari alamat di klien (src/lib/alamat-layar.ts); tiap layar
// tetap dimuat hanya saat dibuka. Alamat yang tidak dikenal = 404.
import { notFound } from "next/navigation";
import { posisiDariPath } from "@/lib/alamat-layar";
import Aplikasi from "../page";

export default async function HalamanLayar({ params }: { params: Promise<{ layar: string }> }) {
  const { layar } = await params;
  if (!posisiDariPath(`/${layar}`)) notFound();
  return <Aplikasi />;
}
