import fs from 'fs';
import path from 'path';
import { projects as projectData } from './projects-data';

export interface ContextData {
  bio: {
    name: string;
    title: string;
    tagline: string;
    description: string[]; // changed to string[] to reflect context.json
    persona_instructions?: string[];
    location: string;
    email: string;
    github: string;
    linkedin: string;
  };
  skills: Array<{
    category: string;
    items: string[];
  }>;
  projects?: Array<{
    id: string;
    title: string;
    description: string;
    tech: string[];
    github: string;
    demo: string;
    image: string;
    linkedin: string;
    status: string;
    date: string;
    features?: string[];
  }>;
  experience: Array<{
    company: string;
    role: string;
    period: string;
    description: string;
  }>;
  awards?: Array<{
    title: string;
    place: string;
    date: string;
    description: string;
    badges?: string[];
  }>;
}

export function loadContext(): ContextData {
  const contextPath = path.join(process.cwd(), 'public', 'context.json');
  const contextData = fs.readFileSync(contextPath, 'utf-8');
  const parsed: ContextData = JSON.parse(contextData);

  // Inject canonical project data (always authoritative)
  parsed.projects = projectData.map(p => ({
    id: p.id,
    title: p.title,
    description: p.description,
    tech: p.tech,
    github: p.github,
    demo: p.demo,
    image: p.image,
    linkedin: p.linkedin || 'N/A',
    status: p.status,
    date: p.date,
    // Cap the feature list. The full set across every project pushes the system prompt past the
    // 8k context window of the legacy fallback models in pages/api/ask.ts, which silently turns
    // the whole fallback chain into a 502 whenever the primary model is rate-limited.
    features: p.features?.slice(0, 3)
  }));

  return parsed;
}

/* The prompt moved to lib/v2/pipPrompt.ts. This module is the data loader — it
   reads context.json off disk and normalises the record — and that one is
   prose about a bird; they change for entirely different reasons and the prose
   is now four times the size of the loader. Re-exported so pages/api/ask.ts
   and anything else keeps importing it from here. */
export { createSystemPrompt } from './v2/pipPrompt';
