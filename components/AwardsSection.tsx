'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimationManager } from '../lib/animations';
import dynamic from 'next/dynamic';

interface AwardItem { 
  title: string; 
  place: string; 
  date: string; 
  description: string; 
  badges?: string[]; 
}

interface ContextPayload { 
  awards: AwardItem[]; 
}

export default function AwardsSection() {
  const [dynamicData, setDynamicData] = useState<ContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AnimationManager.initScrollAnimations();
  }, []);

  // Fetch context.json (public) for dynamic awards
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/context.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load context');
        const json = await res.json();
        if (!cancelled) {
          const payload: ContextPayload = { awards: json.awards || [] };
          setDynamicData(payload);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to fetch');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const awards = dynamicData?.awards || [];

  // Client-only map to avoid SSR hydration mismatches
  const HitchhikeMap = useMemo(() => dynamic(() => import('./HitchhikeMap'), { ssr: false }), []);

  // Whether to render a decorative filler to occupy bottom-right gap (3-column xl layout with 5 awards leaves one empty cell)
  const showAwardsFiller = useMemo(() => awards.length % 3 !== 0, [awards.length]);
  const awardStats = useMemo(() => {
    const firsts = awards.filter(a => /1st/i.test(a.place)).length;
    const seconds = awards.filter(a => /2nd/i.test(a.place)).length;
    const thirds = awards.filter(a => /3rd/i.test(a.place)).length;
    const cash = awards.filter(a => /cash/i.test(a.place)).length;
    return { firsts, seconds, thirds, cash };
  }, [awards]);

  // Dynamic badge tags per award title
  const awardTags = (title: string, place: string): string[] => {
    title = title.toLowerCase();
    if (title.includes('snapchat')) return ['AR', '1M+ USES', 'IMPACT'];
    if (title.includes("dragon")) return ['LEADERSHIP', 'CHARITY', 'INNOVATION'];
    if (title.includes('public speaking')) return ['COMMUNICATION', 'ADVOCACY', place.toUpperCase()];
    if (title.includes('hacksheffield')) return ['GITHUB', 'BEST REPO', 'ENGINEERING'];
    if (title.includes("engineering you")) return ['ROBOTICS', 'AI', 'SWARM'];
    return ['ACHIEVEMENT'];
  };

  function palette(place: string) {
    if (/1st/i.test(place)) return { ring: 'from-amber-300 via-yellow-500 to-orange-600', glass: 'bg-amber-400/10', accent: 'text-amber-300', shadow: 'shadow-[0_0_25px_-2px_rgba(255,191,71,0.35)]' };
    if (/2nd/i.test(place)) return { ring: 'from-slate-200 via-gray-400 to-zinc-600', glass: 'bg-gray-300/10', accent: 'text-gray-200', shadow: 'shadow-[0_0_22px_-2px_rgba(200,200,200,0.30)]' };
    if (/3rd/i.test(place)) return { ring: 'from-amber-700 via-orange-600 to-red-600', glass: 'bg-orange-500/10', accent: 'text-orange-300', shadow: 'shadow-[0_0_22px_-2px_rgba(255,140,60,0.30)]' };
    if (/cash/i.test(place)) return { ring: 'from-emerald-300 via-emerald-500 to-teal-600', glass: 'bg-emerald-400/10', accent: 'text-emerald-300', shadow: 'shadow-[0_0_25px_-2px_rgba(16,185,129,0.35)]' };
    return { ring: 'from-purple-300 via-fuchsia-500 to-blue-600', glass: 'bg-purple-400/10', accent: 'text-purple-300', shadow: 'shadow-[0_0_22px_-2px_rgba(192,132,252,0.30)]' };
  }

  return (
    <div className="py-20 bg-[#0A0A0A]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Loading / Error States */}
        {loading && <p className="text-center text-gray-500 mb-8 animate-pulse">Loading awards...</p>}
        {error && <p className="text-center text-red-400 mb-8">{error}</p>}

        {/* Awards Section dynamic */}
        <div className="relative animate-on-scroll" id="awards">
          <h3 className="text-3xl font-bold text-white mb-4 text-center tracking-tight">Awards & Distinctions</h3>
          <p className="text-center text-gray-400 mb-14 max-w-3xl mx-auto text-sm md:text-base">A constellation of recognitions – visualised as radiant tokens in an orbital field. Hover to unlock layered glow, motion, and metadata.</p>

          <div className="relative grid gap-10 sm:gap-12 md:gap-14 lg:grid-cols-2 xl:grid-cols-3">
            {awards.map((a, i) => {
              const p = palette(a.place);
              return (
                <div key={a.title} className={`group relative isolate rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.015] p-[1px] backdrop-blur-sm overflow-hidden ${p.shadow} hover:shadow-[0_0_38px_-4px_rgba(120,120,255,0.45)] transition-all duration-500`}>
                  {/* Animated perimeter ring */}
                  <div className={`absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500 [mask-image:radial-gradient(circle_at_30%_30%,white,transparent_75%)] bg-gradient-conic ${p.ring} animate-spin-slow`} />
                  {/* Interior glass panel */}
                  <div className={`relative z-10 h-full rounded-2xl ${p.glass} px-5 py-6 flex flex-col gap-4 border border-white/5`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-lg md:text-xl font-semibold text-white leading-snug flex items-center gap-2">
                          <span className="inline-block w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-500 to-purple-600" />
                          {a.title}
                        </h4>
                        <p className={`text-xs font-medium uppercase tracking-wider mt-1 ${p.accent}`}>{a.place}</p>
                      </div>
                      <div className="relative">
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 overflow-hidden">
                          <div className={`absolute inset-0 bg-gradient-to-br ${p.ring} opacity-30 mix-blend-overlay`} />
                          <span className="text-[10px] font-bold tracking-wide text-white/80 leading-tight text-center">
                            {a.date.split(' ')[1]}<br />{a.date.split(' ')[0]}
                          </span>
                        </div>
                        <span className="absolute -inset-2 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-20 blur-xl transition" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed line-clamp-none">{a.description}</p>
                    {/* Orbiting micro badges (custom per award) */}
                    <div className="relative mt-1 h-8">
                      <span className="absolute inset-0 flex items-center gap-2 text-[10px] font-mono tracking-wider text-white/40">
                        {a.badges && a.badges.map((b: string, bi: number) => (
                          <span
                            key={b}
                            className={`px-2 py-1 rounded-md bg-white/5 border border-white/10 backdrop-blur-sm group-hover:bg-white/10 transition ${bi === 2 ? 'hidden md:inline' : ''}`}
                          >
                            {b}
                          </span>
                        ))}
                      </span>
                      <div className="absolute w-20 h-20 -top-6 -right-6 pointer-events-none opacity-0 group-hover:opacity-70 transition duration-700">
                        <div className="absolute inset-0 rounded-full border border-white/10 animate-award-orbit" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-fuchsia-400 shadow-[0_0_8px_2px_rgba(120,120,255,0.6)]" />
                      </div>
                    </div>
                  </div>
                  {/* Top light sheen */}
                  <div className="pointer-events-none absolute -inset-[1px] rounded-2xl overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.35),transparent_55%)] opacity-0 group-hover:opacity-60 transition duration-700" />
                  </div>
                </div>
              );
            })}
            {showAwardsFiller && (
              <div className="hidden xl:flex flex-col relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-800/10 p-6 overflow-hidden group shadow-[0_0_40px_-12px_rgba(100,100,255,0.25)]">
                <div className="absolute -inset-px bg-[radial-gradient(circle_at_85%_85%,rgba(99,102,241,0.35),transparent_60%)] opacity-60 pointer-events-none" />
                <div className="absolute -right-16 -bottom-16 w-64 h-64 rounded-full bg-[conic-gradient(from_0deg,rgba(139,92,246,0.5),transparent_55%)] blur-2xl opacity-40 animate-spin-slow" />
                <header className="relative z-10 mb-4">
                  <h4 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
                    <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-500 to-purple-600" />
                    Summary & Trajectory
                  </h4>
                  <p className="text-[11px] uppercase tracking-wider text-white/50 mt-1">Snapshot Metrics</p>
                </header>
                <div className="relative z-10 grid grid-cols-2 gap-4 text-[11px] font-medium">
                  <div className="space-y-1">
                    <span className="block text-white/60">Total Awards</span>
                    <span className="text-xl font-bold text-white">{awards.length}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-white/60">1st Places</span>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-500">{awardStats.firsts}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-white/60">2nd Places</span>
                    <span className="text-xl font-bold text-gray-200">{awardStats.seconds}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-white/60">3rd Places</span>
                    <span className="text-xl font-bold text-orange-300">{awardStats.thirds}</span>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <span className="block text-white/60 mb-1">Momentum</span>
                    <div className="flex items-end gap-2 h-14">
                      {[awardStats.firsts, awardStats.seconds, awardStats.thirds, awardStats.cash].map((v, bi) => {
                        const h = (v === 0 ? 4 : 12 + v * 8);
                        const colors = ['from-amber-300 to-orange-600','from-gray-200 to-gray-500','from-orange-300 to-red-600','from-emerald-300 to-teal-600'];
                        const labels = ['1st','2nd','3rd','Cash'];
                        return (
                          <div key={bi} className="flex flex-col items-center justify-end gap-1 w-8">
                            <div className={`w-full rounded-t-md bg-gradient-to-b ${colors[bi]} relative overflow-hidden`} style={{height:h}}>
                              <div className="absolute inset-0 opacity-0 group-hover:opacity-60 mix-blend-overlay bg-[radial-gradient(circle_at_40%_20%,rgba(255,255,255,0.6),transparent_60%)] transition" />
                            </div>
                            <span className="text-[9px] tracking-wider text-white/50">{labels[bi]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-2xl" />
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>
            )}
          </div>
        </div>

        {/* Hitchhiking route map under awards (client-only) */}
        <div className="mt-16">
          <HitchhikeMap />
        </div>

        <style jsx global>{`
          @keyframes spin-slow { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }
          @keyframes award-orbit { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }
          .animate-spin-slow { animation: spin-slow 18s linear infinite; }
          .animate-award-orbit { animation: award-orbit 10s linear infinite; }
          .award-orb { position:absolute; width:320px; height:320px; background:radial-gradient(circle at 30% 30%, rgba(140,70,255,0.55), rgba(40,0,60,0.0)); filter:blur(40px); opacity:0.35; animation: orbFloat 12s ease-in-out infinite; }
          .award-orb:nth-child(2){ width:260px; height:260px; background:radial-gradient(circle at 30% 30%, rgba(60,180,255,0.55), rgba(0,40,60,0.0)); animation-duration:14s;} 
          .award-orb:nth-child(3){ width:300px; height:300px; background:radial-gradient(circle at 30% 30%, rgba(0,255,180,0.45), rgba(0,60,40,0.0)); animation-duration:16s;} 
          @keyframes orbFloat { 0%,100% { transform:translate3d(0,0,0) scale(1);} 50% { transform:translate3d(0,-30px,0) scale(1.08);} }
          .award-grid-lines { position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px); background-size:60px 60px; mask-image:radial-gradient(circle at 50% 50%, black 35%, transparent 75%); opacity:0.4; }
        `}</style>
      </div>
    </div>
  );
}
