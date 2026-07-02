'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { TrendingUp, TrendingDown, Minus, Star, MessageSquare, BarChart3, MapPin, Send, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AutoRefresh from './AutoRefresh';
import LogoutButton from './LogoutButton';

const UAA_PURPLE = '#3b1f8c';
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/* ─── Types ─── */
export type Row = {
  score: number; clasificacion: string; comentario: string | null; canal: string;
  cliente_id: number; ticket_id: number; respondido_at: string;
  score_experiencia: number | null; score_productos: number | null;
  score_precios: number | null; score_atencion: number | null;
  aspectos_mejorar: string | null;
  fecha_compra: string | null; hora_compra: string | null;
  c_sucursal: string | null; sucursal_nombre: string | null; nombre_cliente: string | null;
};

/* ─── Helpers ─── */
function getDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function dateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y} - ${DIAS[new Date(Date.UTC(y,m-1,d)).getUTCDay()]}`;
}
function fmtAt(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}
function avgOf(nums: (number|null)[]): number | null {
  const vals = nums.filter(n => n != null) as number[];
  return vals.length > 0 ? Math.round((vals.reduce((a,b) => a+b, 0) / vals.length) * 10) / 10 : null;
}

/* ─── Metric helpers ─── */
type Metrics = {
  total: number; promotores: number; pasivos: number; detractores: number; nps: number;
  avgExp: number|null; avgProd: number|null; avgPrec: number|null; avgAten: number|null;
};

function calcMetrics(rows: Row[]): Metrics {
  let promotores = 0, pasivos = 0, detractores = 0;
  for (const r of rows) {
    if      (r.clasificacion === 'promotor')  promotores++;
    else if (r.clasificacion === 'pasivo')    pasivos++;
    else if (r.clasificacion === 'detractor') detractores++;
  }
  const total = rows.length;
  const nps   = total > 0 ? Math.round(((promotores - detractores) / total) * 100) : 0;
  return {
    total, promotores, pasivos, detractores, nps,
    avgExp:  avgOf(rows.map(r => r.score_experiencia)),
    avgProd: avgOf(rows.map(r => r.score_productos)),
    avgPrec: avgOf(rows.map(r => r.score_precios)),
    avgAten: avgOf(rows.map(r => r.score_atencion)),
  };
}

function calcAspectos(rows: Row[], total: number) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.aspectos_mejorar) continue;
    for (const a of r.aspectos_mejorar.split(',')) {
      const t = a.trim();
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([aspecto, n]) => ({ aspecto, n, pct: total > 0 ? Math.round((n/total)*100) : 0 }))
    .sort((a, b) => b.n - a.n);
}

function calcBySucursal(rows: Row[]) {
  const map = new Map<string, { name: string; rows: Row[] }>();
  for (const r of rows) {
    if (!r.c_sucursal || !r.sucursal_nombre) continue;
    if (!map.has(r.c_sucursal)) map.set(r.c_sucursal, { name: r.sucursal_nombre, rows: [] });
    map.get(r.c_sucursal)!.rows.push(r);
  }
  return Array.from(map.entries()).map(([code, { name, rows }]) => {
    const m = calcMetrics(rows);
    return {
      code, name, total: m.total, nps: m.nps,
      avgScore: avgOf(rows.map(r => r.score)),
      avgExp:   m.avgExp, avgProd: m.avgProd, avgPrec: m.avgPrec, avgAten: m.avgAten,
      promotores: m.promotores, detractores: m.detractores,
    };
  }).sort((a, b) => b.total - a.total);
}

/* ─── NPS Gauge ─── */
function Gauge({ nps, total }: { nps: number; total: number }) {
  const cx = 130, cy = 148, R = 100, sw = 20;
  const clamped = Math.max(-100, Math.min(100, nps));
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (deg: number, r: number): [number, number] => [cx + r*Math.cos(toRad(deg)), cy - r*Math.sin(toRad(deg))];
  const arc = (a: number, b: number, r: number) => {
    const [x1,y1]=pt(a,r); const [x2,y2]=pt(b,r);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${Math.abs(a-b)>180?1:0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const needleDeg = 180 - ((clamped+100)/200)*180;
  const [nx,ny] = pt(needleDeg, R-10);
  const color = nps >= 50 ? '#22c55e' : nps >= 0 ? '#f59e0b' : '#ef4444';
  const [lx,ly]=pt(180,R+sw+6); const [mx,my]=pt(90,R+sw+6); const [rx,ry]=pt(0,R+sw+6);
  return (
    <svg width={260} height={168} viewBox="0 0 260 168" className="mx-auto">
      <path d={arc(180,90,R)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" opacity={0.15}/>
      <path d={arc(90,45,R)}  fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" opacity={0.15}/>
      <path d={arc(45,0,R)}   fill="none" stroke="#22c55e" strokeWidth={sw} strokeLinecap="butt" opacity={0.15}/>
      {total > 0 && <path d={arc(180,needleDeg,R)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" opacity={0.9}/>}
      {[90,45].map(deg => { const [x1,y1]=pt(deg,R-sw/2-2); const [x2,y2]=pt(deg,R+sw/2+2); return <line key={deg} x1={x1.toFixed(2)} y1={y1.toFixed(2)} x2={x2.toFixed(2)} y2={y2.toFixed(2)} stroke="white" strokeWidth={2}/>; })}
      <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)} stroke={UAA_PURPLE} strokeWidth={3.5} strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={7} fill={UAA_PURPLE}/><circle cx={cx} cy={cy} r={3} fill="white"/>
      <text x={lx.toFixed(2)} y={(ly+4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">−100</text>
      <text x={mx.toFixed(2)} y={(my-4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">0</text>
      <text x={rx.toFixed(2)} y={(ry+4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">+100</text>
      {total > 0 ? (
        <>
          <text x={cx} y={cy-26} textAnchor="middle" fontSize={32} fontWeight="bold" fill={color} fontFamily="sans-serif">{nps>0?`+${nps}`:nps}</text>
          <text x={cx} y={cy-10} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="sans-serif">(promotores − detractores) / total</text>
        </>
      ) : (
        <text x={cx} y={cy-18} textAnchor="middle" fontSize={13} fill="#d1d5db" fontFamily="sans-serif">Sin datos</text>
      )}
    </svg>
  );
}

/* ─── Score bar ─── */
function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width:`${(v/5)*100}%`, background: UAA_PURPLE }}/>
      </div>
      <span className="text-xs font-semibold w-8 text-right">{v > 0 ? v : '—'}</span>
    </div>
  );
}

/* ─── Aspecto bar (with %) ─── */
function AspectoBar({ aspecto, n, pct, max }: { aspecto: string; n: number; pct: number; max: number }) {
  const barPct = max > 0 ? (n/max)*100 : 0;
  const good = aspecto.toLowerCase().includes('conforme');
  const color = good ? '#22c55e' : UAA_PURPLE;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-52 shrink-0 truncate" title={aspecto}>{aspecto}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width:`${barPct}%`, background: color }}/>
      </div>
      <span className="text-xs font-bold w-20 text-right whitespace-nowrap" style={{ color }}>
        {n} <span className="text-muted-foreground font-normal">({pct}%)</span>
      </span>
    </div>
  );
}

/* ─── Classification badge ─── */
function ClasifBadge({ c }: { c: string }) {
  if (c === 'promotor')  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-xs">Promotor</Badge>;
  if (c === 'pasivo')    return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-0 text-xs">Pasivo</Badge>;
  if (c === 'detractor') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-xs">Detractor</Badge>;
  return <Badge variant="secondary" className="text-xs">{c}</Badge>;
}

/* ─── Highlight matching text ─── */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const q = query.trim();
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{p}</mark>
          : p
      )}
    </>
  );
}

function Stars({ n }: { n: number }) {
  return <span className="text-amber-400 tracking-tight">{'★'.repeat(Math.max(0,n))}{'☆'.repeat(Math.max(0,5-n))}</span>;
}

function NpsTrend({ nps }: { nps: number }) {
  if (nps >= 50) return <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold"><TrendingUp className="w-3 h-3"/>Bueno</span>;
  if (nps >= 0)  return <span className="inline-flex items-center gap-1 text-yellow-600 text-xs font-semibold"><Minus className="w-3 h-3"/>Neutro</span>;
  return <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold"><TrendingDown className="w-3 h-3"/>Crítico</span>;
}

/* ─── Compact score cell ─── */
function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = value >= 4 ? 'text-green-600' : value >= 3 ? 'text-yellow-600' : 'text-red-500';
  return <span className={`text-xs font-semibold ${color}`}>{value}</span>;
}

/* ════════════════════════════════════════════
   MAIN CLIENT COMPONENT
═════════════════════════════════════════════ */
export default function DashboardClient({
  rows, email, enviados, sucursalesAll,
}: {
  rows: Row[];
  email: string;
  enviados: number;
  sucursalesAll: { code: string; name: string }[];
}) {
  const [sucursal, setSucursalRaw] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [search, setSearch] = useState('');

  function setSucursal(v: string) { setSucursalRaw(v); setSelectedDate(''); }

  /* ── Sucursal dropdown: ref_sucursal + those actually in data ── */
  const sucursales = useMemo(() => {
    const inData = new Set(rows.filter(r => r.c_sucursal).map(r => r.c_sucursal!));
    // include all from ref_sucursal that have responses OR all from ref_sucursal
    return sucursalesAll.filter(s => inData.has(s.code));
  }, [rows, sucursalesAll]);

  const bySucursal = useMemo(() =>
    sucursal ? rows.filter(r => r.c_sucursal === sucursal) : rows,
    [rows, sucursal]);

  const availableDates = useMemo(() => {
    const keys = new Set<string>();
    bySucursal.forEach(r => keys.add(getDateKey(r.respondido_at)));
    return Array.from(keys).sort().reverse();
  }, [bySucursal]);

  const filtered = useMemo(() =>
    selectedDate ? bySucursal.filter(r => getDateKey(r.respondido_at) === selectedDate) : bySucursal,
    [bySucursal, selectedDate]);

  const metrics    = useMemo(() => calcMetrics(filtered), [filtered]);
  const aspectos   = useMemo(() => calcAspectos(filtered, metrics.total), [filtered, metrics.total]);
  const sucBrkdwn  = useMemo(() => calcBySucursal(rows), [rows]); // always all data
  const comentarios = useMemo(() => {
    const withText = filtered.filter(r => r.comentario?.trim());
    if (!search.trim()) return withText;
    const q = search.trim().toLowerCase();
    return withText.filter(r =>
      r.comentario?.toLowerCase().includes(q) ||
      r.nombre_cliente?.toLowerCase().includes(q) ||
      r.sucursal_nombre?.toLowerCase().includes(q)
    );
  }, [filtered, search]);
  const recientes   = filtered.slice(0, 10);
  const maxAspecto  = aspectos.length > 0 ? aspectos[0].n : 1;

  const { total, promotores, pasivos, detractores, nps, avgExp, avgProd, avgPrec, avgAten } = metrics;

  // Response rate (global: total responses in filtered / total sent)
  const tasaNum = rows.filter(r => r.cliente_id > 0).length; // non-demo responses total
  const tasaPct = enviados > 0 ? Math.round((tasaNum / enviados) * 100) : 0;

  const sucursalLabel = sucursal ? (sucursales.find(s => s.code === sucursal)?.name ?? sucursal) : null;

  return (
    <div className="min-h-screen bg-muted/30">

      {/* Header */}
      <div className="w-full py-3.5 px-6 flex items-center justify-between shadow-sm" style={{ background: UAA_PURPLE }}>
        <div className="flex items-center gap-4">
          <Image src="/logo-clubuaa.png" alt="Club UAA" width={110} height={40} style={{ objectFit: 'contain' }}/>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">Dashboard NPS</h1>
            <p className="text-purple-300 text-xs">
              {sucursalLabel ? `Sucursal: ${sucursalLabel}` : 'Todas las sucursales'}
              {selectedDate ? ` · ${dateLabel(selectedDate)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-purple-300 text-xs hidden sm:inline">{email}</span>
          <AutoRefresh intervalMs={30000}/>
          <LogoutButton/>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Filters bar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground"/>
            <span className="text-xs text-muted-foreground">Sucursal</span>
          </div>
          <Select value={sucursal || '__all__'} onValueChange={v => setSucursal(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs w-52 bg-white">
              <SelectValue placeholder="Todas las sucursales"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las sucursales</SelectItem>
              {sucursales.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="h-4 w-px bg-border hidden sm:block"/>

          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-muted-foreground"/>
            <span className="text-xs text-muted-foreground">Fecha</span>
          </div>
          <Select value={selectedDate || '__all__'} onValueChange={v => setSelectedDate(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs w-56 bg-white">
              <SelectValue placeholder="Todas las fechas"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las fechas</SelectItem>
              {availableDates.map(k => <SelectItem key={k} value={k}>{dateLabel(k)}</SelectItem>)}
            </SelectContent>
          </Select>

          {(sucursal || selectedDate) && (
            <button
              onClick={() => { setSucursalRaw(''); setSelectedDate(''); }}
              className="h-8 px-3 text-xs rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Limpiar filtros
            </button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">{total} respuesta{total !== 1 ? 's' : ''}</div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="resumen">
          <TabsList className="mb-6 bg-white border border-border shadow-sm h-9">
            <TabsTrigger value="resumen" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5"/>Resumen
            </TabsTrigger>
            <TabsTrigger value="sucursales" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MapPin className="w-3.5 h-3.5 mr-1.5"/>Por Sucursal
            </TabsTrigger>
            <TabsTrigger value="comentarios" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageSquare className="w-3.5 h-3.5 mr-1.5"/>Comentarios
              {comentarios.length > 0 && (
                <span className="ml-1.5 bg-primary/20 text-primary rounded-full px-1.5 text-[10px] font-bold">{comentarios.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ════ TAB: RESUMEN ════ */}
          <TabsContent value="resumen" className="space-y-5">

            {/* 5 KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {[
                { label: 'Total respuestas', value: String(total),       sub: 'encuestas recibidas',                  color: UAA_PURPLE, icon: <BarChart3 className="w-4 h-4"/> },
                { label: 'Promotores',       value: String(promotores),  sub: `${total > 0 ? Math.round(promotores/total*100) : 0}% del total`, color: '#22c55e', icon: <TrendingUp className="w-4 h-4"/> },
                { label: 'Pasivos',          value: String(pasivos),     sub: `${total > 0 ? Math.round(pasivos/total*100) : 0}% del total`,    color: '#f59e0b', icon: <Minus className="w-4 h-4"/> },
                { label: 'Detractores',      value: String(detractores), sub: `${total > 0 ? Math.round(detractores/total*100) : 0}% del total`, color: '#ef4444', icon: <TrendingDown className="w-4 h-4"/> },
                { label: 'Tasa de respuesta', value: `${tasaPct}%`,     sub: `${tasaNum} respuestas / ${enviados} enviados`, color: '#6366f1', icon: <Send className="w-4 h-4"/> },
              ].map(c => (
                <Card key={c.label} className="shadow-sm border-border/60">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-xs text-muted-foreground font-medium leading-tight">{c.label}</p>
                      <span style={{ color: c.color }} className="opacity-70 shrink-0">{c.icon}</span>
                    </div>
                    <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Gauge + Score bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-0 pt-5 px-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">NPS Score</CardTitle>
                    <NpsTrend nps={nps}/>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-5">
                  <Gauge nps={nps} total={total}/>
                  {total > 0 && (
                    <div className="grid grid-cols-3 text-center text-xs mt-3 pt-3 border-t border-border/40">
                      {[
                        { dot:'bg-red-400',    label:'Detractor', val:'1–2 ★', color:'text-red-500'   },
                        { dot:'bg-yellow-400', label:'Pasivo',    val:'3 ★',   color:'text-yellow-600'},
                        { dot:'bg-green-500',  label:'Promotor',  val:'4–5 ★', color:'text-green-600' },
                      ].map(z => (
                        <div key={z.label}>
                          <div className={`w-2.5 h-2.5 rounded-full ${z.dot} mx-auto mb-1`}/>
                          <p className="text-muted-foreground">{z.label}</p>
                          <p className={`font-bold ${z.color}`}>{z.val}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-0 pt-5 px-6">
                  <CardTitle className="text-sm font-semibold">
                    Promedios por dimensión <span className="text-muted-foreground font-normal text-xs">(sobre 5)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-5 pt-4 space-y-4">
                  <ScoreBar label="Experiencia" value={avgExp}/>
                  <ScoreBar label="Productos"   value={avgProd}/>
                  <ScoreBar label="Precios"     value={avgPrec}/>
                  <ScoreBar label="Atención"    value={avgAten}/>
                </CardContent>
              </Card>
            </div>

            {/* Aspectos */}
            {aspectos.length > 0 && (
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-0 pt-5 px-6">
                  <CardTitle className="text-sm font-semibold">
                    Aspectos por mejorar
                    <span className="ml-2 text-muted-foreground font-normal text-xs">{aspectos.length} opciones · % sobre respuestas con esta opción</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-5 pt-4 space-y-3">
                  {aspectos.map(a => <AspectoBar key={a.aspecto} aspecto={a.aspecto} n={a.n} pct={a.pct} max={maxAspecto}/>)}
                </CardContent>
              </Card>
            )}

            {/* Últimas respuestas */}
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-0 pt-5 px-6">
                <CardTitle className="text-sm font-semibold">Últimas 10 respuestas</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0 pt-3">
                {recientes.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-muted-foreground text-center">Sin respuestas aún</p>
                ) : (
                  <div className="divide-y divide-border/40">
                    {recientes.map((r, i) => (
                      <div key={i} className="px-6 py-3 flex items-start gap-3">
                        <Stars n={r.score}/>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <ClasifBadge c={r.clasificacion}/>
                            {r.sucursal_nombre && <Badge variant="secondary" className="text-xs font-normal">{r.sucursal_nombre}</Badge>}
                            {r.cliente_id === 0 && <Badge variant="outline" className="text-xs font-normal text-muted-foreground">demo</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                            <span>Respuesta: {fmtAt(r.respondido_at)}</span>
                            {r.fecha_compra && <span>Compra: {r.fecha_compra}{r.hora_compra ? ` ${r.hora_compra}` : ''}</span>}
                          </div>
                          {r.comentario && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.comentario}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════ TAB: POR SUCURSAL ════ */}
          <TabsContent value="sucursales">
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-0 pt-5 px-6">
                <CardTitle className="text-sm font-semibold">
                  Rendimiento por sucursal
                  <span className="ml-2 text-muted-foreground font-normal text-xs">
                    {sucBrkdwn.length} sucursales · clic en fila para filtrar
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0 pt-3">
                {sucBrkdwn.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-muted-foreground text-center">Sin datos de sucursal disponibles.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableHead className="text-xs font-semibold pl-6 min-w-[160px]">Sucursal</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Resp.</TableHead>
                          <TableHead className="text-xs font-semibold text-center">NPS</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Score★</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Experiencia</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Productos</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Precios</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Atención</TableHead>
                          <TableHead className="text-xs font-semibold text-center">Prom. / Det.</TableHead>
                          <TableHead className="text-xs font-semibold pr-6">Tendencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sucBrkdwn.map((s, i) => (
                          <TableRow
                            key={s.code}
                            className="border-border/30 cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => setSucursal(sucursal === s.code ? '' : s.code)}
                          >
                            <TableCell className="pl-6 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{i+1}</span>
                                <span className="text-sm font-medium">{s.name}</span>
                                {sucursal === s.code && <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-0 hover:bg-primary/10">activa</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center py-2.5">
                              <span className="text-sm font-bold" style={{ color: UAA_PURPLE }}>{s.total}</span>
                            </TableCell>
                            <TableCell className="text-center py-2.5">
                              <span className={`text-sm font-bold ${s.nps >= 50 ? 'text-green-600' : s.nps >= 0 ? 'text-yellow-600' : 'text-red-500'}`}>
                                {s.nps > 0 ? `+${s.nps}` : s.nps}
                              </span>
                            </TableCell>
                            <TableCell className="text-center py-2.5">
                              <ScoreCell value={s.avgScore}/>
                            </TableCell>
                            <TableCell className="text-center py-2.5"><ScoreCell value={s.avgExp}/></TableCell>
                            <TableCell className="text-center py-2.5"><ScoreCell value={s.avgProd}/></TableCell>
                            <TableCell className="text-center py-2.5"><ScoreCell value={s.avgPrec}/></TableCell>
                            <TableCell className="text-center py-2.5"><ScoreCell value={s.avgAten}/></TableCell>
                            <TableCell className="text-center py-2.5">
                              <span className="text-xs text-green-600 font-medium">{s.promotores}</span>
                              <span className="text-xs text-muted-foreground mx-0.5">/</span>
                              <span className="text-xs text-red-500 font-medium">{s.detractores}</span>
                            </TableCell>
                            <TableCell className="pr-6 py-2.5"><NpsTrend nps={s.nps}/></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════ TAB: COMENTARIOS ════ */}
          <TabsContent value="comentarios">
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-0 pt-5 px-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <CardTitle className="text-sm font-semibold">
                    Comentarios
                    <span className="ml-2 text-muted-foreground font-normal text-xs">{comentarios.length} resultado{comentarios.length !== 1 ? 's' : ''}</span>
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar comentario, cliente o sucursal..."
                      className="h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 w-72"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-base leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0 pt-3">
                {comentarios.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-muted-foreground text-center">Sin comentarios para los filtros seleccionados</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableHead className="text-xs font-semibold pl-6 w-36">Cliente</TableHead>
                          <TableHead className="text-xs font-semibold w-32">Sucursal</TableHead>
                          <TableHead className="text-xs font-semibold w-28">Compra</TableHead>
                          <TableHead className="text-xs font-semibold w-32">Respuesta</TableHead>
                          <TableHead className="text-xs font-semibold w-24">Score</TableHead>
                          <TableHead className="text-xs font-semibold pr-6">Comentario</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comentarios.map((r, i) => (
                          <TableRow key={i} className="border-border/30 hover:bg-muted/30 align-top">
                            <TableCell className="pl-6 py-3 align-top">
                              {r.nombre_cliente
                                ? <span className="text-xs font-medium">{r.nombre_cliente}</span>
                                : r.cliente_id === 0
                                  ? <span className="text-xs text-muted-foreground italic">Demo</span>
                                  : <span className="text-xs text-muted-foreground">ID {r.cliente_id}</span>}
                            </TableCell>
                            <TableCell className="align-top py-3">
                              {r.sucursal_nombre
                                ? <Badge variant="secondary" className="text-xs font-normal whitespace-nowrap">{r.sucursal_nombre}</Badge>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="align-top py-3">
                              {r.fecha_compra
                                ? <div><p className="text-xs">{r.fecha_compra}</p>{r.hora_compra && <p className="text-xs text-muted-foreground">{r.hora_compra}</p>}</div>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="align-top py-3">
                              <p className="text-xs whitespace-nowrap">{fmtAt(r.respondido_at)}</p>
                            </TableCell>
                            <TableCell className="align-top py-3">
                              <div className="flex flex-col gap-1"><Stars n={r.score}/><ClasifBadge c={r.clasificacion}/></div>
                            </TableCell>
                            <TableCell className="align-top py-3 pr-6 max-w-xs">
                              <p className="text-xs text-foreground leading-relaxed">
                                <Highlight text={r.comentario ?? ''} query={search}/>
                              </p>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
