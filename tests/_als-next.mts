// Server Next memasang AsyncLocalStorage ke globalThis sebelum memuat modul
// apa pun; tanpa ini penyimpan konteks Next berupa tiruan yang melempar
// galat saat .run(). Impor berkas ini PALING ATAS di uji yang butuh konteks
// permintaan Next asli.
import { AsyncLocalStorage } from "node:async_hooks";

(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
