import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, X } from 'lucide-react';
import { notificationStatus, requestNotifications } from '../utils/reminders';

// Aviso que aparece al iniciar sesión para aceptar / verificar las notificaciones.
// Funciona en web y en el APK. Se muestra una vez por sesión de login.
const SEEN_KEY = 'mg_notif_gate_seen';

export function NotificationGate({ userId }) {
  const [status, setStatus] = useState(null);   // granted|denied|default|prompt|unsupported
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY)) { setDismissed(true); return; }
    let alive = true;
    notificationStatus().then((s) => {
      if (!alive) return;
      setStatus(s);
      // Si ya están activas, mostramos una confirmación breve y cerramos.
      if (s === 'granted') {
        sessionStorage.setItem(SEEN_KEY, '1');
        setTimeout(() => alive && setDismissed(true), 2500);
      }
    });
    return () => { alive = false; };
  }, []);

  const close = () => { sessionStorage.setItem(SEEN_KEY, '1'); setDismissed(true); };

  const enable = async () => {
    setBusy(true);
    try {
      const s = await requestNotifications(userId);
      setStatus(s);
      if (s === 'granted') { sessionStorage.setItem(SEEN_KEY, '1'); setTimeout(() => setDismissed(true), 1500); }
    } finally {
      setBusy(false);
    }
  };

  if (dismissed || status == null || status === 'unsupported') return null;

  const granted = status === 'granted';
  const denied = status === 'denied';

  return (
    <div
      className={
        'flex items-start gap-3 p-4 mb-4 rounded-xl border ' +
        (granted
          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50'
          : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300 border-amber-200 dark:border-amber-900/50')
      }
    >
      {granted ? <CheckCircle2 size={20} className="shrink-0 mt-0.5" /> : (denied ? <BellOff size={20} className="shrink-0 mt-0.5" /> : <Bell size={20} className="shrink-0 mt-0.5" />)}
      <div className="flex-1 min-w-0">
        {granted ? (
          <p className="text-sm font-semibold">✅ Notificaciones activas</p>
        ) : denied ? (
          <>
            <p className="text-sm font-semibold">Notificaciones bloqueadas</p>
            <p className="text-sm">Activálas desde los ajustes del navegador/teléfono para recibir los avisos de tus entregas.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">Activá las notificaciones</p>
            <p className="text-sm">Así te llegan los avisos de reparto y cambios de estado, aunque tengas la app cerrada.</p>
            <button
              onClick={enable}
              disabled={busy}
              className="mt-2 px-3 py-1.5 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60"
            >
              {busy ? 'Activando…' : 'Activar notificaciones'}
            </button>
          </>
        )}
      </div>
      <button onClick={close} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Cerrar"><X size={18} /></button>
    </div>
  );
}

export default NotificationGate;
