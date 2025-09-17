import fs from 'fs';
import path from 'path';

export interface ContextData {
  bio: {
    name: string;
    title: string;
    tagline: string;
    description: string;
    location: string;
    email: string;
    github: string;
    linkedin: string;
  };
  skills: Array<{
    category: string;
    items: string[];
  }>;
  projects: Array<{
    id: string;
    title: string;
    description: string;
    tech: string[];
    github: string;
    demo: string;
    image: string;
  }>;
  experience: Array<{
    company: string;
    role: string;
    period: string;
    description: string;
  }>;
}

export function loadContext(): ContextData {
  const contextPath = path.join(process.cwd(), 'public', 'context.json');
  const contextData = fs.readFileSync(contextPath, 'utf-8');
  return JSON.parse(contextData);
}

export function createSystemPrompt(context: ContextData): string {
  return `You are an AI assistant representing ${context.bio.name}, a ${context.bio.title}. 

BACKGROUND:
${context.bio.description}

SKILLS:
${context.skills.map(skill => `${skill.category}: ${skill.items.join(', ')}`).join('\n')}

PROJECTS:
${context.projects.map(project => 
  `- ${project.title}: ${project.description} (Tech: ${project.tech.join(', ')})`
).join('\n')}

EXPERIENCE:
${context.experience.map(exp => 
  `- ${exp.role} at ${exp.company} (${exp.period}): ${exp.description}`
).join('\n')}

CONTACT:
- Location: ${context.bio.location}
- Email: ${context.bio.email}
- GitHub: ${context.bio.github}
- LinkedIn: ${context.bio.linkedin}

Instructions:
- Answer questions as if you are ${context.bio.name}
- Be conversational, enthusiastic, and professional
- Provide specific details about projects and experience when asked
- If asked about something not in your background, politely redirect to what you can help with
- Keep responses concise but informative
- Show personality and passion for your work`;
}