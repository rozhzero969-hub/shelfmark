# Shelfmark

Shelfmark makes printable barcode stickers for store items and stockroom inventory. It runs offline in your browser and keeps your current label and print queue in browser storage when available.

## Open Shelfmark

- **Windows or macOS.** Download `Shelfmark.html` from [Releases](../../releases/latest) and open it in a modern browser. Keep the file in the same location to reuse its queue.
- **macOS Dock.** Download and unzip `Shelfmark-macOS.zip`, move `Shelfmark.app` to Applications, and drag it to the Dock. The launcher opens Shelfmark in your default browser. If macOS blocks the locally signed launcher, the standalone HTML file works directly in the browser.

## Make a sticker

1. Enter an optional name, such as **Apple**, and a barcode value, such as **1234**. The scanner reads **1234**. The name appears above the bars.
2. Choose **Code 128** for an internal SKU. Use **EAN-13** or **UPC-A** for an existing assigned retail number. Shelfmark calculates a missing check digit and validates one you supply.
3. Pick a sticker size and the number of copies. Add the label to the queue or print it directly. Download SVG for vector artwork or PNG for a raster image.
4. Choose **Sticker roll**, **A4**, or **US Letter** in the print queue area. For a roll, select the matching custom paper size in your printer settings. The sheet layouts use blank sticker sheets with 8 mm margins and 2 mm gaps.
5. Print at **100% / Actual Size** with browser headers and footers disabled, then test one printed sticker with your store scanner. Your register or inventory software needs the scanned value mapped to the item.

The queue supports editing, removing, and reprinting labels. Changing browsers or moving the file can create a separate queue, depending on the browser.

## Build from source

Run `node scripts/build.mjs` to combine the files under `src` and the bundled barcode library into `Shelfmark.html`. There are no runtime downloads or dependencies to install. On macOS, run `scripts/package-mac.sh /absolute/output/directory` to build the Dock launcher archive.

Shelfmark bundles [JsBarcode 3.12.1](https://github.com/lindell/JsBarcode) under the [MIT license](vendor/JsBarcode.LICENSE.txt).
