"use strict";

const byId = (id) => document.getElementById(id);
const inputs = Object.fromEntries(
  ["name", "code", "format", "size", "width", "height", "copies", "paper", "export-format"]
    .map((id) => [id, byId(id)])
);
const formats = {
  CODE128: { name: "Code 128", hint: "Use letters, numbers, or symbols for internal SKUs." },
  EAN13: { name: "EAN-13", digits: 13, hint: "Enter an assigned GTIN. You can leave off the last digit to calculate it." },
  UPC: { name: "UPC-A", digits: 12, hint: "Enter an assigned UPC. You can leave off the last digit to calculate it." },
};
const sizes = { "60x35": [60, 35], "50x30": [50, 30], "40x25": [40, 25], "75x50": [75, 50] };
const papers = { a4: [210, 297], letter: [215.9, 279.4] };
const svgNS = "http://www.w3.org/2000/svg";
const storageKey = "shelfmark-v1";
const maxQueueCopies = 500;
const pageMargin = 8;
const gap = 2;
let queue = [];
let editingId = null;
let current = null;
let toastTimer;

function persist() {
  try {
    const draft = Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, input.value]));
    localStorage.setItem(storageKey, JSON.stringify({ draft, queue }));
  } catch {
    document.querySelector("footer span:last-child").textContent = "Browser storage is unavailable. Keep this window open to keep your queue.";
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    for (const [id, value] of Object.entries(saved.draft || {})) {
      if (Object.hasOwn(inputs, id) && typeof value === "string") inputs[id].value = value;
    }
    if (Array.isArray(saved.queue)) {
      queue = saved.queue.filter((item) => {
        try {
          makeSticker(item);
          return typeof item.id === "string" && validCopies(item.copies);
        } catch {
          return false;
        }
      });
    }
  } catch {
    // A missing or unreadable draft leaves the example in the editor.
  }
}

function svgElement(tag, attrs) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function svgText(value, x, y, fontSize, options = {}) {
  const { bold = false, mono = false, maxWidth } = options;
  const node = svgElement("text", {
    x, y, "text-anchor": "middle", "font-size": fontSize,
    "font-family": mono ? "monospace" : "Arial, sans-serif",
    "font-weight": bold ? "700" : "400",
    fill: "#000",
  });
  node.textContent = value;
  if (maxWidth && [...value].length * fontSize * (mono ? 0.64 : 0.83) > maxWidth) {
    node.setAttribute("textLength", maxWidth);
    node.setAttribute("lengthAdjust", "spacingAndGlyphs");
  }
  return node;
}

function checkDigit(data) {
  const sum = [...data].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

function makeSticker(item) {
  const { name, format, width, height } = item;
  let { code } = item;
  const spec = Object.hasOwn(formats, format) && formats[format];
  if (!spec || typeof name !== "string" || typeof code !== "string") throw Error("Enter valid label details.");
  if (!validSize(width, height)) throw Error("Use a width of 30–105 mm and a height of 20–100 mm.");
  if (!code) throw Error("Enter a barcode value.");
  if (spec.digits) {
    if (!/^\d+$/.test(code) || ![spec.digits - 1, spec.digits].includes(code.length)) {
      throw Error(`Enter ${spec.digits - 1} or ${spec.digits} digits for ${spec.name}.`);
    }
    const body = code.slice(0, spec.digits - 1);
    const complete = body + checkDigit(body);
    if (code.length === spec.digits && code !== complete) {
      throw Error(`The check digit should be ${complete.at(-1)}. Correct it or leave it off.`);
    }
    code = complete;
  } else if (!/^[ -~]{1,64}$/.test(code)) {
    throw Error("Code 128 accepts up to 64 printable English letters, digits, spaces, and symbols.");
  }

  const data = {};
  JsBarcode(data, code, { format, flat: true, displayValue: false });
  const pattern = data.encodings.map((encoding) => encoding.data).join("");
  const retail = Boolean(spec.digits);
  const quietLeft = format === "EAN13" ? 11 : 10;
  const quietRight = format === "EAN13" ? 7 : 10;
  const modules = pattern.length + quietLeft + quietRight;
  const moduleWidth = Math.min(retail ? 0.33 : 0.55, (width - 4) / modules);
  if (moduleWidth < (retail ? 0.264 : 0.25)) {
    throw Error("Choose a wider sticker so the barcode bars are wide enough to scan.");
  }

  const fromTop = name ? 8 : 3;
  const barHeight = Math.min(retail ? 22.85 : 28, height - fromTop - (retail ? 4.5 : 6));
  if (retail && barHeight < 18.28) {
    throw Error("Choose a taller sticker for this retail barcode.");
  }

  const svg = svgElement("svg", {
    width: `${width}mm`, height: `${height}mm`, viewBox: `0 0 ${width} ${height}`,
    role: "img", "aria-label": `${spec.name} label for ${name ? name + ", " : ""}${code}`,
  });
  svg.append(svgElement("rect", { width, height, fill: "#fff" }));
  if (name) svg.append(svgText(name, width / 2, 5.7, 3.6, { bold: true, maxWidth: width - 5 }));

  const y = fromTop + (height - fromTop - (retail ? 4.5 : 6) - barHeight) / 2;
  const left = (width - modules * moduleWidth) / 2 + quietLeft * moduleWidth;
  const bars = svgElement("g", { fill: "#000", "shape-rendering": "crispEdges" });
  for (const match of pattern.matchAll(/1+/g)) {
    const start = match.index;
    const guard = retail && (start < 3 || (start >= 45 && start < 50) || start >= 92);
    bars.append(svgElement("rect", {
      x: left + start * moduleWidth, y,
      width: match[0].length * moduleWidth, height: barHeight + (guard ? 5 * moduleWidth : 0),
    }));
  }
  svg.append(bars);

  const centerAt = (position) => left + position * moduleWidth;
  if (retail) {
    const baseline = y + barHeight + 3.1;
    const fontSize = Math.min(3.2, moduleWidth * 9.7);
    const groups = format === "EAN13"
      ? [[code[0], -4], [code.slice(1, 7), 24], [code.slice(7), 71]]
      : [[code[0], -4], [code.slice(1, 6), 27.5], [code.slice(6, 11), 67.5], [code.at(-1), 99]];
    for (const [value, position] of groups) svg.append(svgText(value, centerAt(position), baseline, fontSize, { mono: true }));
  } else {
    svg.append(svgText(code, width / 2, y + barHeight + 4, 3, { mono: true, maxWidth: width - 5 }));
  }
  return { svg, code };
}

function validSize(width, height) {
  return Number.isFinite(width) && width >= 30 && width <= 105
    && Number.isFinite(height) && height >= 20 && height <= 100;
}

function validCopies(copies) {
  return Number.isInteger(copies) && copies >= 1 && copies <= 200;
}

function readDraft() {
  const size = inputs.size.value;
  const [width, height] = sizes[size] || [Number(inputs.width.value), Number(inputs.height.value)];
  return {
    name: inputs.name.value.trim(),
    code: inputs.code.value,
    format: inputs.format.value,
    width, height, size,
    copies: Number(inputs.copies.value),
  };
}

function feedback(message) {
  clearTimeout(toastTimer);
  byId("toast").textContent = message;
  toastTimer = setTimeout(() => { byId("toast").textContent = ""; }, 4000);
}

function renderEditor() {
  const item = readDraft();
  const spec = formats[item.format] || formats.CODE128;
  byId("format-help").textContent = spec.hint;
  inputs.code.inputMode = spec.digits ? "numeric" : "text";
  byId("custom").hidden = item.size !== "custom";
  byId("preview-format").textContent = spec.name;
  byId("reset").textContent = editingId ? "Cancel edit" : "Clear";
  byId("save").textContent = editingId ? "Update queued label" : "＋ Add to print queue";
  byId("measure-text").textContent = `${item.width} mm`;
  byId("dimensions").textContent = `${item.width} × ${item.height} mm`;

  current = null;
  let error = "";
  const preview = byId("sticker");
  preview.replaceChildren();
  try {
    const sticker = makeSticker(item);
    current = { ...item, ...sticker };
    const scale = Math.min(4.4, 192 / item.height, 340 / item.width);
    const previewSvg = sticker.svg.cloneNode(true);
    previewSvg.setAttribute("width", item.width * scale);
    previewSvg.setAttribute("height", item.height * scale);
    previewSvg.style.height = "auto";
    preview.append(previewSvg);
  } catch (problem) {
    if (item.code || !validSize(item.width, item.height)) error = problem.message;
  }
  if (!validCopies(item.copies)) error ||= "Choose between 1 and 200 copies.";
  byId("error").textContent = error;
  byId("error").hidden = !error;
  byId("preview-empty").hidden = Boolean(current);
  byId("measure").hidden = !current;
  byId("dimensions").hidden = !current;
  byId("download").disabled = !current;
  byId("print").disabled = !current || !validCopies(item.copies);
  byId("save").disabled = !current || !validCopies(item.copies);
  byId("sizing-text").textContent = current && current.code !== item.code
    ? `Check digit added. This label scans as ${current.code}.`
    : "Print at 100% or Actual Size for accurate dimensions.";
}

function clearEditor() {
  editingId = null;
  inputs.name.value = "";
  inputs.code.value = "";
  inputs.copies.value = "1";
  renderEditor();
  persist();
  inputs.name.focus();
}

function editItem(item) {
  editingId = item.id;
  for (const id of ["name", "code", "format", "size", "width", "height", "copies"]) {
    inputs[id].value = item[id];
  }
  renderEditor();
  persist();
  inputs.name.focus();
  byId("edit-title").scrollIntoView({ block: "nearest" });
}

function totalCopies(items = queue) {
  return items.reduce((total, item) => total + item.copies, 0);
}

function renderQueue() {
  const list = byId("queue-items");
  list.replaceChildren();
  byId("count").textContent = totalCopies();
  byId("count").setAttribute("aria-label", `${totalCopies()} total copies`);
  byId("print-queue").disabled = queue.length === 0;
  const mixed = queue.some((item) => item.width !== queue[0].width || item.height !== queue[0].height);
  byId("print-help").textContent = inputs.paper.value === "roll"
    ? mixed
      ? "A roll print job needs one sticker size. Choose a sheet layout to print mixed sizes together."
      : "One sticker per page. Set the matching paper size in your printer settings."
    : "Sheet layout uses 8 mm margins and 2 mm gaps. Use blank sticker sheets and print at 100%.";
  if (!queue.length) {
    const empty = document.createElement("p");
    empty.className = "queue-empty";
    empty.textContent = "Your queue is empty. Add a label when it’s ready to print.";
    list.append(empty);
  }
  for (const item of queue) {
    const row = document.createElement("div");
    row.className = "queue-row";
    const title = document.createElement("div");
    const name = document.createElement("strong");
    const code = document.createElement("code");
    name.textContent = item.name || "Unnamed item";
    code.textContent = item.code;
    title.append(name, code);
    const meta = document.createElement("small");
    meta.className = "row-meta";
    meta.textContent = `${formats[item.format].name} · ${item.width} × ${item.height} mm`;
    const quantity = document.createElement("small");
    quantity.textContent = `${item.copies} ${item.copies === 1 ? "copy" : "copies"}`;
    const buttons = document.createElement("div");
    buttons.className = "row-buttons";
    const edit = document.createElement("button");
    const remove = document.createElement("button");
    for (const button of [edit, remove]) {
      button.type = "button";
      button.className = "text-button";
    }
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${item.name || item.code}`);
    edit.addEventListener("click", () => editItem(item));
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${item.name || item.code}`);
    remove.addEventListener("click", () => {
      queue = queue.filter(({ id }) => id !== item.id);
      if (editingId === item.id) clearEditor();
      renderQueue();
      persist();
      feedback("Label removed.");
    });
    buttons.append(edit, remove);
    row.append(title, meta, quantity, buttons);
    list.append(row);
  }
}

function saveLabel(event) {
  event.preventDefault();
  if (!current || !validCopies(current.copies)) return;
  const previous = queue.find(({ id }) => id === editingId);
  if (totalCopies() - (previous?.copies || 0) + current.copies > maxQueueCopies) {
    feedback(`The print queue can hold up to ${maxQueueCopies} copies.`);
    return;
  }
  const { svg, ...item } = current;
  item.id = editingId || Array.from(crypto.getRandomValues(new Uint32Array(3)), (part) => part.toString(36)).join("-");
  queue = previous ? queue.map((entry) => entry === previous ? item : entry) : [...queue, item];
  editingId = null;
  renderEditor();
  renderQueue();
  persist();
  feedback(previous ? "Queued label updated." : "Label added to print queue.");
}

function saveBlob(blob, filename) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function downloadSticker() {
  if (!current) return;
  const { svg, name, code, width, height } = current;
  const file = (name || code).replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "sticker";
  const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
  if (inputs["export-format"].value === "svg") {
    saveBlob(svgBlob, `${file}.svg`);
    return;
  }
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width / 25.4 * 300);
    canvas.height = Math.round(height / 25.4 * 300);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob ? saveBlob(blob, `${file}.png`) : feedback("Could not save the PNG. Try SVG."));
  } catch {
    feedback("Could not save the PNG. Try SVG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function printLabels(items) {
  const paper = inputs.paper.value;
  const [width, height] = papers[paper] || [items[0].width, items[0].height];
  if (paper === "roll" && items.some((item) => item.width !== width || item.height !== height)) {
    feedback("Choose A4 or US Letter to print mixed sticker sizes together.");
    return;
  }
  const fragment = document.createDocumentFragment();
  const makePage = () => {
    const page = document.createElement("div");
    page.className = "print-page";
    fragment.append(page);
    return page;
  };

  if (paper === "roll") {
    for (const item of items) {
      const { svg } = makeSticker(item);
      for (let copy = 0; copy < item.copies; copy++) makePage().append(svg.cloneNode(true));
    }
  } else {
    const availableWidth = width - 2 * pageMargin;
    const availableHeight = height - 2 * pageMargin;
    let page = makePage();
    let row = null;
    let rowWidth = 0;
    let rowHeight = 0;
    let usedHeight = 0;
    for (const item of items) {
      const { svg } = makeSticker(item);
      for (let copy = 0; copy < item.copies; copy++) {
        if (row && rowWidth + gap + item.width > availableWidth) {
          usedHeight += rowHeight + gap;
          row = null;
        }
        if (usedHeight + Math.max(row ? rowHeight : 0, item.height) > availableHeight) {
          page = makePage();
          usedHeight = 0;
          row = null;
        }
        if (!row) {
          row = document.createElement("div");
          row.className = "print-row";
          page.append(row);
          rowWidth = 0;
          rowHeight = 0;
        }
        row.append(svg.cloneNode(true));
        rowWidth += (rowWidth ? gap : 0) + item.width;
        rowHeight = Math.max(rowHeight, item.height);
      }
    }
  }

  const pageSize = paper === "a4" ? "A4" : paper === "letter" ? "letter" : `${width}mm ${height}mm`;
  const pagePadding = paper === "roll" ? 0 : pageMargin;
  byId("print-geometry").textContent = `@page { size: ${pageSize}; margin: 0; }
    @media print { .print-page { padding: ${pagePadding}mm; gap: ${gap}mm; } }`;
  byId("print-area").replaceChildren(fragment);
  window.print();
}

byId("editor").addEventListener("submit", saveLabel);
byId("editor").addEventListener("input", () => { renderEditor(); persist(); });
byId("reset").addEventListener("click", clearEditor);
byId("download").addEventListener("click", downloadSticker);
byId("print").addEventListener("click", () => {
  if (current && validCopies(current.copies)) printLabels([current]);
});
byId("print-queue").addEventListener("click", () => { if (queue.length) printLabels(queue); });
inputs.paper.addEventListener("change", () => { renderQueue(); persist(); });
inputs["export-format"].addEventListener("change", persist);
restore();
renderEditor();
renderQueue();
