// Harness sementara untuk pengujian browser modul TV Rakyat (dihapus setelah uji).
import React from "react";
import { createRoot } from "react-dom/client";
import { TvScreen } from "@/features/tv-rakyat/tv-screen";
import { ToastViewport } from "@/components/toast-viewport";
import type { User } from "@/types";

const user: User = {
  id: "u-tv",
  nama: "Admin TV",
  email: "tv@pri.id",
  role: "admin_tv",
  avatar_url: "",
  jabatan: "Admin TV Rakyat",
};

function App() {
  return (
    <>
      <TvScreen user={user} />
      <ToastViewport />
    </>
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
