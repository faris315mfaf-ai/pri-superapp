// ============================================================
// AsistenSuara (fitur 1.20/3) — percakapan SUARA 2 arah realtime
// dengan Gemini Live, murni dari peramban:
//
//   mic → PCM 16 kHz → WebSocket Gemini Live → audio 24 kHz → speaker
//
// Keamanan: WebSocket dibuka dengan TOKEN SEMENTARA (sekali pakai,
// umur menit-an) dari /api/asisten/suara — kunci API asli tidak
// pernah ada di peramban. functionCall dari model TIDAK dieksekusi
// di sini: diteruskan ke server (daftar putih alat) dan hasilnya
// dikembalikan ke sesi.
// ============================================================

import { jalankanAlatSuara } from "@/services";

// Endpoint KHUSUS token sementara (diverifikasi 28 Agu 2026):
// BidiGenerateContentConstrained + ?access_token= — endpoint biasa
// menolak token sementara sebagai "unregistered caller".
const URL_LIVE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export type StatusSuara =
  | "siap"
  | "meminta-mik"
  | "menyambung"
  | "mendengarkan"
  | "berbicara"
  | "berhenti"
  | "galat";

type Callback = {
  onStatus: (s: StatusSuara) => void;
  onGalat: (pesan: string) => void;
  /**
   * Level audio 0..1 untuk animasi avatar (fitur 1.20.1):
   * "masuk" = suara pengguna dari mik, "keluar" = suara asisten.
   */
  onTingkat?: (arah: "masuk" | "keluar", level: number) => void;
  /**
   * Potongan transkrip (fitur 1.20.3): "masuk" = ucapan pengguna,
   * "keluar" = ucapan asisten. `selesai` menandai akhir satu giliran
   * (UI memulai gelembung baru setelahnya).
   */
  onTranskrip?: (arah: "masuk" | "keluar", teks: string, selesai: boolean) => void;
};

/**
 * Keadaan izin mikrofon SEBELUM meminta — supaya layar suara bisa
 * menjelaskan dulu (prompt), atau memandu ke setelan (denied), alih-
 * alih langsung gagal misterius.
 */
export async function cekIzinMik(): Promise<"granted" | "prompt" | "denied" | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }
  try {
    // Sebagian peramban (Safari lama) tidak mengenal nama "microphone"
    // di Permissions API — anggap "prompt" dan biarkan getUserMedia
    // yang menentukan.
    const izin = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return izin.state === "granted" ? "granted" : izin.state === "denied" ? "denied" : "prompt";
  } catch {
    return "prompt";
  }
}

/** RMS sederhana (dilangkahi 8 sampel — cukup halus untuk animasi). */
function tingkatDari(sampel: Float32Array): number {
  let jumlah = 0;
  let n = 0;
  for (let i = 0; i < sampel.length; i += 8) {
    jumlah += sampel[i] * sampel[i];
    n++;
  }
  // RMS suara normal ~0.02-0.2 — dikalikan supaya animasinya terasa.
  return Math.min(1, Math.sqrt(jumlah / Math.max(1, n)) * 6);
}

/** Float32 [-1..1] → PCM16 little-endian, lalu base64. */
function keBase64Pcm(masukan: Float32Array): string {
  const pcm = new Int16Array(masukan.length);
  for (let i = 0; i < masukan.length; i++) {
    const v = Math.max(-1, Math.min(1, masukan[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let biner = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    biner += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(biner);
}

function dariBase64Pcm(b64: string): Float32Array {
  const biner = atob(b64);
  const bytes = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i++) bytes[i] = biner.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer);
  const keluar = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) keluar[i] = pcm[i] / 0x8000;
  return keluar;
}

export class AsistenSuara {
  private ws: WebSocket | null = null;
  private ctxMik: AudioContext | null = null;
  private ctxSpeaker: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private prosesor: ScriptProcessorNode | null = null;
  private jadwalSpeaker = 0;
  private hidup = false;

  constructor(private cb: Callback) {}

  /** Mulai sesi: minta mik → token → sambung → alirkan audio. */
  async mulai(token: string, model: string): Promise<void> {
    if (this.hidup) return;
    this.hidup = true;
    try {
      this.cb.onStatus("meminta-mik");
      // Mik 16 kHz mono — format masukan yang diminta Gemini Live.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      this.cb.onStatus("menyambung");
      // Token sementara dikirim sebagai access_token — kunci asli
      // tidak pernah menyentuh peramban.
      const ws = new WebSocket(`${URL_LIVE}?access_token=${encodeURIComponent(token)}`);
      this.ws = ws;

      ws.onopen = () => {
        // Konfigurasi sesi sudah TERKUNCI di token (liveConnectConstraints)
        // — setup cukup menyebut modelnya.
        ws.send(JSON.stringify({ setup: { model: `models/${model}` } }));
      };
      ws.onmessage = (ev) => void this.terima(ev);
      ws.onerror = () => {
        if (this.hidup) this.gagal("Sambungan suara terputus.");
      };
      ws.onclose = () => {
        if (this.hidup) this.berhenti();
      };
    } catch (e) {
      // Pesan galat dibedakan per penyebab (fitur 1.20.1) — "gagal"
      // polos membuat orang mengira aplikasinya rusak, padahal yang
      // dibutuhkan cuma menekan Izinkan di prompt peramban.
      const nama = e instanceof DOMException ? e.name : "";
      this.gagal(
        nama === "NotAllowedError"
          ? "Izin mikrofon ditolak. Ketuk ikon gembok/setelan situs di peramban lalu izinkan Mikrofon."
          : nama === "NotFoundError"
            ? "Mikrofon tidak ditemukan di perangkat ini."
            : nama === "NotReadableError"
              ? "Mikrofon sedang dipakai aplikasi lain — tutup dulu aplikasi itu."
              : "Gagal memulai mode suara. Coba lagi.",
      );
    }
  }

  /** Setelah setupComplete: mulai mengalirkan mik. */
  private mulaiMik() {
    if (!this.stream || !this.hidup) return;
    // 16 kHz langsung di context — tanpa downsample manual.
    const ctx = new AudioContext({ sampleRate: 16000 });
    this.ctxMik = ctx;
    const sumber = ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor dipilih sadar: usang tapi berjalan di semua
    // peramban tanpa berkas worklet terpisah (CSP ketat).
    const prosesor = ctx.createScriptProcessor(4096, 1, 1);
    this.prosesor = prosesor;
    prosesor.onaudioprocess = (ev) => {
      if (!this.hidup || this.ws?.readyState !== WebSocket.OPEN) return;
      const sampel = ev.inputBuffer.getChannelData(0);
      this.cb.onTingkat?.("masuk", tingkatDari(sampel));
      const data = keBase64Pcm(sampel);
      this.ws.send(
        JSON.stringify({
          realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } },
        }),
      );
    };
    sumber.connect(prosesor);
    prosesor.connect(ctx.destination);
    this.cb.onStatus("mendengarkan");
  }

  private async terima(ev: MessageEvent) {
    try {
      const teks =
        typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
      const pesan = JSON.parse(teks) as {
        setupComplete?: unknown;
        serverContent?: {
          interrupted?: boolean;
          turnComplete?: boolean;
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
          modelTurn?: {
            parts?: { inlineData?: { data?: string; mimeType?: string } }[];
          };
        };
        toolCall?: {
          functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[];
        };
      };

      if (pesan.setupComplete !== undefined) {
        this.mulaiMik();
        return;
      }

      // Transkrip (fitur 1.20.3): tampilkan apa yang didengar & diucapkan.
      const trIn = pesan.serverContent?.inputTranscription?.text;
      if (trIn) this.cb.onTranskrip?.("masuk", trIn, false);
      const trOut = pesan.serverContent?.outputTranscription?.text;
      if (trOut) this.cb.onTranskrip?.("keluar", trOut, false);

      // Pengguna menyela → buang antrean suara yang belum diputar.
      if (pesan.serverContent?.interrupted) {
        this.hentikanSpeaker();
        this.cb.onStatus("mendengarkan");
      }

      const bagian = pesan.serverContent?.modelTurn?.parts ?? [];
      for (const p of bagian) {
        const b64 = p.inlineData?.data;
        if (b64) this.putar(dariBase64Pcm(b64));
      }
      if (pesan.serverContent?.turnComplete) {
        // Tutup gelembung transkrip giliran ini.
        this.cb.onTranskrip?.("keluar", "", true);
        this.cb.onStatus("mendengarkan");
      }

      // functionCall → server (daftar putih) → toolResponse.
      const panggilan = pesan.toolCall?.functionCalls ?? [];
      if (panggilan.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const jawaban = await Promise.all(
          panggilan.map(async (fc) => {
            let hasil: Record<string, unknown>;
            try {
              hasil = await jalankanAlatSuara(String(fc.name ?? ""), fc.args ?? {});
            } catch (e) {
              hasil = { galat: e instanceof Error ? e.message : "Alat gagal." };
            }
            return { id: fc.id, name: fc.name, response: hasil };
          }),
        );
        this.ws.send(JSON.stringify({ toolResponse: { functionResponses: jawaban } }));
      }
    } catch (e) {
      console.error("[asisten-suara] pesan:", e);
    }
  }

  /** Antrekan audio balasan (PCM 24 kHz) supaya mulus tanpa putus. */
  private putar(sampel: Float32Array) {
    if (!this.hidup) return;
    if (!this.ctxSpeaker) {
      this.ctxSpeaker = new AudioContext({ sampleRate: 24000 });
      this.jadwalSpeaker = this.ctxSpeaker.currentTime;
    }
    const ctx = this.ctxSpeaker;
    const buf = ctx.createBuffer(1, sampel.length, 24000);
    buf.getChannelData(0).set(sampel);
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(ctx.destination);
    const mulai = Math.max(ctx.currentTime, this.jadwalSpeaker);
    node.start(mulai);
    this.jadwalSpeaker = mulai + buf.duration;
    this.cb.onStatus("berbicara");
    this.cb.onTingkat?.("keluar", tingkatDari(sampel));
  }

  private hentikanSpeaker() {
    if (this.ctxSpeaker) {
      void this.ctxSpeaker.close().catch(() => {});
      this.ctxSpeaker = null;
      this.jadwalSpeaker = 0;
    }
  }

  private gagal(pesan: string) {
    this.cb.onGalat(pesan);
    this.cb.onStatus("galat");
    this.berhenti(false);
  }

  /** Akhiri sesi & lepaskan semua sumber daya (mik, audio, socket). */
  berhenti(lapor = true) {
    if (!this.hidup && lapor) return;
    this.hidup = false;
    try {
      this.prosesor?.disconnect();
    } catch {
      // Node audio bisa saja sudah terlepas.
    }
    this.prosesor = null;
    if (this.ctxMik) {
      void this.ctxMik.close().catch(() => {});
      this.ctxMik = null;
    }
    this.hentikanSpeaker();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    this.ws = null;
    if (lapor) this.cb.onStatus("berhenti");
  }
}
