// Pembangkit acak yang SAMA PERSIS dengan versi Python (outro.py).
//
// Kenapa harus persis: gaya outro ditentukan seed. Seed yang sama di mesin
// Python dan mesin TS wajib menghasilkan palet, tata letak, partikel, dan
// derau yang sama — kalau tidak, "buat ulang dengan seed 123" dari halaman
// menghasilkan outro lain tergantung mesin mana yang kebetulan melayani.
//
// - AcakPython  : random.Random (MT19937 + algoritma random(), choice(),
//                 uniform() CPython).
// - AcakNumpy   : np.random.default_rng(seed) (SeedSequence + PCG64 XSL-RR)
//                 dengan normal() ziggurat numpy, hanya untuk latar "butir".
//
// Tidak memakai literal BigInt (target tsconfig ES2017): aritmetika 128-bit
// PCG64 dikerjakan dengan 8 limb 16-bit di angka double biasa — tiap hasil
// kali < 2^32 dan jumlahnya < 2^36, jadi tetap tepat.
import { FI_DOUBLE, KI_DOUBLE, WI_DOUBLE, ZIGGURAT_NOR_INV_R, ZIGGURAT_NOR_R } from "./ziggurat-tabel";

const N = 624;
const M = 397;

/** random.Random CPython (Modules/_randommodule.c + Lib/random.py). */
export class AcakPython {
  private readonly mt = new Uint32Array(N);
  private mti = N + 1;

  constructor(seed: number) {
    this.seed(seed);
  }

  /** random.seed(int): kunci = kata 32-bit dari |seed|, urutan kecil dulu. */
  seed(nilai: number): void {
    let n = Math.abs(Math.trunc(nilai));
    const kunci: number[] = [];
    if (n === 0) kunci.push(0);
    while (n > 0) {
      kunci.push(n % 4294967296);
      n = Math.floor(n / 4294967296);
    }
    this.initByArray(kunci);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      // 1812433253 * prev + i, mod 2^32 — dipecah 16-bit supaya tidak lewat 2^53.
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(kunci: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    const panjang = kunci.length;
    for (let k = N > panjang ? N : panjang; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + kunci[j] + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
      if (j >= panjang) j = 0;
    }
    for (let k = N - 1; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
    this.mti = N;
  }

  /** genrand_uint32. */
  acak32(): number {
    const mt = this.mt;
    if (this.mti >= N) {
      let kk = 0;
      for (; kk < N - M; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      const y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** random.random(): 53 bit dari dua kata 32-bit. */
  random(): number {
    const a = this.acak32() >>> 5;
    const b = this.acak32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  /** getrandbits(k) untuk 1 <= k <= 32 — cukup untuk choice() di sini. */
  private getrandbits(k: number): number {
    if (k <= 0) return 0;
    if (k > 32) throw new Error("getrandbits > 32 bit tidak dipakai outro");
    return this.acak32() >>> (32 - k);
  }

  /** _randbelow_with_getrandbits: tolak-ulang sampai < n. */
  randbelow(n: number): number {
    // int.bit_length(): k terkecil dengan 2^k > n.
    let bitLength = 0;
    while (2 ** bitLength <= n) bitLength++;
    let r = this.getrandbits(bitLength);
    while (r >= n) r = this.getrandbits(bitLength);
    return r;
  }

  choice<T>(larik: readonly T[]): T {
    if (larik.length === 0) throw new Error("Cannot choose from an empty sequence");
    return larik[this.randbelow(larik.length)];
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }
}

// ------------------------------------------------------------------
//  numpy: SeedSequence + PCG64 + normal ziggurat
// ------------------------------------------------------------------

const INIT_A = 0x43b0d7e5;
const MULT_A = 0x931e8875;
const INIT_B = 0x8b51f9dd;
const MULT_B = 0x58f38ded;
const MIX_MULT_L = 0xca01f9dd;
const MIX_MULT_R = 0x4973f715;

function hashmix(nilai: number, konst: { h: number }): number {
  let v = (nilai ^ konst.h) >>> 0;
  konst.h = Math.imul(konst.h, MULT_A) >>> 0;
  v = Math.imul(v, konst.h) >>> 0;
  v ^= v >>> 16;
  return v >>> 0;
}

function mix(x: number, y: number): number {
  let r = (Math.imul(MIX_MULT_L, x) - Math.imul(MIX_MULT_R, y)) >>> 0;
  r ^= r >>> 16;
  return r >>> 0;
}

/** SeedSequence(seed).generate_state(8, uint32) — pool 4 kata. */
function seedSequenceState(seed: number, nKata: number): number[] {
  let n = Math.abs(Math.trunc(seed));
  const entropi: number[] = [];
  if (n === 0) entropi.push(0);
  while (n > 0) {
    entropi.push(n % 4294967296);
    n = Math.floor(n / 4294967296);
  }
  const pool = [0, 0, 0, 0];
  const konst = { h: INIT_A };
  for (let i = 0; i < pool.length; i++) {
    pool[i] = hashmix(i < entropi.length ? entropi[i] : 0, konst);
  }
  for (let src = 0; src < pool.length; src++) {
    for (let dst = 0; dst < pool.length; dst++) {
      if (src !== dst) pool[dst] = mix(pool[dst], hashmix(pool[src], konst));
    }
  }
  for (let src = pool.length; src < entropi.length; src++) {
    for (let dst = 0; dst < pool.length; dst++) pool[dst] = mix(pool[dst], hashmix(entropi[src], konst));
  }
  const keluar: number[] = [];
  let h = INIT_B;
  for (let i = 0; i < nKata; i++) {
    let v = (pool[i % pool.length] ^ h) >>> 0;
    h = Math.imul(h, MULT_B) >>> 0;
    v = Math.imul(v, h) >>> 0;
    v ^= v >>> 16;
    keluar.push(v >>> 0);
  }
  return keluar;
}

// 128-bit sebagai 8 limb 16-bit, limb[0] paling rendah.
type U128 = number[];

function dariKata(hi64Hi: number, hi64Lo: number, lo64Hi: number, lo64Lo: number): U128 {
  return [
    lo64Lo & 0xffff, lo64Lo >>> 16, lo64Hi & 0xffff, lo64Hi >>> 16,
    hi64Lo & 0xffff, hi64Lo >>> 16, hi64Hi & 0xffff, hi64Hi >>> 16,
  ];
}

function kali128(a: U128, b: U128): U128 {
  const h = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 8; i++) {
    const ai = a[i];
    if (!ai) continue;
    for (let j = 0; i + j < 8; j++) h[i + j] += ai * b[j];
  }
  let bawa = 0;
  for (let k = 0; k < 8; k++) {
    const v = h[k] + bawa;
    h[k] = v % 65536;
    bawa = Math.floor(v / 65536);
  }
  return h;
}

function tambah128(a: U128, b: U128): U128 {
  const h = [0, 0, 0, 0, 0, 0, 0, 0];
  let bawa = 0;
  for (let k = 0; k < 8; k++) {
    const v = a[k] + b[k] + bawa;
    h[k] = v & 0xffff;
    bawa = v >>> 16;
  }
  return h;
}

// PCG_DEFAULT_MULTIPLIER_128 = 2549297995355413924 * 2^64 + 4865540595714422341
const PENGALI: U128 = dariKata(0x2360ed05, 0x1fc65da4, 0x4385df64, 0x9fccf645);

/** np.random.default_rng(seed): PCG64 dengan SeedSequence. */
export class AcakNumpy {
  private state: U128;
  private readonly inc: U128;

  constructor(seed: number) {
    const s = seedSequenceState(seed, 8);
    // generate_state(4, uint64): pasangan kata little-endian -> uint64.
    // val[0..1] = state (hi, lo), val[2..3] = inc (hi, lo).
    const initState = dariKata(s[1], s[0], s[3], s[2]);
    const initSeq = dariKata(s[5], s[4], s[7], s[6]);
    // inc = (initseq << 1) | 1
    const inc: U128 = [0, 0, 0, 0, 0, 0, 0, 0];
    let bawa = 0;
    for (let k = 0; k < 8; k++) {
      const v = initSeq[k] * 2 + bawa;
      inc[k] = v & 0xffff;
      bawa = v >>> 16;
    }
    inc[0] |= 1;
    this.inc = inc;
    this.state = [0, 0, 0, 0, 0, 0, 0, 0];
    this.langkah();
    this.state = tambah128(this.state, initState);
    this.langkah();
  }

  private langkah(): void {
    this.state = tambah128(kali128(this.state, PENGALI), this.inc);
  }

  /** next_uint64 sebagai [hi32, lo32]. */
  acak64(): [number, number] {
    this.langkah();
    const s = this.state;
    const hiHi = (s[7] << 16 | s[6]) >>> 0;
    const hiLo = (s[5] << 16 | s[4]) >>> 0;
    const loHi = (s[3] << 16 | s[2]) >>> 0;
    const loLo = (s[1] << 16 | s[0]) >>> 0;
    const xh = (hiHi ^ loHi) >>> 0;
    const xl = (hiLo ^ loLo) >>> 0;
    const rot = hiHi >>> 26; // state >> 122
    return rotr64(xh, xl, rot);
  }

  /** next_double: 53 bit atas dibagi 2^53. */
  acakDouble(): number {
    const [h, l] = this.acak64();
    // (r >> 11) = h * 2^21 + (l >>> 11)
    return (h * 2097152 + (l >>> 11)) * (1.0 / 9007199254740992.0);
  }

  /** random_standard_normal (ziggurat numpy). */
  normalStandar(): number {
    for (;;) {
      const [h, l] = this.acak64();
      const idx = l & 0xff;
      const tanda = (l >>> 8) & 1;
      const rabs = (h & 0x1fffffff) * 8388608 + (l >>> 9);
      let x = rabs * WI_DOUBLE[idx];
      if (tanda) x = -x;
      if (rabs < KI_DOUBLE[idx]) return x;
      if (idx === 0) {
        for (;;) {
          const xx = -ZIGGURAT_NOR_INV_R * Math.log1p(-this.acakDouble());
          const yy = -Math.log1p(-this.acakDouble());
          if (yy + yy > xx * xx) {
            // (rabs >> 8) & 1 = bit 17 kata asli.
            return (l >>> 17) & 1 ? -(ZIGGURAT_NOR_R + xx) : ZIGGURAT_NOR_R + xx;
          }
        }
      } else if ((FI_DOUBLE[idx - 1] - FI_DOUBLE[idx]) * this.acakDouble() + FI_DOUBLE[idx] < Math.exp(-0.5 * x * x)) {
        return x;
      }
    }
  }

  /** Generator.normal(loc, scale): loc + scale * standard_normal. */
  normal(loc: number, scale: number): number {
    return loc + scale * this.normalStandar();
  }
}

function rotr64(h: number, l: number, rot: number): [number, number] {
  rot &= 63;
  if (rot === 0) return [h >>> 0, l >>> 0];
  if (rot === 32) return [l >>> 0, h >>> 0];
  if (rot < 32) {
    return [((h >>> rot) | (l << (32 - rot))) >>> 0, ((l >>> rot) | (h << (32 - rot))) >>> 0];
  }
  const r = rot - 32;
  return [((l >>> r) | (h << (32 - r))) >>> 0, ((h >>> r) | (l << (32 - r))) >>> 0];
}
