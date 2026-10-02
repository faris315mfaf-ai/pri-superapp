// Dua jenis galat outro, sama dengan outro.py.

/** Kegagalan yang pesannya layak dibaca orang (OutroError Python). */
export class OutroError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "OutroError";
  }
}

/** Pekerjaan dihentikan atas permintaan (Dibatalkan Python). */
export class Dibatalkan extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "Dibatalkan";
  }
}
