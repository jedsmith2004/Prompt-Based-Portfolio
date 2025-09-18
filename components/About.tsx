'use client';

import { useEffect, useMemo } from 'react';
import Image from 'next/image';
import { AnimationManager } from '../lib/animations';
import { projects } from '../lib/projects-data';

export default function About() {
  useEffect(() => {
    AnimationManager.initScrollAnimations();
  }, []);

  const topTechnologies = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => {
      p.tech.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 6)
      .map(([tech]) => tech);
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
                I'm a passionate builder at heart, whether that's developing software, starting businesses, 
                or exploring the world. I founded a small web development business to help local companies 
                grow their online presence. Now, I'm focused on an ambitious new goal: making Offline AI 
                accessible to everyone who needs it, no matter their resources or internet connection.
              </p>
              <p>
                At university, I've explored a wide range of computer science disciplines, from hands-on 
                machine learning projects to full-stack web development with real clients. I've also worked 
                with SELSA (Student Experience of Learning and Student Assessment) to help improve the quality 
                of teaching and feedback for future students. These experiences have shaped me into someone 
                who loves solving real-world problems and delivering work that makes an impact.
              </p>
              <p>
                Outside of tech, I'm driven by adventure and physical challenge. I'm a keen boulderer and 
                judoka, and I recently spent a month hitchhiking from Croatia through Europe to Morocco, a 
                journey that ended with a week of volunteering in a small village near the Sahara Desert. 
                These experiences keep me grounded, resilient, and always eager for the next challenge.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 mt-8">
              {topTechnologies.map((tech) => (
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