import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Jack Smith - AI + Graphics Enthusiast',
  description: 'Full-stack developer specializing in AI integration and interactive web experiences. Building the future with modern technologies.',
  keywords: ['Full Stack Developer', 'AI Integration', 'React', 'Next.js', 'GSAP', 'Three.js'],
  authors: [{ name: 'Jack Smith' }],
  openGraph: {
    title: 'Jack Smith - AI + Graphics Enthusiast',
    description: 'Building Interactive Worlds with AI and Modern Web Technologies',
    url: 'https://your-domain.com',
    siteName: 'Jack Smith Portfolio',
    images: [
      {
        url: 'https://your-domain.com/og-image.jpg',
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
    description: 'Building Interactive Worlds with AI and Modern Web Technologies',
    images: ['https://your-domain.com/og-image.jpg'],
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.className} bg-[#0A0A0A] antialiased overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}