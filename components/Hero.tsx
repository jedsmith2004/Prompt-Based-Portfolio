'use client';

import { useState, useEffect } from 'react';
import ChatWidget from './ChatWidget';
import { AnimationManager } from '../lib/animations';

export default function Hero() {
  const [isChatActive, setIsChatActive] = useState(false);

  useEffect(() => {
    // Initialize hero animations after component mounts
    const timer = setTimeout(() => {
      AnimationManager.initHeroAnimations();
      if (AnimationManager.initAdvancedParticleBackground) {
        AnimationManager.initAdvancedParticleBackground();
      } else {
        AnimationManager.initParticleBackground();
      }
      if (AnimationManager.initMathematicalHeroBackground) {
        AnimationManager.initMathematicalHeroBackground();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[#0A0A0A]">
      {/* Enhanced floating particles (now built dynamically by AnimationManager) */}
      <div className="hero-particles absolute inset-0 pointer-events-none" />

      <div className="text-center z-10 max-w-4xl mx-auto px-6">
        <h1 className="hero-title text-6xl md:text-8xl font-bold text-white mb-6 opacity-0">
          Jack Smith
        </h1>
        
        <p className="hero-subtitle text-xl md:text-2xl text-gray-300 mb-3 opacity-0 tracking-tight">
          Crafting immersive systems at the intersection of AI, graphics & web dev
        </p>
        <p className="hero-subtitle text-base md:text-lg text-gray-500 mb-12 opacity-0">
          From offline neural runtimes to shader-driven interfaces & algorithmic engines
        </p>

        <div className="hero-chat-box opacity-0">
          <ChatWidget 
            onActivate={() => setIsChatActive(true)}
            isActive={isChatActive}
          />
        </div>

        <p className="hero-hint text-sm text-gray-500 mt-6 opacity-0">
          Ask me anything about my work or projects
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-white/60 rounded-full mt-2 animate-bounce" />
        </div>
      </div>
    </section>
  );
}