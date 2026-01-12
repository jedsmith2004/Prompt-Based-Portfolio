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
  linkedin?: string; // Link to LinkedIn post about this project
}

export const projects: Project[] = [
  {
    id: 'neighbourly',
    title: 'Neighbourly',
    description: 'A community-focused web app connecting neighbors who need help with volunteers willing to assist. Users post requests for help (groceries, errands, companionship) and volunteers view them on an interactive map and offer assistance via real-time chat. An evolution of our HackSheffield 9 hackathon project where we won 1st place in the GitHub competition.',
    tech: ['SvelteKit 5', 'TailwindCSS', 'Google Maps API', 'Python', 'Flask', 'SQLAlchemy', 'PostgreSQL', 'Neon', 'Auth0', 'Vercel', 'Fly.io', 'Real-time Chat'],
    github: 'https://github.com/jedsmith2004/neighbourly',
    demo: 'https://neighbourly.jacksmith.me',
    linkedin: '',
    image: '/neighbourly.png',
    status: 'completed',
    date: 'January 2026',
    features: [
      'Interactive map showing nearby help requests with Google Maps API integration',
      'Real-time chat between requesters and helpers',
      'Two-way map-address interaction: pin updates address field, typing address repositions pin',
      'Secure authentication with Auth0 across separate frontend/backend domains',
      'PostgreSQL-backed sessions for multi-instance server support',
      'Mobile-responsive design',
      'Cross-domain authentication handling with HTTPS behind reverse proxies',
      'Evolution from HackSheffield 9 hackathon (1st place GitHub competition)'
    ]
  },
  {
    id: 'client-website-sheffield',
    title: 'Client Website Delivery (Sheffield)',
    description: 'A real client website delivered end-to-end with a full requirements → prototype → feedback iteration loop, followed by deployment and domain transfer coordination with the client’s previous web provider.',
    tech: ['Web Development', 'UI/UX', 'Prototyping', 'Client Requirements', 'Iteration', 'Deployment', 'Domain Transfer', 'Git', 'Figma'],
    github: '',
    demo: 'https://www.d-a-r-t.co.uk',
    linkedin: 'https://www.linkedin.com/posts/jack-ed-smith_softwareengineering-webdevelopment-clientprojects-activity-7414599219501801472-oc0A?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADuJDq8BCJQoqWvGoU-uR5GamfvCd_uNR6c',
    image: '/dart_home_page.png',
    status: 'completed',
    date: 'October 2025',
    features: [
      'Ran requirements gathering sessions and converted goals into a clear delivery plan and site structure',
      'Built iterative prototypes, collected feedback, and made decisive changes to match client expectations',
      'Focused on usability, clarity, and maintainability to support long-term client updates',
      'Coordinated deployment and handover, ensuring a reliable release process and minimal disruption',
      'Worked with the previous provider to transfer the domain and complete the migration cleanly',
      'Delivered a polished, client-ready site with a smooth post-launch transition'
    ]
  },
  {
    id: 'old-personal-portfolio',
    title: 'Old Personal Portfolio',
    description: 'A Next.js based old personal portfolio website, utilising various technologies such as a CMS, Three.js and Shaders.',
    tech: ['Next.js', 'React', 'Typescript', 'Prismic CMS', 'Three.js', '3D Graphics', 'Tailwind CSS', 'PostCSS', 'Slice Machine', 'Cloudflare', 'Shaders', 'GSAP'],
    github: 'https://github.com/jedsmith2004/portfolio',
    demo: 'https://old-portfolio.jacksmith.me',
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
    id: 'language-learning-app',
    title: 'Language Learning App',
    description: 'A Ruby on Rails language learning app made for a real client as a university project. Through requirements and regular meetings we developed an app that met the desired standards.',
    tech: ['Ruby on Rails', 'PostgreSQL', 'ActiveStorage', 'HAML', 'Bootstrap', 'ShakerPacker', 'Rake', 'GSAP', 'WSL', 'Gitlab', 'Figma'],
    github: 'https://github.com/jedsmith2004/Language-Learning-App',
    demo: '',
    linkedin: 'https://www.linkedin.com/posts/jack-ed-smith_softwareengineering-rubyonrails-educationtech-activity-7414595439846432768-A2Po?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADuJDq8BCJQoqWvGoU-uR5GamfvCd_uNR6c',
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
    id: 'mnist-from-scratch-classifier',
    title: 'MNIST From-Scratch Image Classifier',
    description: 'A complete machine learning pipeline built entirely from scratch in Python for handwritten digit classification, featuring custom SVM and KNN implementations with advanced preprocessing and 99.8% accuracy on noisy test data.',
    tech: ['Python', 'NumPy', 'SciPy', 'AI', 'Machine Learning', 'Computer Vision', 'Mathematics'],
    github: 'https://github.com/jedsmith2004/Handwritten-Number-Classifier',
    demo: '',
    image: '/MNIST-handwritten-digits-dataset-visualized-by-Activeloop.webp',
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
      'Custom software rasterization pipeline with triangle filling and z-buffering',
      'Support for loading and rendering 3D models from .obj files',
      'Custom vector and matrix math library for transformations',
      'Camera system with perspective projection and rotation controls',
      'Wireframe and solid rendering modes for debugging and visualization',
      'Scene management with multiple objects and real-time rendering loop'
    ]
  },
  {
    id: 'eyh-swarm-pipe-robots',
    title: 'EYH Swarm Pipe Robots (FISH)',
    description: 'A third-place Engineering You’re Hired (EYH) concept project: a decentralised swarm of pipe-crawling robots for inspection and leak detection, designed with failure-tolerant locomotion, robust operational protocols, and clear system-level animations.',
    tech: ['Swarm Robotics', 'Robotics', 'Algorithms', 'Systems Design', 'Computer Vision', 'LiDAR', 'Ultrasonic Sensing', 'CAD', 'CFD', 'Blender', '3D Animation', 'Technical Drawings', 'Business Planning'],
    github: '',
    demo: '',
    linkedin: 'https://www.linkedin.com/posts/jack-ed-smith_looking-back-at-one-of-the-most-intense-and-activity-7414591646497173504-ugAd?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADuJDq8BCJQoqWvGoU-uR5GamfvCd_uNR6c',
    image: '/FISH_final_design.png',
    status: 'completed',
    date: 'March 2025',
    features: [
      'Designed caterpillar-like pipe locomotion with grippers + motors and spring-extended safety behavior for power loss',
      'Developed swarm rules for cohesion + full coverage exploration while minimizing redundancy and missed sections',
      'Specified multi-sensor leak detection approach combining vision, LiDAR, and ultrasonic techniques',
      'Defined robust operational protocols (rescue, corner navigation, disconnection handling, recovery procedures)',
      'Produced system animations in Blender, learning the tool from scratch under hack-week time pressure',
      'Delivered CAD concepts, CFD simulations, electrical/technical drawings, and an industry-facing business plan'
    ]
  },
  {
    id: 'interactive-ai-portfolio',
    title: 'Interactive AI Portfolio',
    description: 'This live portfolio you\'re browsing: an AI-augmented, animation-rich Next.js site with streaming Groq chat, contextual system prompt generation, markdown rendering, and dynamic placeholder suggestion engine.',
    tech: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'GSAP', 'LLM Streaming', 'Groq', 'Markdown', 'Node.js', 'Edge Patterns', 'AI', 'LLM', 'API'],
    github: 'https://github.com/jedsmith2004/Prompt-Based-Portfolio',
    demo: 'https://www.jacksmith.me',
    linkedin: 'https://www.linkedin.com/posts/jack-ed-smith_portfolio-webdevelopment-nextjs-activity-7414621831011381248-YeGo?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADuJDq8BCJQoqWvGoU-uR5GamfvCd_uNR6c',
    image: '/AI-Portfolio.png',
    status: 'completed',
    date: 'January 2026',
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
    id: 'offline-ai-app',
    title: 'Mobile Based Offline AI App',
    description: 'A mobile based app that runs distilled models on the phone to access AI without internet. It also has personalities, offline maps and survival guides.',
    tech: ['AI', 'LLM', 'Flask', 'Python', 'LLama.cpp', 'SQLite', 'GGUF', 'Swift', 'Figma', 'React', 'Next.js'],
    github: 'https://github.com/jedsmith2004/Offline-AI',
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
