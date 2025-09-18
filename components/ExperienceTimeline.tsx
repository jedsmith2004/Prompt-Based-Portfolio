'use client';

import { useEffect, useState } from 'react';
import { AnimationManager } from '../lib/animations';

interface ExperienceItem { 
  company: string; 
  role: string; 
  period: string; 
  description: string; 
}

interface ContextPayload { 
  experience: ExperienceItem[]; 
}

export default function ExperienceTimeline() {
  const [dynamicData, setDynamicData] = useState<ContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AnimationManager.initScrollAnimations();
  }, []);

  // Fetch context.json (public) for dynamic experience
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/context.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load context');
        const json = await res.json();
        if (!cancelled) {
          const payload: ContextPayload = { experience: json.experience || [] };
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

  const experience = dynamicData?.experience || [];

  return (
    <div className="py-20 bg-[#0A0A0A]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Loading / Error States */}
        {loading && <p className="text-center text-gray-500 mb-8 animate-pulse">Loading experience...</p>}
        {error && <p className="text-center text-red-400 mb-8">{error}</p>}

        {/* Experience Timeline now dynamic */}
        <div className="animate-on-scroll">
          <h3 className="text-3xl font-bold text-white mb-12 text-center">Experience</h3>
          <div className="relative">
            <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
            <div className="space-y-12">
              {experience.map((exp, idx) => (
                <div key={exp.company + idx} className="flex items-center relative">
                  {/* Alternate sides */}
                  {idx % 2 === 0 ? (
                    <>
                      <div className="w-1/2 pr-8 text-right">
                        <h4 className="text-xl font-bold text-white">{exp.role}</h4>
                        <p className="text-blue-400 font-medium">{exp.company}</p>
                        <p className="text-gray-400 text-sm mb-2">{exp.period}</p>
                        <p className="text-gray-300 text-sm leading-relaxed">{exp.description}</p>
                      </div>
                      <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-blue-500 rounded-full border-4 border-black" />
                      <div className="w-1/2 pl-8" />
                    </>
                  ) : (
                    <>
                      <div className="w-1/2 pr-8" />
                      <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-purple-500 rounded-full border-4 border-black" />
                      <div className="w-1/2 pl-8">
                        <h4 className="text-xl font-bold text-white">{exp.role}</h4>
                        <p className="text-purple-400 font-medium">{exp.company}</p>
                        <p className="text-gray-400 text-sm mb-2">{exp.period}</p>
                        <p className="text-gray-300 text-sm leading-relaxed">{exp.description}</p>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {/* Decorative end cluster if experience present */}
              {experience.length > 0 && (
                <div className="flex items-center relative">
                  <div className="w-1/2 pr-8" />
                  <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <span className="w-4 h-4 bg-purple-600 rounded-full border-4 border-black leading-none" />
                    <span className="w-4 h-4 bg-purple-800 rounded-full border-4 border-black leading-none" />
                    <span className="w-4 h-4 bg-purple-950 rounded-full border-4 border-black leading-none" />
                  </div>
                  <div className="w-1/2 pl-8" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
