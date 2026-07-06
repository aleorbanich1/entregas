// Formato es-AR / $ AR, reutilizable. Zona de operación −03; al parsear
// 'YYYY-MM-DD' lo hacemos al mediodía para no correr el día.

export const parseDia = (d) => new Date(`${d}T12:00:00`);

/** Monto en pesos argentinos: $ 12.345,50 */
export function fmtARS(n) {
  const v = Number(n || 0);
  return v.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Fecha 'YYYY-MM-DD' → "lun. 5 de julio" (es-AR). */
export function fmtFecha(d, opts = { weekday: "short", day: "numeric", month: "long" }) {
  if (!d) return "";
  try {
    return parseDia(d).toLocaleDateString("es-AR", opts);
  } catch {
    return d;
  }
}

/** Timestamp ISO → "5/7/2026 14:30" (es-AR). */
export function fmtFechaHora(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return `${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
