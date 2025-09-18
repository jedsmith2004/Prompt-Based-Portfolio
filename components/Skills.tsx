'use client';

import { useEffect, useMemo } from 'react';
import { AnimationManager } from '../lib/animations';
import { projects } from '../lib/projects-data';

// Mapping of individual tech strings to broad categories (core 4 used for quadrants)
const techCategoryMap: Record<string, string> = {
  // Frontend / UI / Presentation
  'React': 'Frontend', 'Next.js': 'Frontend', 'Typescript': 'Frontend', 'TypeScript': 'Frontend', 'JavaScript': 'Frontend', 'Tailwind CSS': 'Frontend', 'GSAP': 'Frontend', 'Three.js': 'Frontend', 'HAML': 'Frontend', 'Bootstrap': 'Frontend', 'Shaders': 'Frontend', 'Swift': 'Frontend', 'Pygame': 'Frontend',
  // Backend / Core Platform
  'Ruby on Rails': 'Backend', 'PostgreSQL': 'Backend', 'SQLite': 'Backend', 'Flask': 'Backend', 'Node.js': 'Backend', 'GraphQL': 'Backend', 'REST APIs': 'Backend', 'ActiveStorage': 'Backend', 'Python': 'Backend',
  // AI / ML / Data / Computational
  'AI': 'AI/ML', 'ML': 'AI/ML', 'Machine Learning': 'AI/ML', 'LLama.cpp': 'AI/ML', 'GGUF': 'AI/ML', 'TensorFlow': 'AI/ML', 'PyTorch': 'AI/ML', 'Computer Vision': 'AI/ML', 'NLP': 'AI/ML', '3D Graphics': 'AI/ML', 'Rasterization': 'AI/ML', 'NumPy': 'AI/ML', 'SciPy': 'AI/ML', 'Mathematics': 'Tools', 'Object representation': 'AI/ML',
  // Tools / Infra / Dev Productivity
  'Docker': 'Tools', 'AWS': 'Tools', 'Vercel': 'Tools', 'Git': 'Tools', 'Figma': 'Tools', 'Adobe Creative Suite': 'Tools', 'Prismic CMS': 'Tools', 'Slice Machine': 'Tools', 'PostCSS': 'Tools', 'Cloudflare': 'Tools', 'Rake': 'Tools', 'WSL': 'Tools', 'Gitlab': 'Tools', 'ShakerPacker': 'Tools'
};

interface RawSkill { name: string; count: number; weight: number; category: string; }
interface PositionedSkill extends RawSkill { x: number; y: number; fontSize: string; padding: { x: number; y: number }; rotation: number; hue: number; lightness: number; }
interface CategoryQuadrant { name: string; skills: PositionedSkill[]; total: number; }

export default function Skills() {
  useEffect(() => {
    AnimationManager.initScrollAnimations();
  }, []);

  // After first paint, run collision resolution to prevent overlaps in each quadrant
  useEffect(() => {
    function resolveAll() {
      const quadrantEls = document.querySelectorAll<HTMLElement>('.skill-quadrant');
      quadrantEls.forEach(container => resolveCollisions(container));
    }

    function resolveCollisions(container: HTMLElement) {
      const field = container.querySelector<HTMLElement>('.skill-field') || container;
      const pills = Array.from(field.querySelectorAll<HTMLElement>('[data-skill]'));
      if (!pills.length) return;

      // Measure after initial paint
      const rect = field.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const margin = 4; // gap between pills
      const hoverReserve = 1.05; // reserve for hover scale
      const boundsPadding = 6;   // inner padding from edges

      interface NodeInfo {
        el: HTMLElement;
        w: number; h: number; halfW: number; halfH: number; area: number;
        x: number; y: number; placed: boolean;
      }

      // Collect size info first (assumes current transform is translate)
      const nodes: NodeInfo[] = pills.map(el => {
        const b = el.getBoundingClientRect();
        const w = b.width; const h = b.height;
        return { el, w, h, halfW: w/2, halfH: h/2, area: w*h, x: centerX, y: centerY, placed: false };
      });

      // Sort largest first (area then max dimension) for better packing
      nodes.sort((a,b) => b.area - a.area || Math.max(b.w,b.h) - Math.max(a.w,a.h));

      // Rectangle overlap test with margin & hover scaling reservation
      function overlaps(a: NodeInfo, b: NodeInfo, scale: number) {
        const aw = a.halfW * hoverReserve * scale + margin;
        const ah = a.halfH * hoverReserve * scale + margin;
        const bw = b.halfW * hoverReserve * scale + margin;
        const bh = b.halfH * hoverReserve * scale + margin;
        return Math.abs(a.x - b.x) < (aw + bw) && Math.abs(a.y - b.y) < (ah + bh);
      }

      // Clamp inside field bounds considering scale & hover
      function clamp(n: NodeInfo, scale: number) {
        const effW = n.halfW * hoverReserve * scale;
        const effH = n.halfH * hoverReserve * scale;
        if (n.x - effW < boundsPadding) n.x = boundsPadding + effW;
        if (n.x + effW > width - boundsPadding) n.x = width - boundsPadding - effW;
        if (n.y - effH < boundsPadding) n.y = boundsPadding + effH;
        if (n.y + effH > height - boundsPadding) n.y = height - boundsPadding - effH;
      }

      // Archimedean spiral function (word-cloud style)
      function placeAll(scale: number): boolean {
        const placed: NodeInfo[] = [];
        const TWO_PI = Math.PI * 2;
        const angleStep = 0.28; // smaller -> tighter revolutions
        const radialStep = 2.4; // base radial increment per revolution
        // Try to keep memory of previously used theta start to avoid directional bias
        let thetaSeed = 0;

        for (const node of nodes) {
            const maxAttempts = 2200; // generous attempts for long pills
            let placedNode = false;
            // Start near center with small random phase offset (deterministic seed via element text)
            const name = node.el.textContent || '';
            let localTheta = (Array.from(name).reduce((h,c)=> (h*31 + c.charCodeAt(0))|0, 0) & 0xffff) / 0xffff * TWO_PI;
            localTheta += thetaSeed; // drift seed
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              // Spiral radius grows with sqrt to stay dense
              const r = (radialStep + 0.12 * (node.w + node.h) * 0.5 * scale) * Math.sqrt(attempt * 0.35);
              const theta = localTheta + attempt * angleStep;
              node.x = centerX + r * Math.cos(theta);
              node.y = centerY + r * Math.sin(theta);
              clamp(node, scale);
              let collision = false;
              for (const other of placed) {
                if (overlaps(node, other, scale)) { collision = true; break; }
              }
              if (!collision) {
                node.placed = true; placed.push(node); placedNode = true; thetaSeed += 0.11; break; }
            }
            if (!placedNode) return false; // fail layout at this scale
        }
        return true;
      }

      // Adaptive scaling fallback: try scale 1 downward
      const scales = [1, 0.97, 0.94, 0.91, 0.88, 0.85];
      let usedScale = 1;
      let success = false;
      for (const s of scales) {
        // Reset positions each trial
        nodes.forEach(n => { n.x = centerX; n.y = centerY; n.placed = false; });
        if (placeAll(s)) { usedScale = s; success = true; break; }
      }

      if (!success) {
        // As a last resort, just stack vertically centered without overlap (should be rare)
        let yCursor = boundsPadding;
        nodes.forEach(n => {
          n.x = centerX;
          n.y = yCursor + n.halfH;
          yCursor += n.halfH * 2 + margin;
          clamp(n, usedScale);
        });
      }

      // Apply final positions (percentage) & scale transform
      nodes.forEach(n => {
        const px = (n.x / width) * 100;
        const py = (n.y / height) * 100;
        const base = 'translate(-50%, -50%)';
        const scaleStr = usedScale !== 1 ? ` scale(${usedScale})` : '';
        n.el.style.left = px + '%';
        n.el.style.top = py + '%';
        n.el.style.transform = base + scaleStr;
        n.el.style.transformOrigin = 'center center';
      });
    }

    const raf = requestAnimationFrame(() => resolveAll());
    const timeout = setTimeout(resolveAll, 600);
    window.addEventListener('resize', resolveAll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      window.removeEventListener('resize', resolveAll);
    };
  }, []);

  // Compute quadrant bubble layouts
  const quadrants = useMemo<CategoryQuadrant[]>(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => p.tech.forEach(t => { if (!t) return; counts[t] = (counts[t] || 0) + 1; }));
    const entries = Object.entries(counts);
    if (!entries.length) return [];

    // Build raw skills WITHOUT global weighting
    const raw: RawSkill[] = entries.map(([name, count]) => ({
      name,
      count,
      weight: 0, // placeholder, will be set per-category
      category: techCategoryMap[name] || 'Other'
    }));

    const core = ['Frontend', 'Backend', 'AI/ML', 'Tools'];
    raw.forEach(s => { if (!core.includes(s.category)) s.category = 'Backend'; }); // Fallback now goes to Backend instead of Tools to avoid ML misclassification

    const grouped: Record<string, RawSkill[]> = { Frontend: [], Backend: [], 'AI/ML': [], Tools: [] };
    raw.forEach(s => grouped[s.category].push(s));

    // Assign weights relative to EACH CATEGORY (local max) instead of global
    core.forEach(cat => {
      const arr = grouped[cat];
      if (!arr.length) return;
      const min = Math.min(...arr.map(s => s.count));
      const max = Math.max(...arr.map(s => s.count));
      arr.forEach(s => {
        if (max === min) {
          s.weight = 0.65; // uniform medium size if only one or all equal
        } else {
          s.weight = (s.count - min) / (max - min); // 0..1 within category
        }
      });
    });

    // Layout helpers (same as before)
    const hash = (str: string) => { let h = 0; for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0; return Math.abs(h); };
    const golden = Math.PI * (3 - Math.sqrt(5));

    function layout(skills: RawSkill[]): PositionedSkill[] {
      if (!skills.length) return [];
      const sorted = [...skills].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
      const placed: PositionedSkill[] = [];
      let maxR = 0; const spacing = 8; // tighter spiral spacing
      sorted.forEach((s, i) => {
        const r = spacing * Math.sqrt(i);
        const theta = i * golden;
        maxR = Math.max(maxR, r);
        placed.push({
          ...s,
          x: r * Math.cos(theta),
          y: r * Math.sin(theta),
          fontSize: '',
          padding: { x: 0, y: 0 },
          rotation: 0,
          hue: 0,
          lightness: 0
        });
      });
      placed.forEach(p => {
        const nx = p.x / (maxR || 1);
        const ny = p.y / (maxR || 1);
        p.x = 50 + nx * 42;
        p.y = 50 + ny * 42;
        const fontMin = 0.70, fontMax = 1.85;
        p.fontSize = (fontMin + (fontMax - fontMin) * p.weight).toFixed(3) + 'rem';
        p.padding = { x: 0.55 + 0.75 * p.weight, y: 0.28 + 0.38 * p.weight };
        const baseHue = { 'Frontend': 210, 'Backend': 265, 'AI/ML': 300, 'Tools': 180 }[p.category] ?? 220;
        p.hue = (baseHue + (hash(p.name) % 18) - 9);
        p.lightness = 60 + p.weight * 18;
      });
      return placed;
    }

    const quadrants: CategoryQuadrant[] = core.map(cat => ({
      name: cat,
      skills: layout(grouped[cat]),
      total: grouped[cat].reduce((a, b) => a + b.count, 0)
    }));

    return quadrants;
  }, []);

  // Awards data (memoized so layout effects don't re-run needlessly)
  const awards = useMemo(() => {
    return [
      {
        title: "Snapchat Lens Competition Cash Prize",
        place: "Cash Prize",
        date: "March 2022",
        description: "Created a Snapchat lens used 1M+ times – secured £1500 for school tech resources as top performing creative entry.",
        badges: ["AR", "INNOVATION", "IMPACT"],
      },
      {
        title: "Dragon's Apprentice Challenge",
        place: "1st Place",
        date: "March 2022",
        description: "Led winning charity venture multiplying £100 seed via events (balloon race, auction, milkshake stand) & secured creativity award.",
        badges: ["LEADERSHIP", "CHARITY", "ENTREPRENEUR"],
      },
      {
        title: "Public Speaking Competition",
        place: "2nd Place",
        date: "March 2023",
        description: "Delivered a talk on legalising psychedelics before an RAF Officer, police lieutenant & advisor to the Prime Minister.",
        badges: ["ADVOCACY", "COMMUNICATION", "STAGE"],
      },
      {
        title: "hackSheffield 10",
        place: "1st Place",
        date: "November 2024",
        description: "Won best GitHub repository – engineered structure, documentation & DX polish resulting in judges' top scoring repo.",
        badges: ["OPEN-SOURCE", "ENGINEERING", "DX"],
      },
      {
        title: "Engineering You're Hired",
        place: "3rd Place",
        date: "March 2025",
        description: "Designed a pipe inspection & repair concept using decentralised swarm robotics – authored swarm behaviour mechanics and AI visual inspection modules.",
        badges: ["SWARM", "ROBOTICS", "AI"],
      },
    ];
  }, []);

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
    <section id="skills" className="py-20 bg-[#0A0A0A]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="animate-on-scroll text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Skills & Expertise</h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">Segmented skill cloud – frequency-sized tech pills clustered per category.</p>
        </div>

        {/* Quadrant Bubble Cloud */}
        <div className="animate-on-scroll relative grid grid-cols-1 md:grid-cols-2 gap-10 xl:gap-14">
          {quadrants.map(q => (
            <div key={q.name} className="skill-quadrant relative rounded-xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 md:p-5 overflow-hidden min-h-[320px] md:min-h-[360px]">
              <div className="absolute inset-0 pointer-events-none opacity-40 [mask-image:radial-gradient(circle_at_50%_50%,black,transparent)]" style={{ backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.05)_0_2px,transparent_2px_6px)' }} />
              <div className="flex items-center justify-between mb-3 relative z-10">
                <h3 className="text-lg md:text-xl font-semibold text-white tracking-wide flex items-center gap-2">
                  <span className="w-2 h-6 rounded-full bg-gradient-to-b from-blue-500 to-purple-500" />{q.name}
                </h3>
                <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-white/5 text-gray-400 border border-white/10">{q.total} Uses</span>
              </div>
              <div className="relative w-full h-[260px] md:h-[300px] skill-field">
                {q.skills.map(s => {
                  const borderAlpha = (0.15 + s.weight * 0.35).toFixed(2);
                  const bgAlpha = (0.06 + s.weight * 0.22).toFixed(2);
                  const glow = (0.15 + s.weight * 0.40).toFixed(2);
                  return (
                    <span
                      key={s.name}
                      data-skill
                      data-rotate={s.rotation}
                      className="absolute select-none cursor-default rounded-full backdrop-blur-sm border text-white/90 font-medium inline-flex items-center gap-1.5 shadow-sm transition-all duration-300 will-change-transform hover:shadow-[0_0_20px_var(--glow)] hover:-translate-y-1 hover:scale-[1.05]"
                      style={{
                        top: s.y + '%',
                        left: s.x + '%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: s.fontSize,
                        padding: `${s.padding.y}rem ${s.padding.x}rem`,
                        ['--glow' as any]: `hsla(${s.hue} 100% 55% / ${glow})`,
                        background: `linear-gradient(135deg, hsla(${s.hue} 100% ${s.lightness}% / ${bgAlpha}), hsla(${s.hue} 100% ${(s.lightness - 12)}% / ${(Number(bgAlpha)*0.55).toFixed(2)}))`,
                        borderColor: `hsla(${s.hue} 100% 70% / ${borderAlpha})`,
                        boxShadow: `inset 0 0 0 1px hsla(${s.hue} 100% 55% / ${(Number(borderAlpha)*0.5).toFixed(2)})`
                      }}
                    >
                      <span>{s.name}</span>
                      <span className="text-[9px] leading-none px-1.5 py-0.5 rounded-full bg-black/30 text-white/60 border border-white/10 tracking-wide">{s.count}x</span>
                    </span>
                  );
                })}
                {!q.skills.length && (
                  <p className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm italic">No skills yet.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Experience Timeline (unchanged) */}
        <div className="mt-20 animate-on-scroll">
          <h3 className="text-3xl font-bold text-white mb-12 text-center">Experience</h3>
          <div className="relative">
            <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
            <div className="space-y-12">
              <div className="flex items-center relative">
                <div className="w-1/2 pr-8 text-right">
                  <h4 className="text-xl font-bold text-white">Missions Engineer</h4>
                  <p className="text-blue-400 font-medium">Project Falcon</p>
                  <p className="text-gray-400 text-sm mb-2">2023-2024</p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Project Falcon developed a fixed wing quadcopter to compete in the IMechE competition. 
                    The missions team, which I was a part of, developed the FGCS. The FGCS helped monitor the 
                    drone, record and display data, as well as receive real world data.
                  </p>
                </div>
                <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-blue-500 rounded-full border-4 border-black" />
                <div className="w-1/2 pl-8" />
              </div>
              <div className="flex items-center relative">
                <div className="w-1/2 pr-8" />
                <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-purple-500 rounded-full border-4 border-black" />
                <div className="w-1/2 pl-8">
                  <h4 className="text-xl font-bold text-white">Web Developer</h4>
                  <p className="text-purple-400 font-medium">UCD</p>
                  <p className="text-gray-400 text-sm mb-2">2025 - Present</p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Founded a small web development business with my friend, creating web solutions for local 
                    companies. From small, static websites to fullstack web applications, we worked with 
                    clients to provide exactly what they're looking for.
                  </p>
                </div>
              </div>
              {/* Cluster of three dots at end of timeline */}
              <div className="flex items-center relative">
                <div className="w-1/2 pr-8" />
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <span className="w-4 h-4 bg-purple-600 rounded-full border-4 border-black leading-none" />
                  <span className="w-4 h-4 bg-purple-800 rounded-full border-4 border-black leading-none" />
                  <span className="w-4 h-4 bg-purple-950 rounded-full border-4 border-black leading-none" />
                </div>
                <div className="w-1/2 pl-8" />
              </div>
            </div>
          </div>
        </div>

        {/* Awards Section */}
        <div className="mt-28 relative animate-on-scroll" id="awards">
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
    </section>
  );
}