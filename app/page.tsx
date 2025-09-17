'use client';

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import About from '../components/About';
import Projects from '../components/Projects';
import Skills from '../components/Skills';
import Contact from '../components/Contact';
import Footer from '../components/Footer';

export default function Home() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
      
      // Refresh ScrollTrigger on page load
      ScrollTrigger.refresh();

      // Cleanup on unmount
      return () => {
        ScrollTrigger.getAll().forEach(st => st.kill());
      };
    }
  }, []);

  return (
    <main className="relative">
      <Navbar />
      <Hero />
      <About />
      <Projects />
      <Skills />
      <Contact />
      <Footer />
    </main>
  );
}