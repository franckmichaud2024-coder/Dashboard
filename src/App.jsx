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

const UI_FONT = "Inter, Segoe UI, Roboto, Arial, sans-serif";

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
  heureFinEstimee: true,
  efficaciteGlobale: true,
  restantProduire: true,
};

const KPI_OPTIONS = [
  ["alerteDerive", "Alerte dérive production"],
  ["efficaciteDepuisDebut", "Efficacité depuis début du quart"],
  ["efficaciteTheoriqueReel", "Efficacité théorique / réel"],
  ["efficaciteGlobale", "Efficacité globale pondérée"],
  ["heureFinEstimee", "Heure fin estimée"],
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

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        shift: "soir",
        data: {
          jour: clonePreset(PRESETS.jour),
          soir: clonePreset(PRESETS.soir),
        },
      };
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
    return {
      shift: "soir",
      data: {
        jour: clonePreset(PRESETS.jour),
        soir: clonePreset(PRESETS.soir),
      },
    };
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
  color: "#39e8ff",
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
            value={current.productionReelle}
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
      onClick={onClick}
      style={{
        height: compact ? 34 : 38,
        padding: compact ? "0 12px" : "0 18px",
        borderRadius: 10,
        border: active
          ? "1px solid rgba(109,230,255,0.65)"
          : "1px solid rgba(255,255,255,0.12)",
        background: active
          ? "linear-gradient(180deg, rgba(41,91,123,0.55), rgba(14,34,58,0.75))"
          : "rgba(20,34,55,0.78)",
        color: "#eefaff",
        fontSize: compact ? 12 : 13,
        fontWeight: 800,
        letterSpacing: "0.01em",
        lineHeight: 1,
        cursor: "pointer",
        boxShadow: active ? "0 0 16px rgba(109,230,255,0.18)" : "none",
        fontFamily: UI_FONT,
      }}
    >
      {children}
    </button>
  );
}

function buttonStyle(active = false, compact = false) {
  return {
    height: compact ? 34 : 38,
    padding: compact ? "0 12px" : "0 18px",
    borderRadius: 10,
    border: active
      ? "1px solid rgba(109,230,255,0.65)"
      : "1px solid rgba(255,255,255,0.12)",
    background: active
      ? "linear-gradient(180deg, rgba(41,91,123,0.55), rgba(14,34,58,0.75))"
      : "rgba(20,34,55,0.78)",
    color: "#eefaff",
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    letterSpacing: "0.01em",
    lineHeight: 1,
    cursor: "pointer",
    boxShadow: active ? "0 0 16px rgba(109,230,255,0.18)" : "none",
    fontFamily: UI_FONT,
  };
}

function KPI({
  title,
  value,
  subtitle,
  valueColor = "#f3fbff",
  highlight = false,
  compact = false,
}) {
  const textValue = String(value ?? "");
  const isAlert =
    textValue.toUpperCase().includes("RETARD") ||
    textValue.toUpperCase().includes("ALERTE") ||
    textValue.toUpperCase().includes("SOUS");

  const statusColor = isAlert ? "#ff4f67" : highlight ? "#ffd84d" : valueColor;
  const ledColor = isAlert ? "#ff4f67" : highlight ? "#ffd84d" : "#39e8ff";
  const borderColor = isAlert
    ? "rgba(255,79,103,0.55)"
    : highlight
      ? "rgba(255,216,77,0.40)"
      : "rgba(70,219,255,0.24)";

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: compact ? 118 : 138,
        padding: compact ? "12px 14px" : "16px 18px",
        borderRadius: 18,
        border: `1px solid ${borderColor}`,
        background:
          "linear-gradient(180deg, rgba(7,23,42,0.97) 0%, rgba(3,10,20,0.99) 100%)",
        boxShadow: isAlert
          ? "0 0 0 1px rgba(255,255,255,0.025) inset, 0 0 28px rgba(255,79,103,0.20)"
          : highlight
            ? "0 0 0 1px rgba(255,255,255,0.025) inset, 0 0 28px rgba(255,216,77,0.16)"
            : "0 0 0 1px rgba(255,255,255,0.025) inset, 0 0 28px rgba(70,219,255,0.12)",
        fontFamily: UI_FONT,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -42,
          right: -42,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${ledColor}30, transparent 64%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: compact ? 10 : 12,
        }}
      >
        <div
          style={{
            color: "#d8f4ff",
            fontSize: compact ? 10 : 11,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            lineHeight: 1.25,
          }}
        >
          {title}
        </div>

        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: ledColor,
            boxShadow: `0 0 14px ${ledColor}`,
            flex: "0 0 auto",
          }}
        />
      </div>

      <div
        style={{
          minHeight: compact ? 34 : 36,
          borderRadius: 14,
          border: "1px solid rgba(255,216,77,0.34)",
          background:
            "linear-gradient(180deg, rgba(72,56,16,0.76), rgba(32,26,8,0.90))",
          color: statusColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 12px",
          fontSize: compact ? 14 : 15,
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.02em",
          lineHeight: 1,
          textShadow: "0 0 10px rgba(0,0,0,0.55)",
        }}
      >
        {value}
      </div>

      {subtitle ? (
        <div
          style={{
            marginTop: compact ? 8 : 10,
            color: isAlert ? "#ffb4bf" : "#7f99ad",
            fontSize: compact ? 10 : 11,
            fontWeight: 800,
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Gauge({ value, target = 92, compact = false }) {
  const pctRaw = Number(value) || 0;
  const pct = Math.max(0, Math.min(120, pctRaw));
  const capped = Math.max(0, Math.min(100, pct));

  let mainColor = "#ff4d5a";
  let statusText = "SOUS LA CIBLE";

  if (pct >= target) {
    mainColor = "#9df548";
    statusText = "PERFORMANCE OK";
  } else if (pct >= target - 7) {
    mainColor = "#ffd84d";
    statusText = "À SURVEILLER";
  }

  const cx = 160;
  const cy = 145;
  const r = 112;

  const valueAngle = -180 + (capped / 100) * 180;
  const valueRad = (valueAngle * Math.PI) / 180;

  const needleX = cx + (r - 22) * Math.cos(valueRad);
  const needleY = cy + (r - 22) * Math.sin(valueRad);

  const targetAngle = -180 + (Math.max(0, Math.min(100, target)) / 100) * 180;
  const targetRad = (targetAngle * Math.PI) / 180;

  const targetX1 = cx + (r - 14) * Math.cos(targetRad);
  const targetY1 = cy + (r - 14) * Math.sin(targetRad);
  const targetX2 = cx + (r + 12) * Math.cos(targetRad);
  const targetY2 = cy + (r + 12) * Math.sin(targetRad);

  function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  }

  function arcPath(startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  }

  function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={current.productionReelle}
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
      style={{
        ...cardStyle,
        padding: 14,
        height: compact ? 210 : 230,
        border:
          pct < 80
            ? "1px solid rgba(255,77,90,0.55)"
            : "1px solid rgba(74,190,255,0.16)",
        boxShadow:
          pct < 80
            ? "0 0 24px rgba(255,77,90,0.25)"
            : "0 0 18px rgba(43,140,255,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#d8f4ff",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
          fontFamily: UI_FONT,
        }}
      >
        Efficacité depuis début du quart
      </div>

      <svg width="100%" height={compact ? 135 : 150} viewBox="0 0 320 185">
        <path
          d={arcPath(-180, 0)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="20"
          strokeLinecap="round"
        />

        <path
          d={arcPath(-180, -27)}
          fill="none"
          stroke="#ff4d5a"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.95"
        />

        <path
          d={arcPath(-27, -9)}
          fill="none"
          stroke="#ffd84d"
          strokeWidth="18"
          strokeLinecap="butt"
          opacity="0.95"
        />

        <path
          d={arcPath(-9, 0)}
          fill="none"
          stroke="#9df548"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.95"
        />

        <line
          x1={targetX1}
          y1={targetY1}
          x2={targetX2}
          y2={targetY2}
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.95"
        />

        <text
          x={cx}
          y="28"
          textAnchor="middle"
          fill="#d8f4ff"
          fontSize="10"
          fontWeight="800"
        >
          Cible {target} %
        </text>

        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="#e8f7ff"
          strokeWidth="5"
          strokeLinecap="round"
          style={{ transition: "all 0.45s ease" }}
        />

        <circle cx={cx} cy={cy} r="11" fill="#9befff" />
        <circle cx={cx} cy={cy} r="6" fill="#24576a" />

        <text x="48" y="168" fill="#ff7b86" fontSize="10" fontWeight="800">
          0 %
        </text>
        <text x="138" y="168" fill="#ffd84d" fontSize="10" fontWeight="800">
          85 %
        </text>
        <text x="246" y="168" fill="#9df548" fontSize="10" fontWeight="800">
          100 %
        </text>
      </svg>

      <div
        style={{
          textAlign: "center",
          marginTop: -10,
          fontSize: 25,
          fontWeight: 900,
          color: mainColor,
          fontFamily: UI_FONT,
          transition: "color 0.3s ease",
        }}
      >
        {formatPercent(pct)} %
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: 4,
          fontSize: 11,
          fontWeight: 900,
          color: mainColor,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {statusText}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const reel = payload.find((p) => p.dataKey === "reel")?.value ?? 0;
  const theorique = payload.find((p) => p.dataKey === "theorique")?.value ?? 0;

  function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={current.productionReelle}
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
      style={{
        background: "rgba(6,16,30,0.96)",
        border: "1px solid rgba(94,210,255,0.24)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 0 20px rgba(0,0,0,0.35)",
        fontFamily: UI_FONT,
      }}
    >
      <div
        style={{
          color: "#ffe98a",
          fontSize: 12,
          fontWeight: 900,
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      <div style={{ color: "#7ed8ff", fontSize: 12 }}>
        • Réel cumulé : <strong>{reel}</strong>
      </div>

      <div style={{ color: "#d9f07c", fontSize: 12 }}>
        • Théorique cumulé : <strong>{theorique}</strong>
      </div>
    </div>
  );
}

function cellStyle(prediction = false, left = false) {
  return {
    padding: "10px 8px",
    fontSize: 13,
    textAlign: "center",
    color: prediction && left ? "#ffd861" : "#eefaff",
    background: prediction
      ? "linear-gradient(180deg, rgba(63,53,20,0.45) 0%, rgba(44,37,14,0.58) 100%)"
      : "rgba(6,18,34,0.72)",
    borderRight: "1px solid rgba(74,190,255,0.10)",
    borderBottom: "1px solid rgba(74,190,255,0.10)",
    fontWeight: left ? 800 : 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    lineHeight: 1.2,
    fontFamily: UI_FONT,
  };
}

function NumberText({ children, color = "#eefaff", size = 13, weight = 800 }) {
  function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={current.productionReelle}
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
    <span
      style={{
        color,
        fontSize: size,
        fontWeight: weight,
        fontFamily: UI_FONT,
      }}
    >
      {children}
    </span>
  );
}

function MobileBlocCard({ bloc, updateBloc, mobileCompact }) {
  const cumulCell = Number(bloc.cumulActuel || 0);
  const reelBlocCell = Number(bloc.reelBloc || 0);
  const efficaciteCell = bloc.isPrediction
    ? bloc.efficaciteReelleAffichee
    : bloc.efficaciteReelle;
  const ecartCell = bloc.isPrediction ? bloc.ecartDeCoupeAffiche : bloc.ecartDeCoupe;

  function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={current.productionReelle}
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
      style={{
        border: bloc.isPrediction
          ? "1px solid rgba(255,206,84,0.28)"
          : "1px solid rgba(74,190,255,0.14)",
        borderRadius: 12,
        padding: mobileCompact ? 10 : 8,
        marginBottom: 10,
        background: bloc.isPrediction
          ? "linear-gradient(180deg, rgba(63,53,20,0.45) 0%, rgba(44,37,14,0.58) 100%)"
          : "rgba(6,18,34,0.72)",
        fontFamily: UI_FONT,
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: bloc.isPrediction ? "#ffd861" : "#eefaff",
          marginBottom: 8,
          fontSize: 13,
        }}
      >
        {bloc.label}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
        <div><strong>Début :</strong> {fmtTime(bloc.start)}</div>
        <div><strong>Fin :</strong> {fmtTime(bloc.end)}</div>
        <div><strong>Cadence :</strong> {bloc.cadence}</div>
        <div><strong>100 % :</strong> {bloc.coupe100}</div>
        <div><strong>Minutes :</strong> {bloc.minutesTravaillees}</div>
        <div><strong>Cible réelle :</strong> {bloc.coupeCibleReelle}</div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 700 }}>Coupe cible (%)</div>
        <select
          style={yellowInputStyle(mobileCompact, true, true)}
          value={bloc.ciblePct}
          onChange={(e) => updateBloc(bloc.id, "ciblePct", e.target.value)}
        >
          {[70, 75, 80, 82, 85, 88, 90, 92, 95, 100].map((v) => (
            <option key={v} value={v}>
              {v} %
            </option>
          ))}
        </select>
      </div>

      {!bloc.isPrediction ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 700 }}>
            Coupe réelle cumulative
          </div>
          <input
            style={{
              ...yellowInputStyle(true, true, false),
              maxWidth: 140,
              display: "block",
              margin: "0 auto",
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={Number(bloc.coupeReelle || 0) > 0 ? String(Number(bloc.coupeReelle || 0)) : ""}
            placeholder={bloc.isEstimated ? String(Number(bloc.cumulActuel || 0)) : "0"}
            onChange={(e) => updateBloc(bloc.id, "coupeReelle", e.target.value)}
          />
          <div style={{ marginTop: 6, fontSize: 11, color: "#7f99ad" }}>
            Réel bloc : <strong>{reelBlocCell}</strong>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 700 }}>
            Cumul projeté fin de quart
          </div>
          <div style={{ textAlign: "center" }}>
            <NumberText size={24} weight={900}>
              {cumulCell}
            </NumberText>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "#7f99ad", textAlign: "center" }}>
            Bloc prévu : <strong>{reelBlocCell}</strong>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 8,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        <div>
          <div>Écart</div>
          <div style={{ color: ecartCell >= 0 ? "#8ef6a7" : "#ff4f67", fontSize: 16 }}>
            {ecartCell >= 0 ? `+${ecartCell}` : ecartCell}
          </div>
        </div>
        <div>
          <div>Efficacité</div>
          <div style={{ color: "#ffd84d", fontSize: 16 }}>
            {formatPercent(efficaciteCell)} %
          </div>
        </div>
      </div>
    </div>
  );
}



function HistoryTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const production = payload.find((p) => p.dataKey === "production")?.value ?? 0;
  const efficacite = payload.find((p) => p.dataKey === "efficacite")?.value ?? 0;

  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(5,16,31,0.98), rgba(3,11,22,0.98))",
        border: "1px solid rgba(74,190,255,0.22)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 0 24px rgba(0,0,0,0.45)",
        color: "#eefaff",
        fontFamily: UI_FONT,
      }}
    >
      <div
        style={{
          color: "#39e8ff",
          fontSize: 12,
          fontWeight: 900,
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      <div style={{ color: "#46dbff", fontSize: 12, fontWeight: 800 }}>
        Cochons produits : {production}
      </div>

      <div style={{ color: "#ffd84d", fontSize: 12, fontWeight: 800, marginTop: 4 }}>
        Efficacité % : {formatPercent(efficacite)} %
      </div>
    </div>
  );
}


function HistoryDot(props) {
  const { cx, cy, payload } = props;
  const color = performanceColor(payload?.efficacite);

  if (cx == null || cy == null) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={color}
      stroke="rgba(0,0,0,0.55)"
      strokeWidth={2}
    />
  );
}


function openHistoryGraphWindow(title, data) {
  const rows = Array.isArray(data) ? data : [];
  const safeTitle = String(title || "Historique").replace(/[<>&"']/g, (c) => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;"}[c]));

  const width = 1280;
  const height = 720;
  const pad = { left: 80, right: 80, top: 95, bottom: 95 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxProduction = Math.max(...rows.map((d) => Number(d.production || 0)), 1000);
  const maxLeft = Math.ceil(maxProduction / 500) * 500;
  const maxRight = 120;

  const xFor = (i) => pad.left + (rows.length <= 1 ? plotW / 2 : (i * plotW) / (rows.length - 1));
  const yLeft = (v) => pad.top + plotH - (Number(v || 0) / maxLeft) * plotH;
  const yRight = (v) => pad.top + plotH - (Number(v || 0) / maxRight) * plotH;

  const prodPoints = rows.map((d, i) => `${xFor(i)},${yLeft(d.production)}`).join(" ");
  const effPoints = rows.map((d, i) => `${xFor(i)},${yRight(d.efficacite)}`).join(" ");
  const avgProduction = rows.length ? Math.round(rows.reduce((s, d) => s + Number(d.production || 0), 0) / rows.length) : 0;
  const avgEff = rows.length ? rows.reduce((s, d) => s + Number(d.efficacite || 0), 0) / rows.length : 0;

  const grid = Array.from({ length: 6 }, (_, i) => {
    const y = pad.top + (i * plotH) / 5;
    const leftVal = Math.round(maxLeft - (i * maxLeft) / 5);
    const rightVal = Math.round(maxRight - (i * maxRight) / 5);
    return `
      <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(127,165,196,.14)" stroke-dasharray="5 7" />
      <text x="${pad.left - 18}" y="${y + 4}" text-anchor="end" fill="#8ea9bf" font-size="13" font-weight="800">${leftVal}</text>
      <text x="${width - pad.right + 18}" y="${y + 4}" text-anchor="start" fill="#ffd84d" font-size="13" font-weight="800">${rightVal}</text>`;
  }).join("");

  const labels = rows.map((d, i) => {
    const x = xFor(i);
    const date = String(d.date || "").replace(/[<>&"']/g, (c) => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;"}[c]));
    return `
      <text x="${x}" y="${height - 58}" text-anchor="middle" fill="#8ea9bf" font-size="12" font-weight="800">${date}</text>
      <circle cx="${x}" cy="${yLeft(d.production)}" r="5" fill="#46dbff" stroke="#00111f" stroke-width="2" />
      <circle cx="${x}" cy="${yRight(d.efficacite)}" r="5" fill="#ffd84d" stroke="#00111f" stroke-width="2" />`;
  }).join("");

  const body = rows.length ? `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#071d33"/><stop offset="1" stop-color="#020914"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="4" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="26" fill="url(#bg)" />
      <rect x="22" y="22" width="${width-44}" height="${height-44}" rx="22" fill="rgba(4,12,24,.55)" stroke="rgba(57,232,255,.20)" />
      <text x="42" y="58" fill="#39e8ff" font-size="24" font-weight="950" letter-spacing="2">${safeTitle.toUpperCase()}</text>
      <text x="42" y="82" fill="#8ea9bf" font-size="13" font-weight="800">Graphique seulement — production réelle et efficacité enregistrées</text>
      <text x="${width-380}" y="58" fill="#46dbff" font-size="16" font-weight="900">Moyenne cochons : ${avgProduction}</text>
      <text x="${width-380}" y="82" fill="#ffd84d" font-size="16" font-weight="900">Vitesse moyenne : ${avgEff.toFixed(1)} %</text>
      ${grid}
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="rgba(142,169,191,.42)" />
      <line x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="rgba(255,216,77,.35)" />
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="rgba(142,169,191,.30)" />
      <polyline points="${prodPoints}" fill="none" stroke="#46dbff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" />
      <polyline points="${effPoints}" fill="none" stroke="#ffd84d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" />
      ${labels}
      <circle cx="${width/2-130}" cy="${height-28}" r="6" fill="#46dbff"/><text x="${width/2-116}" y="${height-23}" fill="#d8f4ff" font-size="13" font-weight="900">Cochons produits</text>
      <circle cx="${width/2+55}" cy="${height-28}" r="6" fill="#ffd84d"/><text x="${width/2+69}" y="${height-23}" fill="#d8f4ff" font-size="13" font-weight="900">Efficacité %</text>
    </svg>` : `<div class="empty">Aucun historique enregistré.</div>`;

  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>${safeTitle}</title><style>
    html,body{margin:0;width:100%;height:100%;background:#020914;color:#eefaff;font-family:${UI_FONT};overflow:hidden;}
    .wrap{width:100vw;height:100vh;padding:14px;box-sizing:border-box;background:radial-gradient(circle at top right, rgba(57,232,255,.16), transparent 34%), #020914;}
    .empty{height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#7f99ad;border:1px solid rgba(57,232,255,.2);border-radius:24px;}
  </style></head><body><div class="wrap">${body}</div></body></html>`;

  const win = window.open("", "_blank", "width=1400,height=820");
  if (!win) {
    alert("La fenêtre a été bloquée par le navigateur. Autorise les pop-ups pour ouvrir le graphique.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}


function safeLoadHistoryImages() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_IMAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function resizeImageToDataUrl(file, maxWidth = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function HistoryChart({ title, data, onDelete, onClear, onCommentSave, compact = false }) {
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentStatus, setCommentStatus] = useState({});
  const [imageDrafts, setImageDrafts] = useState(() => safeLoadHistoryImages());
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    setCommentDrafts((prev) => {
      const next = { ...prev };
      data.forEach((row) => {
        if (next[row.id] === undefined) next[row.id] = row.commentaire || "";
      });
      return next;
    });
  }, [data]);

  async function handleSaveComment(row) {
    const value = commentDrafts[row.id] ?? "";
    setCommentStatus((prev) => ({ ...prev, [row.id]: "saving" }));

    const ok = await onCommentSave?.(row.id, value);

    setCommentStatus((prev) => ({ ...prev, [row.id]: ok === false ? "error" : "saved" }));

    setTimeout(() => {
      setCommentStatus((prev) => {
        const next = { ...prev };
        if (next[row.id] === "saved") delete next[row.id];
        return next;
      });
    }, 1800);
  }

  async function handleImageUpload(rowId, file) {
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      alert("Choisis un fichier image seulement.");
      return;
    }

    try {
      const imageData = await resizeImageToDataUrl(file);
      setImageDrafts((prev) => {
        const next = { ...prev, [rowId]: imageData };
        localStorage.setItem(HISTORY_IMAGE_KEY, JSON.stringify(next));
        return next;
      });
    } catch {
      alert("Impossible d'importer cette image.");
    }
  }

  function removeHistoryImage(rowId) {
    setImageDrafts((prev) => {
      const next = { ...prev };
      delete next[rowId];
      localStorage.setItem(HISTORY_IMAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const maxProduction = Math.max(...data.map((d) => Number(d.production || 0)), 100);

  const moyenneCochons =
    data.length > 0
      ? Math.round(data.reduce((s, d) => s + Number(d.production || 0), 0) / data.length)
      : 0;

  const moyenneEfficacite =
    data.length > 0
      ? data.reduce((s, d) => s + Number(d.efficacite || 0), 0) / data.length
      : 0;

  return (
    <div style={{ ...cardStyle, padding: compact ? 10 : 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#39e8ff", fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {title}
          </div>
          <div style={{ color: "#7f99ad", fontSize: 11, fontWeight: 700, marginTop: 4 }}>
            Production réelle + efficacité réelle enregistrées
          </div>
        </div>

        <button
          onClick={onClear}
          style={{
            height: 28,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,79,103,0.25)",
            background: "rgba(90,20,30,0.35)",
            color: "#ff97a6",
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Effacer ce quart
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "1fr 1fr",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            border: "1px solid rgba(74,190,255,0.14)",
            borderRadius: 14,
            padding: "12px 14px",
            background:
              "linear-gradient(180deg, rgba(8,22,40,0.72), rgba(4,12,24,0.86))",
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#d8f4ff",
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Moyenne cochons produits
          </div>
          <div
            style={{
              color: "#46dbff",
              fontSize: compact ? 20 : 24,
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.02em",
              lineHeight: 1,
              textAlign: "center",
              textShadow: "0 0 16px rgba(70,219,255,0.32)",
            }}
          >
            {moyenneCochons}
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,216,77,0.16)",
            borderRadius: 14,
            padding: "12px 14px",
            background:
              "linear-gradient(180deg, rgba(72,56,16,0.18), rgba(4,12,24,0.86))",
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#d8f4ff",
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Vitesse moyenne
          </div>
          <div
            style={{
              color: performanceColor(moyenneEfficacite),
              fontSize: compact ? 20 : 24,
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.02em",
              lineHeight: 1,
              textAlign: "center",
              textShadow: "0 0 16px rgba(255,216,77,0.26)",
            }}
          >
            {formatPercent(moyenneEfficacite)} %
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{ minHeight: 150, display: "flex", alignItems: "center", justifyContent: "center", color: "#7f99ad", fontSize: 12, fontWeight: 700, border: "1px dashed rgba(120,190,255,0.14)", borderRadius: 12 }}>
          Aucun historique enregistré.
        </div>
      ) : (
        <>
          <div style={{ height: compact ? 220 : 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="rgba(127,165,196,0.10)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#8ea9bf", fontSize: 11 }} />
                <YAxis yAxisId="left" domain={[0, Math.ceil(maxProduction / 500) * 500]} tick={{ fill: "#8ea9bf", fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 120]} tick={{ fill: "#ffd84d", fontSize: 11 }} />
                <Tooltip content={<HistoryTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#b8d2e3", paddingTop: 6 }} />
                <Area yAxisId="left" type="monotone" dataKey="production" name="Cochons produits" stroke="#46dbff" fill="#46dbff" fillOpacity={0.12} strokeWidth={2.5} />
                <Line yAxisId="right" type="monotone" dataKey="efficacite" name="Efficacité %" stroke="#ffd84d" strokeWidth={3} dot={<HistoryDot />} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#d8f4ff", textAlign: "left" }}>
                  <th style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.12)" }}>Date</th>
                  <th style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.12)" }}>Cochons</th>
                  <th style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.12)" }}>Efficacité</th>
                  <th style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.12)" }}>Référence</th>
                  <th style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.12)" }}>Commentaire</th>
                  <th style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.12)", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(-8).map((row) => (
                  <tr key={row.id} style={{ color: "#eefaff" }}>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.08)" }}>{row.date}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.08)", fontWeight: 900 }}>{row.production}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.08)", color: performanceColor(row.efficacite), fontWeight: 900 }}>{formatPercent(row.efficacite)} %</td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.08)", color: "#7f99ad" }}>{row.referenceBloc}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.08)", maxWidth: 560 }}>
                      <textarea
                        value={commentDrafts[row.id] ?? row.commentaire ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCommentDrafts((prev) => ({ ...prev, [row.id]: value }));
                          setCommentStatus((prev) => ({ ...prev, [row.id]: "dirty" }));
                        }}
                        placeholder="Écrire une note..."
                        rows={3}
                        style={{
                          width: "100%",
                          minHeight: 64,
                          resize: "vertical",
                          borderRadius: 9,
                          border: commentStatus[row.id] === "dirty"
                            ? "1px solid rgba(255,216,77,0.45)"
                            : "1px solid rgba(120,190,255,0.14)",
                          background: "rgba(6,18,34,0.82)",
                          color: "#eefaff",
                          padding: "8px 10px",
                          boxSizing: "border-box",
                          outline: "none",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: UI_FONT,
                        }}
                      />

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 8,
                        }}
                      >
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 30,
                            padding: "0 10px",
                            borderRadius: 8,
                            border: "1px solid rgba(57,232,255,0.30)",
                            background: "rgba(12,72,98,0.36)",
                            color: "#39e8ff",
                            fontSize: 11,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          📎 Importer image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(row.id, e.target.files?.[0])}
                            style={{ display: "none" }}
                          />
                        </label>

                        {imageDrafts[row.id] && (
                          <>
                            <button
                              onClick={() => removeHistoryImage(row.id)}
                              style={{
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 8,
                                border: "1px solid rgba(255,79,103,0.25)",
                                background: "rgba(90,20,30,0.35)",
                                color: "#ff97a6",
                                fontSize: 11,
                                fontWeight: 900,
                                cursor: "pointer",
                              }}
                            >
                              Retirer image
                            </button>

                            <button
                              onClick={() => setImagePreview(imageDrafts[row.id])}
                              style={{
                                height: 30,
                                padding: "0 10px",
                                borderRadius: 8,
                                border: "1px solid rgba(255,216,77,0.25)",
                                background: "rgba(90,68,14,0.35)",
                                color: "#ffd84d",
                                fontSize: 11,
                                fontWeight: 900,
                                cursor: "pointer",
                              }}
                            >
                              Ouvrir image
                            </button>
                          </>
                        )}
                      </div>

                      {imageDrafts[row.id] && (
                        <div
                          onClick={() => setImagePreview(imageDrafts[row.id])}
                          title="Cliquer pour agrandir"
                          style={{
                            marginTop: 8,
                            width: 120,
                            height: 74,
                            borderRadius: 10,
                            overflow: "hidden",
                            border: "1px solid rgba(120,190,255,0.18)",
                            background: "rgba(6,18,34,0.82)",
                            cursor: "pointer",
                          }}
                        >
                          <img
                            src={imageDrafts[row.id]}
                            alt="Pièce jointe"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        </div>
                      )}

                      <div style={{ marginTop: 5, minHeight: 14, color: commentStatus[row.id] === "saved" ? "#9df548" : commentStatus[row.id] === "error" ? "#ff4f67" : "#7f99ad", fontSize: 10, fontWeight: 800 }}>
                        {commentStatus[row.id] === "dirty" ? "Modification non enregistrée" : commentStatus[row.id] === "saving" ? "Sauvegarde..." : commentStatus[row.id] === "saved" ? "✔ Commentaire enregistré" : commentStatus[row.id] === "error" ? "Erreur sauvegarde" : ""}
                      </div>
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(74,190,255,0.08)", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        title="Enregistrer le commentaire"
                        aria-label="Enregistrer le commentaire"
                        onClick={() => handleSaveComment(row)}
                        disabled={commentStatus[row.id] === "saving"}
                        style={{
                          border: "1px solid rgba(157,245,72,0.28)",
                          background: "rgba(24,76,42,0.42)",
                          color: "#9df548",
                          borderRadius: 8,
                          height: 34,
                          width: 38,
                          fontSize: 18,
                          cursor: commentStatus[row.id] === "saving" ? "not-allowed" : "pointer",
                          marginRight: 8,
                          fontWeight: 800,
                        }}
                      >💾</button>
                      <button
                        title="Supprimer la ligne"
                        aria-label="Supprimer la ligne"
                        onClick={() => { removeHistoryImage(row.id); onDelete(row.id); }}
                        style={{ border: "1px solid rgba(255,79,103,0.25)", background: "rgba(90,20,30,0.35)", color: "#ff97a6", borderRadius: 8, height: 34, width: 38, fontSize: 18, cursor: "pointer" }}
                      >🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    {imagePreview && (
      <div
        onClick={() => setImagePreview(null)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(0,0,0,0.86)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            maxWidth: "94vw",
            maxHeight: "92vh",
            borderRadius: 16,
            border: "1px solid rgba(57,232,255,0.35)",
            background: "#020b16",
            padding: 12,
            boxShadow: "0 0 40px rgba(57,232,255,0.20)",
          }}
        >
          <button
            onClick={() => setImagePreview(null)}
            style={{
              position: "absolute",
              top: -14,
              right: -14,
              width: 36,
              height: 36,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.28)",
              background: "rgba(90,20,30,0.95)",
              color: "#fff",
              fontSize: 18,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ×
          </button>

          <img
            src={imagePreview}
            alt="Image commentaire"
            style={{
              maxWidth: "90vw",
              maxHeight: "86vh",
              objectFit: "contain",
              display: "block",
              borderRadius: 12,
            }}
          />
        </div>
      </div>
    )}
  </div>
  );
}


function HistoryGraphOnly({ title, data, compact = false }) {
  const maxProduction = Math.max(...data.map((d) => Number(d.production || 0)), 100);

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#020b16", padding: 18, boxSizing: "border-box" }}>
      <div style={{ ...cardStyle, height: "calc(100vh - 36px)", padding: 18, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: "#39e8ff", fontSize: 22, fontWeight: 900, textTransform: "uppercase" }}>{title}</div>
          <button onClick={() => { navigateRoute("/"); }}>← Retour dashboard</button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 42, left: 12, bottom: 48 }}>
              <CartesianGrid stroke="rgba(127,165,196,0.10)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#8ea9bf", fontSize: 12 }} />
              <YAxis yAxisId="left" domain={[0, Math.ceil(maxProduction / 500) * 500]} tick={{ fill: "#8ea9bf", fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 120]} tick={{ fill: "#ffd84d", fontSize: 12 }} />
              <Tooltip content={<HistoryTooltip />} />
              <Legend wrapperStyle={{ fontSize: 13, color: "#b8d2e3", paddingTop: 12 }} />
              <Area yAxisId="left" type="monotone" dataKey="production" name="Cochons produits" stroke="#46dbff" fill="#46dbff" fillOpacity={0.12} strokeWidth={3} />
              <Line yAxisId="right" type="monotone" dataKey="efficacite" name="Efficacité %" stroke="#ffd84d" strokeWidth={3.5} dot={<HistoryDot />} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}


function formatValue(val) {
  if (val === "" || val === null || val === undefined) return "0";
  const num = Number(String(val).replace(",", "."));
  if (!Number.isFinite(num)) return "0";
  return String(val);
}


function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAuth(e) {
    e.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase n'est pas configuré. Vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.");
      return;
    }

    setLoading(true);

    const result = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setLoading(false);

    if (result.error) {
      const msg = result.error.message || "Connexion refusée";

      if (msg === "Invalid login credentials") {
        setMessage("Courriel ou mot de passe invalide.");
        return;
      }

      setMessage(
        msg === "Failed to fetch"
          ? `Failed to fetch — vérifie VITE_SUPABASE_URL dans Vercel. URL utilisée : ${SUPABASE_URL || "VIDE"}`
          : msg
      );
      return;
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 50% 0%, rgba(0,200,255,0.08), transparent 34%), #000",
        display: "grid",
        placeItems: "center",
        padding: 20,
        fontFamily: UI_FONT,
        color: "#eefaff",
      }}
    >
      <form
        onSubmit={handleAuth}
        style={{
          width: "min(460px, 100%)",
          background:
            "linear-gradient(180deg, rgba(5,16,31,0.98), rgba(3,11,22,0.98))",
          border: "1px solid rgba(74,190,255,0.20)",
          borderRadius: 22,
          padding: 24,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Dashboard Production
        </div>

        <div style={{ color: "#7f99ad", fontSize: 13, fontWeight: 700, marginBottom: 22 }}>
          Connexion sécurisée — accès autorisé seulement
        </div>

        <label style={{ display: "grid", gap: 6, marginBottom: 12, fontWeight: 800 }}>
          Courriel
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            required
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(74,190,255,0.18)",
              background: "rgba(6,18,34,0.88)",
              color: "#eefaff",
              padding: "0 12px",
              fontWeight: 800,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6, marginBottom: 16, fontWeight: 800 }}>
          Mot de passe
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(74,190,255,0.18)",
              background: "rgba(6,18,34,0.88)",
              color: "#eefaff",
              padding: "0 12px",
              fontWeight: 800,
            }}
          />
        </label>

        {message ? (
          <div
            style={{
              color: "#ff97a6",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            height: 46,
            borderRadius: 14,
            border: "1px solid rgba(74,190,255,0.35)",
            background:
              "linear-gradient(180deg, rgba(34,93,128,0.95), rgba(10,42,67,0.95))",
            color: "#fff",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
            marginBottom: 10,
          }}
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        <div
          style={{
            minHeight: 38,
            borderRadius: 12,
            border: "1px solid rgba(255,216,77,0.20)",
            background: "rgba(72,56,16,0.28)",
            color: "#ffd84d",
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 10px",
            fontSize: 12,
          }}
        >
          Accès créé seulement par l'administrateur
        </div>
      </form>
    </div>
  );
}


export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const boot = useMemo(() => safeLoad(), []);
  const [shift, setShift] = useState(boot.shift);
  const [stateByShift, setStateByShift] = useState(boot.data);
  const [clockMode, setClockMode] = useState("real"); // real | simulated
  const [manualTime, setManualTime] = useState(dateToHHMM(new Date()));
  const [effectiveNow, setEffectiveNow] = useState(new Date());
  const [clock, setClock] = useState(currentClock());
  const [clockPaused, setClockPaused] = useState(false);
  const [pausedNow, setPausedNow] = useState(null);
  const [showPeriodes, setShowPeriodes] = useState(true);
  const [showIndicatorsPanel, setShowIndicatorsPanel] = useState(true);
  const [showBlocTable, setShowBlocTable] = useState(true);
  const [factoryMode, setFactoryMode] = useState(false);
  const [zoom, setZoom] = useState(1.1);
  const [visibleKpis, setVisibleKpis] = useState(safeLoadKpiVisibility);
  const [kpiOrder, setKpiOrder] = useState(safeLoadKpiOrder);
  const [history, setHistory] = useState(safeLoadHistory);
  const [saveDate, setSaveDate] = useState(todayISO());
  const [manualProduction, setManualProduction] = useState("");
  const [manualEfficiency, setManualEfficiency] = useState("");
  const [manualComment, setManualComment] = useState("");
  const [draggedKpi, setDraggedKpi] = useState(null);
  const [dashboardCloudLoaded, setDashboardCloudLoaded] = useState(false);
  const sessionRef = useRef(null);
  const saveDashboardTimerRef = useRef(null);
  const dashboardCloudLoadedRef = useRef(false);
  const { isMobile, isTablet } = useResponsive();

  const inputStyle = normalInputStyle(isMobile);

  const mobileCompact = false; // Vue desktop forcée sur cellulaire pour permettre le zoom/pinch
  const sectionPadding = mobileCompact ? 10 : 12;
  const gapMain = mobileCompact ? 8 : 12;
  const titleSize = mobileCompact ? 14 : 18;
  const clockSize = mobileCompact ? 16 : 24;
  const chartHeight = mobileCompact ? 220 : isTablet ? 240 : 260;
  const [route, setRoute] = useState(() => window.location.pathname);

  function navigateRoute(path) {
    window.history.pushState({}, "", path);
    setRoute(path);
  }

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    dashboardCloudLoadedRef.current = dashboardCloudLoaded;
  }, [dashboardCloudLoaded]);

  useEffect(() => {
    return () => {
      if (saveDashboardTimerRef.current) {
        clearTimeout(saveDashboardTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    async function initAuth() {
      // Sécurité poste partagé :
      // À chaque ouverture / rafraîchissement, on efface l'ancienne session sauvegardée.
      // La session reste active seulement tant que la page actuelle reste ouverte.
      clearSupabaseAuthStorage();

      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(data?.session || null);
      setAuthLoading(false);
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    let viewport = document.querySelector('meta[name="viewport"]');

    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.setAttribute("name", "viewport");
      document.head.appendChild(viewport);
    }

    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=5, user-scalable=yes"
    );
  }, []);

  useEffect(() => {
    if (clockPaused) return undefined;

    if (clockMode === "real") {
      const updateRealClock = () => {
        const now = new Date();
        setEffectiveNow(now);
        setClock(clockFromDate(now));
      };

      updateRealClock();
      const id = setInterval(updateRealClock, 1000);
      return () => clearInterval(id);
    }

    const simulatedStart = makeDateFromHHMM(manualTime);
    setEffectiveNow(simulatedStart);
    setClock(clockFromDate(simulatedStart));

    const id = setInterval(() => {
      setEffectiveNow((prev) => {
        const next = new Date((prev || simulatedStart).getTime() + 1000);
        setClock(clockFromDate(next));
        return next;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [clockPaused, clockMode, manualTime]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ shift, data: stateByShift }));
    } catch {
      // no-op
    }
  }, [shift, stateByShift]);

  useEffect(() => {
    try {
      localStorage.setItem(KPI_VISIBILITY_KEY, JSON.stringify(visibleKpis));
    } catch {
      // no-op
    }
  }, [visibleKpis]);

  useEffect(() => {
    try {
      localStorage.setItem(KPI_ORDER_KEY, JSON.stringify(kpiOrder));
    } catch {
      // no-op
    }
  }, [kpiOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // no-op
    }
  }, [history]);

  async function loadDashboardStateFromSupabase() {
    if (!supabase || !session?.user) {
      setDashboardCloudLoaded(true);
      dashboardCloudLoadedRef.current = true;
      return;
    }

    const { data, error } = await supabase
      .from(DASHBOARD_STATE_TABLE)
      .select("state")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("Erreur lecture état dashboard Supabase :", error.message);
      setDashboardCloudLoaded(true);
      dashboardCloudLoadedRef.current = true;
      return;
    }

    const cloudState = data?.state;

    if (
      cloudState &&
      (cloudState.shift === "jour" || cloudState.shift === "soir") &&
      cloudState.data?.jour &&
      cloudState.data?.soir
    ) {
      setShift(cloudState.shift);
      setStateByShift(cloudState.data);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudState));
      } catch {
        // no-op
      }
    }

    setDashboardCloudLoaded(true);
    dashboardCloudLoadedRef.current = true;
  }

  async function saveDashboardStateToSupabase(nextShift, nextData, delay = 350) {
    const activeSession = sessionRef.current;

    if (!supabase || !activeSession?.user || !dashboardCloudLoadedRef.current) {
      return;
    }

    if (saveDashboardTimerRef.current) {
      clearTimeout(saveDashboardTimerRef.current);
    }

    saveDashboardTimerRef.current = setTimeout(async () => {
      const payload = {
        user_id: activeSession.user.id,
        state: { shift: nextShift, data: nextData },
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from(DASHBOARD_STATE_TABLE)
        .upsert(payload, { onConflict: "user_id" });

      if (error) {
        console.error("Erreur sauvegarde dashboard_state Supabase :", error.message);
        window.__dashboardSyncLastError = error.message;
      } else {
        window.__dashboardSyncLastSave = payload.updated_at;
      }
    }, delay);
  }

  function changeShift(nextShift) {
    setShift(nextShift);
    saveDashboardStateToSupabase(nextShift, stateByShift, 0);
  }

  async function loadHistoryFromSupabase() {
    if (!supabase || !session?.user) return;

    const { data, error } = await supabase
      .from("production_history")
      .select("*")
      .eq("user_id", session.user.id)
      .order("date", { ascending: true });

    if (error) {
      alert("Erreur lecture Supabase : " + error.message);
      return;
    }

    setHistory((data || []).map(mapHistoryRow).sort(sortByDateAsc));
  }

  useEffect(() => {
    setDashboardCloudLoaded(false);
    loadDashboardStateFromSupabase();
    loadHistoryFromSupabase();
  }, [session?.user?.id]);

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setDashboardCloudLoaded(false);
    setSession(null);
  }

  const current = stateByShift[shift];
  const validation = useMemo(() => validatePeriodes(current.periodes), [current.periodes]);

  function toggleKpi(key) {
    setVisibleKpis((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const kpiLabelByKey = useMemo(
    () => Object.fromEntries(KPI_OPTIONS.map(([key, label]) => [key, label])),
    []
  );

  function moveKpi(key, direction) {
    setKpiOrder((prev) => {
      const index = prev.indexOf(key);
      if (index < 0) return prev;

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;

      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  function moveKpiToTop(key) {
    setKpiOrder((prev) => {
      const copy = prev.filter((item) => item !== key);
      return [key, ...copy];
    });
  }

  function moveKpiToBottom(key) {
    setKpiOrder((prev) => {
      const copy = prev.filter((item) => item !== key);
      return [...copy, key];
    });
  }

  function moveKpiToPosition(key, targetIndex) {
    setKpiOrder((prev) => {
      const currentIndex = prev.indexOf(key);
      if (currentIndex < 0) return prev;

      const copy = prev.filter((item) => item !== key);
      const safeIndex = Math.max(0, Math.min(targetIndex, copy.length));
      copy.splice(safeIndex, 0, key);
      return copy;
    });
  }

  function handleKpiDrop(targetKey) {
    if (!draggedKpi || draggedKpi === targetKey) {
      setDraggedKpi(null);
      return;
    }

    const targetIndex = kpiOrder.indexOf(targetKey);
    moveKpiToPosition(draggedKpi, targetIndex);
    setDraggedKpi(null);
  }

  function resetKpiOrder() {
    setKpiOrder(KPI_OPTIONS.map(([key]) => key));
  }

  function updateShiftData(patch) {
    setStateByShift((prev) => {
      const nextData = {
        ...prev,
        [shift]: { ...prev[shift], ...patch },
      };

      saveDashboardStateToSupabase(shift, nextData);
      return nextData;
    });
  }

  function toggleClockPause() {
    if (clockPaused) {
      setClockPaused(false);
      setPausedNow(null);
      return;
    }

    const freeze = effectiveNow;
    setPausedNow(freeze);
    setClockPaused(true);
    setClock(clockFromDate(freeze));
  }

  function updatePeriode(id, key, value) {
    updateShiftData({
      periodes: current.periodes.map((p) =>
        p.id === id
          ? {
              ...p,
              [key]: key === "cadence" ? normalizeIntegerInput(value) : value,
            }
          : p
      ),
    });
  }

  function deletePeriode(id) {
    updateShiftData({
      periodes: current.periodes.filter((p) => p.id !== id),
    });
  }

  function addPeriode() {
    const nextId = Math.max(...current.periodes.map((p) => p.id), 0) + 1;
    const last = current.periodes[current.periodes.length - 1];
    updateShiftData({
      periodes: [
        ...current.periodes,
        {
          id: nextId,
          type: "Production",
          start: last?.end || "00:00",
          end: last?.end || "00:00",
          cadence: 0,
        },
      ],
    });
  }

  function addPeriodeAfter(id) {
    const index = current.periodes.findIndex((p) => p.id === id);
    const nextId = Math.max(...current.periodes.map((p) => p.id), 0) + 1;
    const base = current.periodes[index];
    const newRow = {
      id: nextId,
      type: "Production",
      start: base?.end || "00:00",
      end: base?.end || "00:00",
      cadence: base?.cadence || 0,
    };

    const copy = [...current.periodes];
    copy.splice(index + 1, 0, newRow);
    updateShiftData({ periodes: copy });
  }

  function updateBloc(id, key, value) {
    updateShiftData({
      blocs: current.blocs.map((b) =>
        b.id === id
          ? {
              ...b,
              [key]:
                key === "coupeReelle" || key === "ciblePct"
                  ? normalizeIntegerInput(value)
                  : Number(value),
            }
          : b
      ),
    });
  }

  function resetCurrentShift() {
    const ok = window.confirm("Souhaites-tu vraiment réinitialiser les données du quart actuel ?");
    if (!ok) return;

    updateShiftData({
      objectifReel: 0,
      productionReelle: 0,
      periodes: current.periodes.map((p) => ({
        ...p,
        cadence: 0,
      })),
      blocs: current.blocs.map((b) => ({
        ...b,
        coupeReelle: 0,
        ciblePct: 92,
      })),
    });
  }

  function toggleFactoryMode() {
    setFactoryMode((prev) => !prev);

    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    } catch {
      // Plein écran non disponible
    }
  }

  function zoomOut() {
    setZoom((z) => Math.max(0.8, Number((z - 0.05).toFixed(2))));
  }

  function zoomIn() {
    setZoom((z) => Math.min(1.2, Number((z + 0.05).toFixed(2))));
  }

  function resetZoom() {
    setZoom(1.1);
  }

  const baseCanvasWidth = 1600;

  const sourcesBlocsProduction = useMemo(
    () => buildProductionBlocSources(current.periodes),
    [current.periodes]
  );

  const blocsCalcules = useMemo(() => {
    let previousCumul = 0;
    let totalRealSaisi = 0;
    let total100Saisi = 0;

    return current.blocs.map((bloc, index) => {
      const sourceBloc = sourcesBlocsProduction[index];
      const start = sourceBloc ? sourceBloc.start : "00:00";
      const end = sourceBloc ? sourceBloc.end : "00:00";
      const cadence = sourceBloc ? Number(sourceBloc.cadence) : 0;

      const minutesTravaillees = sourceBloc ? Number(sourceBloc.minutesTravaillees || 0) : 0;
      const coupe100 = sourceBloc ? Number(sourceBloc.coupe100 || 0) : 0;
      const coupeCibleReelle = round(coupe100 * (bloc.ciblePct / 100));
      const moyenneEfficaciteActuelle = total100Saisi > 0 ? (totalRealSaisi / total100Saisi) * 100 : 0;

      if (bloc.isPrediction) {
        // 5e bloc = synthèse/prévision.
        // Son efficacité réelle affichée = moyenne réelle des blocs déjà saisis.
        // Exemple : si les blocs 1 à 4 sont remplis, l'efficacité du 5e = moyenne réelle des 4 blocs.
        const reelBloc = coupe100 > 0 ? round(coupe100 * (moyenneEfficaciteActuelle / 100)) : 0;
        const cumulActuel = previousCumul + reelBloc;

        return {
          ...bloc,
          start,
          end,
          cadence,
          minutesTravaillees,
          coupe100,
          coupeCibleReelle,
          cumulActuel,
          cumulPrecedent: previousCumul,
          reelBloc,
          efficaciteReelle: moyenneEfficaciteActuelle,
          efficaciteReelleAffichee: moyenneEfficaciteActuelle,
          ecartDeCoupe: reelBloc - coupeCibleReelle,
          ecartDeCoupeAffiche: reelBloc - coupeCibleReelle,
          hasRealInput: false,
          isEstimated: true,
          isAverageSummary: true,
        };
      }

      const hasRealInput = Number(bloc.coupeReelle || 0) > 0;

      let cumulActuel;
      let reelBloc;
      let isEstimated = false;

      if (hasRealInput) {
        cumulActuel = Number(bloc.coupeReelle || 0);
        reelBloc = Math.max(0, cumulActuel - previousCumul);
      } else if (moyenneEfficaciteActuelle > 0 && coupe100 > 0) {
        reelBloc = round(coupe100 * (moyenneEfficaciteActuelle / 100));
        cumulActuel = previousCumul + reelBloc;
        isEstimated = true;
      } else {
        cumulActuel = previousCumul;
        reelBloc = 0;
      }

      const efficaciteReelle = coupe100 > 0 ? (reelBloc / coupe100) * 100 : 0;
      const ecartDeCoupe = reelBloc - coupeCibleReelle;

      if (hasRealInput) {
        totalRealSaisi += reelBloc;
        total100Saisi += coupe100;
      }

      const result = {
        ...bloc,
        start,
        end,
        cadence,
        minutesTravaillees,
        coupe100,
        coupeCibleReelle,
        cumulActuel,
        cumulPrecedent: previousCumul,
        reelBloc,
        efficaciteReelle,
        ecartDeCoupe,
        hasRealInput,
        isEstimated,
      };

      previousCumul = cumulActuel;
      return result;
    });
  }, [current.blocs, sourcesBlocsProduction]);

  const efficacitePonderee = useMemo(
    () => weightedEfficiency(blocsCalcules),
    [blocsCalcules]
  );

  const predictionDernierBloc = useMemo(() => {
    const pred = blocsCalcules.find((b) => b.isPrediction);
    if (!pred) return 0;
    return round(pred.coupe100 * (efficacitePonderee / 100));
  }, [blocsCalcules, efficacitePonderee]);

  const blocsAffiches = useMemo(() => blocsCalcules, [blocsCalcules]);

  const heureFinQuartOfficielle = shift === "jour" ? "15:00" : "23:57";

  const objectifTotalTheorique = useMemo(
    () => blocsAffiches.reduce((s, b) => s + Number(b.coupe100 || 0), 0),
    [blocsAffiches]
  );

  const projectionFinQuart = Number(
    blocsAffiches[blocsAffiches.length - 1]?.cumulActuel || 0
  );

  const restantAProduire = Math.max(
    0,
    Number(current.objectifReel) - Number(current.productionReelle)
  );

  const ecartProjectionObjectif = projectionFinQuart - Number(current.objectifReel || 0);

  const statutUsine =
    ecartProjectionObjectif >= 0
      ? "EN AVANCE"
      : ecartProjectionObjectif >= -150
      ? "À SURVEILLER"
      : "EN RETARD";

  const statutUsineColor =
    statutUsine === "EN AVANCE"
      ? "#9df548"
      : statutUsine === "À SURVEILLER"
      ? "#ffd84d"
      : "#ff4f67";

  const alerteDerive =
    ecartProjectionObjectif >= 0
      ? "Aucune dérive"
      : ecartProjectionObjectif >= -150
      ? "Dérive légère"
      : "Dérive importante";

  const ecartActuel = current.productionReelle - current.objectifReel;
  const minutesTotales = totalWorkMinutes(current.periodes);

  const activeNow = clockPaused && pausedNow ? pausedNow : effectiveNow;
  const nowMinutes = activeNow.getHours() * 60 + activeNow.getMinutes();
  const heureFinEstimee = estimateFinishTime(
    current.periodes,
    nowMinutes,
    restantAProduire,
    efficacitePonderee
  );

  const theoriqueDepuisDebutQuart = round(
    theoreticalUntilNow(current.periodes, nowMinutes)
  );

  const efficaciteDepuisDebutQuart =
    theoriqueDepuisDebutQuart > 0
      ? (Number(current.productionReelle || 0) / theoriqueDepuisDebutQuart) * 100
      : 0;

  const efficaciteTheoriqueReel =
    theoriqueDepuisDebutQuart > 0
      ? (Number(current.productionReelle || 0) / theoriqueDepuisDebutQuart) * 100
      : 0;

  const efficaciteTheoriqueReelColor =
    efficaciteTheoriqueReel >= 100
      ? "#9df548"
      : efficaciteTheoriqueReel >= 95
      ? "#ffd84d"
      : "#ff4f67";

  const chartData = useMemo(() => {
    let theoriqueCum = 0;

    return blocsAffiches.map((b) => {
      theoriqueCum += Number(b.coupeCibleReelle || 0);
      return {
        time: b.end,
        reel: Number(b.cumulActuel || 0),
        theorique: theoriqueCum,
      };
    });
  }, [blocsAffiches]);

  const chartMax = Math.max(
    objectifTotalTheorique,
    ...chartData.map((d) => d.reel),
    ...chartData.map((d) => d.theorique),
    100
  );

  const efficiencyBlockIndex = shift === "soir" ? 3 : 2;
  const referenceBloc = blocsAffiches[efficiencyBlockIndex];
  const efficaciteReference =
    referenceBloc && Number(referenceBloc.coupe100 || 0) > 0
      ? Number(referenceBloc.efficaciteReelle || referenceBloc.efficaciteReelleAffichee || 0)
      : 0;

  useEffect(() => {
    setManualProduction(String(Number(current.productionReelle || 0)));
    setManualEfficiency(efficaciteReference ? formatPercent(efficaciteReference) : "0.0");
  }, [shift, current.productionReelle, efficaciteReference]);

  const historyJour = useMemo(
    () => history.filter((h) => h.shift === "jour").sort(sortByDateAsc),
    [history]
  );

  const historySoir = useMemo(
    () => history.filter((h) => h.shift === "soir").sort(sortByDateAsc),
    [history]
  );

  async function saveHistoryEntry() {
    const productionValue = normalizeIntegerInput(manualProduction);
    const efficiencyValue = Number(String(manualEfficiency).replace(",", "."));

    if (!saveDate) {
      alert("Choisis une date avant d'enregistrer.");
      return;
    }

    if (!Number.isFinite(efficiencyValue)) {
      alert("Entre une efficacité réelle valide.");
      return;
    }

    const entry = {
      id: `${saveDate}-${shift}`,
      date: saveDate,
      shift,
      production: productionValue,
      efficacite: Number(formatPercent(efficiencyValue)),
      referenceBloc: "Saisie manuelle",
      commentaire: manualComment.trim(),
      savedAt: new Date().toISOString(),
    };

    if (supabase && session?.user) {
      const payload = {
        user_id: session.user.id,
        date: entry.date,
        shift: entry.shift,
        production: entry.production,
        efficacite: entry.efficacite,
        reference_bloc: entry.referenceBloc,
        commentaire: entry.commentaire,
        saved_at: entry.savedAt,
      };

      const { error } = await supabase
        .from("production_history")
        .upsert(payload, { onConflict: "user_id,date,shift" });

      if (error) {
        alert("Erreur sauvegarde Supabase : " + error.message);
        return;
      }

      setManualComment("");
      await loadHistoryFromSupabase();
      return;
    }

    setHistory((prev) => {
      const clean = prev.filter((item) => !(item.date === entry.date && item.shift === entry.shift));
      return [...clean, entry].sort(sortByDateAsc);
    });
    setManualComment("");
  }

  async function updateHistoryComment(id, commentaire) {
    if (supabase && session?.user) {
      const { error } = await supabase
        .from("production_history")
        .update({ commentaire })
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) {
        alert("Erreur sauvegarde commentaire Supabase : " + error.message);
        await loadHistoryFromSupabase();
        return false;
      }
    }

    setHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, commentaire } : item))
    );

    return true;
  }

  async function deleteHistoryEntry(id) {
    const ok = window.confirm("Souhaites-tu vraiment supprimer cette entrée de l'historique ?");
    if (!ok) return;

    if (supabase && session?.user) {
      const { error } = await supabase
        .from("production_history")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) {
        alert("Erreur suppression Supabase : " + error.message);
        return;
      }

      await loadHistoryFromSupabase();
      return;
    }

    setHistory((prev) => prev.filter((item) => item.id !== id));
  }

  async function clearHistoryForShift(targetShift) {
    const label = targetShift === "jour" ? "quart de jour" : "quart de soir";
    const ok = window.confirm(`Souhaites-tu vraiment effacer tout l'historique du ${label} ?`);
    if (!ok) return;

    if (supabase && session?.user) {
      const { error } = await supabase
        .from("production_history")
        .delete()
        .eq("user_id", session.user.id)
        .eq("shift", targetShift);

      if (error) {
        alert("Erreur suppression Supabase : " + error.message);
        return;
      }

      await loadHistoryFromSupabase();
      return;
    }

    setHistory((prev) => prev.filter((item) => item.shift !== targetShift));
  }

  function renderKpiCard(key) {
    if (!visibleKpis[key]) return null;

    const common = { compact: mobileCompact };

    switch (key) {
      case "productionActuelle":
        return (
          <KPI
            key={key}
            title="Production actuelle"
            value={current.productionReelle}
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

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#000",
          color: "#eefaff",
          fontFamily: UI_FONT,
          fontWeight: 900,
        }}
      >
        Chargement sécurisé...
      </div>
    );
  }


  const currentPath = route;

  if (currentPath === "/historique-jour") {
    return (
      <div
        style={{
          width: "100%",
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top right, rgba(57,232,255,0.12), transparent 32%), #020b16",
          padding: mobileCompact ? 10 : 18,
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => { navigateRoute("/"); }}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 12,
              border: "1px solid rgba(57,232,255,0.35)",
              background: "linear-gradient(180deg, rgba(12,72,98,0.88), rgba(5,25,45,0.96))",
              color: "#39e8ff",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 0 18px rgba(57,232,255,0.12)",
              fontFamily: UI_FONT,
            }}
          >
            ← Retour dashboard
          </button>
        </div>

        <HistoryChart
          title="Historique quart de jour"
          data={[...historyJour].sort(sortByDateAsc)}
          onDelete={deleteHistoryEntry}
          onClear={() => clearHistoryForShift("jour")}
          onCommentSave={updateHistoryComment}
          compact={false}
        />
      </div>
    );
  }

  if (currentPath === "/historique-soir") {
    return (
      <div
        style={{
          width: "100%",
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top right, rgba(255,216,77,0.10), transparent 32%), #020b16",
          padding: mobileCompact ? 10 : 18,
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => { navigateRoute("/"); }}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 12,
              border: "1px solid rgba(57,232,255,0.35)",
              background: "linear-gradient(180deg, rgba(12,72,98,0.88), rgba(5,25,45,0.96))",
              color: "#39e8ff",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 0 18px rgba(57,232,255,0.12)",
              fontFamily: UI_FONT,
            }}
          >
            ← Retour dashboard
          </button>
        </div>

        <HistoryChart
          title="Historique quart de soir"
          data={[...historySoir].sort(sortByDateAsc)}
          onDelete={deleteHistoryEntry}
          onClear={() => clearHistoryForShift("soir")}
          onCommentSave={updateHistoryComment}
          compact={false}
        />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <>
      <style>
        {`
          * {
            font-family: ${UI_FONT};
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }

          input, select, button {
            font-family: ${UI_FONT} !important;
          }

          input[type="date"]::-webkit-calendar-picker-indicator {
            opacity: 1;
            cursor: pointer;
            filter: invert(87%) sepia(83%) saturate(589%) hue-rotate(348deg) brightness(105%) contrast(101%);
          }

          @keyframes gridDrift {
            0% { transform: translate3d(0, 0, 0); opacity: 0.55; }
            50% { opacity: 0.82; }
            100% { transform: translate3d(42px, 28px, 0); opacity: 0.55; }
          }

          @keyframes scanLine {
            0% { transform: translateX(-120%); opacity: 0; }
            15% { opacity: 0.65; }
            55% { opacity: 0.65; }
            100% { transform: translateX(120%); opacity: 0; }
          }

          @keyframes pulseGlow {
            0%, 100% { opacity: 0.25; transform: scale(1); }
            50% { opacity: 0.55; transform: scale(1.08); }
          }

          @keyframes radarSweep {
            0% { transform: rotate(0deg); opacity: 0.22; }
            100% { transform: rotate(360deg); opacity: 0.22; }
          }

          .wow-panel {
            position: relative;
          }

          .wow-panel::before {
            content: "";
            position: absolute;
            left: 18px;
            right: 18px;
            top: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(57,232,255,0.95), transparent);
            opacity: 0.75;
            pointer-events: none;
            animation: scanLine 5.5s ease-in-out infinite;
          }

          option {
            font-family: ${UI_FONT};
            font-weight: 700;
          }
        `}
      </style>

      <div
        style={{
          position: "fixed",
          top: 12,
          right: 14,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid rgba(255,79,103,0.35)",
          background: "rgba(8,15,28,0.92)",
          boxShadow: "0 0 22px rgba(0,0,0,0.45)",
          fontFamily: UI_FONT,
        }}
      >
        <span
          title="Connecté"
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "#9df548",
            boxShadow: "0 0 10px rgba(157,245,72,0.85)",
          }}
        />
        <span
          style={{
            color: "#d8f4ff",
            fontSize: 11,
            fontWeight: 900,
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session?.user?.email}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 9,
            border: "1px solid rgba(255,79,103,0.45)",
            background: "linear-gradient(180deg, rgba(120,24,42,0.85), rgba(70,15,26,0.9))",
            color: "#fff",
            fontSize: 11,
            fontWeight: 900,
            cursor: "pointer",
            fontFamily: UI_FONT,
          }}
        >
          Déconnexion
        </button>
      </div>

      <div
      style={{
        minHeight: "100vh",
        position: "relative",
        isolation: "isolate",
        background:
          "radial-gradient(circle at 18% 8%, rgba(0,220,255,0.16), transparent 24%), radial-gradient(circle at 82% 14%, rgba(255,216,77,0.08), transparent 20%), radial-gradient(circle at 50% 72%, rgba(30,90,255,0.10), transparent 34%), linear-gradient(180deg, #020711 0%, #00040a 52%, #020914 100%)",
        color: "#eefaff",
        fontFamily: UI_FONT,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        textSizeAdjust: "100%",
        fontVariantNumeric: "tabular-nums",
        padding: isMobile ? 4 : factoryMode ? 4 : 8,
        overflowX: "auto",
        overflowY: "auto",
        touchAction: "pan-x pan-y pinch-zoom",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -3,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(57,232,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(57,232,255,0.07) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage: "linear-gradient(180deg, transparent 0%, #000 12%, #000 82%, transparent 100%)",
          animation: "gridDrift 18s linear infinite",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          width: 520,
          height: 520,
          right: -160,
          top: -150,
          zIndex: -2,
          pointerEvents: "none",
          borderRadius: "50%",
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(57,232,255,0.22) 45deg, transparent 92deg, transparent 360deg)",
          filter: "blur(1px)",
          animation: "radarSweep 14s linear infinite",
          opacity: 0.28,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "8%",
          bottom: "10%",
          width: 420,
          height: 420,
          zIndex: -2,
          pointerEvents: "none",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(57,232,255,0.18), transparent 62%)",
          filter: "blur(18px)",
          animation: "pulseGlow 7s ease-in-out infinite",
        }}
      />
      <div
        style={{
          width: baseCanvasWidth * zoom,
          minWidth: baseCanvasWidth * zoom,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className="wow-panel"
          style={{
            ...shellStyle,
            width: baseCanvasWidth,
            maxWidth: factoryMode ? "100%" : baseCanvasWidth,
            minWidth: baseCanvasWidth,
            borderRadius: factoryMode ? 0 : shellStyle.borderRadius,
          }}
        >
        <div style={{ padding: mobileCompact ? 8 : 12 }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 300,
              background:
                "linear-gradient(180deg, rgba(2,9,18,0.94) 0%, rgba(3,12,24,0.88) 78%, rgba(0,0,0,0.56) 100%)",
              paddingBottom: 10,
              backdropFilter: "blur(8px)",
            }}
          >
          <div
            style={{
              marginBottom: 10,
              padding: mobileCompact ? 10 : 14,
              borderRadius: 20,
              border: "1px solid rgba(74,190,255,0.18)",
              background:
                "linear-gradient(135deg, rgba(4,14,27,0.98) 0%, rgba(3,9,18,0.98) 55%, rgba(5,20,32,0.95) 100%)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.025) inset, 0 16px 40px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: mobileCompact ? "1fr" : "1.35fr 0.8fr",
                gap: 14,
                alignItems: "stretch",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: mobileCompact ? 110 : 124,
                  padding: mobileCompact ? 12 : 16,
                  borderRadius: 18,
                  background:
                    "linear-gradient(180deg, rgba(8,22,40,0.78), rgba(4,12,24,0.92))",
                  border: "1px solid rgba(74,190,255,0.12)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: mobileCompact ? 18 : 24,
                      fontWeight: 900,
                      letterSpacing: "0.035em",
                      textTransform: "uppercase",
                      lineHeight: 1,
                      fontFamily: UI_FONT,
                    }}
                  >
                    Dashboard Production
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "#8ea9bf",
                      fontSize: mobileCompact ? 11 : 12,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Cadence • Volume • Efficacité • Projection
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <Btn active={shift === "jour"} onClick={() => changeShift("jour")} compact={mobileCompact}>
                    Quart de jour
                  </Btn>
                  <Btn active={shift === "soir"} onClick={() => changeShift("soir")} compact={mobileCompact}>
                    Quart de soir
                  </Btn>
<button
                  onClick={() => navigateRoute("/historique-jour")}
                  style={{
                    height: mobileCompact ? 38 : 44,
                    padding: mobileCompact ? "0 14px" : "0 18px",
                    borderRadius: 14,
                    border: "1px solid rgba(57,232,255,0.38)",
                    background: "linear-gradient(180deg, rgba(12,72,98,0.92), rgba(5,25,45,0.96))",
                    color: "#39e8ff",
                    fontSize: mobileCompact ? 12 : 13,
                    fontWeight: 900,
                    letterSpacing: "0.035em",
                    cursor: "pointer",
                    boxShadow: "0 0 20px rgba(57,232,255,0.14)",
                    whiteSpace: "nowrap",
                    fontFamily: UI_FONT,
                  }}
                >
                  📈 Historique jour
                </button>

                <button
                  onClick={() => navigateRoute("/historique-soir")}
                  style={{
                    height: mobileCompact ? 38 : 44,
                    padding: mobileCompact ? "0 14px" : "0 18px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,216,77,0.38)",
                    background: "linear-gradient(180deg, rgba(90,68,14,0.82), rgba(5,25,45,0.96))",
                    color: "#ffd84d",
                    fontSize: mobileCompact ? 12 : 13,
                    fontWeight: 900,
                    letterSpacing: "0.035em",
                    cursor: "pointer",
                    boxShadow: "0 0 20px rgba(255,216,77,0.12)",
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
                  color: "#39e8ff",
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
                color: "#39e8ff",
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
            value={current.productionReelle}
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
                        color: "#39e8ff",
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
                      color: "#39e8ff",
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
                    color: "#39e8ff",
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
            value={current.productionReelle}
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
                <div style={{ color: "#39e8ff", fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
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
