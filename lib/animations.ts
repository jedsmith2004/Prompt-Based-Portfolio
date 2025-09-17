import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export class AnimationManager {
  static initHeroAnimations() {
    const tl = gsap.timeline();
    
    tl.fromTo('.hero-title', 
      { y: 100, opacity: 0 }, 
      { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out' }
    )
    .fromTo('.hero-subtitle', 
      { y: 50, opacity: 0 }, 
      { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 
      '-=0.6'
    )
    .fromTo('.hero-chat-box', 
      { y: 30, opacity: 0, scale: 0.9 }, 
      { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.7)' }, 
      '-=0.4'
    )
    .fromTo('.hero-hint', 
      { opacity: 0 }, 
      { opacity: 1, duration: 0.6 }, 
      '-=0.2'
    );

    return tl;
  }

  static initScrollAnimations() {
    // Animate sections on scroll
    gsap.utils.toArray('.animate-on-scroll').forEach((element: any) => {
      gsap.fromTo(element, 
        { y: 80, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 85%',
            end: 'bottom 15%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });

    // Stagger animations for lists
    gsap.utils.toArray('.stagger-animation').forEach((container: any) => {
      const items = container.querySelectorAll('.stagger-item');
      
      gsap.fromTo(items,
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 85%',
            end: 'bottom 15%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });
  }

  static animateProjectCards() {
    gsap.utils.toArray('.project-card').forEach((card: any) => {
      const tl = gsap.timeline({ paused: true });
      
      tl.to(card, {
        scale: 1.05,
        y: -10,
        boxShadow: '0 20px 40px rgba(0, 123, 255, 0.3)',
        duration: 0.3,
        ease: 'power2.out'
      });

      card.addEventListener('mouseenter', () => tl.play());
      card.addEventListener('mouseleave', () => tl.reverse());
    });
  }

  static animateChatMessage(element: HTMLElement, isUser: boolean = false) {
    gsap.fromTo(element,
      { 
        y: 20, 
        opacity: 0, 
        scale: 0.9,
        transformOrigin: isUser ? 'right bottom' : 'left bottom'
      },
      { 
        y: 0, 
        opacity: 1, 
        scale: 1,
        duration: 0.4, 
        ease: 'back.out(1.7)' 
      }
    );
  }

  static createTypewriterEffect(element: HTMLElement, text: string, speed: number = 30) {
    return new Promise<void>((resolve) => {
      let i = 0;
      element.textContent = '';
      
      const timer = setInterval(() => {
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          resolve();
        }
      }, speed);
    });
  }

  static initParticleBackground() {
    const particles = document.querySelectorAll('.particle');
    
    particles.forEach((particle: any, index) => {
      gsap.to(particle, {
        y: -100,
        x: index % 2 === 0 ? 50 : -50,
        rotation: 360,
        duration: 10 + (index * 2),
        repeat: -1,
        ease: 'none',
        delay: index * 0.5
      });
    });
  }

  static animateSkillBars() {
    gsap.utils.toArray('.skill-bar').forEach((bar: any) => {
      const percentage = bar.dataset.percentage || '0';
      
      gsap.fromTo(bar.querySelector('.skill-fill'),
        { width: '0%' },
        {
          width: `${percentage}%`,
          duration: 1.5,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: bar,
            start: 'top 90%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });
  }
}