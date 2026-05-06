import { useEffect, useMemo, useState } from "react";
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

const STORAGE_KEY = "dashboard_coupe_stable_v6_kpi_visible";
const KPI_VISIBILITY_KEY = "dashboard_kpi_visibility_v1";

const DEFAULT_VISIBLE_KPIS = {
  productionActuelle: true,
  objectifTotal: true,
  projectionFinQuart: true,
  theoriqueDepuisDebut: true,
  efficaciteDepuisDebut: true,
  heureFinEstimee: true,
  efficaciteGlobale: true,
  restantProduire: true,
};

const KPI_OPTIONS = [
  ["efficaciteDepuisDebut", "Efficacité depuis début du quart"],
  ["efficaciteGlobale", "Efficacité globale pondérée"],
  ["heureFinEstimee", "Heure fin estimée"],
  ["objectifTotal", "Objectif total théorique"],
  ["productionActuelle", "Production actuelle"],
  ["projectionFinQuart", "Projection fin de quart"],
  ["restantProduire", "Restant à produire"],
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
      { id: 4, label: "4e bloc (Prévision)", ciblePct: 92, coupeReelle: 0, isPrediction: true },
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
      { id: 4, label: "4e bloc (Prévision)", ciblePct: 92, coupeReelle: 0, isPrediction: true },
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

function useResponsive() {
  const getWidth = () => (typeof window !== "undefined" ? window.innerWidth : 1400);
  const [width, setWidth] = useState(getWidth());

  useEffect(() => {
    const onResize = () => setWidth(getWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width <= 768,
    isTablet: width > 768 && width <= 1100,
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

function currentClock() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h} h ${m} min ${s} s`;
}

function normalizeIntegerInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits === "") return 0;
  return parseInt(digits, 10);
}

function weightedEfficiency(rows) {
  const base = rows.filter((r) => !r.isPrediction).slice(0, 3);
  const totalReal = base.reduce((s, r) => s + Number(r.reelBloc || 0), 0);
  const total100 = base.reduce((s, r) => s + Number(r.coupe100 || 0), 0);

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

const shellStyle = {
  maxWidth: 1600,
  margin: "0 auto",
  borderRadius: 18,
  border: "1px solid rgba(74,190,255,0.16)",
  background:
    "linear-gradient(180deg, rgba(4,13,25,0.96) 0%, rgba(3,9,18,0.98) 100%)",
  boxShadow:
    "0 0 0 1px rgba(255,255,255,0.02) inset, 0 12px 40px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(5,16,31,0.96) 0%, rgba(3,11,22,0.98) 100%)",
  border: "1px solid rgba(74,190,255,0.16)",
  borderRadius: 16,
  boxShadow: "0 0 18px rgba(43,140,255,0.05)",
};

function normalInputStyle(isMobile) {
  return {
    width: "100%",
    height: isMobile ? 36 : 40,
    borderRadius: 10,
    border: "1px solid rgba(120,190,255,0.12)",
    background: "rgba(9,19,34,0.82)",
    color: "#eefaff",
    fontSize: isMobile ? 12 : 14,
    fontWeight: 700,
    padding: isMobile ? "0 10px" : "0 12px",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "Segoe UI, Arial, sans-serif",
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
    fontSize: compact ? (isMobile ? 16 : 18) : isMobile ? 20 : 24,
    lineHeight: 1,
    padding: fullWidth ? "0 12px" : 0,
    fontFamily: "Segoe UI, Arial, sans-serif",
  };
}

function Btn({ children, active, onClick, compact = false }) {
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
        fontSize: compact ? 12 : 14,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? "0 0 16px rgba(109,230,255,0.18)" : "none",
        fontFamily: "Segoe UI, Arial, sans-serif",
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
    fontSize: compact ? 12 : 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: active ? "0 0 16px rgba(109,230,255,0.18)" : "none",
    fontFamily: "Segoe UI, Arial, sans-serif",
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
  return (
    <div
      style={{
        ...cardStyle,
        padding: compact ? "10px 12px" : "16px 18px",
        border: highlight
          ? "1px solid rgba(255,206,84,0.28)"
          : "1px solid rgba(74,190,255,0.16)",
        background: highlight
          ? "linear-gradient(180deg, rgba(63,53,20,0.78) 0%, rgba(44,37,14,0.85) 100%)"
          : cardStyle.background,
      }}
    >
      <div
        style={{
          fontSize: compact ? 10 : 12,
          fontWeight: 800,
          color: highlight ? "#ffd861" : "#d8f4ff",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: "Segoe UI, Arial, sans-serif",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: compact ? 16 : 22,
          fontWeight: 900,
          color: valueColor,
          lineHeight: 1,
          fontFamily: "Segoe UI, Arial, sans-serif",
        }}
      >
        {value}
      </div>

      {subtitle ? (
        <div
          style={{
            marginTop: 8,
            fontSize: compact ? 10 : 12,
            color: highlight ? "#ffe8a1" : "#7f99ad",
            lineHeight: 1.3,
            fontFamily: "Segoe UI, Arial, sans-serif",
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Gauge({ value, target = 92 }) {
  const pct = Math.max(0, Math.min(120, Number(value) || 0));
  const pctArc = Math.max(0, Math.min(100, pct));

  let mainColor = "#ff4d5a"; // rouge
  let statusText = "SOUS PERFORMANCE";
  if (pct >= 85) {
    mainColor = "#ffd84d"; // jaune
    statusText = "À SURVEILLER";
  }
  if (pct >= 95) {
    mainColor = "#9df548"; // vert
    statusText = "PERFORMANCE OK";
  }

  const angle = -90 + (Math.min(pctArc, 100) / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 160;
  const cy = 145;
  const r = 110;
  const x2 = cx + r * Math.cos(rad);
  const y2 = cy + r * Math.sin(rad);

  const targetAngle = -90 + (Math.min(Math.max(target, 0), 100) / 100) * 180;
  const targetRad = (targetAngle * Math.PI) / 180;
  const tx1 = cx + (r - 18) * Math.cos(targetRad);
  const ty1 = cy + (r - 18) * Math.sin(targetRad);
  const tx2 = cx + (r + 12) * Math.cos(targetRad);
  const ty2 = cy + (r + 12) * Math.sin(targetRad);

  return (
    <div
      style={{
        ...cardStyle,
        padding: 14,
        height: 210,
        border: pct < 80 ? "1px solid rgba(255,77,90,0.55)" : cardStyle.border,
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
          marginBottom: 8,
          fontFamily: "Segoe UI, Arial, sans-serif",
        }}
      >
        Efficacité depuis début du quart
      </div>

      <svg width="100%" height="132" viewBox="0 0 320 180">
        <path
          d="M 40 145 A 120 120 0 0 1 280 145"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="18"
          strokeLinecap="round"
        />

        <path
          d="M 40 145 A 120 120 0 0 1 280 145"
          fill="none"
          stroke={mainColor}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${(pctArc / 100) * 377} 377`}
          style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease" }}
        />

        <line
          x1={tx1}
          y1={ty1}
          x2={tx2}
          y2={ty2}
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.9"
        />

        <text x={cx} y="36" textAnchor="middle" fill="#d8f4ff" fontSize="10" fontWeight="700">
          Cible {target} %
        </text>

        <line
          x1={cx}
          y1={cy}
          x2={x2}
          y2={y2}
          stroke="#e8f7ff"
          strokeWidth="5"
          strokeLinecap="round"
          style={{ transition: "all 0.5s ease" }}
        />

        <circle cx={cx} cy={cy} r="10" fill="#97ecff" />
        <circle cx={cx} cy={cy} r="6" fill="#4d90a6" />
      </svg>

      <div
        style={{
          textAlign: "center",
          marginTop: -12,
          fontSize: 24,
          fontWeight: 900,
          color: mainColor,
          fontFamily: "Segoe UI, Arial, sans-serif",
          transition: "color 0.3s ease",
        }}
      >
        {pct.toFixed(1)} %
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

  return (
    <div
      style={{
        background: "rgba(6,16,30,0.96)",
        border: "1px solid rgba(94,210,255,0.24)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 0 20px rgba(0,0,0,0.35)",
        fontFamily: "Segoe UI, Arial, sans-serif",
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
    fontFamily: "Segoe UI, Arial, sans-serif",
  };
}

function NumberText({ children, color = "#eefaff", size = 13, weight = 800 }) {
  return (
    <span
      style={{
        color,
        fontSize: size,
        fontWeight: weight,
        fontFamily: "Segoe UI, Arial, sans-serif",
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

  return (
    <div
      style={{
        border: bloc.isPrediction
          ? "1px solid rgba(255,206,84,0.28)"
          : "1px solid rgba(74,190,255,0.14)",
        borderRadius: 12,
        padding: factoryMode ? 4 : 8,
        marginBottom: 8,
        background: bloc.isPrediction
          ? "linear-gradient(180deg, rgba(63,53,20,0.45) 0%, rgba(44,37,14,0.58) 100%)"
          : "rgba(6,18,34,0.72)",
        fontFamily: "Segoe UI, Arial, sans-serif",
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
            value={String(Number(bloc.coupeReelle || 0))}
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
            {round(efficaciteCell)} %
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const boot = useMemo(() => safeLoad(), []);
  const [shift, setShift] = useState(boot.shift);
  const [stateByShift, setStateByShift] = useState(boot.data);
  const [clock, setClock] = useState(currentClock());
  const [showPeriodes, setShowPeriodes] = useState(true);
  const [factoryMode, setFactoryMode] = useState(false);
  const [visibleKpis, setVisibleKpis] = useState(safeLoadKpiVisibility);
  const { isMobile, isTablet } = useResponsive();

  const inputStyle = normalInputStyle(isMobile);

  const mobileCompact = isMobile;
  const sectionPadding = mobileCompact ? 8 : 12;
  const gapMain = mobileCompact ? 8 : 12;
  const titleSize = mobileCompact ? 14 : 18;
  const clockSize = mobileCompact ? 16 : 24;
  const chartHeight = mobileCompact ? 180 : 260;

  useEffect(() => {
    const id = setInterval(() => setClock(currentClock()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const current = stateByShift[shift];
  const validation = useMemo(() => validatePeriodes(current.periodes), [current.periodes]);

  function toggleKpi(key) {
    setVisibleKpis((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function updateShiftData(patch) {
    setStateByShift((prev) => ({
      ...prev,
      [shift]: { ...prev[shift], ...patch },
    }));
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
    updateShiftData({
      periodes: [
        ...current.periodes,
        { id: nextId, type: "Production", start: "00:00", end: "00:01", cadence: 0 },
      ],
    });
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
      // plein écran non disponible
    }
  }

  const productivePeriodes = useMemo(
    () => current.periodes.filter(isProductive),
    [current.periodes]
  );

  const blocsCalcules = useMemo(() => {
    let previousCumul = 0;

    return current.blocs.map((bloc, index) => {
      const sourcePeriode = productivePeriodes[index];
      const start = sourcePeriode ? sourcePeriode.start : "00:00";
      const end = sourcePeriode ? sourcePeriode.end : "00:00";
      const cadence = sourcePeriode ? Number(sourcePeriode.cadence) : 0;

      const minutesTravaillees = diffMinutes(start, end);
      const coupe100 = round((minutesTravaillees / 60) * cadence);
      const coupeCibleReelle = round(coupe100 * (bloc.ciblePct / 100));

      const cumulActuel = bloc.isPrediction ? previousCumul : Number(bloc.coupeReelle || 0);
      const cumulPrecedent = previousCumul;
      const reelBloc = bloc.isPrediction ? 0 : Math.max(0, cumulActuel - cumulPrecedent);
      const efficaciteReelle = coupe100 > 0 ? (reelBloc / coupe100) * 100 : 0;
      const ecartDeCoupe = reelBloc - coupeCibleReelle;

      if (!bloc.isPrediction) previousCumul = cumulActuel;

      return {
        ...bloc,
        start,
        end,
        cadence,
        minutesTravaillees,
        coupe100,
        coupeCibleReelle,
        cumulActuel,
        cumulPrecedent,
        reelBloc,
        efficaciteReelle,
        ecartDeCoupe,
      };
    });
  }, [current.blocs, productivePeriodes]);

  const efficacitePonderee = useMemo(
    () => weightedEfficiency(blocsCalcules),
    [blocsCalcules]
  );

  const predictionDernierBloc = useMemo(() => {
    const pred = blocsCalcules.find((b) => b.isPrediction);
    if (!pred) return 0;
    return round(pred.coupe100 * (efficacitePonderee / 100));
  }, [blocsCalcules, efficacitePonderee]);

  const blocsAffiches = useMemo(() => {
    let previousCumul = 0;

    return blocsCalcules.map((b) => {
      if (!b.isPrediction) {
        previousCumul = Number(b.cumulActuel || 0);
        return b;
      }

      const reelBloc = predictionDernierBloc;
      const cumulPrecedent = previousCumul;
      const cumulActuel = cumulPrecedent + reelBloc;
      const efficaciteReelleAffichee =
        b.coupe100 > 0 ? (reelBloc / b.coupe100) * 100 : 0;
      const ecartDeCoupeAffiche = reelBloc - b.coupeCibleReelle;

      previousCumul = cumulActuel;

      return {
        ...b,
        reelBloc,
        cumulPrecedent,
        cumulActuel,
        efficaciteReelleAffichee,
        ecartDeCoupeAffiche,
      };
    });
  }, [blocsCalcules, predictionDernierBloc]);

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

  const ecartActuel = current.productionReelle - current.objectifReel;
  const heureFinEstimee = blocsAffiches[blocsAffiches.length - 1]?.end || "--:--";
  const minutesTotales = totalWorkMinutes(current.periodes);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const theoriqueDepuisDebutQuart = round(
    theoreticalUntilNow(current.periodes, nowMinutes)
  );

  const efficaciteDepuisDebutQuart =
    theoriqueDepuisDebutQuart > 0
      ? (Number(current.productionReelle || 0) / theoriqueDepuisDebutQuart) * 100
      : 0;

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

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 50% 0%, rgba(0,200,255,0.08), transparent 34%), radial-gradient(circle at 85% 20%, rgba(255,216,77,0.05), transparent 22%), #000000",
        color: "#eefaff",
        fontFamily: "Segoe UI, Arial, sans-serif",
        padding: 8,
      }}
    >
      <div style={{ ...shellStyle, maxWidth: factoryMode ? "100%" : shellStyle.maxWidth, borderRadius: factoryMode ? 0 : shellStyle.borderRadius }}>
        <div style={{ padding: mobileCompact ? 8 : 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobileCompact ? "1fr" : "1.7fr 0.9fr",
              gap: gapMain,
              marginBottom: 10,
            }}
          >
            <div style={{ ...cardStyle, padding: sectionPadding }}>
              <div
                style={{
                  fontSize: titleSize,
                  fontWeight: 900,
                  letterSpacing: "0.03em",
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                Dashboard Production
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn active={shift === "jour"} onClick={() => setShift("jour")} compact={mobileCompact}>
                  Quart de jour
                </Btn>
                <Btn active={shift === "soir"} onClick={() => setShift("soir")} compact={mobileCompact}>
                  Quart de soir
                </Btn>
                <Btn onClick={resetCurrentShift} compact={mobileCompact}>
                  Réinitialiser
                </Btn>
                <Btn onClick={() => setShowPeriodes((v) => !v)} compact={mobileCompact}>
                  {showPeriodes ? "Masquer périodes" : "Afficher périodes"}
                </Btn>
                <Btn onClick={toggleFactoryMode} active={factoryMode} compact={mobileCompact}>
                  Mode écran usine
                </Btn>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: sectionPadding }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#d8f4ff",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Heure système
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: clockSize,
                  fontWeight: 900,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span>{clock}</span>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#2fe1ff",
                    boxShadow: "0 0 16px rgba(47,225,255,0.9)",
                    flexShrink: 0,
                  }}
                />
              </div>
            </div>
          </div>

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
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                gap: "12px 28px",
                width: "100%",
              }}
            >
              {KPI_OPTIONS.map(([key, label]) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "#eefaff",
                    flex: "1 1 220px",
                    maxWidth: 310,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(visibleKpis[key])}
                    onChange={() => toggleKpi(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobileCompact ? "1fr" : isTablet ? "1fr" : "1.7fr 0.9fr",
              gap: gapMain,
            }}
          >
            <div>
              <div style={{ ...cardStyle, padding: sectionPadding, marginBottom: 10 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: mobileCompact ? "1fr" : "1fr 1fr auto",
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

                  <button
                    onClick={addPeriode}
                    style={{
                      ...buttonStyle(false, mobileCompact),
                      width: mobileCompact ? "100%" : 40,
                      padding: 0,
                    }}
                  >
                    +
                  </button>
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
                    <div style={{ minWidth: mobileCompact ? 850 : "auto" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.15fr 0.7fr 0.7fr 0.9fr 0.12fr",
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
                      </div>

                      {current.periodes.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.15fr 0.7fr 0.7fr 0.9fr 0.12fr",
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
                            onClick={() => deletePeriode(p.id)}
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
                    <div>{fmtTime(heureFinEstimee)}</div>
                  </div>
                </div>
              )}

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
                        minWidth: 1320,
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
                            fontWeight: 800,
                            textAlign: "center",
                            color: "#eefaff",
                            background: "rgba(8,20,38,0.95)",
                            borderRight: "1px solid rgba(74,190,255,0.10)",
                            borderBottom: "1px solid rgba(74,190,255,0.10)",
                            fontFamily: "Segoe UI, Arial, sans-serif",
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
                                  value={String(Number(b.coupeReelle || 0))}
                                  onChange={(e) => updateBloc(b.id, "coupeReelle", e.target.value)}
                                />
                              )}
                            </div>

                            <div style={cellStyle(b.isPrediction)}>
                              <NumberText color={b.isPrediction ? "#ffd84d" : "#eefaff"} size={b.isPrediction ? 20 : 13} weight={900}>
                                {reelBlocCell}
                              </NumberText>
                            </div>

                            <div style={cellStyle(b.isPrediction)}>
                              <NumberText color={ecartCell >= 0 ? "#8ef6a7" : "#ff4f67"} size={13} weight={900}>
                                {ecartCell >= 0 ? `+${ecartCell}` : ecartCell}
                              </NumberText>
                            </div>

                            <div style={cellStyle(b.isPrediction)}>
                              <NumberText color="#ffd84d" size={13} weight={900}>
                                {round(efficaciteCell)} %
                              </NumberText>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: mobileCompact ? "1fr" : "1.35fr 1fr",
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

                <Gauge value={efficaciteDepuisDebutQuart} target={92} />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: mobileCompact ? "1fr 1fr" : "1fr",
                gap: mobileCompact ? 8 : 12,
                alignContent: "start",
              }}
            >
              {visibleKpis.productionActuelle && (
                <KPI title="Production actuelle" value={current.productionReelle} subtitle={current.productionReelle >= current.objectifReel ? "SUR LA CIBLE" : "SOUS LA CIBLE"} compact={mobileCompact} />
              )}

              {visibleKpis.objectifTotal && (
                <KPI title="Objectif total théorique" value={objectifTotalTheorique} subtitle="calculé selon les blocs" compact={mobileCompact} />
              )}

              {visibleKpis.projectionFinQuart && (
                <KPI title="Projection fin de quart" value={projectionFinQuart} subtitle="cumul projeté à la fin du quart" valueColor="#ffd84d" highlight compact={mobileCompact} />
              )}

              {visibleKpis.theoriqueDepuisDebut && (
                <KPI title="Théorique depuis début du quart" value={theoriqueDepuisDebutQuart} subtitle="calculé jusqu'à l'heure actuelle" compact={mobileCompact} />
              )}

              {visibleKpis.efficaciteDepuisDebut && (
                <KPI title="Efficacité depuis début du quart" value={`${efficaciteDepuisDebutQuart.toFixed(1)} %`} subtitle="basée sur le champ nombre réellement produit" valueColor="#ffd84d" compact={mobileCompact} />
              )}

              {visibleKpis.heureFinEstimee && (
                <KPI title="Heure fin estimée" value={fmtTime(heureFinEstimee)} subtitle="pour atteindre l'objectif réel" compact={mobileCompact} />
              )}

              {visibleKpis.efficaciteGlobale && (
                <KPI title="Efficacité globale pondérée" value={`${efficacitePonderee.toFixed(1)} %`} subtitle="basée sur les 3 premiers blocs" valueColor="#ffd84d" compact={mobileCompact} />
              )}

              {visibleKpis.restantProduire && (
                <KPI title="Restant à produire" value={restantAProduire} subtitle="pour atteindre l'objectif réel" compact={mobileCompact} />
              )}
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
                fontFamily: "Segoe UI, Arial, sans-serif",
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
  );
}
