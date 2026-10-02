// np.exp untuk array float32, SAMA dengan kernel SIMD numpy (AVX2+FMA3 /
// AVX512F, loops_exponent_log.dispatch.c.src, numpy 1.18 s.d. 2.x).
//
// Kenapa tidak cukup Math.fround(Math.exp(x)): numpy memakai aproksimasi
// rasional sendiri (galat sampai 2,5 ULP), bukan expf libm. Selisih 1 ULP
// itu cukup untuk membalik pemotongan astype(uint8) di sebagian kecil
// piksel latar "sapuan". Dengan algoritma yang sama, piksel itu ikut sama.
// Catatan: CPU tanpa AVX2/FMA3 membuat numpy kembali ke expf libm — di sana
// Python sendiri bisa berbeda 1 nilai di piksel yang sama.

const f32 = Math.fround;

const CODY_WAITE_HIGH = f32(-6.93145752e-1);
const CODY_WAITE_LOW = f32(-1.42860677e-6);
const P0 = f32(9.999999999980870924916e-1);
const P1 = f32(7.257664613233124478488e-1);
const P2 = f32(2.473615434895520810817e-1);
const P3 = f32(5.114512081637298353406e-2);
const P4 = f32(6.757896990527504603057e-3);
const P5 = f32(5.082762527590693718096e-4);
const Q0 = f32(1.0);
const Q1 = f32(-2.742335390411667452936e-1);
const Q2 = f32(2.159509375685829852307e-2);
const MAGIC = f32(12582912); // 0x1.8p+23: pembulatan ke bilangan bulat terdekat
const LOG2E = f32(1.442695040888963407359924681001892137);
const XMAX = 88.72283935546875;
const XMIN = -103.97208404541015625;

/** 2^q untuk q bulat -150..128 (Math.pow per piksel terlalu mahal). */
const PANGKAT2 = new Float64Array(279);
for (let q = -150; q <= 128; q++) PANGKAT2[q + 150] = 2 ** q;

/** fmadd float32: a*b tepat di double (48 bit), lalu satu pembulatan ke float32. */
const fma = (a: number, b: number, c: number) => f32(a * b + c);

export function expF32(xMasuk: number): number {
  let x = f32(xMasuk);
  if (x !== x) return Number.NaN;
  if (x >= XMAX) return Number.POSITIVE_INFINITY;
  if (x <= XMIN) return 0;
  let q = f32(x * LOG2E);
  q = f32(q + MAGIC);
  q = f32(q - MAGIC);
  // Reduksi Cody-Waite: x - q*ln2 dalam dua langkah fmadd.
  x = fma(q, CODY_WAITE_HIGH, x);
  x = fma(q, CODY_WAITE_LOW, x);
  let num = fma(P5, x, P4);
  num = fma(num, x, P3);
  num = fma(num, x, P2);
  num = fma(num, x, P1);
  num = fma(num, x, P0);
  let den = fma(Q2, x, Q1);
  den = fma(den, x, Q0);
  const poly = f32(num / den);
  if (q <= -125) {
    // scalef untuk hasil denormal: kalikan 2^-125 lalu bagi 2^(selisih).
    const selisih = -125 - q;
    return f32(f32(poly * PANGKAT2[-125 + 150]) / PANGKAT2[selisih + 150]);
  }
  return f32(poly * PANGKAT2[q + 150]);
}
