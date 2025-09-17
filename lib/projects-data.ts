export interface Project {
  id: string;
  title: string;
  description: string;
  tech: string[];
  github: string;
  demo: string;
  image: string;
  // New optional metadata for enhanced project cards
  status?: 'completed' | 'in-progress';
  date?: string; // e.g. 'Jan 2025'
  features?: string[]; // Key feature bullet points
}

export const projects: Project[] = [
  {
    id: 'offline-ai-app',
    title: 'Mobile Based Offline AI App',
    description: 'A mobile based app that runs distilled models on the phone to access AI without internet. It also has personalities, offline maps and survival guides.',
    tech: ['Flask', 'LLama.cpp', 'SQLite', 'GGUF', 'Swift'],
    github: 'https://github.com/jedsmith2004/OfflineAI',
    demo: '',
    image: '/Offline-AI-App.png',
    status: 'in-progress',
    date: 'July 2025',
    features: [
      'Fully offline inference (no cloud dependency)',
      'Multiple AI personalities / system profiles',
      'Local vector store & semantic recall',
      'Offline maps & survival reference modules',
      'Optimized quantized GGUF models (memory aware)',
      'Energy adaptive runtime (battery aware)'
    ]
  },
  {
    id: 'language-learning-app',
    title: 'Language Learning App',
    description: 'A Ruby on Rails language learning app made for a real client as a university project. Through requirements and regular meetings we developed an app that met the desired standards.',
    tech: ['Ruby on Rails', 'PostgreSQL', 'ActiveStorage', 'HAML', 'JavaScript', 'Bootstrap', 'ShakerPacker', 'Rake', 'GSAP', 'WSL', 'Gitlab'],
    github: 'https://github.com/jedsmith2004/Language-Learning-App',
    demo: '',
    image: '/language-learning-app.png',
    status: 'completed',
    date: 'May 2025',
    features: [
      'Role‑based user & admin dashboards',
      'Progress tracking & spaced repetition logic',
      'Media asset handling via ActiveStorage',
      'Real client requirement gathering process',
      'Component animations powered by GSAP',
      'Secure Postgres relational schema'
    ]
  },
  {
    id: 'old-personal-portfolio',
    title: 'Old Personal Portfolio',
    description: 'A Next.js based old personal portfolio website, utilising various technologies such as a CMS, Three.js and Shaders.',
    tech: ['Next.js', 'React', 'Typescript', 'Prismic CMS', 'Tailwind CSS', 'PostCSS', 'Slice Machine', 'Cloudflare', 'Shaders', 'GSAP'],
    github: 'https://github.com/jedsmith2004/portfolio',
    demo: 'https://jacksmith.me',
    image: '/old-portfolio.png',
    status: 'completed',
    date: 'December 2024',
    features: [
      'Prismic driven content slices',
      'Custom GLSL shader accents',
      'Optimised image delivery via Cloudflare',
      'Reusable layout primitives',
      'Accessible keyboard navigation',
      'Theming & content versioning'
    ]
  },
  {
    id: '3d-rasterizer-engine',
    title: '3D Rasterizer Engine',
    description: 'A 3D engine pipeline built from scratch enrirely in python, usilising rasterzing, loading models from .obj files and using custom vector and matrix types.',
    tech: ['Python', 'Pygame', '3D Graphics', 'Rasterization', 'Mathematics', 'Object representation'],
    github: 'https://github.com/jedsmith2004/portfolio',
    demo: 'https://jacksmith.me',
    image: '/old-portfolio.png',
    status: 'completed',
    date: 'June 2023',
    features: [
      'Prismic driven content slices',
      'Custom GLSL shader accents',
      'Optimised image delivery via Cloudflare',
      'Reusable layout primitives',
      'Accessible keyboard navigation',
      'Theming & content versioning'
    ]
  }
];
