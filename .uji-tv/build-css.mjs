import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFileSync, writeFileSync } from "fs";
let css = readFileSync("src/app/globals.css", "utf8");
css = css.replace(
  '@import "tailwindcss";',
  '@import "tailwindcss";\n@source "/home/z/my-project/src";\n@source "/home/z/my-project/.uji-tv";',
);
const hasil = await postcss([tailwind()]).process(css, { from: "src/app/globals.css" });
writeFileSync("/tmp/tv-test/public/style.css", hasil.css);
console.log("CSS OK:", hasil.css.length, "karakter");
