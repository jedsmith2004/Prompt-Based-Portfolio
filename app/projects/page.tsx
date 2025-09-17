'use client';

import { useEffect, useState, useMemo } from 'react';
import { projects, Project } from '../../lib/projects-data';
import { AnimationManager } from '../../lib/animations';
import Link from 'next/link';

export default function AllProjectsPage() {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [showAllTech, setShowAllTech] = useState(false);

  useEffect(() => {
    AnimationManager.initScrollAnimations();
    AnimationManager.initPersistentReveals();
  }, []);

  // Stable square configs (avoids hydration mismatch)
  const squares = useMemo(() => {
    const count = 22;
    const arr: { left: number; top: number; size: number; dx: number; dy: number; dur: number; delay: number; }[] = [];
    for (let i = 0; i < count; i++) {
      const size = 40 + Math.random() * 90; // 40-130px
      arr.push({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size,
        dx: (Math.random() * 120 - 60),
        dy: (Math.random() * 120 - 60),
        dur: 18 + Math.random() * 24, // 18-42s
        delay: Math.random() * 10
      });
    }
    return arr;
  }, []);

  const sortedTech = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => p.tech.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return Object.entries(counts)
      .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tech]) => tech);
  }, []);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const matchesFilter = filter === 'all' || p.tech.includes(filter);
      const s = search.toLowerCase();
      const matchesSearch = !s || p.title.toLowerCase().includes(s) || p.description.toLowerCase().includes(s) || p.tech.some(t => t.toLowerCase().includes(s));
      return matchesFilter && matchesSearch;
    });
  }, [filter, search]);

  // Re-run lift animation binding when filtered list changes
  useEffect(() => {
    AnimationManager.animateLiftCards('.project-card');
  }, [filtered]);

  const visibleTech = sortedTech.slice(0,5);
  const remainingCount = sortedTech.length - visibleTech.length;

  return (
    <div className="min-h-screen relative overflow-hidden pt-32 pb-24 text-white bg-[#0A0A0A]">
      {/* Animated Small Squares Background */}
      <div className="pointer-events-none absolute inset-0">
        {/* Subtle static grid baseline */}
        <div className="absolute inset-0 opacity-[0.12] animated-grid-squares" />
        {/* Squares layer */}
        <div className="absolute inset-0">{
          squares.map((sq, i) => (
            <div
              key={i}
              className="absolute rounded-md bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(239,68,68,0.18))] border border-white/5 backdrop-blur-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] mix-blend-screen will-change-transform square-anim"
              style={{
                left: `${sq.left}%`,
                top: `${sq.top}%`,
                width: sq.size,
                height: sq.size,
                // Custom properties consumed by CSS keyframes
                ['--dx' as any]: `${sq.dx}px`,
                ['--dy' as any]: `${sq.dy}px`,
                ['--dur' as any]: `${sq.dur}s`,
                ['--delay' as any]: `${sq.delay}s`
              }}
            />
          ))
        }</div>
        {/* Intersection highlight pass (moving radial that reveals overlaps) */}
        <div className="absolute inset-0 pointer-events-none mix-blend-color-dodge opacity-40 [background:radial-gradient(circle_at_var(--mx,50%)_var(--my,50%),rgba(59,130,246,0.35),transparent_55%)] animate-orb-pointer" />
        {/* Vignette */}
        <div className="absolute inset-0 [background:radial-gradient(circle_at_center,transparent_60%,rgba(0,0,0,0.65))]" />
      </div>

      {/* Back Button */}
      <div className="absolute top-6 left-6 z-30 animate-on-scroll">
        <Link href="/" className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-400/50 transition-all backdrop-blur-md">
          <svg className="w-4 h-4 text-gray-300 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium tracking-wide text-gray-300 group-hover:text-white">Back</span>
        </Link>
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <header className="animate-on-scroll mb-14">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-5">
            <span className="text-white">All</span>{' '}
            <span className="bg-gradient-to-r from-blue-400 to-red-400 bg-clip-text text-transparent">Projects</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 leading-relaxed max-w-2xl">
            A vertical timeline of shipped and evolving work. Each build pushes experimentation with AI, interaction, and edge performance.
          </p>
        </header>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-12 animate-on-scroll">
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${filter === 'all' ? 'bg-blue-600/80 border-blue-400 text-white shadow-[0_0_0_1px_#3b82f680,0_0_15px_-4px_#ef4444]' : 'bg-white/5 border-white/10 hover:border-blue-400/40 hover:text-blue-300'}`}>All</button>
            {visibleTech.map(tech => (
              <button key={tech} onClick={() => setFilter(tech)} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${filter === tech ? 'bg-red-600/80 border-red-400 text-white shadow-[0_0_0_1px_rgba(239,68,68,0.5),0_0_15px_-4px_rgba(59,130,246,0.55)]' : 'bg-white/5 border-white/10 hover:border-red-400/40 hover:text-red-300'}`}>{tech}</button>
            ))}
            {remainingCount > 0 && (
              <button onClick={() => setShowAllTech(true)} className="px-4 py-1.5 rounded-full text-xs font-medium transition-all border bg-white/5 border-white/10 hover:border-red-400/40 text-gray-300 hover:text-red-300">+{remainingCount} more</button>
            )}
          </div>

          <div className="relative w-full md:w-72 group">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500/60 outline-none transition-all placeholder:text-gray-500 backdrop-blur-md text-sm"
            />
            <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M5 11a6 6 0 1112 0 6 6 0 01-12 0z" /></svg>
          </div>
        </div>

        {/* Vertical Cards */}
        <div className="space-y-10">
          {filtered.map((project, idx) => (
            <ProjectCard key={project.id} project={project} index={idx} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-gray-500 mt-20 animate-on-scroll">
            <p>No projects match your criteria.</p>
          </div>
        )}
      </div>

      {/* All tech modal/panel */}
      {showAllTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowAllTech(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-xl bg-white/10 border border-white/20 rounded-2xl p-8 overflow-hidden" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-6">Filter by Technology</h2>
            <div className="flex flex-wrap gap-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
              {sortedTech.map(t => (
                <button
                  key={t}
                  onClick={() => { setFilter(t); setShowAllTech(false); }}
                  className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${filter === t ? 'bg-blue-600/80 border-blue-400 text-white' : 'bg-white/5 border-white/10 hover:border-red-400/40 hover:text-red-300 text-gray-300'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowAllTech(false)} className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  return (
    <div
      className="project-card reveal-once relative group rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden transition-all hover:border-blue-500/40 hover:bg-white/[0.06]"
      data-reveal-delay={(index * 0.08).toFixed(2)}
    >
      {/* Removed left accent bar */}
      <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-gradient-to-br from-blue-500/10 to-red-500/10 blur-3xl opacity-0 group-hover:opacity-60 transition-opacity" />

      <div className="relative p-10 md:p-14">{/* increased padding from p-8 md:p-12 */}
        {/* Header with title left, status/date right */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight group-hover:text-blue-300 transition-colors">{/* was text-2xl md:text-3xl */}
              {project.title}
            </h2>
            <p className="text-gray-300/90 leading-relaxed text-sm md:text-base max-w-2xl mt-3">
              {project.description}
            </p>
          </div>
          <div className="flex items-center md:items-start gap-4 md:flex-row md:text-right shrink-0">
            {project.status && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide uppercase border shadow-sm whitespace-nowrap ${project.status === 'completed' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-red-500/15 text-red-300 border-red-500/30'}`}>
                {project.status === 'completed' ? 'Completed' : 'In Progress'}
              </span>
            )}
            {project.date && (
              <div className="flex items-center gap-2 text-sm font-medium text-gray-300 whitespace-nowrap">
                {/* Monochrome calendar icon (inherits text color) */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{project.date}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tech & Features */}
        <div className="grid md:grid-cols-5 gap-8 mt-8">
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-xs uppercase tracking-wider text-gray-400">Tech Stack</h3>
            <div className="flex flex-wrap gap-2">
              {project.tech.map(t => (
                <span key={t} className="px-3 py-1.5 rounded-full text-[10px] md:text-xs bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="md:col-span-3 space-y-4">
            <h3 className="text-xs uppercase tracking-wider text-gray-400">Key Features</h3>
            <ul className="grid sm:grid-cols-2 gap-2 text-[13px] text-gray-300">
              {(project.features || []).map(f => (
                <li key={f} className="relative pl-4 leading-snug">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-400 to-red-400" />
                  {f}
                </li>
              ))}
              {(!project.features || project.features.length === 0) && (
                <li className="italic text-gray-500">Feature list coming soon...</li>
              )}
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href={project.github}
            target="_blank"
            className="group/action inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-sm font-medium text-white transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.12-1.47-1.12-1.47-.92-.63.07-.62.07-.62 1.02.07 1.56 1.05 1.56 1.05.9 1.54 2.36 1.1 2.94.84.09-.65.35-1.1.63-1.35-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.29.1-2.68 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.8c.85.004 1.71.12 2.51.35 1.9-1.29 2.74-1.02 2.74-1.02.55 1.39.2 2.42.1 2.68.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .26.18.57.69.47A10 10 0 0012 2z"/></svg>
            <span>Source</span>
          </a>
          {project.demo && (
            <a
              href={project.demo}
              target="_blank"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-500 hover:to-red-500 text-sm font-medium text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              <span>Live</span>
            </a>
          )}
          {!project.demo && (
            <button disabled className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 text-sm font-medium text-gray-500 border border-white/10 cursor-not-allowed">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>No Demo</span>
            </button>
          )}
        </div>
      </div>{/* end padded container */}
    </div>
  );
}
