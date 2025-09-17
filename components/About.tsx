'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { AnimationManager } from '../lib/animations';

export default function About() {
  useEffect(() => {
    AnimationManager.initScrollAnimations();
  }, []);

  return (
    <section id="about" className="py-20 bg-[#0A0A0A] relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="animate-on-scroll">
            <div className="relative">
              <div className="w-80 h-80 mx-auto relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl" />
                <Image
                  src="/jack-avatar.jpg"
                  alt="Jack Smith"
                  width={320}
                  height={320}
                  className="relative z-10 w-full h-full object-cover rounded-full border-4 border-white/20"
                />
              </div>
            </div>
          </div>

          <div className="animate-on-scroll space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">
              About Me
            </h2>
            
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>
                I'm a passionate full-stack developer with a deep fascination for artificial intelligence 
                and interactive graphics. My journey in tech began with curiosity about how digital 
                experiences could blur the line between reality and imagination.
              </p>
              
              <p>
                Over the years, I've specialized in creating immersive web applications that combine 
                cutting-edge AI integration with stunning visual design. From real-time chat platforms 
                powered by GPT models to interactive 3D portfolios built with Three.js, I believe 
                in pushing the boundaries of what's possible on the web.
              </p>
              
              <p>
                When I'm not coding, you'll find me exploring the latest developments in machine learning, 
                experimenting with new animation libraries, or contributing to open-source projects. 
                I'm always excited to collaborate on projects that challenge conventional thinking 
                and create meaningful user experiences.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 mt-8">
              {['React', 'Next.js', 'TypeScript', 'GSAP', 'Three.js', 'OpenAI API'].map((tech) => (
                <span
                  key={tech}
                  className="px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-sm text-gray-300 hover:border-blue-400/50 hover:text-white transition-all duration-200"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}