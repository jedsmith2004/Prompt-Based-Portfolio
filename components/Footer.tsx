export default function Footer() {
  return (
    <footer className="bg-black border-t border-white/10 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-6 md:mb-0">
            <h3 className="text-2xl font-bold text-white mb-2">Jack Smith</h3>
            <p className="text-gray-400">
              Building the future, one pixel at a time.
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-8">
            <div className="flex space-x-6">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors duration-200"
              >
                GitHub
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors duration-200"
              >
                LinkedIn
              </a>
              <a
                href="mailto:jack@example.com"
                className="text-gray-400 hover:text-white transition-colors duration-200"
              >
                Email
              </a>
            </div>
            
            <div className="text-center md:text-right">
              <p className="text-gray-500 text-sm">
                © 2024 Jack Smith. All rights reserved.
              </p>
              <p className="text-gray-600 text-xs mt-1">
                Built with Next.js, GSAP, and lots of ☕
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}