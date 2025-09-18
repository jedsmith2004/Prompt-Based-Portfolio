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
    id: 'interactive-ai-portfolio',
    title: 'Interactive AI Portfolio',
    description: 'This live portfolio you\'re browsing: an AI-augmented, animation-rich Next.js site with streaming Groq chat, contextual system prompt generation, markdown rendering, and dynamic placeholder suggestion engine.',
    tech: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'GSAP', 'LLM Streaming', 'Groq', 'Markdown', 'Node.js', 'Edge Patterns', 'AI', 'LLM', 'API'],
    github: 'https://github.com/jedsmith2004/Prompt-Based-Portfolio',
    demo: '',
    image: '/AI-Portfolio.png',
    status: 'in-progress',
    date: 'September 2025',
    features: [
      'Real-time streaming AI chat with conversation memory & fallback model chain',
      'RunId-based deterministic placeholder suggestion animator (no overlap)',
      'Lightweight custom markdown renderer with links, code & lists',
      'Dynamic system prompt built from structured JSON context & project injection',
      'Responsive glass UI with particle & hero entrance animations (GSAP)',
      'Model fallback chain (Mixtral → Gemma2 → Llama 8B) for resilience',
      'Type-safe project metadata with extended feature lists',
      'Optimized minimal message rendering and scroll management'
    ]
  },
  {
    id: 'language-learning-app',
    title: 'Language Learning App',
    description: 'A Ruby on Rails language learning app made for a real client as a university project. Through requirements and regular meetings we developed an app that met the desired standards.',
    tech: ['Ruby on Rails', 'PostgreSQL', 'ActiveStorage', 'HAML', 'Bootstrap', 'ShakerPacker', 'Rake', 'GSAP', 'WSL', 'Gitlab', 'Figma'],
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
    id: '3d-rasterizer-engine',
    title: '3D Rasterizer Engine',
    description: 'A 3D engine pipeline built from scratch enrirely in python, usiliting rasterzing, loading models from .obj files and using custom vector and matrix types.',
    tech: ['Python', 'Pygame', '3D Graphics', 'Rasterization', 'Mathematics', 'Object representation'],
    github: 'https://github.com/jedsmith2004/rasterizer',
    demo: '',
    image: '/3d-rasterizer-engine.png',
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
  },
  {
    id: 'mnist-from-scratch-classifier',
    title: 'MNIST From-Scratch Image Classifier',
    description: 'A complete machine learning pipeline built entirely from scratch in Python for handwritten digit classification, featuring custom SVM and KNN implementations with advanced preprocessing and 99.8% accuracy on noisy test data.',
    tech: ['Python', 'NumPy', 'SciPy', 'AI', 'Machine Learning', 'Computer Vision', 'Mathematics'],
    github: 'https://github.com/jedsmith2004/Handwritten-Number-Classifier',
    demo: '',
    image: '/',
    status: 'completed',
    date: 'December 2024',
    features: [
        'Custom multi-class SVM with One-vs-All strategy',
        'Mini-batch gradient descent with hinge loss optimization',
        'PCA dimensionality reduction retaining 95% variance',
        'Advanced data augmentation (rotation, flip, noise)',
        'Robust preprocessing with threshold masking and Gaussian blur',
        'Complete type annotations and comprehensive documentation',
        'Performance progression from 70% to 99.8% accuracy',
        'Model persistence and evaluation pipeline'
    ]
  },
  {
    id: 'offline-ai-app',
    title: 'Mobile Based Offline AI App',
    description: 'A mobile based app that runs distilled models on the phone to access AI without internet. It also has personalities, offline maps and survival guides.',
    tech: ['AI', 'LLM', 'Flask', 'Python', 'LLama.cpp', 'SQLite', 'GGUF', 'Swift', 'Figma', 'React', 'Next.js'],
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
    id: 'old-personal-portfolio',
    title: 'Old Personal Portfolio',
    description: 'A Next.js based old personal portfolio website, utilising various technologies such as a CMS, Three.js and Shaders.',
    tech: ['Next.js', 'React', 'Typescript', 'Prismic CMS', 'Three.js', '3D Graphics', 'Tailwind CSS', 'PostCSS', 'Slice Machine', 'Cloudflare', 'Shaders', 'GSAP'],
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
    id: 'texas-holdem-haskell',
    title: 'Texas Hold\'em Poker in Haskell',
    description: 'A complete Texas Hold\'em poker game implementation in pure Haskell featuring multiple AI strategies, comprehensive hand evaluation, and full game mechanics including betting rounds, blinds, and sophisticated tie-breaking systems.',
    tech: ['Haskell', 'Functional Programming', 'Game Development', 'AI', 'Random Generation', 'Monadic Programming'],
    github: 'https://github.com/jedsmith2004/Texas-Hold-em-Poker-in-Haskell',
    demo: '',
    image: '',
    status: 'completed',
    date: 'December 2024',
    features: [
        'Complete poker hand evaluation system (Royal Flush to High Card)',
        'Four distinct AI strategies: Random, Passive, Aggressive, and Smart',
        'Human player interaction with input validation',
        'Full betting mechanics (fold, check, call, raise) with proper constraints',
        'Comprehensive tie-breaking system for all hand types',
        'Proper blind system implementation (small/big blinds)',
        'Multi-round gameplay with chip tracking and dealer rotation',
        'Advanced functional programming patterns and monadic IO',
        'Deck shuffling and card dealing with proper randomization',
        'Complete game state management and player elimination',
        'Sophisticated winner determination with multiple tied players',
        'Pure functional implementation with immutable data structures'
    ]
  }
];
