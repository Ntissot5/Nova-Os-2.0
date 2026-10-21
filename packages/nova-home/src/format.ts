// Mise en forme suisse romande : montants, durées, dates relatives.

// Format suisse, indépendant des données de langue du système : 4’860 CHF, 1’240.50 CHF.
export function chf(n: number) {
  const [int, dec] = Math.abs(n).toFixed(n % 1 ? 2 : 0).split(".");
  return `${n < 0 ? "-" : ""}${int!.replace(/\B(?=(\d{3})+(?!\d))/g, "’")}${dec ? `.${dec}` : ""} CHF`;
}

export function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

const time = (d: Date) => `${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`;

export function relative(iso: string, now: Date) {
  const d = new Date(iso);
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days === 0) return `aujourd'hui, ${time(d)}`;
  if (days === 1) return `hier, ${time(d)}`;
  if (days < 7) return `${d.toLocaleDateString("fr-CH", { weekday: "long" })}, ${time(d)}`;
  return d.toLocaleDateString("fr-CH", { day: "numeric", month: "long" });
}

export function countdown(iso: string, now: Date) {
  const s = Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function greeting(now: Date) {
  const h = now.getHours();
  return h < 5 || h >= 18 ? "Bonsoir" : "Bonjour";
}

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
