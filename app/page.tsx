'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, CircleDollarSign, Database, Gauge, Loader2, Search, ShieldAlert, Sparkles, Watch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Analysis = { receivedQlv: number; givenQlv: number; cashPaid: number; costs: number; riskPenalty: number; liquidityBonus: number };
type SavedListing = { id: string; source: string; brand: string; model: string; reference: string; askCents: number; confidence: number; economicAlphaCents: number; strategicScoreCents: number; createdAt: string };
const initial: Analysis = { receivedQlv: 2750, givenQlv: 2450, cashPaid: 150, costs: 50, riskPenalty: 75, liquidityBonus: 140 };
const stages = ['Discovered', 'Valued', 'Qualify seller', 'Ask questions', 'Opening offer', 'Counter', 'Pending approval'];
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export default function Home() {
  const [analysis, setAnalysis] = useState(initial);
  const [listing, setListing] = useState('https://www.reddit.com/r/Watchexchange/example');
  const [brand, setBrand] = useState('Omega');
  const [model, setModel] = useState('Seamaster Diver 300M');
  const [reference, setReference] = useState('210.30.42.20.01.001');
  const [ask, setAsk] = useState(3200);
  const [rawText, setRawText] = useState('');
  const [dealerAskMedian, setDealerAskMedian] = useState(3050);
  const [privateAskMedian, setPrivateAskMedian] = useState(2950);
  const [clearingEstimate, setClearingEstimate] = useState(2875);
  const [qlvHaircut, setQlvHaircut] = useState(10);
  const [extraction, setExtraction] = useState<{ confidence: number; evidence: string[]; missing: string[]; fetched: boolean; warning: string; source: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [stage, setStage] = useState(2);
  const [notice, setNotice] = useState('');
  const [savedListings, setSavedListings] = useState<SavedListing[]>([]);
  const [saving, setSaving] = useState(false);
  const economicAlpha = useMemo(() => analysis.receivedQlv - analysis.givenQlv - analysis.cashPaid - analysis.costs - analysis.riskPenalty, [analysis]);
  const strategicScore = economicAlpha + analysis.liquidityBonus;
  const maxCash = Math.max(0, analysis.receivedQlv - analysis.givenQlv - analysis.costs - analysis.riskPenalty - 200);
  const comparableMedian = useMemo(() => [dealerAskMedian, privateAskMedian, clearingEstimate].sort((a, b) => a - b)[1], [dealerAskMedian, privateAskMedian, clearingEstimate]);
  const update = (key: keyof Analysis, value: string) => {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    setAnalysis((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const loadListings = async () => {
    const response = await fetch('/api/listings');
    if (!response.ok) return;
    const data = await response.json() as { listings: SavedListing[] };
    setSavedListings(data.listings);
  };

  const extractListing = async () => {
    setExtracting(true); setNotice('');
    try {
      const response = await fetch('/api/normalize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: listing, text: rawText }) });
      const data = await response.json() as { brand: string; model: string; reference: string; ask: number | null; confidence: number; evidence: string[]; missing: string[]; fetched: boolean; warning: string; source: string };
      setBrand(data.brand); setModel(data.model); setReference(data.reference); setAsk(data.ask ?? 0);
      setExtraction(data); setNotice(data.warning || `Listing read successfully · ${Math.round(data.confidence * 100)}% field coverage`);
    } catch { setNotice('Could not extract this listing. You can still enter the fields manually.'); }
    finally { setExtracting(false); }
  };

  const estimateQlv = () => {
    const estimate = Math.round(comparableMedian * (1 - qlvHaircut / 100) / 25) * 25;
    setAnalysis((current) => ({ ...current, receivedQlv: estimate }));
    setNotice(`QLV estimated at ${money(estimate)} from a ${money(comparableMedian)} median and ${qlvHaircut}% liquidity haircut`);
  };

  const analyzeListing = async () => {
    setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/listings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        url: listing, rawText, brand, model, reference, ask, ...analysis, dealerAskMedian, privateAskMedian, clearingEstimate, qlvHaircutBps: qlvHaircut * 100,
      }) });
      const data = await response.json() as { error?: string; confidence?: number };
      if (!response.ok) throw new Error(data.error ?? 'Could not save listing.');
      setNotice(`Listing analyzed and saved · ${Math.round((data.confidence ?? 0) * 100)}% reference confidence`);
      setStage(1); await loadListings();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save listing.'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    void loadListings();
    const modelContext = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: unknown) => void } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: 'analyze_trade', title: 'Analyze trade',
      description: 'Update the visible watch-trade economics and return the enforced offer ceiling.',
      inputSchema: { type: 'object', properties: {
        receivedQlv: { type: 'number' }, givenQlv: { type: 'number' }, cashPaid: { type: 'number' },
        costs: { type: 'number' }, riskPenalty: { type: 'number' }, liquidityBonus: { type: 'number' },
      }, required: ['receivedQlv', 'givenQlv', 'cashPaid', 'costs', 'riskPenalty', 'liquidityBonus'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const next = input as Analysis; setAnalysis(next);
        const alpha = next.receivedQlv - next.givenQlv - next.cashPaid - next.costs - next.riskPenalty;
        return { economicAlpha: alpha, strategicScore: alpha + next.liquidityBonus, requiresHumanApproval: true };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-white/8 bg-[#07101d]/90 px-5 py-4 text-white backdrop-blur-xl lg:px-9">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between">
        <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full border border-cyan-300/25 bg-cyan-300/10"><Watch className="size-4 text-cyan-300" /></div><div><div className="font-heading text-lg font-semibold tracking-[-.03em]">Project Pepsi</div><div className="text-[11px] uppercase tracking-[.18em] text-slate-400">Trade intelligence</div></div></div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/8 px-3 py-1.5 text-xs text-emerald-200"><span className="size-1.5 rounded-full bg-emerald-300" /> Human approval enforced</div>
      </div>
    </header>
    <div className="mx-auto max-w-[1480px] px-5 py-6 lg:px-9 lg:py-8">
      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-cyan-700">Opportunity workspace</p><h1 className="max-w-3xl font-heading text-3xl font-semibold tracking-[-.04em] md:text-4xl">Know the walk-away number before you negotiate.</h1></div>
        <div className="flex min-w-0 gap-2 lg:w-[480px]"><Input aria-label="Listing URL" value={listing} onChange={(e) => { setListing(e.target.value); setExtraction(null); }} className="h-11 bg-white text-sm shadow-sm" /><Button disabled={extracting} className="h-11 bg-[#0a68a5] px-4 hover:bg-[#08598d]" onClick={extractListing}>{extracting ? <Loader2 className="animate-spin" /> : <Search />} Read listing</Button></div>
      </section>
      {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900"><CheckCircle2 className="size-4" />{notice}</div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,.82fr)]">
        <section className="overflow-hidden rounded-[22px] border bg-card shadow-[0_12px_40px_rgba(15,35,55,.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-[#f8fbfd] p-5 md:p-6">
            <div className="flex gap-4"><div className="grid size-14 place-items-center rounded-2xl bg-[#07101d] text-cyan-300"><Watch className="size-6" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold tracking-[-.03em]">{brand} {model}</h2><span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">Normalized</span></div><p className="mt-1 font-mono text-sm text-slate-500">{reference || 'Reference required'} · manual verification</p></div></div>
            <div className="text-right"><div className="text-xs uppercase tracking-wider text-slate-500">Seller ask</div><div className="text-2xl font-semibold">{money(ask)}</div></div>
          </div>
          <div className="grid gap-6 p-5 md:grid-cols-2 md:p-6">
            <div><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Listing normalization</h3><Button variant="outline" size="sm" disabled={extracting} onClick={extractListing}>{extracting ? <Loader2 className="animate-spin" /> : <Sparkles />} Extract fields</Button></div><div className="mb-4 grid grid-cols-2 gap-3">
              <Input aria-label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" />
              <Input aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
              <Input aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" className="font-mono" />
              <Input aria-label="Seller ask" type="number" min="0" value={ask} onChange={(e) => setAsk(Number(e.target.value))} placeholder="Seller ask" />
              <Textarea aria-label="Listing text" value={rawText} onChange={(e) => setRawText(e.target.value)} className="col-span-2 min-h-20 resize-none" placeholder="Paste listing description" />
            </div>{extraction && <div className={`mb-5 rounded-xl border p-3 text-xs ${extraction.warning ? 'border-amber-200 bg-amber-50' : 'border-cyan-100 bg-cyan-50/60'}`}><div className="font-semibold text-slate-900">{extraction.fetched ? `${extraction.source} page read` : 'Manual text mode'}</div><div className="mt-1 leading-5 text-slate-700">{extraction.evidence.join(' · ') || extraction.warning || 'No structured fields found.'}</div>{extraction.missing.length > 0 && <div className="mt-1 text-amber-700">Confirm manually: {extraction.missing.join(', ')}</div>}</div>}
            <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Comparable-based QLV</h3><span className="text-xs text-slate-500">Median minus haircut</span></div>
            <div className="mb-3 grid grid-cols-2 gap-3"><CompactMoney label="Dealer ask median" value={dealerAskMedian} onChange={setDealerAskMedian} /><CompactMoney label="Private ask median" value={privateAskMedian} onChange={setPrivateAskMedian} /><CompactMoney label="Clearing estimate" value={clearingEstimate} onChange={setClearingEstimate} /><label className="text-xs text-slate-500">QLV haircut %<Input type="number" min="0" max="50" value={qlvHaircut} onChange={(e) => setQlvHaircut(Number(e.target.value))} className="mt-1" /></label></div>
            <Button variant="secondary" className="mb-5 w-full" onClick={estimateQlv}>Estimate QLV · {money(Math.round(comparableMedian * (1 - qlvHaircut / 100) / 25) * 25)}</Button>
            <h3 className="mb-4 text-sm font-semibold">Trade economics</h3><div className="space-y-3">
              <MoneyRow label="Received watch QLV" value={analysis.receivedQlv} onChange={(v) => update('receivedQlv', v)} positive />
              <MoneyRow label="Your Tudor BB58 QLV" value={analysis.givenQlv} onChange={(v) => update('givenQlv', v)} />
              <MoneyRow label="Cash paid by you" value={analysis.cashPaid} onChange={(v) => update('cashPaid', v)} />
              <MoneyRow label="Transaction costs" value={analysis.costs} onChange={(v) => update('costs', v)} />
              <MoneyRow label="Expected risk loss" value={analysis.riskPenalty} onChange={(v) => update('riskPenalty', v)} warning />
            </div></div>
            <div className="rounded-2xl bg-[#07101d] p-5 text-white">
              <div className="flex items-center justify-between text-sm text-slate-400"><span>Economic alpha</span><Gauge className="size-4" /></div><div className={`mt-2 text-4xl font-semibold tracking-[-.05em] ${economicAlpha >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(economicAlpha)}</div>
              <div className="mt-5 border-t border-white/10 pt-4"><div className="flex justify-between text-sm"><span className="text-slate-400">Liquidity adjustment</span><span className="text-cyan-300">+{money(analysis.liquidityBonus)}</span></div><div className="mt-2 flex justify-between text-sm"><span className="text-slate-400">Strategic score</span><span className="font-semibold">{money(strategicScore)}</span></div></div>
              <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/8 p-3"><div className="text-xs uppercase tracking-wider text-amber-200">Hard offer ceiling</div><div className="mt-1 text-xl font-semibold">Tudor + {money(maxCash)}</div><p className="mt-1 text-xs leading-5 text-slate-400">Preserves the $200 minimum alpha. Language generation cannot exceed this limit.</p></div>
            </div>
          </div><div className="border-t bg-[#f8fbfd] px-5 py-4 md:px-6"><Button disabled={saving || !brand || !model || !reference || ask <= 0} className="h-10 w-full bg-[#0a68a5] hover:bg-[#08598d]" onClick={analyzeListing}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save completed analysis</Button></div>
        </section>
        <aside className="space-y-5">
          <section className="rounded-[22px] border bg-white p-5 shadow-[0_12px_40px_rgba(15,35,55,.06)] md:p-6">
            <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Risk review</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em]">Proceed with questions</h2></div><div className="grid size-11 place-items-center rounded-full bg-amber-100 text-amber-700"><ShieldAlert className="size-5" /></div></div>
            <Risk label="Reference consistency" detail="Case, dial and listing text agree" score="Low" tone="good" /><Risk label="Seller provenance" detail="42 confirmed transactions; account 4 years old" score="Low" tone="good" /><Risk label="Service history" detail="No receipt or service record provided" score="Medium" tone="warn" /><Risk label="Photo coverage" detail="Movement and clasp codes not shown" score="Medium" tone="warn" />
          </section>
          <section className="rounded-[22px] border bg-white p-5 shadow-[0_12px_40px_rgba(15,35,55,.06)] md:p-6">
            <div className="mb-4 flex items-center gap-2"><Sparkles className="size-4 text-cyan-700" /><h2 className="font-semibold">Supervised negotiation</h2></div>
            <div className="mb-5 flex gap-1 overflow-hidden rounded-full bg-slate-100 p-1" aria-label="Negotiation progress">{stages.map((label, index) => <button key={label} aria-label={label} title={label} onClick={() => setStage(index)} className={`h-2 flex-1 rounded-full transition ${index <= stage ? 'bg-cyan-600' : 'bg-slate-200'}`} />)}</div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Next message · {stages[stage]}</p><Textarea className="min-h-28 resize-none bg-slate-50 leading-6" defaultValue="Thanks — could you share clear photos of the clasp code, caseback, and warranty card? Also, has the watch been pressure-tested or serviced recently?" />
            <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" className="h-10" onClick={() => setNotice('Draft saved — nothing has been sent')}>Save draft</Button><Button className="h-10 bg-[#0a68a5] hover:bg-[#08598d]" onClick={() => { setStage(Math.min(6, stage + 1)); setNotice('Message marked ready for your review'); }}>Review message <ChevronRight /></Button></div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><CircleDollarSign className="size-3.5" />No binding acceptance or meetup can be sent.</div>
          </section>
        </aside>
      </div>
      <section className="mt-5 rounded-[22px] border bg-white p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Database className="size-4 text-cyan-700" /><h2 className="font-semibold">Saved analyses</h2></div><span className="text-xs text-slate-500">Persistent history</span></div>
        {savedListings.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No saved listings yet. Analyze the listing above to create the first record.</p> : <div className="divide-y overflow-hidden rounded-xl border">{savedListings.map((item) => <div key={item.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[110px_minmax(0,1fr)_150px_120px] md:items-center"><span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-xs uppercase text-slate-600">{item.source}</span><div><div className="font-medium">{item.brand} {item.model}</div><div className="font-mono text-xs text-slate-500">{item.reference} · {Math.round(item.confidence * 100)}% match</div></div><div className="text-slate-500">Ask {money(item.askCents / 100)}</div><div className={`font-mono font-semibold ${item.economicAlphaCents >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(item.economicAlphaCents / 100)} alpha</div></div>)}</div>}
      </section>
      <section className="mt-5 rounded-[22px] border bg-white p-5 md:p-6"><div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Path to GMT-Master II</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em]">Trade graph</h2></div><span className="text-sm text-slate-500">Liquidity-weighted route</span></div><div className="flex items-center gap-2 overflow-x-auto pb-1"><GraphNode name="Tudor BB58" value="$2,450" active /><ArrowRight className="size-4 shrink-0 text-slate-300" /><GraphNode name="Omega SMP" value="$2,750" next /><ArrowRight className="size-4 shrink-0 text-slate-300" /><GraphNode name="Rolex Explorer" value="$6,300" /><ArrowRight className="size-4 shrink-0 text-slate-300" /><GraphNode name="GMT-Master II" value="Target" /></div></section>
    </div>
  </main>;
}

function MoneyRow({ label, value, onChange, positive, warning }: { label: string; value: number; onChange: (v: string) => void; positive?: boolean; warning?: boolean }) {
  return <label className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 text-sm"><span className="text-slate-600">{label}</span><span className="relative w-28"><span className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${positive ? 'text-emerald-600' : warning ? 'text-amber-600' : 'text-slate-400'}`}>$</span><Input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 pl-6 text-right font-mono" /></span></label>;
}
function CompactMoney({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-xs text-slate-500">{label}<span className="relative mt-1 block"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">$</span><Input type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} className="pl-6 font-mono" /></span></label>;
}
function Risk({ label, detail, score, tone }: { label: string; detail: string; score: string; tone: 'good' | 'warn' }) {
  return <div className="flex items-start justify-between gap-4 border-t py-3 first:border-t-0 first:pt-0"><div><div className="text-sm font-medium">{label}</div><div className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${tone === 'good' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{score}</span></div>;
}
function GraphNode({ name, value, active, next }: { name: string; value: string; active?: boolean; next?: boolean }) {
  return <div className={`min-w-44 rounded-2xl border p-4 ${active ? 'border-slate-800 bg-[#07101d] text-white' : next ? 'border-cyan-300 bg-cyan-50' : 'bg-slate-50'}`}><div className={`text-xs ${active ? 'text-slate-400' : 'text-slate-500'}`}>{active ? 'You own' : next ? 'Current opportunity' : 'Candidate step'}</div><div className="mt-1 font-semibold">{name}</div><div className={`mt-2 font-mono text-sm ${next ? 'text-cyan-800' : active ? 'text-cyan-300' : 'text-slate-500'}`}>{value}</div></div>;
}
