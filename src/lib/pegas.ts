// ============================================================
// Kurva PEGAS ala Apple (7 Okt 2026, desain baru): redaman + respons
// (WWDC "Designing Fluid Interfaces") yang dihitung sekali menjadi easing
// CSS linear(). Redaman 1 = teredam kritis (tanpa memantul).
// Dibuat dengan rumus pegas teredam; jangan disunting tangan.
// ============================================================

/** Perpindahan halaman: redaman 1, respons 0,42 s. */
export const PEGAS_HALAMAN = { easing: "linear(0, 0.029, 0.097, 0.186, 0.282, 0.376, 0.466, 0.547, 0.619, 0.682, 0.736, 0.782, 0.821, 0.854, 0.881, 0.903, 0.921, 0.936, 0.949, 0.959, 0.967, 0.973, 0.979, 0.983, 0.986, 0.989, 0.991, 0.993, 0.995, 0.996, 0.997, 0.997, 0.998, 0.998, 0.999, 0.999, 0.999, 0.999, 0.999, 1, 1)", durasi: 700 } as const;
/** Antarmuka umum: redaman 1, respons 0,32 s. */
export const PEGAS_LEMBUT = { easing: "linear(0, 0.029, 0.096, 0.184, 0.279, 0.373, 0.462, 0.543, 0.616, 0.679, 0.733, 0.779, 0.818, 0.851, 0.878, 0.901, 0.92, 0.935, 0.947, 0.958, 0.966, 0.973, 0.978, 0.982, 0.986, 0.989, 0.991, 0.993, 0.994, 0.995, 0.996, 0.997, 0.998, 0.998, 0.999, 0.999, 0.999, 0.999, 0.999, 1, 1)", durasi: 530 } as const;
/** Sedikit memantul (gerak bermomentum): redaman 0,78, respons 0,34 s. */
export const PEGAS_PANTUL = { easing: "linear(0, 0.025, 0.09, 0.177, 0.277, 0.38, 0.481, 0.575, 0.66, 0.735, 0.799, 0.852, 0.896, 0.932, 0.959, 0.98, 0.995, 1.006, 1.013, 1.017, 1.019, 1.02, 1.019, 1.018, 1.016, 1.014, 1.012, 1.01, 1.008, 1.007, 1.005, 1.004, 1.003, 1.002, 1.001, 1.001, 1, 1, 1, 1, 1)", durasi: 520 } as const;
