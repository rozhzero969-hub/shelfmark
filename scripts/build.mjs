import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");
const [template, css, library, license, app] = await Promise.all([
  read("src/index.html"),
  read("src/style.css"),
  read("vendor/JsBarcode.all.min.js"),
  read("vendor/JsBarcode.LICENSE.txt"),
  read("src/app.js"),
]);
const html = template
  .replace("<!-- STYLES -->", () => `<style>\n${css}</style>`)
  .replace("<!-- VENDOR -->", () => `<!-- JsBarcode 3.12.1\n${license}-->\n<script>\n${library}\n</script>`)
  .replace("<!-- APPLICATION -->", () => `<script>\n${app}</script>`);
await writeFile(new URL("Shelfmark.html", root), html);
