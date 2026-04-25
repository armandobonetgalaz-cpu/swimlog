import { useState, useMemo, useRef, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const ESTILOS = ["Libre", "Pecho", "Espalda", "Mariposa", "Combinado"];

const DEMO_SESSIONS = [
  { id: 1, fecha: "2025-03-01", estilo: "Libre",   distancia: 1000, tiempo: 22.00, calorias: 320, esfuerzo: 6 },
  { id: 2, fecha: "2025-03-05", estilo: "Libre",   distancia: 1200, tiempo: 25.30, calorias: 380, esfuerzo: 7 },
  { id: 3, fecha: "2025-03-10", estilo: "Pecho",   distancia: 800,  tiempo: 28.45, calorias: 290, esfuerzo: 7 },
  { id: 4, fecha: "2025-03-14", estilo: "Libre",   distancia: 1400, tiempo: 28.00, calorias: 430, esfuerzo: 8 },
  { id: 5, fecha: "2025-03-20", estilo: "Espalda", distancia: 900,  tiempo: 24.15, calorias: 310, esfuerzo: 5 },
  { id: 6, fecha: "2025-03-28", estilo: "Libre",   distancia: 1600, tiempo: 30.00, calorias: 490, esfuerzo: 8 },
];

const METRICS = [
  { key: "distancia",  label: "Distancia (m)",    color: "#00d4ff", unit: "m"     },
  { key: "tiempo",     label: "Tiempo (min)",      color: "#ff6b35", unit: "min"   },
  { key: "calorias",   label: "Calorías",          color: "#7fff7f", unit: "kcal"  },
  { key: "esfuerzo",   label: "Esfuerzo (1–10)",   color: "#c084fc", unit: "/10"   },
  { key: "velocidad",  label: "Velocidad (m/min)", color: "#ffd700", unit: "m/min" },
];

const calcVelocidad = s => s.tiempo > 0 ? Math.round(s.distancia / s.tiempo) : 0;
const enrichSession = s => ({ ...s, velocidad: calcVelocidad(s) });

const STORAGE_KEY = "swimlog_sessions";

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(enrichSession);
    }
  } catch {}
  return DEMO_SESSIONS.map(enrichSession);
}

function saveSessions(sessions) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
}

// ── CSV parser ──────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("El archivo está vacío o solo tiene encabezado.");
  const rawHeaders = lines[0].split(/[,;\t]/).map(h =>
    h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_")
  );
  const alias = { distance:"distancia", time:"tiempo", calories:"calorias",
                  cals:"calorias", effort:"esfuerzo", style:"estilo", date:"fecha" };
  const headers = rawHeaders.map(h => alias[h] || h);
  const idx = key => headers.indexOf(key);
  const iDist = idx("distancia"), iTiempo = idx("tiempo");
  if (iDist===-1||iTiempo===-1)
    throw new Error(`Columnas requeridas no encontradas.\nEncabezados detectados: ${headers.join(", ")}\n\nNecesitas columnas llamadas 'distancia' y 'tiempo'.`);
  const iDate=idx("fecha"),iEstilo=idx("estilo"),iCal=idx("calorias"),iEsf=idx("esfuerzo");
  const today = new Date().toISOString().slice(0,10);
  const results = [];
  for (let i=1;i<lines.length;i++) {
    const cols = lines[i].split(/[,;\t]/).map(c=>c.trim().replace(/^"|"$/g,""));
    const dist = parseFloat(cols[iDist]), tiem = parseFloat(cols[iTiempo]);
    if (isNaN(dist)||isNaN(tiem)) continue;
    results.push({ id:Date.now()+i,
      fecha:    iDate>=0&&cols[iDate]   ? cols[iDate]   : today,
      estilo:   iEstilo>=0&&cols[iEstilo]? cols[iEstilo] : "Libre",
      distancia:dist, tiempo:tiem,
      calorias: iCal>=0 ? (parseFloat(cols[iCal])||0) : 0,
      esfuerzo: iEsf>=0 ? (parseFloat(cols[iEsf])||0) : 0,
    });
  }
  if (!results.length) throw new Error("No se encontraron filas con datos numéricos válidos.");
  return results;
}

export default function App() {
  const [sessions, setSessions]         = useState(loadSessions);
  const [activeMetric, setActiveMetric] = useState("distancia");
  const [activeTab, setActiveTab]       = useState("dashboard");
  const [form, setForm]                 = useState({ fecha:"", estilo:"Libre", distancia:"", tiempo:"", calorias:"", esfuerzo:"" });
  const [importMsg, setImportMsg]       = useState(null);
  const [preview, setPreview]           = useState(null);
  const fileRef = useRef();

  // persist on every change
  useEffect(() => { saveSessions(sessions); }, [sessions]);

  const metric = METRICS.find(m => m.key === activeMetric);

  const chartData = useMemo(() =>
    [...sessions].sort((a,b)=>a.fecha.localeCompare(b.fecha))
      .map(s=>({ fecha:s.fecha.slice(5), [activeMetric]:s[activeMetric], estilo:s.estilo })),
    [sessions, activeMetric]);

  const stats = useMemo(() => {
    if (!sessions.length) return null;
    const vals = sessions.map(s=>s[activeMetric]).filter(v=>v>0);
    const sorted = [...sessions].sort((a,b)=>a.fecha.localeCompare(b.fecha));
    return {
      total:  sessions.length,
      best:   Math.max(...vals),
      latest: sorted[sorted.length-1]?.[activeMetric],
      avg:    +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1),
    };
  }, [sessions, activeMetric]);

  const handleSubmit = () => {
    if (!form.fecha||!form.distancia||!form.tiempo) return;
    setSessions(prev=>[...prev, enrichSession({
      id:Date.now(), ...form,
      distancia:+form.distancia, tiempo:+form.tiempo,
      calorias:+form.calorias,   esfuerzo:+form.esfuerzo
    })]);
    setForm({ fecha:"", estilo:"Libre", distancia:"", tiempo:"", calorias:"", esfuerzo:"" });
    setActiveTab("dashboard");
  };

  const handleFileChange = e => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportMsg(null); setPreview(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try { setPreview(parseCSV(ev.target.result)); }
      catch(err) { setImportMsg({ type:"error", text:err.message }); }
    };
    reader.readAsText(file);
    e.target.value="";
  };

  const confirmImport = () => {
    setSessions(prev=>[...prev, ...preview.map(enrichSession)]);
    setImportMsg({ type:"ok", text:`✓ ${preview.length} sesiones importadas.` });
    setPreview(null); setActiveTab("dashboard");
  };

  const handleDeleteAll = () => {
    if (window.confirm("¿Borrar todas las sesiones? Esta acción no se puede deshacer.")) {
      setSessions([]);
    }
  };

  return (
    <div style={{ fontFamily:"'Space Mono',monospace", background:"#050d14", minHeight:"100vh", color:"#e0f7ff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#050d14}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0a1a2a}::-webkit-scrollbar-thumb{background:#00d4ff44;border-radius:2px}
        .wave-bg{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;
          background:radial-gradient(ellipse at 20% 80%,#003a5280 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,#00152580 0%,transparent 50%)}
        .lane-line{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;
          background:repeating-linear-gradient(90deg,transparent,transparent 79px,#00d4ff08 80px)}
        .header{padding:28px 20px 0;position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px}
        .logo{font-family:'Bebas Neue',sans-serif;font-size:2.4rem;letter-spacing:4px;color:#00d4ff;text-shadow:0 0 30px #00d4ff66}
        .logo span{color:#ffffff88;font-size:1rem;display:block;letter-spacing:8px;margin-top:-6px}
        .header-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .tabs{display:flex;gap:6px;padding:16px 20px 0;position:relative;z-index:1;flex-wrap:wrap}
        .tab{padding:8px 16px;border:1px solid #00d4ff22;border-radius:2px;background:transparent;color:#00d4ff88;
          font-family:'Space Mono',monospace;font-size:0.72rem;cursor:pointer;letter-spacing:2px;transition:all 0.2s;touch-action:manipulation}
        .tab.active{background:#00d4ff15;border-color:#00d4ff;color:#00d4ff;text-shadow:0 0 10px #00d4ff66}
        .tab:hover:not(.active){border-color:#00d4ff44;color:#00d4ffaa}
        .main{padding:20px 20px 80px;position:relative;z-index:1}
        .stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px}
        @media(min-width:600px){.stat-grid{grid-template-columns:repeat(4,1fr)}}
        .stat-card{background:#0a1a2a;border:1px solid #00d4ff1a;padding:14px;border-radius:4px;position:relative;overflow:hidden}
        .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--c)}
        .stat-label{font-size:0.58rem;letter-spacing:2px;color:#5a8a9a;margin-bottom:4px}
        .stat-value{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;color:var(--c);text-shadow:0 0 20px var(--c)}
        .stat-unit{font-size:0.65rem;color:#5a8a9a;margin-left:3px}
        .chart-card{background:#0a1a2a;border:1px solid #00d4ff1a;border-radius:4px;padding:16px;margin-bottom:20px}
        .chart-title{font-size:0.65rem;letter-spacing:3px;color:#5a8a9a;margin-bottom:14px}
        .metric-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
        .pill{padding:6px 12px;border:1px solid;border-radius:20px;font-size:0.65rem;letter-spacing:1px;cursor:pointer;transition:all 0.2s;background:transparent;font-family:'Space Mono',monospace;touch-action:manipulation}
        .session-list{display:flex;flex-direction:column;gap:8px}
        .session-row{background:#0a1a2a;border:1px solid #00d4ff12;border-radius:4px;padding:12px 14px;
          display:grid;grid-template-columns:80px 70px 1fr 1fr;gap:10px;align-items:center;font-size:0.7rem}
        .session-row.header-row{background:transparent;border:none;padding-bottom:2px}
        .session-row:not(.header-row):hover{border-color:#00d4ff33;background:#0d2030}
        .session-date{color:#5a8a9a;letter-spacing:1px;font-size:0.65rem}
        .badge{display:inline-block;padding:2px 6px;border-radius:2px;font-size:0.58rem;letter-spacing:2px;border:1px solid #00d4ff44;color:#00d4ff}
        .col-head{font-size:0.58rem;letter-spacing:2px;color:#2a4a5a;text-transform:uppercase}
        .form-card{background:#0a1a2a;border:1px solid #00d4ff22;border-radius:4px;padding:24px;max-width:560px}
        .form-title{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;color:#00d4ff;letter-spacing:4px;margin-bottom:20px}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .field label{display:block;font-size:0.6rem;letter-spacing:3px;color:#5a8a9a;margin-bottom:6px}
        .field input,.field select{width:100%;background:#060e18;border:1px solid #00d4ff22;border-radius:2px;padding:10px 12px;
          color:#e0f7ff;font-family:'Space Mono',monospace;font-size:0.8rem;outline:none;transition:border-color 0.2s;-webkit-appearance:none}
        .field input:focus,.field select:focus{border-color:#00d4ff66}
        .field select option{background:#060e18}
        .btn-primary{margin-top:18px;padding:12px 28px;background:#00d4ff15;border:1px solid #00d4ff;color:#00d4ff;
          font-family:'Space Mono',monospace;font-size:0.75rem;letter-spacing:3px;cursor:pointer;border-radius:2px;transition:all 0.2s;touch-action:manipulation;width:100%}
        .btn-primary:active{background:#00d4ff30}
        .btn-add{padding:8px 16px;background:#00d4ff12;border:1px solid #00d4ff44;color:#00d4ff;
          font-family:'Space Mono',monospace;font-size:0.68rem;letter-spacing:2px;cursor:pointer;border-radius:2px;touch-action:manipulation}
        .btn-import{padding:8px 16px;background:#ffd70012;border:1px solid #ffd70044;color:#ffd700;
          font-family:'Space Mono',monospace;font-size:0.68rem;letter-spacing:2px;cursor:pointer;border-radius:2px;touch-action:manipulation}
        .btn-danger{padding:8px 16px;background:#ff444412;border:1px solid #ff444444;color:#ff6666;
          font-family:'Space Mono',monospace;font-size:0.68rem;letter-spacing:2px;cursor:pointer;border-radius:2px;touch-action:manipulation}
        .btn-confirm{padding:10px 20px;background:#7fff7f15;border:1px solid #7fff7f66;color:#7fff7f;
          font-family:'Space Mono',monospace;font-size:0.7rem;letter-spacing:2px;cursor:pointer;border-radius:2px;touch-action:manipulation}
        .import-card{background:#0a1a2a;border:1px solid #ffd70033;border-radius:4px;padding:20px;margin-bottom:20px}
        .import-title{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:#ffd700;letter-spacing:4px;margin-bottom:10px}
        .import-hint{font-size:0.66rem;color:#5a8a9a;line-height:1.9;margin-bottom:18px}
        .import-hint code{color:#ffd70099;background:#ffd70010;padding:2px 6px;border-radius:2px;font-family:'Space Mono',monospace}
        .drop-zone{border:2px dashed #ffd70033;border-radius:4px;padding:32px 20px;text-align:center;cursor:pointer;transition:all 0.2s;touch-action:manipulation}
        .drop-zone:active{border-color:#ffd70088;background:#ffd70008}
        .drop-label{font-size:0.72rem;letter-spacing:2px;color:#ffd70066}
        .msg-ok{padding:10px 16px;background:#7fff7f12;border:1px solid #7fff7f44;border-radius:4px;color:#7fff7f;font-size:0.7rem;letter-spacing:1px;margin-bottom:14px}
        .msg-error{padding:10px 16px;background:#ff444412;border:1px solid #ff444444;border-radius:4px;color:#ff6666;font-size:0.7rem;margin-bottom:14px;white-space:pre-wrap;line-height:1.6}
        .preview-table{width:100%;border-collapse:collapse;margin:14px 0;font-size:0.68rem}
        .preview-table th{text-align:left;padding:6px 8px;color:#2a4a5a;font-size:0.58rem;letter-spacing:2px;border-bottom:1px solid #0d2030}
        .preview-table td{padding:6px 8px;border-bottom:1px solid #0a1a2a88;color:#b0d0e0}
        .preview-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
        .empty{text-align:center;padding:50px 20px;color:#2a4a5a;font-size:0.78rem;letter-spacing:2px;line-height:2}
        .custom-tooltip{background:#0d2030;border:1px solid #00d4ff33;padding:10px 14px;border-radius:4px;font-size:0.7rem}
        .tt-label{color:#5a8a9a;margin-bottom:4px}
        .tt-val{color:#00d4ff;font-family:'Bebas Neue',sans-serif;font-size:1.4rem}
        .danger-zone{margin-top:32px;padding-top:20px;border-top:1px solid #ff444420}
        .danger-title{font-size:0.6rem;letter-spacing:3px;color:#ff444466;margin-bottom:10px}
      `}</style>

      <div className="wave-bg"/><div className="lane-line"/>

      <header className="header">
        <div className="logo">SWIMLOG<span>PROGRESS TRACKER</span></div>
        <div className="header-actions">
          <button className="btn-import" onClick={()=>setActiveTab("importar")}>↑ CSV</button>
          <button className="btn-add"    onClick={()=>setActiveTab("agregar")}>+ SESIÓN</button>
        </div>
      </header>

      <nav className="tabs">
        {["dashboard","sesiones","agregar","importar"].map(t=>(
          <button key={t} className={`tab ${activeTab===t?"active":""}`} onClick={()=>setActiveTab(t)}>
            {t==="dashboard"?"DASHBOARD":t==="sesiones"?"SESIONES":t==="agregar"?"+ REGISTRAR":"↑ IMPORTAR"}
          </button>
        ))}
      </nav>

      <main className="main">

        {/* DASHBOARD */}
        {activeTab==="dashboard" && (<>
          <div className="metric-pills">
            {METRICS.map(m=>(
              <button key={m.key} className="pill"
                style={{borderColor:activeMetric===m.key?m.color:`${m.color}33`,
                        color:activeMetric===m.key?m.color:`${m.color}66`,
                        boxShadow:activeMetric===m.key?`0 0 14px ${m.color}33`:"none"}}
                onClick={()=>setActiveMetric(m.key)}>{m.label}</button>
            ))}
          </div>
          {stats && (
            <div className="stat-grid">
              {[{label:"SESIONES",val:stats.total,unit:""},
                {label:"MEJOR MARCA",val:stats.best,unit:metric.unit},
                {label:"ÚLTIMO",val:stats.latest,unit:metric.unit},
                {label:"PROMEDIO",val:stats.avg,unit:metric.unit}].map((s,i)=>(
                <div key={i} className="stat-card" style={{"--c":metric.color}}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.val}<span className="stat-unit">{s.unit}</span></div>
                </div>
              ))}
            </div>
          )}
          <div className="chart-card">
            <div className="chart-title">EVOLUCIÓN · {metric.label.toUpperCase()}</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{top:4,right:4,left:-10,bottom:0}}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={metric.color} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={metric.color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#0d2030"/>
                <XAxis dataKey="fecha" tick={{fill:"#2a4a5a",fontSize:9,fontFamily:"Space Mono"}} axisLine={{stroke:"#0d2030"}} tickLine={false}/>
                <YAxis tick={{fill:"#2a4a5a",fontSize:9,fontFamily:"Space Mono"}} axisLine={false} tickLine={false}/>
                <Tooltip content={({active,payload})=>active&&payload?.length?(
                  <div className="custom-tooltip">
                    <div className="tt-label">{payload[0].payload.fecha} · {payload[0].payload.estilo}</div>
                    <div className="tt-val">{payload[0].value}<span style={{fontSize:"0.8rem",marginLeft:4}}>{metric.unit}</span></div>
                  </div>
                ):null}/>
                <Area type="monotone" dataKey={activeMetric} stroke={metric.color} strokeWidth={2} fill="url(#grad)"
                  dot={{fill:metric.color,r:3,strokeWidth:0}} activeDot={{r:5,fill:metric.color,stroke:"#050d14",strokeWidth:2}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {sessions.length===0 && (
            <div className="empty">NO HAY SESIONES AÚN<br/>REGISTRA TU PRIMER ENTRENAMIENTO</div>
          )}
        </>)}

        {/* SESIONES */}
        {activeTab==="sesiones" && (
          <div>
            <div className="session-row header-row">
              <div className="col-head">FECHA</div><div className="col-head">ESTILO</div>
              <div className="col-head">DIST.</div><div className="col-head">TIEMPO</div>
            </div>
            <div className="session-list">
              {sessions.length===0
                ? <div className="empty">SIN SESIONES AÚN<br/>AGREGA TU PRIMER ENTRENAMIENTO</div>
                : [...sessions].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(s=>(
                  <div key={s.id} className="session-row">
                    <div className="session-date">{s.fecha.slice(5)}</div>
                    <div><span className="badge">{s.estilo.slice(0,4).toUpperCase()}</span></div>
                    <div style={{color:"#00d4ff"}}>{s.distancia}<span style={{color:"#2a4a5a",fontSize:"0.6rem"}}> m</span></div>
                    <div style={{color:"#ff6b35"}}>{s.tiempo}<span style={{color:"#2a4a5a",fontSize:"0.6rem"}}> min</span></div>
                  </div>
                ))
              }
            </div>
            {sessions.length>0 && (
              <div className="danger-zone">
                <div className="danger-title">ZONA DE PELIGRO</div>
                <button className="btn-danger" onClick={handleDeleteAll}>🗑 BORRAR TODAS LAS SESIONES</button>
              </div>
            )}
          </div>
        )}

        {/* AGREGAR */}
        {activeTab==="agregar" && (
          <div className="form-card">
            <div className="form-title">NUEVA SESIÓN</div>
            <div className="form-grid">
              <div className="field"><label>FECHA</label>
                <input type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/></div>
              <div className="field"><label>ESTILO</label>
                <select value={form.estilo} onChange={e=>setForm(f=>({...f,estilo:e.target.value}))}>
                  {ESTILOS.map(e=><option key={e}>{e}</option>)}</select></div>
              <div className="field"><label>DISTANCIA (m)</label>
                <input type="number" inputMode="decimal" placeholder="ej. 1500" value={form.distancia}
                  onChange={e=>setForm(f=>({...f,distancia:e.target.value}))}/></div>
              <div className="field"><label>TIEMPO (min)</label>
                <input type="number" inputMode="decimal" step="0.01" placeholder="ej. 30.00" value={form.tiempo}
                  onChange={e=>setForm(f=>({...f,tiempo:e.target.value}))}/></div>
              <div className="field"><label>CALORÍAS (kcal)</label>
                <input type="number" inputMode="decimal" placeholder="ej. 400" value={form.calorias}
                  onChange={e=>setForm(f=>({...f,calorias:e.target.value}))}/></div>
              <div className="field"><label>ESFUERZO (1–10)</label>
                <input type="number" inputMode="numeric" min="1" max="10" placeholder="ej. 7" value={form.esfuerzo}
                  onChange={e=>setForm(f=>({...f,esfuerzo:e.target.value}))}/></div>
            </div>
            <button className="btn-primary" onClick={handleSubmit}>GUARDAR SESIÓN →</button>
          </div>
        )}

        {/* IMPORTAR */}
        {activeTab==="importar" && (
          <div>
            {importMsg && <div className={importMsg.type==="ok"?"msg-ok":"msg-error"}>{importMsg.text}</div>}
            {preview ? (
              <div className="import-card" style={{borderColor:"#7fff7f33"}}>
                <div className="import-title" style={{color:"#7fff7f"}}>VISTA PREVIA · {preview.length} FILAS</div>
                <div style={{overflowX:"auto"}}>
                  <table className="preview-table">
                    <thead><tr>
                      <th>FECHA</th><th>ESTILO</th><th>DIST.</th><th>TIEMPO</th><th>CAL.</th>
                    </tr></thead>
                    <tbody>
                      {preview.slice(0,8).map((r,i)=>(
                        <tr key={i}>
                          <td>{r.fecha}</td><td>{r.estilo}</td>
                          <td>{r.distancia}m</td><td>{r.tiempo}</td><td>{r.calorias||"—"}</td>
                        </tr>
                      ))}
                      {preview.length>8&&<tr><td colSpan={5} style={{color:"#2a4a5a",textAlign:"center",padding:"10px"}}>…y {preview.length-8} más</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="preview-actions">
                  <button className="btn-confirm" onClick={confirmImport}>✓ IMPORTAR {preview.length} SESIONES</button>
                  <button className="btn-danger"  onClick={()=>{setPreview(null);setImportMsg(null)}}>✕ CANCELAR</button>
                </div>
              </div>
            ) : (
              <div className="import-card">
                <div className="import-title">IMPORTAR CSV</div>
                <div className="import-hint">
                  Tu archivo necesita al menos estas columnas:<br/>
                  <code>distancia</code> — metros nadados<br/>
                  <code>tiempo</code> — en minutos decimales (ej. <code>30.00</code>)<br/><br/>
                  Ejemplo mínimo:<br/>
                  <code>distancia,tiempo</code><br/>
                  <code>1500,30.00</code><br/>
                  <code>1200,25.45</code>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" style={{display:"none"}} onChange={handleFileChange}/>
                <div className="drop-zone" onClick={()=>fileRef.current?.click()}>
                  <div style={{fontSize:"2rem",marginBottom:8,color:"#ffd70044"}}>↑</div>
                  <div className="drop-label">TOCA PARA SELECCIONAR ARCHIVO</div>
                  <div style={{fontSize:"0.6rem",color:"#2a4a5a",marginTop:6,letterSpacing:2}}>CSV · TXT · TSV</div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
