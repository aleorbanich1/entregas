// pdfEtiquetas.js — Genera un PDF de etiquetas/comprobantes de entrega con jsPDF.
//
// Idea: el usuario arma "hojas" A4. En cada hoja elige cuántas entregas entran
// (1, 2, 3 o 4), cuáles, y una escala de tamaño. La A4 se divide en celdas
// iguales según la cantidad:
//   1 → 1 celda (toda la hoja)      3 → 3 bandas horizontales
//   2 → 2 bandas horizontales       4 → 4 cuadrantes (2×2)
//
// Cada celda muestra los datos de la entrega (según `campos`). El texto se
// autoajusta al alto de la celda y `escala` permite agrandarlo/achicarlo.
//
// La descarga funciona en web (blob) y en Android/Capacitor (Filesystem + Share).
import { isNative } from "./nativeNotifications";

// A4 vertical, en milímetros.
const A4 = { w: 210, h: 297 };
const MARGIN = 8; // margen exterior de la hoja
const GUTTER = 6; // separación entre celdas

// Tamaños base (en pt) por cantidad de entregas por hoja, a escala 1.
// Menos entregas ⇒ celda más grande ⇒ letra más grande.
const BASE = {
  1: { cliente: 42, dir: 26, body: 20, label: 13 },
  2: { cliente: 30, dir: 19, body: 15, label: 11 },
  3: { cliente: 24, dir: 15, body: 12.5, label: 10 },
  4: { cliente: 22, dir: 14, body: 12, label: 9.5 },
};

// Escala máxima permitida por layout (1 entrega tolera letra más grande).
export const ESCALA_MAX = { 1: 1.5, 2: 1.35, 3: 1.2, 4: 1.15 };
export const ESCALA_MIN = 0.7;

// Divide la hoja (área útil) en `n` rectángulos {x,y,w,h} en mm.
function celdas(n) {
  const x0 = MARGIN;
  const y0 = MARGIN;
  const areaW = A4.w - MARGIN * 2;
  const areaH = A4.h - MARGIN * 2;

  const filas = n === 4 ? 2 : n; // 1→1, 2→2, 3→3, 4→2 filas
  const cols = n === 4 ? 2 : 1;

  const cellW = (areaW - GUTTER * (cols - 1)) / cols;
  const cellH = (areaH - GUTTER * (filas - 1)) / filas;

  const out = [];
  for (let r = 0; r < filas; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        x: x0 + c * (cellW + GUTTER),
        y: y0 + r * (cellH + GUTTER),
        w: cellW,
        h: cellH,
      });
    }
  }
  return out.slice(0, n);
}

const fmtMonto = (m) =>
  Number(m || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const parseDia = (d) => new Date(`${d}T12:00:00`);
const fmtFecha = (d) => {
  if (!d) return "";
  try {
    return parseDia(d).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return d;
  }
};

const PT_TO_MM = 0.3528; // 1 pt ≈ 0.3528 mm

// Dibuja una entrega dentro de una celda. Recorta lo que no entra.
function dibujarCelda(doc, cell, entrega, campos, sizes) {
  const pad = Math.max(3, cell.w * 0.04);
  const left = cell.x + pad;
  const maxW = cell.w - pad * 2;
  const bottom = cell.y + cell.h - pad;
  let y = cell.y + pad;

  // Marco de la etiqueta.
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.roundedRect(cell.x, cell.y, cell.w, cell.h, 2, 2, "S");

  const lineH = (pt) => pt * PT_TO_MM * 1.15;

  // Escribe texto con wrapping; corta si se pasa del alto. Devuelve true si escribió.
  const write = (text, pt, { bold = false, color = [15, 23, 42], gapBefore = 0 } = {}) => {
    if (!text) return;
    y += gapBefore;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(pt);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(String(text), maxW);
    for (const ln of lines) {
      if (y + lineH(pt) > bottom) return; // no entra: cortar
      y += lineH(pt);
      doc.text(ln, left, y - lineH(pt) * 0.25);
    }
  };

  // Etiqueta chica en gris (ej: "PRODUCTOS").
  const chip = (text, pt) => {
    if (!text) return;
    if (y + lineH(pt) > bottom) return;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(pt);
    doc.setTextColor(120, 120, 120);
    y += lineH(pt);
    doc.text(String(text).toUpperCase(), left, y - lineH(pt) * 0.25);
  };

  // 1) Cliente (siempre) + dirección + teléfono.
  if (campos.contacto !== false) {
    write(entrega.cliente || "Sin nombre", sizes.cliente, { bold: true });
    write(entrega.direccion || "Sin dirección", sizes.dir, { gapBefore: lineH(sizes.dir) * 0.15 });
    if (entrega.telefono) write(`Tel: ${entrega.telefono}`, sizes.body);
  }

  // 2) Productos.
  if (campos.productos && entrega.productos) {
    chip("Productos", sizes.label);
    write(entrega.productos, sizes.body);
  }

  // 3) Monto y pago.
  if (campos.pago) {
    const pagado = !!entrega.pagado;
    const medio = entrega.medio_pago ? ` (${entrega.medio_pago})` : "";
    const texto = pagado ? "PAGADO" : `A COBRAR $${fmtMonto(entrega.monto)}${medio}`;
    write(texto, sizes.body, {
      bold: true,
      color: pagado ? [4, 120, 87] : [180, 83, 9],
      gapBefore: lineH(sizes.body) * 0.25,
    });
  }

  // 4) Fecha / franja / hora / notas.
  if (campos.logistica) {
    const partes = [];
    if (entrega.fecha_entrega) partes.push(fmtFecha(entrega.fecha_entrega));
    if (entrega.franja) partes.push(entrega.franja);
    if (entrega.hora_aprox) partes.push(String(entrega.hora_aprox).slice(0, 5));
    if (partes.length) write(partes.join(" · "), sizes.label, { color: [90, 90, 90], gapBefore: lineH(sizes.body) * 0.2 });
    if (entrega.notas) write(entrega.notas, sizes.label, { color: [90, 90, 90] });
  }
}

/**
 * Genera el documento jsPDF a partir del plan de hojas.
 * @param {Array} hojas - [{ entregas: Entrega[], escala: number }]
 * @param {Object} campos - { contacto, productos, pago, logistica }
 * @returns {jsPDF}
 */
export async function construirPdf(hojas, campos) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const paginas = hojas.filter((h) => h.entregas && h.entregas.length > 0);
  paginas.forEach((hoja, idx) => {
    if (idx > 0) doc.addPage();
    const n = Math.min(4, Math.max(1, hoja.entregas.length));
    const rects = celdas(n);
    const base = BASE[n];
    const escala = hoja.escala || 1;
    const sizes = {
      cliente: base.cliente * escala,
      dir: base.dir * escala,
      body: base.body * escala,
      label: base.label * escala,
    };
    hoja.entregas.slice(0, 4).forEach((e, i) => {
      dibujarCelda(doc, rects[i], e, campos, sizes);
    });
  });

  return doc;
}

// Nombre de archivo con la fecha del día.
function nombreArchivo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `etiquetas-${ymd}.pdf`;
}

// Descarga en web: ancla con blob URL.
function descargarWeb(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

// Guarda en Android (Filesystem cache) y abre la hoja de compartir/abrir.
async function compartirNativo(blob, filename) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const base64 = await blobToBase64(blob);
  const res = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({
    title: "Etiquetas de entrega",
    url: res.uri,
    dialogTitle: "Compartir o guardar PDF",
  });
}

/**
 * Genera y entrega el PDF (descarga en web, compartir en Android).
 */
export async function generarYDescargar(hojas, campos) {
  const doc = await construirPdf(hojas, campos);
  const blob = doc.output("blob");
  const filename = nombreArchivo();
  if (isNative()) {
    try {
      await compartirNativo(blob, filename);
      return;
    } catch (e) {
      // Si falla el share nativo, intentamos la descarga web como respaldo.
      console.warn("[pdf] share nativo falló, uso descarga web", e);
    }
  }
  descargarWeb(blob, filename);
}
