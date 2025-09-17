'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { AnimationManager } from '../lib/animations';

interface Project {
  id: string;
  title: string;
  description: string;
  tech: string[];
  github: string;
  demo: string;
  image: string;
}

const projects: Project[] = [
  {
    id: 'ai-chat-app',
    title: 'AI-Powered Chat Platform',
    description: 'Real-time chat application with AI assistant integration, supporting voice messages and document analysis.',
    tech: ['Next.js', 'OpenAI API', 'Socket.io', 'PostgreSQL', 'Redis'],
    github: 'https://github.com/alexjohnson/ai-chat',
    demo: 'https://ai-chat-demo.vercel.app',
    image: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg'
  },
  {
    id: '3d-portfolio',
    title: 'Interactive 3D Portfolio',
    description: 'Immersive portfolio experience built with Three.js, featuring animated 3D models and particle systems.',
    tech: ['Three.js', 'React', 'GSAP', 'WebGL', 'Blender'],
    github: 'https://github.com/alexjohnson/3d-portfolio',
    demo: 'https://3d-portfolio-demo.vercel.app',
    image: 'https://images.pexels.com/photos/1181677/pexels-photo-1181677.jpeg'
  },
  {
    id: 'data-viz-dashboard',
    title: 'Real-time Analytics Dashboard',
    description: 'Dynamic dashboard for visualizing complex datasets with interactive charts and real-time updates.',
    tech: ['React', 'D3.js', 'Node.js', 'WebSocket', 'MongoDB'],
    github: 'https://github.com/alexjohnson/analytics-dashboard',
    demo: 'https://analytics-demo.vercel.app',
    image: 'https://images.pexels.com/photos/590020/pexels-photo-590020.jpg'
  }
];

export default function Projects() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    AnimationManager.initScrollAnimations();
    AnimationManager.animateProjectCards();
  }, []);

  return (
    <section id="projects" className="py-20 bg-gradient-to-b from-[#0A0A0A] to-black">
      <div className="max-w-7xl mx-auto px-6">
        <div className="animate-on-scroll text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Featured Projects
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            A selection of projects that showcase my passion for creating immersive, 
            AI-powered experiences and pushing the boundaries of web development.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 stagger-animation">
          {projects.map((project) => (
            <div
              key={project.id}
              className="project-card stagger-item group cursor-pointer bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden hover:border-blue-400/50 transition-all duration-300"
              onClick={() => setSelectedProject(project)}
            >
              <div className="relative h-48 overflow-hidden">
                <Image
                  src={project.image}
                  alt={project.title}
                  width={400}
                  height={200}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
              
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-blue-400 transition-colors">
                  {project.title}
                </h3>
                
                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                  {project.description}
                </p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {project.tech.slice(0, 3).map((tech) => (
                    <span
                      key={tech}
                      className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30"
                    >
                      {tech}
                    </span>
                  ))}
                  {project.tech.length > 3 && (
                    <span className="px-3 py-1 bg-white/10 text-gray-400 text-xs rounded-full">
                      +{project.tech.length - 3} more
                    </span>
                  )}
                </div>

                <div className="flex space-x-4">
                  <a
                    href={project.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                  </a>
                  <a
                    href={project.demo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Project Modal */}
        {selectedProject && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-6"
            onClick={() => setSelectedProject(null)}
          >
            <div
              className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative">
                <button
                  onClick={() => setSelectedProject(null)}
                  className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                <div className="h-64 overflow-hidden rounded-t-3xl">
                  <Image
                    src={selectedProject.image}
                    alt={selectedProject.title}
                    width={800}
                    height={300}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              
              <div className="p-8">
                <h3 className="text-3xl font-bold text-white mb-4">
                  {selectedProject.title}
                </h3>
                
                <p className="text-gray-300 leading-relaxed mb-6">
                  {selectedProject.description}
                </p>
                
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-white mb-3">Technologies Used</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedProject.tech.map((tech) => (
                      <span
                        key={tech}
                        className="px-4 py-2 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="flex space-x-4">
                  <a
                    href={selectedProject.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all duration-200"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    <span>View Code</span>
                  </a>
                  <a
                    href={selectedProject.demo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl text-white transition-all duration-200"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>Live Demo</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}