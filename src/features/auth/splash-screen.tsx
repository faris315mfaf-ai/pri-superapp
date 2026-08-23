"use client";

// ============================================================
// SplashScreen — transisi singkat 0,8 detik setelah login.
// Menyapa "Selamat datang, [Nama]" dengan animasi logo.
// ============================================================

import { motion } from "framer-motion";
import { sapaanHari } from "@/lib/format";
import type { User } from "@/types";

export function SplashScreen({ user }: { user: User }) {
  return (
    <div
      className="kolom-aplikasi flex min-h-dvh flex-col items-center justify-center px-8"
      role="status"
      aria-label="Memuat aplikasi"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 16 }}
        className="flex h-20 w-20 items-center justify-center rounded-full font-heading text-xl font-extrabold text-white"
        style={{
          background: "linear-gradient(135deg, #DC2626 20%, #F59E0B 100%)",
          boxShadow: "0 16px 40px rgba(220, 38, 38, 0.45)",
        }}
        aria-hidden="true"
      >
        PRI
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="mt-6 text-center font-heading text-xl font-extrabold text-teks-utama"
      >
        {sapaanHari()}, {user.nama.split(" ")[0]}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="mt-1.5 text-sm text-teks-sekunder"
      >
        Menyiapkan PRI SuperApp...
      </motion.p>

      {/* Bar progres tipis */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.15, duration: 0.7, ease: "easeInOut" }}
        className="mt-6 h-1 w-36 origin-left rounded-full"
        style={{ background: "linear-gradient(90deg, #DC2626, #F59E0B)" }}
        aria-hidden="true"
      />
    </div>
  );
}
