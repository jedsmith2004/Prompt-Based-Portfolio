'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';

export default function FloatingCV() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Physics state
  const physics = useRef({
    x: 0,
    y: 0,
    vx: 0.3,
    vy: 0.2,
    baseX: 0,
    baseY: 0,
    mouseX: 0,
    mouseY: 0,
    rotation: 0,
    rotationVel: 0.15,
  });

  // For portal - ensure we're on client
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const cv = cvRef.current;
    if (!container || !cv) return;

    const bounds = { width: 280, height: 280 };
    const cvSize = 80;
    const padding = 10;
    const circleRadius = 100; // Radius of the attraction circle (from center)
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    
    // Initialize position at center
    physics.current.x = centerX - cvSize / 2;
    physics.current.y = centerY - cvSize / 2;
    physics.current.baseX = physics.current.x;
    physics.current.baseY = physics.current.y;
    
    // Set initial position immediately so it doesn't start at top-left
    gsap.set(cv, {
      x: physics.current.x,
      y: physics.current.y,
      rotation: 0,
    });

    let animationId: number;
    let time = 0;

    const animate = () => {
      time += 0.016;
      const p = physics.current;

      // Orbital drift motion (base animation)
      const orbitX = Math.sin(time * 0.5) * 40;
      const orbitY = Math.cos(time * 0.7) * 30;
      
      // Secondary wobble
      const wobbleX = Math.sin(time * 1.3) * 8;
      const wobbleY = Math.cos(time * 1.1) * 8;

      // Check if mouse is inside the circle (not the square container)
      const mouseDistFromCenter = Math.sqrt(
        Math.pow(p.mouseX - centerX, 2) + Math.pow(p.mouseY - centerY, 2)
      );
      const mouseInsideCircle = mouseDistFromCenter <= circleRadius;

      let targetX: number;
      let targetY: number;

      if (mouseInsideCircle) {
        // Attract to mouse position (with offset to center the CV on cursor)
        targetX = p.mouseX - cvSize / 2;
        targetY = p.mouseY - cvSize / 2;
      } else {
        // Default orbital motion when mouse is outside
        targetX = p.baseX + orbitX + wobbleX;
        targetY = p.baseY + orbitY + wobbleY;
      }

      // Smooth interpolation - slower when attracting for a magnetic lag effect
      const smoothing = mouseInsideCircle ? 0.02 : 0.08;
      p.x += (targetX - p.x) * smoothing;
      p.y += (targetY - p.y) * smoothing;

      // Keep within bounds
      p.x = Math.max(padding, Math.min(bounds.width - cvSize - padding, p.x));
      p.y = Math.max(padding, Math.min(bounds.height - cvSize - padding, p.y));

      // Rotation based on movement
      p.rotation += Math.sin(time * 0.8) * 0.3;

      // Apply transform
      gsap.set(cv, {
        x: p.x,
        y: p.y,
        rotation: p.rotation,
      });

      animationId = requestAnimationFrame(animate);
    };

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      physics.current.mouseX = e.clientX - rect.left;
      physics.current.mouseY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      physics.current.mouseX = -1000;
      physics.current.mouseY = -1000;
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // Hover glow effect
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;

    if (isHovered) {
      gsap.to(cv, {
        scale: 1.1,
        duration: 0.3,
        ease: 'power2.out',
      });
    } else {
      gsap.to(cv, {
        scale: 1,
        duration: 0.4,
        ease: 'power2.out',
      });
    }
  }, [isHovered]);

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isModalOpen]);

  return (
    <>
      {/* Floating CV Container */}
      <div 
        ref={containerRef}
        className="relative w-[280px] h-[280px] mx-auto"
      >
        {/* Orbital path hint (decorative) */}
        <div className="absolute inset-8 border border-dashed border-white/10 rounded-full pointer-events-none" />
        <div className="absolute inset-16 border border-dashed border-white/5 rounded-full pointer-events-none" />
        
        {/* The floating CV element */}
        <div
          ref={cvRef}
          onClick={openModal}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="absolute w-20 h-20 cursor-pointer group"
        >
          {/* CV Card */}
          <div className="w-full h-full bg-white/10 backdrop-blur-md border border-white/20 rounded-xl flex flex-col items-center justify-center transition-all duration-300 overflow-hidden hover:bg-white/15 hover:border-white/30">
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            
            {/* Icon */}
            <svg className="w-8 h-8 text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[10px] text-gray-400 font-medium tracking-wide">CV</span>
          </div>
          
          {/* Pulse rings */}
          <div className="absolute inset-0 rounded-xl border border-white/20 animate-ping opacity-20" style={{ animationDuration: '2s' }} />
          <div className="absolute inset-0 rounded-xl border border-white/10 animate-ping opacity-10" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
        </div>

        {/* Helper text */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-500 opacity-60 whitespace-nowrap pointer-events-none">
          Click to view CV
        </div>
      </div>

      {/* Modal - rendered via portal to document.body */}
      {mounted && isModalOpen && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={closeModal}
        >
          {/* Backdrop - covers full screen */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          {/* Modal Content */}
          <div 
            className="relative bg-[#0A0A0A] border border-white/20 rounded-2xl p-8 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Content */}
            <div className="text-center">
              {/* Animated icon */}
              <div className="w-20 h-20 mx-auto mb-6 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              <h3 className="text-2xl font-bold text-white mb-2">Jack Smith</h3>
              <p className="text-gray-500 mb-6">Curriculum Vitae</p>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-2xl font-bold text-white">3+</div>
                  <div className="text-xs text-gray-500">Years Exp</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-2xl font-bold text-white">10+</div>
                  <div className="text-xs text-gray-500">Projects</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-2xl font-bold text-white">1st</div>
                  <div className="text-xs text-gray-500">Class (exp)</div>
                </div>
              </div>

              {/* Download button */}
              <a
                href="/CV Jack Smith.pdf"
                download="Jack Smith - CV.pdf"
                className="inline-flex items-center justify-center gap-3 w-full px-6 py-4 bg-white text-black font-semibold rounded-xl transition-all duration-300 hover:bg-gray-200 hover:scale-[1.02]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CV
              </a>

              {/* Secondary actions */}
              <div className="flex gap-4 mt-4">
                <a
                  href="/CV Jack Smith.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/20 text-gray-300 text-sm rounded-lg transition-colors"
                >
                  View in Browser
                </a>
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/20 text-gray-300 text-sm rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
