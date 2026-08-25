import type { Metadata } from 'next';
import './v2.css';

export const metadata: Metadata = {
  title: 'Jack Smith — builds from the metal up',
  description:
    'Software rasterizers written from nothing, neural runtimes that never leave your machine, motion models that answer inside the editor. Final year Computer Science, University of Sheffield.',
  robots: { index: false, follow: false }
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <div className="v2">{children}</div>;
}
