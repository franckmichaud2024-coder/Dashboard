import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

const STORAGE_KEY = "dashboard_coupe_v18_pc_stable";
const KPI_VISIBILITY_KEY = "dashboard_kpi_visibility_v1";
const KPI_ORDER_KEY = "dashboard_kpi_order_v1";
const HISTORY_KEY = "dashboard_historique_production_v1";
const HISTORY_IMAGE_KEY = "dashboard_historique_images_v1";
const DASHBOARD_STATE_TABLE = "dashboard_state";
const DASHBOARD_IMAGES_BUCKET = "dashboard-images";

const UI_FONT = "Inter, Segoe UI, Roboto, Arial, sans-serif";

const HISTORY_PASSWORD = "1Mixture2*";

function validateHistoryAccess() {
  const entered = window.prompt("Mot de passe requis pour accéder aux historiques :");

  if (entered === HISTORY_PASSWORD) {
    return true;
  }

  if (entered !== null) {
    window.alert("Mot de passe invalide");
  }

  return false;
}


function cleanSupabaseUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  // Supabase doit recevoir SEULEMENT l'URL de base :
  // https://xxxxx.supabase.co
  // On enlève les chemins ajoutés par erreur comme /rest/v1 ou /auth/v1.
  const withoutPath = raw
    .replace(/\/rest\/v1.*$/i, "")
    .replace(/\/auth\/v1.*$/i, "")
    .replace(/\/+$/g, "");

  return withoutPath;
}

const SUPABASE_URL = cleanSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: true,
        },
      })
    : null;


function clearSupabaseAuthStorage() {
  try {
    Object.keys(localStorage).forEach((key) => {
      const k = key.toLowerCase();
      if (key.startsWith("sb-") || k.includes("supabase.auth") || k.includes("supabase")) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // no-op
  }
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase non configuré. Vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.");
} else {
  console.log("Supabase URL utilisée :", SUPABASE_URL);
}

function mapHistoryRow(row) {
  return {
    id: row.id,
    date: row.date,
    shift: row.shift,
    production: Number(row.production || 0),
    efficacite: Number(row.efficacite || 0),
    referenceBloc: row.reference_bloc || "Saisie manuelle",
    commentaire: row.commentaire || "",
    photos: Array.isArray(row.photos) ? row.photos : [],
    savedAt: row.saved_at,
  };
}

const DEFAULT_VISIBLE_KPIS = {
  productionActuelle: true,
  objectifTotal: true,
  projectionFinQuart: true,
  statutUsine: true,
  alerteDerive: true,
  theoriqueDepuisDebut: true,
  efficaciteDepuisDebut: true,
  efficaciteTheoriqueReel: true,
  efficaciteQuartComplet: true,
  heureFinEstimee: true,
  heureReelleSelonRestant: true,
  efficaciteGlobale: true,
  restantProduire: true,
};

const KPI_OPTIONS = [
  ["alerteDerive", "Alerte dérive production"],
  ["efficaciteDepuisDebut", "Efficacité depuis début du quart"],
  ["efficaciteTheoriqueReel", "Efficacité théorique / réel"],
  ["efficaciteQuartComplet", "Efficacité quart complet / 100 %"],
  ["efficaciteGlobale", "Efficacité globale pondérée"],
  ["heureFinEstimee", "Heure fin estimée"],
  ["heureReelleSelonRestant", "Heure réelle selon restant"],
  ["objectifTotal", "Objectif total théorique"],
  ["productionActuelle", "Production actuelle"],
  ["projectionFinQuart", "Projection fin de quart"],
  ["restantProduire", "Restant à produire"],
  ["statutUsine", "Statut usine"],
  ["theoriqueDepuisDebut", "Théorique depuis début du quart"],
].sort((a, b) => a[1].localeCompare(b[1], "fr"));

const PRESETS = {
  jour: {
    objectifReel: 4369,
    productionReelle: 3300,
    periodes: [
      { id: 1, type: "Production", start: "06:30", end: "09:00", cadence: 585 },
      { id: 2, type: "Pause", start: "09:00", end: "09:17", cadence: 0 },
      { id: 3, type: "Production", start: "09:17", end: "11:45", cadence: 585 },
      { id: 4, type: "Diner", start: "11:45", end: "12:30", cadence: 0 },
      { id: 5, type: "Fin de quart", start: "12:30", end: "15:00", cadence: 585 },
    ],
    blocs: [
      { id: 1, label: "1er bloc", ciblePct: 92, coupeReelle: 843 },
      { id: 2, label: "2e bloc", ciblePct: 92, coupeReelle: 1749 },
      { id: 3, label: "3e bloc", ciblePct: 92, coupeReelle: 2900 },
      { id: 4, label: "4e bloc (Moyenne / Prévision)", ciblePct: 92, coupeReelle: 0, isPrediction: true },
    ],
  },
  soir: {
    objectifReel: 3000,
    productionReelle: 2000,
    periodes: [
      { id: 1, type: "Production", start: "15:15", end: "17:15", cadence: 585 },
      { id: 2, type: "Pause", start: "17:15", end: "17:32", cadence: 0 },
      { id: 3, type: "Production", start: "17:32", end: "19:30", cadence: 500 },
      { id: 4, type: "Diner", start: "19:30", end: "20:15", cadence: 0 },
      { id: 5, type: "Production", start: "20:15", end: "22:15", cadence: 500 },
      { id: 6, type: "Pause", start: "22:15", end: "22:32", cadence: 0 },
      { id: 7, type: "Production (Fin de quart)", start: "22:32", end: "23:57", cadence: 500 },
    ],
    blocs: [
      { id: 1, label: "1er bloc", ciblePct: 92, coupeReelle: 1051 },
      { id: 2, label: "2e bloc", ciblePct: 92, coupeReelle: 2000 },
      { id: 3, label: "3e bloc", ciblePct: 92, coupeReelle: 3000 },
      { id: 4, label: "4e bloc", ciblePct: 92, coupeReelle: 0 },
      { id: 5, label: "5e bloc (Moyenne / Prévision)", ciblePct: 92, coupeReelle: 0, isPrediction: true },
    ],
  },
};

function clonePreset(data) {
  return JSON.parse(JSON.stringify(data));
}

function makeEmptyDashboardData() {
  const data = {
    jour: clonePreset(PRESETS.jour),
    soir: clonePreset(PRESETS.soir),
  };

  for (const shiftKey of ["jour", "soir"]) {
    data[shiftKey].objectifReel = 0;
    data[shiftKey].productionReelle = 0;

    data[shiftKey].blocs = data[shiftKey].blocs.map((bloc) => ({
      ...bloc,
      coupeReelle: 0,
    }));
  }

  return data;
}

function makeEmptyDashboardState() {
  return {
    shift: "soir",
    data: makeEmptyDashboardData(),
  };
}

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return makeEmptyDashboardState();
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      (parsed.shift !== "jour" && parsed.shift !== "soir") ||
      !parsed.data?.jour ||
      !parsed.data?.soir
    ) {
      throw new Error("bad storage");
    }

    return parsed;
  } catch {
    return makeEmptyDashboardState();
  }
}

function safeLoadKpiVisibility() {
  try {
    const raw = localStorage.getItem(KPI_VISIBILITY_KEY);
    if (!raw) return DEFAULT_VISIBLE_KPIS;

    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_VISIBLE_KPIS,
      ...parsed,
    };
  } catch {
    return DEFAULT_VISIBLE_KPIS;
  }
}


function safeLoadKpiOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(KPI_ORDER_KEY) || "[]");
    const validKeys = KPI_OPTIONS.map(([key]) => key);
    const cleaned = saved.filter((key) => validKeys.includes(key));
    const missing = validKeys.filter((key) => !cleaned.includes(key));
    return [...cleaned, ...missing];
  } catch {
    return KPI_OPTIONS.map(([key]) => key);
  }
}


function safeLoadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


function dateKey(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function sortByDateAsc(a, b) {
  return dateKey(a.date).localeCompare(dateKey(b.date));
}

function performanceColor(value) {
  const n = Number(value) || 0;
  if (n >= 95) return "#9df548";
  if (n >= 85) return "#ffd84d";
  return "#ff4f67";
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function safeStorageFileName(name) {
  return String(name || "photo.jpg")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(-90) || "photo.jpg";
}



function useResponsive() {
  const getWidth = () => (typeof window !== "undefined" ? window.innerWidth : 1400);
  const [width, setWidth] = useState(getWidth());

  useEffect(() => {
    const onResize = () => setWidth(getWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width <= 820,
    isTablet: width > 820 && width <= 1180,
  };
}

function toMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function diffMinutes(start, end) {
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

function fmtTime(hhmm) {
  return hhmm && hhmm.includes(":") ? hhmm : "--:--";
}

function round(n) {
  return Math.round(Number(n) || 0);
}

function formatPercent(val, decimals = 1) {
  const num = Number(String(val).replace(",", "."));
  if (!Number.isFinite(num)) return "0.0";
  return num.toFixed(decimals);
}

function currentClock() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h} h ${m} min ${s} s`;
}


function clockFromDate(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h} h ${m} min ${s} s`;
}

function dateToHHMM(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function makeDateFromHHMM(hhmm) {
  const d = new Date();
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}


function normalizeIntegerInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits === "") return 0;
  return parseInt(digits, 10);
}

function weightedEfficiency(rows) {
  const actualRows = rows.filter((r) => !r.isPrediction && r.hasRealInput);

  const totalReal = actualRows.reduce((s, r) => s + Number(r.reelBloc || 0), 0);
  const total100 = actualRows.reduce((s, r) => s + Number(r.coupe100 || 0), 0);

  if (total100 <= 0) return 0;

  return (totalReal / total100) * 100;
}

function totalWorkMinutes(periodes) {
  return periodes
    .filter((p) => Number(p.cadence) > 0)
    .reduce((s, p) => s + diffMinutes(p.start, p.end), 0);
}

function validatePeriodes(periodes) {
  const issues = [];

  const rows = periodes
    .map((p) => ({
      ...p,
      s: toMinutes(p.start),
      e: toMinutes(p.end),
    }))
    .sort((a, b) => a.s - b.s);

  for (const row of rows) {
    if (row.e <= row.s) {
      issues.push(`${row.type} ${row.start} → ${row.end} invalide`);
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];

      if (a.e <= a.s || b.e <= b.s) continue;

      if (a.s < b.e && b.s < a.e) {
        issues.push(`Chevauchement ${a.start}-${a.end} et ${b.start}-${b.end}`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function isProductive(p) {
  return Number(p.cadence) > 0;
}

function buildProductionBlocSources(periodes) {
  const sources = [];
  let group = [];

  const closeGroup = (forcedEnd = null) => {
    if (!group.length) return;

    const start = group[0].start;
    const end = forcedEnd || group[group.length - 1].end;
    const minutesTravaillees = diffMinutes(start, end);

    const weightedCadenceTotal = group.reduce((sum, p) => {
      const minutes = diffMinutes(p.start, p.end);
      return sum + minutes * Number(p.cadence || 0);
    }, 0);

    const weightedMinutes = group.reduce((sum, p) => sum + diffMinutes(p.start, p.end), 0);
    const cadence = weightedMinutes > 0 ? round(weightedCadenceTotal / weightedMinutes) : 0;
    const coupe100 = round((minutesTravaillees / 60) * cadence);

    sources.push({
      start,
      end,
      minutesTravaillees,
      cadence,
      coupe100,
    });

    group = [];
  };

  periodes.forEach((p) => {
    if (isProductive(p)) {
      group.push(p);
      return;
    }

    // Pause / Dîner / Souper / Fin de quart : coupe le bloc au début de l'arrêt.
    // Exemple : production 06:30-08:00 + 08:00-08:30, pause à 09:15
    // => bloc 06:30-09:15 avec cadence moyenne des lignes de production du bloc.
    closeGroup(p.start);
  });

  closeGroup();
  return sources;
}

function theoreticalUntilNow(periodes, nowMinutes) {
  return periodes.reduce((sum, p) => {
    const cadence = Number(p.cadence || 0);
    if (cadence <= 0) return sum;

    const start = toMinutes(p.start);
    const end = toMinutes(p.end);

    if (nowMinutes <= start) return sum;

    const workedUntil = Math.min(nowMinutes, end);
    const minutesWorked = Math.max(0, workedUntil - start);

    return sum + (minutesWorked / 60) * cadence;
  }, 0);
}

function minutesToHHMM(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return "--:--";
  const normalized = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function estimateFinishTime(periodes, nowMinutes, restant, efficacitePonderee) {
  let remaining = Math.max(0, Number(restant || 0));
  const eff = Math.max(0, Number(efficacitePonderee || 0)) / 100;

  if (remaining <= 0) return minutesToHHMM(nowMinutes);
  if (eff <= 0) return "--:--";

  const productive = periodes
    .filter((p) => Number(p.cadence || 0) > 0)
    .map((p) => ({
      start: toMinutes(p.start),
      end: toMinutes(p.end),
      cadenceReelle: Number(p.cadence || 0) * eff,
    }))
    .filter((p) => p.end > p.start && p.cadenceReelle > 0);

  for (const p of productive) {
    if (nowMinutes >= p.end) continue;

    const usableStart = Math.max(nowMinutes, p.start);
    const availableMinutes = Math.max(0, p.end - usableStart);
    const possible = (availableMinutes / 60) * p.cadenceReelle;

    if (remaining <= possible) {
      const minutesNeeded = (remaining / p.cadenceReelle) * 60;
      return minutesToHHMM(usableStart + minutesNeeded);
    }

    remaining -= possible;
  }

  const lastProductive = productive[productive.length - 1];
  if (!lastProductive) return "--:--";

  const minutesAfterQuart = (remaining / lastProductive.cadenceReelle) * 60;
  return minutesToHHMM(lastProductive.end + minutesAfterQuart);
}

function estimateRealFinishTimeByRemaining(periodes, nowMinutes, restant) {
  const remaining = Math.max(0, Number(restant || 0));

  if (remaining <= 0) return minutesToHHMM(nowMinutes);

  const productive = periodes
    .filter((p) => Number(p.cadence || 0) > 0)
    .map((p) => ({ cadence: Number(p.cadence || 0) }))
    .filter((p) => p.cadence > 0);

  const lastProductive = productive[productive.length - 1];
  if (!lastProductive) return "--:--";

  const cochonsParMinute = lastProductive.cadence / 60;
  if (cochonsParMinute <= 0) return "--:--";

  const minutesNeeded = remaining / cochonsParMinute;
  return minutesToHHMM(nowMinutes + minutesNeeded);
}

const shellStyle = {
  maxWidth: 1600,
  minWidth: 1240,
  margin: "0 auto",
  borderRadius: 22,
  border: "1px solid rgba(74,190,255,0.22)",
  background:
    "linear-gradient(180deg, rgba(5,18,34,0.88) 0%, rgba(2,8,18,0.96) 100%)",
  boxShadow:
    "0 0 0 1px rgba(255,255,255,0.035) inset, 0 0 55px rgba(0,210,255,0.10), 0 24px 70px rgba(0,0,0,0.58)",
  overflow: "hidden",
  backdropFilter: "blur(14px)",
};

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(6,22,42,0.82) 0%, rgba(3,10,22,0.92) 100%)",
  border: "1px solid rgba(74,190,255,0.22)",
  borderRadius: 18,
  boxShadow:
    "0 0 0 1px rgba(255,255,255,0.025) inset, 0 0 28px rgba(42,190,255,0.08), 0 16px 38px rgba(0,0,0,0.26)",
  backdropFilter: "blur(10px)",
};

const textTitle = {
  fontFamily: UI_FONT,
  fontWeight: 900,
  letterSpacing: "0.035em",
  textTransform: "uppercase",
  color: "#f3fbff",
};

const textSection = {
  fontFamily: UI_FONT,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#ffd84d",
};

const textLabel = {
  fontFamily: UI_FONT,
  fontSize: 12,
  fontWeight: 800,
  color: "#d8f4ff",
};

const textMuted = {
  fontFamily: UI_FONT,
  fontSize: 11,
  fontWeight: 700,
  color: "#7f99ad",
};


function normalInputStyle(isMobile) {
  return {
    width: "100%",
    height: isMobile ? 36 : 40,
    borderRadius: 10,
    border: "1px solid rgba(120,190,255,0.12)",
    background: "rgba(9,19,34,0.82)",
    color: "#eefaff",
    fontSize: isMobile ? 12 : 13,
    fontWeight: 800,
    padding: isMobile ? "0 10px" : "0 12px",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: UI_FONT,
  };
}

function yellowInputStyle(isMobile = false, fullWidth = false, compact = false) {
  return {
    width: fullWidth ? "100%" : isMobile ? 92 : 100,
    height: compact ? (isMobile ? 36 : 40) : isMobile ? 42 : 48,
    margin: fullWidth ? "0" : "0 auto",
    borderRadius: 8,
    border: "1px solid rgba(255,206,84,0.35)",
    background:
      "linear-gradient(180deg, rgba(72,56,16,0.85), rgba(52,40,10,0.92))",
    color: "#ffd84d",
    fontWeight: 900,
    textAlign: "center",
    boxSizing: "border-box",
    outline: "none",
    fontSize: compact ? (isMobile ? 13 : 14) : isMobile ? 15 : 16,
    lineHeight: 1,
    letterSpacing: "0.01em",
    padding: fullWidth ? "0 12px" : 0,
    fontFamily: UI_FONT,
  };
}

function Btn({ children, active, onClick, compact = false }) {
  function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={Number(current.productionReelle || 0) > 0 ? String(Number(current.productionReelle || 0)) : ""}
            subtitle={current.productionReelle >= current.objectifReel ? "SUR LA CIBLE" : "SOUS LA CIBLE"}
            {...common}
          />
        );

      case "objectifTotal":
        return (
          <KPI
            key={key}
            title="Objectif total théorique"
            value={objectifTotalTheorique}
            subtitle="calculé selon les blocs"
            {...common}
          />
        );

      case "projectionFinQuart":
        return (
          <KPI
            key={key}
            title="Projection fin de quart"
            value={projectionFinQuart}
            subtitle="cumul projeté à la fin du quart"
            valueColor="#ffd84d"
            highlight
            {...common}
          />
        );

      case "theoriqueDepuisDebut":
        return (
          <KPI
            key={key}
            title="Théorique depuis début du quart"
            value={theoriqueDepuisDebutQuart}
            subtitle="calculé jusqu'à l'heure actuelle"
            {...common}
          />
        );

      case "efficaciteDepuisDebut":
        return (
          <KPI
            key={key}
            title="Efficacité depuis début du quart"
            value={`${formatPercent(efficaciteDepuisDebutQuart)} %`}
            subtitle="basée sur le champ nombre réellement produit"
            valueColor="#ffd84d"
            {...common}
          />
        );

      case "efficaciteTheoriqueReel":
        return (
          <KPI
            key={key}
            title="Efficacité théorique / réel"
            value={`${formatPercent(efficaciteTheoriqueReel)} %`}
            subtitle="réel produit ÷ théorique depuis début"
            valueColor={efficaciteTheoriqueReelColor}
            highlight={efficaciteTheoriqueReel < 95}
            {...common}
          />
        );

      case "efficaciteQuartComplet":
        return (
          <KPI
            key={key}
            title="Efficacité quart complet / 100 %"
            value={`${formatPercent(efficaciteQuartComplet)} %`}
            subtitle={`${capaciteQuartComplet} cochons = 100 % du quart`}
            valueColor={efficaciteQuartCompletColor}
            highlight={efficaciteQuartComplet < 95}
            {...common}
          />
        );

      case "heureFinEstimee":
        return (
          <KPI
            key={key}
            title="Heure fin estimée"
            value={fmtTime(heureFinEstimee)}
            subtitle="pour atteindre l'objectif réel"
            {...common}
          />
        );

      case "heureReelleSelonRestant":
        return (
          <KPI
            key={key}
            title="Heure réelle selon restant"
            value={fmtTime(heureReelleSelonRestant)}
            subtitle="restant ÷ dernière cadence du quart"
            {...common}
          />
        );

      case "efficaciteGlobale":
        return (
          <KPI
            key={key}
            title="Efficacité globale pondérée"
            value={`${formatPercent(efficacitePonderee)} %`}
            subtitle="basée sur les blocs réels remplis"
            valueColor="#ffd84d"
            {...common}
          />
        );

      case "restantProduire":
        return (
          <KPI
            key={key}
            title="Restant à produire"
            value={restantAProduire}
            subtitle="pour atteindre l'objectif réel"
            {...common}
          />
        );

      case "statutUsine":
        return (
          <KPI
            key={key}
            title="Statut usine"
            value={statutUsine}
            subtitle="selon la projection fin de quart"
            valueColor={statutUsineColor}
            highlight={statutUsine !== "EN AVANCE"}
            {...common}
          />
        );

      case "alerteDerive":
        return (
          <KPI
            key={key}
            title="Alerte dérive production"
            value={alerteDerive}
            subtitle={ecartProjectionObjectif < 0 ? `${Math.abs(ecartProjectionObjectif)} cochons sous l'objectif` : "projection suffisante"}
            valueColor={statutUsineColor}
            {...common}
          />
        );

      default:
        return null;
    }
  }

  return (
    <button
  onClick={() => navigateHistoryRoute("/historique-soir")}
  style={{
    height: mobileCompact ? 38 : 44,
    padding: mobileCompact ? "0 14px" : "0 18px",
    borderRadius: 14,
    border: "2px solid rgba(57,232,255,0.98)",
    background: "linear-gradient(180deg, rgba(20,90,120,0.95), rgba(8,35,55,0.98))",
    color: "#39e8ff",
    fontSize: mobileCompact ? 12 : 13,
    fontWeight: 950,
    letterSpacing: "0.035em",
    cursor: "pointer",
    boxShadow: "0 0 45px rgba(57,232,255,0.95)",
    whiteSpace: "nowrap",
    fontFamily: UI_FONT,
  }}
>
  🌙 Historique soir
</button>

                </div>
              </div>

              <div
                style={{
                  minHeight: mobileCompact ? 104 : 132,
                  padding: mobileCompact ? 12 : 16,
                  borderRadius: 18,
                  position: "relative",
                  overflow: "hidden",
                  background:
                    "radial-gradient(circle at 50% 18%, rgba(47,225,255,0.16), transparent 30%), linear-gradient(180deg, rgba(8,22,40,0.88), rgba(3,10,20,0.98))",
                  border: "1px solid rgba(74,190,255,0.18)",
                  display: "grid",
                  alignContent: "center",
                  justifyItems: "center",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 26px rgba(47,225,255,0.06)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg, transparent, rgba(47,225,255,0.06), transparent)",
                    transform: "translateX(-35%)",
                    opacity: 0.8,
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: "#d8f4ff",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: 14,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  Heure système
                </div>

                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: mobileCompact ? 28 : 38,
                      fontWeight: 900,
                      letterSpacing: "0.05em",
                      lineHeight: 1,
                      color: "#f3fbff",
                      textAlign: "center",
                      width: "100%",
                      fontFamily: UI_FONT,
                      fontVariantNumeric: "tabular-nums",
                      textShadow: "0 0 18px rgba(47,225,255,0.18)",
                    }}
                  >
                    {clock}
                  </div>

                  <span
                    style={{
                      position: "absolute",
                      right: 12,
                      width: 13,
                      height: 13,
                      borderRadius: "50%",
                      background: clockPaused ? "#ffd84d" : "#2fe1ff",
                      boxShadow: clockPaused
                        ? "0 0 18px rgba(255,216,77,0.95)"
                        : "0 0 18px rgba(47,225,255,0.95)",
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={toggleClockPause}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    margin: "16px auto 0",
                    display: "block",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: 999,
                    padding: "9px 16px",
                    cursor: "pointer",
                    background: clockPaused
                      ? "linear-gradient(135deg, rgba(157,245,72,0.25), rgba(47,225,255,0.16))"
                      : "linear-gradient(135deg, rgba(255,216,77,0.22), rgba(255,79,103,0.14))",
                    color: "#f3fbff",
                    fontWeight: 900,
                    letterSpacing: "0.04em",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.22)",
                  }}
                >
                  {clockPaused ? "▶ Reprendre l’heure normale" : "⏸ Pause horloge"}
                </button>

                {clockPaused && (
                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      marginTop: 8,
                      textAlign: "center",
                      color: "#ffd84d",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    Temps figé pour les calculs et l’heure fin estimée
                  </div>
                )}

                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setClockMode("real");
                      setClockPaused(false);
                      setPausedNow(null);
                    }}
                    style={{
                      height: 30,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: clockMode === "real"
                        ? "1px solid rgba(47,225,255,0.65)"
                        : "1px solid rgba(255,255,255,0.14)",
                      background: clockMode === "real"
                        ? "rgba(47,225,255,0.18)"
                        : "rgba(20,34,55,0.72)",
                      color: "#eefaff",
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: "pointer",
                      fontFamily: UI_FONT,
                    }}
                  >
                    Heure réelle
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setClockMode("simulated");
                      setClockPaused(false);
                      setPausedNow(null);
                    }}
                    style={{
                      height: 30,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: clockMode === "simulated"
                        ? "1px solid rgba(255,216,77,0.65)"
                        : "1px solid rgba(255,255,255,0.14)",
                      background: clockMode === "simulated"
                        ? "rgba(255,216,77,0.18)"
                        : "rgba(20,34,55,0.72)",
                      color: clockMode === "simulated" ? "#ffd84d" : "#eefaff",
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: "pointer",
                      fontFamily: UI_FONT,
                    }}
                  >
                    Heure simulée
                  </button>

                  {clockMode === "simulated" && (
                    <input
                      type="time"
                      value={manualTime}
                      onChange={(e) => {
                        setManualTime(e.target.value);
                        setClockPaused(false);
                        setPausedNow(null);
                      }}
                      style={{
                        height: 30,
                        width: 110,
                        borderRadius: 999,
                        border: "1px solid rgba(255,216,77,0.42)",
                        background: "rgba(72,56,16,0.62)",
                        color: "#ffd84d",
                        fontSize: 12,
                        fontWeight: 900,
                        padding: "0 10px",
                        outline: "none",
                        fontFamily: UI_FONT,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: mobileCompact ? "1fr" : "1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: 8,
                  borderRadius: 18,
                  background: "rgba(6,18,34,0.62)",
                  border: "1px solid rgba(74,190,255,0.10)",
                }}
              >
                <Btn onClick={() => setShowPeriodes((v) => !v)} compact={mobileCompact}>
                  {showPeriodes ? "Masquer périodes" : "Afficher périodes"}
                </Btn>
                <Btn onClick={() => setShowIndicatorsPanel((v) => !v)} compact={mobileCompact}>
                  {showIndicatorsPanel ? "Masquer indicateurs" : "Afficher indicateurs"}
                </Btn>
                <Btn onClick={() => setShowBlocTable((v) => !v)} compact={mobileCompact}>
                  {showBlocTable ? "Masquer tableau blocs" : "Afficher tableau blocs"}
                </Btn>
                <Btn onClick={toggleFactoryMode} active={factoryMode} compact={mobileCompact}>
                  Mode écran usine
                </Btn>
                
              </div>




              <button
                onClick={resetCurrentShift}
                style={{
                  height: mobileCompact ? 38 : 44,
                  padding: mobileCompact ? "0 16px" : "0 22px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,105,105,0.36)",
                  background:
                    "linear-gradient(180deg, rgba(95,28,34,0.92), rgba(52,18,24,0.95))",
                  color: "#fff3f3",
                  fontSize: mobileCompact ? 12 : 13,
                  fontWeight: 900,
                  letterSpacing: "0.035em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow:
                    "0 0 18px rgba(255,77,90,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
                  justifySelf: mobileCompact ? "stretch" : "end",
                  fontFamily: UI_FONT,
                }}
              >
                Réinitialiser
              </button>
            </div>
          </div>

          <div
            style={{
              ...cardStyle,
              padding: sectionPadding,
              marginBottom: 10,
              display: "grid",
              gridTemplateColumns: mobileCompact ? "1fr" : "1fr auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  color: "#ffd84d",
                  fontSize: 13,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                Zoom PC
              </div>
              <div style={{ color: "#7f99ad", fontSize: 11, fontWeight: 700 }}>
                Le mode PC reste la vue principale. Ajuste seulement le zoom si nécessaire.
              </div>
            </div>

            <div style={{ display: "grid", gap: 8, minWidth: mobileCompact ? "100%" : 360 }}>
              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 32px 72px auto", gap: 8, alignItems: "center" }}>
                <Btn onClick={zoomOut} compact>
                  −
                </Btn>

                <input
                  type="range"
                  min="80"
                  max="120"
                  step="5"
                  value={Math.round(zoom * 100)}
                  onChange={(e) => setZoom(Number(e.target.value) / 100)}
                  style={{ width: "100%" }}
                />

                <Btn onClick={zoomIn} compact>
                  +
                </Btn>

                <div
                  style={{
                    textAlign: "center",
                    color: "#ffd84d",
                    fontWeight: 900,
                    fontSize: 14,
                  }}
                >
                  {Math.round(zoom * 100)} %
                </div>

                <Btn onClick={resetZoom} compact>
                  Reset
                </Btn>
              </div>
            </div>
          </div>

          </div>

          {showIndicatorsPanel && (
          <div style={{ ...cardStyle, padding: sectionPadding, marginBottom: 10 }}>
            <div
              style={{
                color: "#ffd84d",
                fontSize: 13,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Afficher / masquer les indicateurs
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#7f99ad",
                marginBottom: 10,
                fontWeight: 700,
              }}
            >
              Coche les indicateurs à afficher, puis choisis leur position.
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 10,
              }}
            >
              <button
                onClick={resetKpiOrder}
                style={{
                  ...buttonStyle(false, true),
                  height: 28,
                  fontSize: 11,
                  padding: "0 10px",
                }}
              >
                Réinitialiser l'ordre
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
                gap: 8,
                width: "100%",
              }}
            >
              {kpiOrder.map((key, index) => {
                const label = kpiLabelByKey[key] || key;

                function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={Number(current.productionReelle || 0) > 0 ? String(Number(current.productionReelle || 0)) : ""}
            subtitle={current.productionReelle >= current.objectifReel ? "SUR LA CIBLE" : "SOUS LA CIBLE"}
            {...common}
          />
        );

      case "objectifTotal":
        return (
          <KPI
            key={key}
            title="Objectif total théorique"
            value={objectifTotalTheorique}
            subtitle="calculé selon les blocs"
            {...common}
          />
        );

      case "projectionFinQuart":
        return (
          <KPI
            key={key}
            title="Projection fin de quart"
            value={projectionFinQuart}
            subtitle="cumul projeté à la fin du quart"
            valueColor="#ffd84d"
            highlight
            {...common}
          />
        );

      case "theoriqueDepuisDebut":
        return (
          <KPI
            key={key}
            title="Théorique depuis début du quart"
            value={theoriqueDepuisDebutQuart}
            subtitle="calculé jusqu'à l'heure actuelle"
            {...common}
          />
        );

      case "efficaciteDepuisDebut":
        return (
          <KPI
            key={key}
            title="Efficacité depuis début du quart"
            value={`${formatPercent(efficaciteDepuisDebutQuart)} %`}
            subtitle="basée sur le champ nombre réellement produit"
            valueColor="#ffd84d"
            {...common}
          />
        );

      case "efficaciteTheoriqueReel":
        return (
          <KPI
            key={key}
            title="Efficacité théorique / réel"
            value={`${formatPercent(efficaciteTheoriqueReel)} %`}
            subtitle="réel produit ÷ théorique depuis début"
            valueColor={efficaciteTheoriqueReelColor}
            highlight={efficaciteTheoriqueReel < 95}
            {...common}
          />
        );

      case "efficaciteQuartComplet":
        return (
          <KPI
            key={key}
            title="Efficacité quart complet / 100 %"
            value={`${formatPercent(efficaciteQuartComplet)} %`}
            subtitle={`${capaciteQuartComplet} cochons = 100 % du quart`}
            valueColor={efficaciteQuartCompletColor}
            highlight={efficaciteQuartComplet < 95}
            {...common}
          />
        );

      case "heureFinEstimee":
        return (
          <KPI
            key={key}
            title="Heure fin estimée"
            value={fmtTime(heureFinEstimee)}
            subtitle="pour atteindre l'objectif réel"
            {...common}
          />
        );

      case "heureReelleSelonRestant":
        return (
          <KPI
            key={key}
            title="Heure réelle selon restant"
            value={fmtTime(heureReelleSelonRestant)}
            subtitle="restant ÷ dernière cadence du quart"
            {...common}
          />
        );

      case "efficaciteGlobale":
        return (
          <KPI
            key={key}
            title="Efficacité globale pondérée"
            value={`${formatPercent(efficacitePonderee)} %`}
            subtitle="basée sur les blocs réels remplis"
            valueColor="#ffd84d"
            {...common}
          />
        );

      case "restantProduire":
        return (
          <KPI
            key={key}
            title="Restant à produire"
            value={restantAProduire}
            subtitle="pour atteindre l'objectif réel"
            {...common}
          />
        );

      case "statutUsine":
        return (
          <KPI
            key={key}
            title="Statut usine"
            value={statutUsine}
            subtitle="selon la projection fin de quart"
            valueColor={statutUsineColor}
            highlight={statutUsine !== "EN AVANCE"}
            {...common}
          />
        );

      case "alerteDerive":
        return (
          <KPI
            key={key}
            title="Alerte dérive production"
            value={alerteDerive}
            subtitle={ecartProjectionObjectif < 0 ? `${Math.abs(ecartProjectionObjectif)} cochons sous l'objectif` : "projection suffisante"}
            valueColor={statutUsineColor}
            {...common}
          />
        );

      default:
        return null;
    }
  }

  return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => setDraggedKpi(key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleKpiDrop(key)}
                    onDragEnd={() => setDraggedKpi(null)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: mobileCompact ? "32px 1fr" : "auto 1fr auto",
                      alignItems: "center",
                      gap: 10,
                      border:
                        draggedKpi === key
                          ? "1px solid rgba(255,216,77,0.75)"
                          : "1px solid rgba(74,190,255,0.12)",
                      borderRadius: 14,
                      padding: "10px 12px",
                      background:
                        draggedKpi === key
                          ? "linear-gradient(180deg, rgba(72,56,16,0.55), rgba(42,33,12,0.65))"
                          : "linear-gradient(180deg, rgba(7,19,36,0.78), rgba(4,12,24,0.88))",
                      cursor: "grab",
                      boxShadow: draggedKpi === key ? "0 0 18px rgba(255,216,77,0.18)" : "none",
                    }}
                  >
                    <div
                      style={{
                        color: "#ffd84d",
                        fontSize: 11,
                        fontWeight: 900,
                        opacity: 0.75,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </div>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        color: "#eefaff",
                        minWidth: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(visibleKpis[key])}
                        onChange={() => toggleKpi(key)}
                      />
                      <span style={{ lineHeight: 1.2 }}>{label}</span>
                    </label>

                    <select
                      value={index}
                      onChange={(e) => moveKpiToPosition(key, Number(e.target.value))}
                      style={{
                        gridColumn: mobileCompact ? "1 / -1" : "auto",
                        height: 30,
                        width: mobileCompact ? "100%" : "auto",
                        minWidth: 92,
                        borderRadius: 999,
                        border: "1px solid rgba(255,216,77,0.28)",
                        background: "linear-gradient(180deg, rgba(72,56,16,0.72), rgba(42,33,12,0.86))",
                        color: "#ffd84d",
                        fontSize: 11,
                        fontWeight: 900,
                        padding: "0 8px",
                        outline: "none",
                        cursor: "pointer",
                      }}
                      title="Choisir la position exacte"
                    >
                      {kpiOrder.map((_, pos) => (
                        <option key={pos} value={pos}>
                          Position {pos + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobileCompact ? "1fr" : "1.7fr 0.9fr",
              gap: gapMain,
              marginTop: 10,
            }}
          >
            <div>
              <div style={{ ...cardStyle, padding: sectionPadding, marginBottom: 10 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr auto",
                    gap: 14,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Objectif réel à produire
                    </div>
                    <input
                      style={yellowInputStyle(mobileCompact, true, false)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(Number(current.objectifReel || 0))}
                      onChange={(e) =>
                        updateShiftData({
                          objectifReel: normalizeIntegerInput(e.target.value),
                        })
                      }
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Nombre réellement produit
                    </div>
                    <input
                      style={yellowInputStyle(mobileCompact, true, false)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(Number(current.productionReelle || 0))}
                      onChange={(e) =>
                        updateShiftData({
                          productionReelle: normalizeIntegerInput(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {showPeriodes && (
                <div style={{ ...cardStyle, padding: sectionPadding, marginBottom: 10 }}>
                  <div
                    style={{
                      color: "#ffd84d",
                      fontSize: 13,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 10,
                    }}
                  >
                    Périodes et cadences
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: mobileCompact ? 760 : isTablet ? 900 : "auto" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.15fr 0.7fr 0.7fr 0.9fr 0.12fr 0.12fr",
                          gap: 10,
                          padding: "0 8px 8px",
                          fontSize: 12,
                          color: "#dfefff",
                        }}
                      >
                        <div>Type</div>
                        <div>Début</div>
                        <div>Fin</div>
                        <div>Cadence cible / heure</div>
                        <div></div>
                        <div></div>
                      </div>

                      {current.periodes.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.15fr 0.7fr 0.7fr 0.9fr 0.12fr 0.12fr",
                            gap: 10,
                            marginBottom: 8,
                          }}
                        >
                          <select
                            style={inputStyle}
                            value={p.type}
                            onChange={(e) => updatePeriode(p.id, "type", e.target.value)}
                          >
                            <option>Production</option>
                            <option>Pause</option>
                            <option>Diner</option>
                            <option>Souper</option>
                            <option>Fin de quart</option>
                            <option>Production (Fin de quart)</option>
                          </select>

                          <input
                            style={inputStyle}
                            type="time"
                            value={p.start}
                            onChange={(e) => updatePeriode(p.id, "start", e.target.value)}
                          />

                          <input
                            style={inputStyle}
                            type="time"
                            value={p.end}
                            onChange={(e) => updatePeriode(p.id, "end", e.target.value)}
                          />

                          <input
                            style={yellowInputStyle(mobileCompact, true, true)}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={String(Number(p.cadence || 0))}
                            onChange={(e) => updatePeriode(p.id, "cadence", e.target.value)}
                          />

                          <button
                            onClick={() => addPeriodeAfter(p.id)}
                            title="Ajouter une ligne après celle-ci"
                            style={{ ...inputStyle, padding: 0, cursor: "pointer" }}
                          >
                            +
                          </button>

                          <button
                            onClick={() => deletePeriode(p.id)}
                            title="Supprimer cette ligne"
                            style={{ ...inputStyle, padding: 0, cursor: "pointer" }}
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "linear-gradient(180deg, rgba(87,71,23,0.45), rgba(60,49,17,0.50))",
                      border: "1px solid rgba(255,207,84,0.30)",
                      display: "grid",
                      gridTemplateColumns: mobileCompact ? "1fr 1fr" : "1.4fr 1fr 1fr 1fr 1fr",
                      gap: 10,
                      alignItems: "center",
                      fontWeight: 900,
                      fontSize: mobileCompact ? 12 : 14,
                    }}
                  >
                    <div style={{ color: "#ffd861", textTransform: "uppercase" }}>Objectif 100 %</div>
                    <div>{`${String(Math.floor(minutesTotales / 60)).padStart(2, "0")}:${String(minutesTotales % 60).padStart(2, "0")}`}</div>
                    <div>{objectifTotalTheorique}</div>
                    <div>Fin quart</div>
                    <div>{heureFinQuartOfficielle}</div>
                  </div>
                </div>
              )}

              {showBlocTable && (
              <div style={{ ...cardStyle, padding: sectionPadding, marginBottom: 10 }}>
                <div
                  style={{
                    color: "#ffd84d",
                    fontSize: 13,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 8,
                  }}
                >
                  Tableau de coupe par bloc
                </div>

                {mobileCompact ? (
                  <div>
                    {blocsAffiches.map((b) => (
                      <MobileBlocCard
                        key={b.id}
                        bloc={b}
                        updateBloc={updateBloc}
                        mobileCompact={mobileCompact}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <div
                      style={{
                        minWidth: mobileCompact ? 1180 : 1320,
                        display: "grid",
                        gridTemplateColumns:
                          "1.1fr 0.6fr 0.6fr 0.72fr 0.8fr 0.78fr 0.95fr 0.9fr 1.05fr 0.95fr 0.92fr 0.8fr",
                        gap: 0,
                        border: "1px solid rgba(74,190,255,0.14)",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      {[
                        "Bloc / Quart",
                        "Début",
                        "Fin",
                        "Minutes travaillées",
                        "Cadence cible / h",
                        "Coupe à 100 %",
                        "Coupe cible (%)",
                        "Coupe cible réelle",
                        "Coupe réelle cumulative",
                        "Réel bloc",
                        "Écart de coupe",
                        "Efficacité réelle",
                      ].map((h) => (
                        <div
                          key={h}
                          style={{
                            padding: "10px 8px",
                            fontSize: 12,
                            fontWeight: 900,
                            letterSpacing: "0.015em",
                            textAlign: "center",
                            color: "#eefaff",
                            background: "rgba(8,20,38,0.95)",
                            borderRight: "1px solid rgba(74,190,255,0.10)",
                            borderBottom: "1px solid rgba(74,190,255,0.10)",
                            fontFamily: UI_FONT,
                          }}
                        >
                          {h}
                        </div>
                      ))}

                      {blocsAffiches.map((b) => {
                        const cumulCell = Number(b.cumulActuel || 0);
                        const reelBlocCell = Number(b.reelBloc || 0);
                        const efficaciteCell = b.isPrediction
                          ? b.efficaciteReelleAffichee
                          : b.efficaciteReelle;
                        const ecartCell = b.isPrediction ? b.ecartDeCoupeAffiche : b.ecartDeCoupe;

                        function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={Number(current.productionReelle || 0) > 0 ? String(Number(current.productionReelle || 0)) : ""}
            subtitle={current.productionReelle >= current.objectifReel ? "SUR LA CIBLE" : "SOUS LA CIBLE"}
            {...common}
          />
        );

      case "objectifTotal":
        return (
          <KPI
            key={key}
            title="Objectif total théorique"
            value={objectifTotalTheorique}
            subtitle="calculé selon les blocs"
            {...common}
          />
        );

      case "projectionFinQuart":
        return (
          <KPI
            key={key}
            title="Projection fin de quart"
            value={projectionFinQuart}
            subtitle="cumul projeté à la fin du quart"
            valueColor="#ffd84d"
            highlight
            {...common}
          />
        );

      case "theoriqueDepuisDebut":
        return (
          <KPI
            key={key}
            title="Théorique depuis début du quart"
            value={theoriqueDepuisDebutQuart}
            subtitle="calculé jusqu'à l'heure actuelle"
            {...common}
          />
        );

      case "efficaciteDepuisDebut":
        return (
          <KPI
            key={key}
            title="Efficacité depuis début du quart"
            value={`${formatPercent(efficaciteDepuisDebutQuart)} %`}
            subtitle="basée sur le champ nombre réellement produit"
            valueColor="#ffd84d"
            {...common}
          />
        );

      case "efficaciteTheoriqueReel":
        return (
          <KPI
            key={key}
            title="Efficacité théorique / réel"
            value={`${formatPercent(efficaciteTheoriqueReel)} %`}
            subtitle="réel produit ÷ théorique depuis début"
            valueColor={efficaciteTheoriqueReelColor}
            highlight={efficaciteTheoriqueReel < 95}
            {...common}
          />
        );

      case "efficaciteQuartComplet":
        return (
          <KPI
            key={key}
            title="Efficacité quart complet / 100 %"
            value={`${formatPercent(efficaciteQuartComplet)} %`}
            subtitle={`${capaciteQuartComplet} cochons = 100 % du quart`}
            valueColor={efficaciteQuartCompletColor}
            highlight={efficaciteQuartComplet < 95}
            {...common}
          />
        );

      case "heureFinEstimee":
        return (
          <KPI
            key={key}
            title="Heure fin estimée"
            value={fmtTime(heureFinEstimee)}
            subtitle="pour atteindre l'objectif réel"
            {...common}
          />
        );

      case "heureReelleSelonRestant":
        return (
          <KPI
            key={key}
            title="Heure réelle selon restant"
            value={fmtTime(heureReelleSelonRestant)}
            subtitle="restant ÷ dernière cadence du quart"
            {...common}
          />
        );

      case "efficaciteGlobale":
        return (
          <KPI
            key={key}
            title="Efficacité globale pondérée"
            value={`${formatPercent(efficacitePonderee)} %`}
            subtitle="basée sur les blocs réels remplis"
            valueColor="#ffd84d"
            {...common}
          />
        );

      case "restantProduire":
        return (
          <KPI
            key={key}
            title="Restant à produire"
            value={restantAProduire}
            subtitle="pour atteindre l'objectif réel"
            {...common}
          />
        );

      case "statutUsine":
        return (
          <KPI
            key={key}
            title="Statut usine"
            value={statutUsine}
            subtitle="selon la projection fin de quart"
            valueColor={statutUsineColor}
            highlight={statutUsine !== "EN AVANCE"}
            {...common}
          />
        );

      case "alerteDerive":
        return (
          <KPI
            key={key}
            title="Alerte dérive production"
            value={alerteDerive}
            subtitle={ecartProjectionObjectif < 0 ? `${Math.abs(ecartProjectionObjectif)} cochons sous l'objectif` : "projection suffisante"}
            valueColor={statutUsineColor}
            {...common}
          />
        );

      default:
        return null;
    }
  }

  return (
                          <div key={b.id} style={{ display: "contents" }}>
                            <div style={cellStyle(b.isPrediction, true)}>{b.label}</div>
                            <div style={cellStyle(b.isPrediction)}><NumberText>{fmtTime(b.start)}</NumberText></div>
                            <div style={cellStyle(b.isPrediction)}><NumberText>{fmtTime(b.end)}</NumberText></div>
                            <div style={cellStyle(b.isPrediction)}><NumberText>{b.minutesTravaillees}</NumberText></div>
                            <div style={cellStyle(b.isPrediction)}><NumberText>{b.cadence}</NumberText></div>
                            <div style={cellStyle(b.isPrediction)}><NumberText>{b.coupe100}</NumberText></div>

                            <div style={cellStyle(b.isPrediction)}>
                              <select
                                style={yellowInputStyle(false, false, true)}
                                value={b.ciblePct}
                                onChange={(e) => updateBloc(b.id, "ciblePct", e.target.value)}
                              >
                                {[70, 75, 80, 82, 85, 88, 90, 92, 95, 100].map((v) => (
                                  <option key={v} value={v}>
                                    {v} %
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div style={cellStyle(b.isPrediction)}><NumberText>{b.coupeCibleReelle}</NumberText></div>

                            <div style={cellStyle(b.isPrediction)}>
                              {b.isPrediction ? (
                                <NumberText>{cumulCell}</NumberText>
                              ) : (
                                <input
                                  style={yellowInputStyle(false, false, false)}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={Number(b.coupeReelle || 0) > 0 ? String(Number(b.coupeReelle || 0)) : ""}
                                  placeholder={b.isEstimated ? String(Number(b.cumulActuel || 0)) : "0"}
                                  onChange={(e) => updateBloc(b.id, "coupeReelle", e.target.value)}
                                />
                              )}
                            </div>

                            <div style={cellStyle(b.isPrediction)}>
                              <div style={{ display: "grid", gap: 2 }}>
                                <NumberText color={b.isPrediction || b.isEstimated ? "#ffd84d" : "#eefaff"} size={b.isPrediction ? 20 : 13} weight={900}>
                                  {reelBlocCell}
                                </NumberText>
                                {b.isAverageSummary ? (
                                  <span style={{ fontSize: 9, color: "#ffd84d", fontWeight: 900 }}>MOYENNE</span>
                                ) : b.isEstimated ? (
                                  <span style={{ fontSize: 9, color: "#ffd84d", fontWeight: 900 }}>ESTIMÉ</span>
                                ) : null}
                              </div>
                            </div>

                            <div style={cellStyle(b.isPrediction)}>
                              <NumberText color={ecartCell >= 0 ? "#8ef6a7" : "#ff4f67"} size={13} weight={900}>
                                {ecartCell >= 0 ? `+${ecartCell}` : ecartCell}
                              </NumberText>
                            </div>

                            <div style={cellStyle(b.isPrediction)}>
                              <NumberText color="#ffd84d" size={13} weight={900}>
                                {formatPercent(efficaciteCell)} %
                              </NumberText>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.35fr 1fr",
                  gap: mobileCompact ? 8 : 12,
                }}
              >
                <div style={{ ...cardStyle, padding: sectionPadding }}>
                  <div
                    style={{
                      color: "#d8f4ff",
                      fontSize: 13,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 8,
                    }}
                  >
                    Courbe réel vs théorique actuel
                  </div>

                  <div
                    style={{
                      height: chartHeight,
                      borderRadius: 12,
                      background:
                        "linear-gradient(180deg, rgba(5,12,24,0.95) 0%, rgba(3,8,18,0.98) 100%)",
                    }}
                  >
                    <ResponsiveContainer>
                      <ComposedChart data={chartData} margin={{ top: 15, right: 16, left: 0, bottom: 8 }}>
                        <defs>
                          <linearGradient id="reelAreaFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#46dbff" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#46dbff" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>

                        <CartesianGrid stroke="rgba(127,165,196,0.10)" strokeDasharray="3 3" />
                        <XAxis dataKey="time" tick={{ fill: "#8ea9bf", fontSize: 11 }} />
                        <YAxis domain={[0, chartMax + 300]} tick={{ fill: "#8ea9bf", fontSize: 11 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12, color: "#b8d2e3", paddingTop: 6 }} />
                        <ReferenceLine
                          y={objectifTotalTheorique}
                          stroke="#ff4f67"
                          strokeDasharray="5 4"
                          label={{
                            value: "Objectif 100 %",
                            position: "insideTopRight",
                            fill: "#ff97a6",
                            fontSize: 10,
                          }}
                        />
                        <Area type="monotone" dataKey="reel" stroke="none" fill="url(#reelAreaFill)" />
                        <Line type="monotone" dataKey="reel" name="Réel cumulé" stroke="#46dbff" strokeWidth={3} dot={{ r: 3, fill: "#7ff0ff" }} />
                        <Line type="monotone" dataKey="theorique" name="Théorique cumulé" stroke="#d7ef76" strokeWidth={2.2} dot={false} strokeDasharray="6 4" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <Gauge value={efficaciteDepuisDebutQuart} target={92} compact={mobileCompact} />
              </div>

              <div style={{ ...cardStyle, padding: sectionPadding, marginTop: 12, marginBottom: 10 }}>
                <div style={{ color: "#ffd84d", fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                  Enregistrer l'historique
                </div>

                <div style={{ color: "#7f99ad", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
                  Choisis la date avec le calendrier, ajuste les valeurs au besoin, puis enregistre. Le graphique utilisera ces valeurs manuelles.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: mobileCompact ? "1fr" : "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Date</div>
                    <div style={{ position: "relative" }}>
                      <input
                        style={{
                          ...yellowInputStyle(mobileCompact, true, false),
                          paddingRight: 42,
                          cursor: "pointer",
                        }}
                        type="date"
                        value={saveDate}
                        onChange={(e) => setSaveDate(e.target.value)}
                      />
                      <span
                        style={{
                          position: "absolute",
                          right: 14,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#ffd84d",
                          fontSize: 18,
                          fontWeight: 900,
                          pointerEvents: "none",
                          filter: "drop-shadow(0 0 6px rgba(255,216,77,0.45))",
                        }}
                      >
                        📅
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Nombre produit</div>
                    <input
                      style={yellowInputStyle(mobileCompact, true, false)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={manualProduction === "" ? "0" : manualProduction}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setManualProduction(String(normalizeIntegerInput(e.target.value)))}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Efficacité réelle %
                    </div>
                    <div
                      style={{
                        ...yellowInputStyle(mobileCompact, true, false),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        paddingLeft: 12,
                        paddingRight: 12,
                      }}
                    >
                      <input
                        style={{
                          width: 70,
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          color: "#ffd84d",
                          textAlign: "right",
                          fontWeight: 900,
                          fontSize: mobileCompact ? 15 : 16,
                          fontFamily: UI_FONT,
                          fontVariantNumeric: "tabular-nums",
                        }}
                        type="text"
                        inputMode="decimal"
                        value={manualEfficiency === "" ? "0.0" : manualEfficiency}
                        onFocus={(e) => e.target.select()}
                        onBlur={(e) => {
                          const val = e.target.value.replace(",", ".");
                          const num = Number(val);
                          setManualEfficiency(Number.isFinite(num) ? num.toFixed(1) : "0.0");
                        }}
                        onChange={(e) => setManualEfficiency(e.target.value.replace(/[^0-9.,]/g, ""))}
                      />
                      <span
                        style={{
                          color: "#ffd84d",
                          fontWeight: 900,
                          fontSize: mobileCompact ? 15 : 16,
                          fontFamily: UI_FONT,
                        }}
                      >
                        %
                      </span>
                    </div>
                  </div>

                  <button onClick={saveHistoryEntry} style={{ ...buttonStyle(true, mobileCompact), height: mobileCompact ? 40 : 48 }}>
                    Enregistrer
                  </button>
                </div>

                <div style={{ display: "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Commentaire / note</div>
                  <textarea
                    value={manualComment}
                    onChange={(e) => setManualComment(e.target.value)}
                    placeholder="Ex. arrêt ligne, manque employés, maintenance, retard, commentaire superviseur..."
                    rows={3}
                    style={{
                      width: "100%",
                      minHeight: 70,
                      resize: "vertical",
                      borderRadius: 12,
                      border: "1px solid rgba(120,190,255,0.16)",
                      background: "rgba(6,18,34,0.88)",
                      color: "#eefaff",
                      padding: "10px 12px",
                      boxSizing: "border-box",
                      outline: "none",
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: UI_FONT,
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: mobileCompact ? 8 : 12,
                alignContent: "start",
              }}
            >
              {kpiOrder.map((key) => renderKpiCard(key))}
            </div>
          </div>

          {!validation.ok && (
            <div
              style={{
                marginTop: 12,
                ...cardStyle,
                padding: 12,
                color: "#ff97a6",
                fontWeight: 700,
                fontSize: mobileCompact ? 12 : 14,
                fontFamily: UI_FONT,
              }}
            >
              {validation.issues.map((issue, i) => (
                <div key={i}>• {issue}</div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
    </>
  );
}


/* FORCE SOIR BUTTONS BLEU FLASH */
