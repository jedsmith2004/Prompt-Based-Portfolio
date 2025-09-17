'use client';

import { useEffect } from 'react';
import { AnimationManager } from '../lib/animations';

const skillCategories = [
  {
    category: 'Frontend',
    items: [
      { name: 'React', level: 95 },
      { name: 'Next.js', level: 90 },
      { name: 'TypeScript', level: 88 },
      { name: 'GSAP', level: 85 },
      { name: 'Three.js', level: 80 },
      { name: 'Tailwind CSS', level: 92 }
    ]
  },
  {
    category: 'Backend',
    items: [
      { name: 'Node.js', level: 88 },
      { name: 'Python', level: 85 },
      { name: 'PostgreSQL', level: 82 },
      { name: 'MongoDB', level: 80 },
      { name: 'GraphQL', level: 78 },
      { name: 'REST APIs', level: 90 }
    ]
  },
  {
    category: 'AI/ML',
    items: [
      { name: 'OpenAI GPT', level: 90 },
      { name: 'Langchain', level: 85 },
      { name: 'TensorFlow', level: 75 },
      { name: 'PyTorch', level: 72 },
      { name: 'Computer Vision', level: 70 },
      { name: 'NLP', level: 80 }
    ]
  },
  {
    category: 'Tools',
    items: [
      { name: 'Docker', level: 85 },
      { name: 'AWS', level: 80 },
      { name: 'Vercel', level: 95 },
      { name: 'Git', level: 92 },
      { name: 'Figma', level: 88 },
      { name: 'Adobe Creative Suite', level: 85 }
    ]
  }
];

export default function Skills() {
  useEffect(() => {
    AnimationManager.initScrollAnimations();
    AnimationManager.animateSkillBars();
  }, []);

  return (
    <section id="skills" className="py-20 bg-[#0A0A0A]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="animate-on-scroll text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Skills & Expertise
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            A comprehensive toolkit built through years of hands-on experience 
            in modern web development, AI integration, and creative design.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          {skillCategories.map((category) => (
            <div key={category.category} className="animate-on-scroll">
              <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                <span className="w-2 h-8 bg-blue-500 rounded-full mr-3" />
                {category.category}
              </h3>
              
              <div className="space-y-4">
                {category.items.map((skill) => (
                  <div key={skill.name} className="skill-bar" data-percentage={skill.level}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-300 font-medium">{skill.name}</span>
                      <span className="text-blue-400 text-sm">{skill.level}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="skill-fill h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-1000"
                        style={{ width: '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Experience Timeline */}
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