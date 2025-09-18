import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export class AnimationManager {
  static initHeroAnimations() {
    const tl = gsap.timeline();
    
    tl.fromTo('.hero-title', 
      { y: 100, opacity: 0 }, 
      { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out' }
    )
    .fromTo('.hero-subtitle', 
      { y: 50, opacity: 0 }, 
      { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 
      '-=0.6'
    )
    .fromTo('.hero-chat-box', 
      { y: 30, opacity: 0, scale: 0.9 }, 
      { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.7)' }, 
      '-=0.4'
    )
    .fromTo('.hero-hint', 
      { opacity: 0 }, 
      { opacity: 1, duration: 0.6 }, 
      '-=0.2'
    );

    return tl;
  }

  static initScrollAnimations() {
    // Animate sections on scroll
    gsap.utils.toArray('.animate-on-scroll').forEach((element: any) => {
      gsap.fromTo(element, 
        { y: 80, opacity: 0 },
        {
          y: 0,
            opacity: 1,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 85%',
            end: 'bottom 15%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });

    // Stagger animations for lists
    gsap.utils.toArray('.stagger-animation').forEach((container: any) => {
      const items = container.querySelectorAll('.stagger-item');
      
      gsap.fromTo(items,
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 85%',
            end: 'bottom 15%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });
  }

  static animateProjectCards() {
    gsap.utils.toArray('.project-card').forEach((card: any) => {
      const tl = gsap.timeline({ paused: true });
      
      tl.to(card, {
        scale: 1.05,
        y: -10,
        boxShadow: '0 20px 40px rgba(0, 123, 255, 0.3)',
        duration: 0.3,
        ease: 'power2.out'
      });

      card.addEventListener('mouseenter', () => tl.play());
      card.addEventListener('mouseleave', () => tl.reverse());
    });
  }

  // New subtle lift for All Projects page cards
  static animateLiftCards(selector: string = '.project-card') {
    if (typeof window === 'undefined') return;
    document.querySelectorAll<HTMLElement>(selector).forEach(card => {
      if (card.dataset.liftInit) return; // prevent duplicate listeners
      card.dataset.liftInit = 'true';
      const tl = gsap.timeline({ paused: true });
      tl.to(card, {
        y: -8,
        scale: 1.02,
        boxShadow: '0 12px 28px -12px rgba(0,0,0,0.6), 0 8px 16px -8px rgba(59,130,246,0.25)',
        borderColor: 'rgba(59,130,246,0.5)',
        duration: 0.35,
        ease: 'power3.out'
      });
      card.addEventListener('mouseenter', () => tl.play());
      card.addEventListener('mouseleave', () => tl.reverse());
      card.addEventListener('focusin', () => tl.play());
      card.addEventListener('focusout', () => tl.reverse());
    });
  }

  // New: one-time reveal that won't reverse (fix flicker for project cards)
  static initPersistentReveals() {
    if (typeof window === 'undefined') return;
    // Prevent double init
    if ((window as any).__persistentRevealsInit) return;
    (window as any).__persistentRevealsInit = true;

    const elements = document.querySelectorAll<HTMLElement>('.reveal-once');
    elements.forEach(el => {
      gsap.set(el, { opacity: 0, y: 40, willChange: 'opacity, transform' });
    });

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          const delay = parseFloat(el.dataset.revealDelay || '0');
          gsap.to(el, { opacity: 1, y: 0, duration: 0.8, delay, ease: 'power3.out', clearProps: 'will-change' });
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });

    elements.forEach(el => observer.observe(el));
  }

  static animateChatMessage(element: HTMLElement, isUser: boolean = false) {
    gsap.fromTo(element,
      { 
        y: 20, 
        opacity: 0, 
        scale: 0.9,
        transformOrigin: isUser ? 'right bottom' : 'left bottom'
      },
      { 
        y: 0, 
        opacity: 1, 
        scale: 1,
        duration: 0.4, 
        ease: 'back.out(1.7)' 
      }
    );
  }

  static createTypewriterEffect(element: HTMLElement, text: string, speed: number = 30) {
    return new Promise<void>((resolve) => {
      let i = 0;
      element.textContent = '';
      
      const timer = setInterval(() => {
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          resolve();
        }
      }, speed);
    });
  }

  static initParticleBackground() {
    const particles = document.querySelectorAll('.particle');
    
    particles.forEach((particle: any, index) => {
      gsap.to(particle, {
        y: -100,
        x: index % 2 === 0 ? 50 : -50,
        rotation: 360,
        duration: 10 + (index * 2),
        repeat: -1,
        ease: 'none',
        delay: index * 0.5
      });
    });
  }

  // Advanced dynamic particle system for hero background
  // Generates layered soft particles with per-axis drift, scale flicker, orbital arcs and subtle parallax
  static initAdvancedParticleBackground() {
    if (typeof window === 'undefined') return;

    const container = document.querySelector<HTMLElement>('.hero-particles');
    if (!container) return;
    container.style.background = '#0A0A0A'; // enforce flat background

    // Prevent double init
    if (container.dataset.advancedParticlesInit) return;
    container.dataset.advancedParticlesInit = 'true';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const particleCount = prefersReducedMotion ? 16 : 42;

    const colors = [
      'rgba(255,255,255,0.09)',
      'rgba(255,255,255,0.06)',
      'rgba(255,255,255,0.12)',
      'rgba(255,255,255,0.04)'
    ];

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < particleCount; i++) {
      const el = document.createElement('div');
      el.className = 'hero-particle';
      const baseSize = (Math.random() * 6 + 4); // 4 - 10px
      const depth = Math.random(); // 0 (near) to 1 (far)

      Object.assign(el.style, {
        position: 'absolute',
        width: `${baseSize}px`,
        height: `${baseSize}px`,
        borderRadius: '9999px',
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        background: colors[i % colors.length],
        filter: 'blur(0.5px)',
        opacity: String(0.25 + depth * 0.35),
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        willChange: 'transform'
      });

      // Slight variation shapes: some are faint rings / soft glows
      if (Math.random() < 0.18) {
        el.style.background = 'transparent';
        el.style.boxShadow = `0 0 ${8 + Math.random()*12}px ${Math.random()*2 + 1}px ${colors[i % colors.length]}`;
        el.style.filter = 'blur(1px)';
      } else if (Math.random() < 0.3) {
        el.style.boxShadow = `0 0 ${4 + Math.random()*10}px ${colors[i % colors.length].replace('0.', '0.2')}`;
      }

      fragment.appendChild(el);

      // Primary drifting animation vector
      const driftX = (Math.random() * 200 - 100) * (0.4 + depth * 0.6); // depth affects amplitude
      const driftY = (Math.random() * 200 - 100) * (0.4 + depth * 0.6);
      const duration = 16 + Math.random() * 18; // slow, ambient

      gsap.to(el, {
        x: driftX,
        y: driftY,
        duration,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });

      // Gentle scale pulse / flicker
      gsap.to(el, {
        scale: 0.85 + Math.random()*0.5,
        duration: 3 + Math.random()*4,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });

      // Occasional orbital motion overlay for a subset
      if (Math.random() < 0.18) {
        const orbitRadius = 10 + Math.random()*25;
        const orbitDur = 20 + Math.random()*20;
        gsap.to(el, {
          motionPath: {
            path: [
              { x: 0, y: 0 },
              { x: orbitRadius, y: 0 },
              { x: 0, y: orbitRadius },
              { x: -orbitRadius, y: 0 },
              { x: 0, y: -orbitRadius },
              { x: 0, y: 0 },
            ],
            autoRotate: false,
          },
          duration: orbitDur,
          ease: 'none',
          repeat: -1,
        });
      }

      // Subtle parallax relative to pointer (very gentle)
      window.addEventListener('pointermove', (e) => {
        const rect = container.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        const parallaxStrength = 6 * (1 - depth); // near particles move more
        gsap.to(el, { xPercent: relX * parallaxStrength, yPercent: relY * parallaxStrength, duration: 2, ease: 'sine.out' });
      }, { passive: true });
    }

    container.appendChild(fragment);
  }

  static initMathematicalHeroBackground() {
    if (typeof window === 'undefined') return;
    const container = document.querySelector<HTMLElement>('.hero-particles');
    if (!container || container.dataset.mathBgInit) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.dataset.mathBgInit = 'true';
    container.style.background = '#0A0A0A'; // enforce flat background

    const canvas = document.createElement('canvas');
    canvas.className = 'hero-math-canvas';
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none',
      filter: 'blur(0.2px)', mixBlendMode: 'screen'
    });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    container.appendChild(canvas);

    function resize() {
      if (!container || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    const golden = Math.PI * (3 - Math.sqrt(5));
    const POINTS = prefersReducedMotion ? 320 : 850;
    const radiusMax = () => Math.min(container.clientWidth, container.clientHeight) * 0.55;
    const points: {x:number; y:number; r:number; a:number;}[] = [];
    for (let n = 0; n < POINTS; n++) {
      const rNorm = Math.sqrt(n / POINTS);
      const theta = n * golden;
      points.push({ x: rNorm * Math.cos(theta), y: rNorm * Math.sin(theta), r: rNorm, a: theta });
    }

    // Declare animation state before render definition
    let t = 0;
    let frameId = 0;
    function render() {
      frameId = requestAnimationFrame(render);
      if (!container || !ctx) return;
      t += 0.004;
      const w = container.clientWidth; const h = container.clientHeight;
      ctx.clearRect(0,0,w,h);

      const cx = w/2, cy = h/2;
      const baseR = radiusMax();
      // Removed concentric rings; introduce a global breathing factor for dots instead
      const breath = 1 + Math.sin(t * 2) * 0.035; // previously ring pulse amplitude repurposed

      const rot = t * 0.25;
      const drift = Math.sin(t*0.8)*0.02;
      const scale = baseR * 0.88 * breath; // apply breathing to overall point field radius
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      points.forEach((p,i) => {
        const rx = p.x * scale * (1 + drift * p.r);
        const ry = p.y * scale * (1 + drift * p.r);
        // Per-point micro breathing layered atop global breath
        const localPulse = 1 + Math.sin(t*3 + p.a) * 0.18;
        const alpha = 0.022 + p.r*0.055; // slightly dimmer since no rings
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.beginPath();
        const sz = (0.55 + p.r * 1.25) * localPulse; // size also affected by breathing
        ctx.arc(rx, ry, sz, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.restore();
    }
    if (!prefersReducedMotion) render();

    const cleanup = () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      canvas.remove();
      if (container) delete container.dataset.mathBgInit;
    };
    (window as any).addEventListener('beforeunload', cleanup);
  }

  static animateSkillBars() {
    gsap.utils.toArray('.skill-bar').forEach((bar: any) => {
      const percentage = bar.dataset.percentage || '0';
      
      gsap.fromTo(bar.querySelector('.skill-fill'),
        { width: '0%' },
        {
          width: `${percentage}%`,
          duration: 1.5,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: bar,
            start: 'top 90%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });
  }
}