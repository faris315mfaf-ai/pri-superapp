// Titik masuk bundel esbuild -> runner.mjs (perintah: node runner.mjs).
// Dipisah dari utama.ts karena entri esbuild memakai --entry-names=[name]:
// "utama" sudah dipakai server mesin (src/mesin-video/server/utama.ts -> utama.mjs).
import { mulai } from "./utama";

mulai().catch((e) => {
  console.error("[bot-runner] berhenti karena galat:", e instanceof Error ? e.message : e);
  process.exit(1);
});
