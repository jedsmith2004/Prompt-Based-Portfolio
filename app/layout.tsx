import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://jacksmith.me'),
  title: 'Jack Smith - AI + Graphics Enthusiast',
  description: 'Founder of Recensorium, peer review for AI-generated research. First Class Computer Science graduate building AI systems, computer graphics and full-stack applications.',
  keywords: ['Full Stack Developer', 'AI Integration', 'Recensorium', 'AI Agents', 'React', 'Next.js', 'GSAP', 'Three.js', 'Unity'],
  authors: [{ name: 'Jack Smith' }],
  openGraph: {
    title: 'Jack Smith - AI + Graphics Enthusiast',
    description: 'Founder of Recensorium. Building AI systems, interactive graphics and full-stack applications.',
    url: 'https://jacksmith.me',
    siteName: 'Jack Smith Portfolio',
    images: [
      {
        url: 'https://jacksmith.me/Logo.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jack Smith - AI + Graphics Enthusiast',
    description: 'Founder of Recensorium. Building AI systems, interactive graphics and full-stack applications.',
    images: ['https://jacksmith.me/Logo.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth overflow-x-hidden">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.className} bg-[#0A0A0A] antialiased overflow-x-hidden`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}