'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimationManager } from '../lib/animations';
import { projects } from '../lib/projects-data';

// Mapping of individual tech strings to broad categories (core 4 used for quadrants)
const techCategoryMap: Record<string, string> = {
  // Frontend / UI / Presentation
  'React': 'Frontend', 'Next.js': 'Frontend', 'Typescript': 'Frontend', 'TypeScript': 'Frontend', 'JavaScript': 'Frontend', 'Tailwind CSS': 'Frontend', 'GSAP': 'Frontend', 'Three.js': 'Frontend', 'HAML': 'Frontend', 'Bootstrap': 'Frontend', 'Shaders': 'Frontend', 'Swift': 'Frontend', 'Pygame': 'Frontend', 'Web Development': 'Frontend', 'UI/UX': 'Frontend', 'Prototyping': 'Frontend', 'Haskell': 'Frontend',
  // Backend / Core Platform
  'Ruby on Rails': 'Backend', 'PostgreSQL': 'Backend', 'SQLite': 'Backend', 'Flask': 'Backend', 'Node.js': 'Backend', 'GraphQL': 'Backend', 'REST APIs': 'Backend', 'ActiveStorage': 'Backend', 'Python': 'Backend', 'API': 'Backend', 'Edge Patterns': 'Backend', 'MongoDB': 'Backend',
  // AI / ML / Data / Computational
  'AI': 'AI/ML', 'ML': 'AI/ML', 'Machine Learning': 'AI/ML', 'LLM': 'AI/ML', 'LLM Streaming': 'AI/ML', 'Groq': 'AI/ML', 'OpenAI GPT': 'AI/ML', 'Langchain': 'AI/ML', 'LLama.cpp': 'AI/ML', 'GGUF': 'AI/ML', 'TensorFlow': 'AI/ML', 'PyTorch': 'AI/ML', 'Computer Vision': 'AI/ML', 'NLP': 'AI/ML', '3D Graphics': 'AI/ML', 'Rasterization': 'AI/ML', 'NumPy': 'AI/ML', 'SciPy': 'AI/ML', 'Object representation': 'AI/ML', 'Random Generation': 'AI/ML', 'Mathematics': 'AI/ML', 'Algorithms': 'AI/ML', 'Systems Design': 'AI/ML', 'Swarm Robotics': 'AI/ML', 'Robotics': 'AI/ML',
  // Tools / Infra / Dev Productivity
  'Docker': 'Tools', 'AWS': 'Tools', 'Vercel': 'Tools', 'Git': 'Tools', 'Figma': 'Tools', 'Adobe Creative Suite': 'Tools', 'Prismic CMS': 'Tools', 'Slice Machine': 'Tools', 'PostCSS': 'Tools', 'Cloudflare': 'Tools', 'Rake': 'Tools', 'WSL': 'Tools', 'Gitlab': 'Tools', 'ShakerPacker': 'Tools', 'Functional Programming': 'Tools', 'Game Development': 'Tools', 'Monadic Programming': 'Tools', 'Markdown': 'Tools', 'Client Requirements': 'Tools', 'Iteration': 'Tools', 'Deployment': 'Tools', 'Domain Transfer': 'Tools', 'Blender': 'Tools', '3D Animation': 'Tools', 'Technical Drawings': 'Tools', 'Business Planning': 'Tools', 'CAD': 'Tools', 'CFD': 'Tools', 'LiDAR': 'Tools', 'Ultrasonic Sensing': 'Tools'
};

interface RawSkill { name: string; count: number; weight: number; category: string; }
interface PositionedSkill extends RawSkill { x: number; y: number; fontSize: string; padding: { x: number; y: number }; rotation: number; hue: number; lightness: number; }
interface CategoryQuadrant { name: string; skills: PositionedSkill[]; total: number; }
interface ContextPayload { skills: { category: string; items: string[] }[]; }

export default function SkillsCloud() {
  const [dynamicData, setDynamicData] = useState<ContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AnimationManager.initScrollAnimations();
  }, []);

  // Fetch context.json (public) for dynamic skills
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/context.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load context');
        const json = await res.json();
        if (!cancelled) {
          const payload: ContextPayload = { skills: json.skills || [] };
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

  const dynamicSkills = dynamicData?.skills || [];

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

      // Adaptive scaling fallback: try scale 1 downward with more aggressive scaling
      const scales = [1, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45, 0.40];
      let usedScale = 1;
      let success = false;
      for (const s of scales) {
        // Reset positions each trial
        nodes.forEach(n => { n.x = centerX; n.y = centerY; n.placed = false; });
        if (placeAll(s)) { usedScale = s; success = true; break; }
      }

      if (!success) {
        // Final fallback: force ultra-compact spiral with minimal scale
        usedScale = 0.35;
        nodes.forEach(n => { n.x = centerX; n.y = centerY; n.placed = false; });
        
        // Ultra-compact spiral placement
        const placed: NodeInfo[] = [];
        const TWO_PI = Math.PI * 2;
        const compactAngleStep = 0.15; // tighter spiral
        const compactRadialStep = 1.5; // smaller radius increments
        
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          let placedNode = false;
          
          for (let attempt = 0; attempt < 1000; attempt++) {
            const r = compactRadialStep * Math.sqrt(attempt * 0.5);
            const theta = attempt * compactAngleStep;
            node.x = centerX + r * Math.cos(theta);
            node.y = centerY + r * Math.sin(theta);
            clamp(node, usedScale);
            
            let collision = false;
            for (const other of placed) {
              if (overlaps(node, other, usedScale)) { collision = true; break; }
            }
            if (!collision) {
              node.placed = true;
              placed.push(node);
              placedNode = true;
              break;
            }
          }
          
          if (!placedNode) {
            // If still can't place, just position at center with slight offset
            node.x = centerX + (i % 3 - 1) * 20;
            node.y = centerY + Math.floor(i / 3) * 15;
            clamp(node, usedScale);
          }
        }
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
    // If dynamic skills exist, merge them with project-derived frequency weighting
    const counts: Record<string, number> = {};
    projects.forEach(p => p.tech.forEach(t => { if (!t) return; counts[t] = (counts[t] || 0) + 1; }));

    // Canonical name + synonym map to collapse variants & typos
    const synonymMap: Record<string, string> = {
      'typescript': 'TypeScript', 'typesript': 'TypeScript', 'ts': 'TypeScript',
      'javascript': 'JavaScript', 'js': 'JavaScript',
      'postgres': 'PostgreSQL', 'postgresql': 'PostgreSQL',
      'py': 'Python',
      'llama.cpp': 'LLama.cpp',
      'numpy': 'NumPy', 'scipy': 'SciPy',
      'markdown': 'Markdown'
    };
    function canonicalize(raw: string): string {
      const trimmed = raw.trim();
      const lower = trimmed.toLowerCase();
      if (synonymMap[lower]) return synonymMap[lower];
      // Normalise capitalization for multi-word tokens
      if (lower === 'tailwind css') return 'Tailwind CSS';
      if (lower === 'ruby on rails') return 'Ruby on Rails';
      if (lower === 'rest apis' || lower === 'rest api' || lower === 'api' || lower === 'apis') return 'REST APIs';
      return trimmed.replace(/\b(ai|ml|nlp)\b/gi, (m) => m.toUpperCase());
    }

    // Skills we consider noisy / too granular for the cloud (avoid inflating a single quadrant)
    const noise = new Set<string>(['Edge Patterns']);

    // Ensure every dynamic skill item appears at least once in counts (canonicalised)
    dynamicSkills.forEach(cat => cat.items.forEach(item => {
      const c = canonicalize(item);
      if (!noise.has(c)) counts[c] = counts[c] || 1;
    }));

    // Consolidate counts with canonical names
    const consolidated: Record<string, number> = {};
    Object.entries(counts).forEach(([name, count]) => {
      const c = canonicalize(name);
      if (noise.has(c)) return; // drop noise
      consolidated[c] = (consolidated[c] || 0) + count;
    });

    const entries = Object.entries(consolidated);
    if (!entries.length) return [];

    // Build raw skills WITHOUT global weighting
    const raw: RawSkill[] = entries.map(([name, count]) => ({
      name,
      count,
      weight: 0, // placeholder, will be set per-category
      category: techCategoryMap[name] || techCategoryMap[canonicalize(name)] || 'Tools' // fallback now Tools to avoid Backend overload
    }));

    const core = ['Frontend', 'Backend', 'AI/ML', 'Tools'];
    raw.forEach(s => { if (!core.includes(s.category)) s.category = 'Tools'; });

    const grouped: Record<string, RawSkill[]> = { Frontend: [], Backend: [], 'AI/ML': [], Tools: [] };
    raw.forEach(s => grouped[s.category].push(s));

    // Cap each category to top 25 skills by usage count for visual clarity
    const MAX_SKILLS_PER_QUADRANT = 20;
    core.forEach(cat => {
      // Always sort by count descending, then alphabetically
      grouped[cat].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      // Always slice to max (handles cases where length <= max too)
      grouped[cat] = grouped[cat].slice(0, MAX_SKILLS_PER_QUADRANT);
    });

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
  }, [dynamicSkills]);

  return (
    <div className="py-20 bg-[#0A0A0A]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Loading / Error States */}
        {loading && <p className="text-center text-gray-500 mb-8 animate-pulse">Loading skill cloud...</p>}
        {error && <p className="text-center text-red-400 mb-8">{error}</p>}

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
                  // Higher weight = higher z-index so bigger tiles are always on top
                  const zIndex = Math.round(s.weight * 100);
                  return (
                    <span
                      key={s.name}
                      data-skill
                      data-rotate={s.rotation}
                      className="absolute select-none cursor-default rounded-full backdrop-blur-sm border text-white/90 font-medium inline-flex items-center gap-1.5 shadow-sm transition-all duration-300 will-change-transform hover:shadow-[0_0_20px_var(--glow)] hover:-translate-y-1 hover:scale-[1.05] hover:z-[200]"
                      style={{
                        top: s.y + '%',
                        left: s.x + '%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: s.fontSize,
                        padding: `${s.padding.y}rem ${s.padding.x}rem`,
                        zIndex,
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
      </div>
    </div>
  );
}
