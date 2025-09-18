'use client';

import SkillsCloud from './SkillsCloud';
import ExperienceTimeline from './ExperienceTimeline';
import AwardsSection from './AwardsSection';

export default function Skills() {
  return (
    <section id="skills" className="bg-[#0A0A0A]">
      <SkillsCloud />
      <ExperienceTimeline />
      <AwardsSection />
    </section>
  );
}