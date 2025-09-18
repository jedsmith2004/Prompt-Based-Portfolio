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

    // Collision resolution for a single quadrant container
    function resolveCollisions(container: HTMLElement) {
      const pills = Array.from(container.querySelectorAll<HTMLElement>('[data-skill]'));
      if (pills.length === 0) return;
      const rect = container.getBoundingClientRect();

      // Capture pills as nodes with dynamic measurements
      interface NodeInfo { el: HTMLElement; x: number; y: number; r: number; }
      const nodes: NodeInfo[] = pills.map(el => {
        const box = el.getBoundingClientRect();
        // Current center (top/left set as percentage; translate(-50%, -50%) already centers element)
        // Compute center relative to container
        const cx = box.left - rect.left + box.width / 2;
        const cy = box.top - rect.top + box.height / 2;
        // Approximate radius (use half diagonal scaled slightly)
        const r = Math.sqrt(box.width * box.width + box.height * box.height) * 0.55;
        return { el, x: cx, y: cy, r };
      });

      const maxIterations = 300;
      const damping = 0.5; // reduce movement each iteration for stability
      const boundsPadding = 4; // px padding inside container
      const width = rect.width;
      const height = rect.height;

      for (let iter = 0; iter < maxIterations; iter++) {
        let moved = false;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            const minDist = a.r + b.r;
            if (dist < minDist) {
              // Overlap amount
              const overlap = (minDist - dist);
              // Normalize
              dx /= dist; dy /= dist;
              const shift = overlap * 0.5 * damping;
              a.x -= dx * shift; a.y -= dy * shift;
              b.x += dx * shift; b.y += dy * shift;
              moved = true;
            }
          }
        }
        // Constrain to container bounds
        nodes.forEach(n => {
          let changed = false;
          if (n.x - n.r < boundsPadding) { n.x = boundsPadding + n.r; changed = true; }
          if (n.x + n.r > width - boundsPadding) { n.x = width - boundsPadding - n.r; changed = true; }
          if (n.y - n.r < boundsPadding) { n.y = boundsPadding + n.r; changed = true; }
            if (n.y + n.r > height - boundsPadding) { n.y = height - boundsPadding - n.r; changed = true; }
          if (changed) moved = true;
        });
        if (!moved) break; // stable
      }

      // Apply final positions (convert back to percentage coordinates for responsiveness)
      nodes.forEach(n => {
        const px = (n.x / width) * 100;
        const py = (n.y / height) * 100;
        const existingRotate = n.el.getAttribute('data-rotate') || '0';
        n.el.style.left = px + '%';
        n.el.style.top = py + '%';
        n.el.style.transform = `translate(-50%, -50%) rotate(${existingRotate}deg)`;
      });
    }

    // Run after a frame so DOM metrics are ready
    const raf = requestAnimationFrame(() => resolveAll());
    // Also run after fonts may settle
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
      let maxR = 0; const spacing = 10;
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
          rotation: (hash(s.name) % 7) - 3,
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
              <div className="relative w-full h-[260px] md:h-[300px]">
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
                        transform: 'translate(-50%, -50%) rotate(' + s.rotation + 'deg)',
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
                  <h4 className="text-xl font-bold text-white">Senior Full Stack Developer</h4>
                  <p className="text-blue-400 font-medium">Tech Innovate Inc.</p>
                  <p className="text-gray-400 text-sm mb-2">2022 - Present</p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Leading development of AI-integrated web applications, mentoring junior developers, 
                    and architecting scalable solutions for high-traffic platforms.
                  </p>
                </div>
                <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-blue-500 rounded-full border-4 border-black" />
                <div className="w-1/2 pl-8" />
              </div>
              <div className="flex items-center relative">
                <div className="w-1/2 pr-8" />
                <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-purple-500 rounded-full border-4 border-black" />
                <div className="w-1/2 pl-8">
                  <h4 className="text-xl font-bold text-white">Frontend Developer</h4>
                  <p className="text-purple-400 font-medium">Creative Studios</p>
                  <p className="text-gray-400 text-sm mb-2">2020 - 2022</p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Specialized in creating interactive user experiences and implementing complex 
                    animations for high-profile clients in the entertainment industry.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}