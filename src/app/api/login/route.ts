// POST /api/login — autentikasi pengguna aplikasi
import { NextRequest, NextResponse } from "next/server";
import { users, keUserPublik } from "@/data/users";

export const dynamic = "force-dynamic";

/** Jeda simulasi jaringan */
const jeda = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

export async function POST(request: NextRequest) {
  await jeda();

  let body: { email?: string; password?: string } = {};
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const cocok = users.find(
    (u) => u.email.toLowerCase() === email && u.password === password,
  );

  if (!cocok) {
    return NextResponse.json({ error: "Email atau kata sandi salah" }, { status: 401 });
  }

  // Respons TIDAK menyertakan password
  return NextResponse.json({ user: keUserPublik(cocok) });
}
