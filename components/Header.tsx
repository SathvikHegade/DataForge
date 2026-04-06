import { Moon, Sun, User, Github, Linkedin, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';

export function Header() {
  const [showAbout, setShowAbout] = useState(false);
  const [activeHash, setActiveHash] = useState<string>('');
  const [isLightBg, setIsLightBg] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setActiveHash(window.location.hash.replace('#', ''));
    };

    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isLightBg) {
      root.classList.add('light-bg');
    } else {
      root.classList.remove('light-bg');
    }
  }, [isLightBg]);

  const navItems = useMemo(
    () => [
      { id: 'features', label: 'Features' },
      { id: 'how', label: 'How it works' },
      { id: 'tips', label: 'Tips' },
    ],
    [],
  );

  const getNavLinkClass = (id: string) => {
    const isActive = activeHash === id;
    return [
      'px-3 py-1.5 rounded-full border transition-colors',
      isActive
        ? 'bg-warning/10 border-warning/40 text-foreground'
        : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:border-border',
    ].join(' ');
  };

  return (
    <>
      <header className="glass-nav fixed top-0 inset-x-0 z-[90]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="min-h-16 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-3 overflow-x-hidden">
            <a href="#home" className="flex items-center gap-3 min-w-0 overflow-hidden">
              <img
                src="/logo.png"
                alt="DataForge Logo"
                className="w-9 h-9 rounded-lg object-cover"
              />
              <div className="min-w-0 overflow-hidden">
                <div className="text-base sm:text-lg font-semibold text-foreground leading-tight truncate">DataForge</div>
                <div className="text-xs text-muted-foreground leading-tight truncate hidden sm:block">Smart Dataset Cleaning</div>
              </div>
            </a>

            <nav className="hidden md:flex items-center justify-center flex-wrap gap-2 text-sm px-2">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={getNavLinkClass(item.id)}
                  aria-current={activeHash === item.id ? 'page' : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsLightBg((v) => !v)}
                className="rounded-xl"
                aria-label="Toggle background theme"
              >
                {isLightBg ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAbout(true)}
                className="rounded-xl gap-2"
              >
                <User className="w-4 h-4" />
                <span className="hidden lg:inline">About Developer</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* About Developer Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 p-6 rounded-2xl bg-card border border-border shadow-2xl animate-in fade-in zoom-in duration-200">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAbout(false)}
              className="absolute top-4 right-4 rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>

            <div className="text-center space-y-4">
              <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-3xl font-bold text-white">SH</span>
              </div>
              
              <div>
                <h2 className="text-xl font-bold text-foreground">T S Sathvik Hegade</h2>
                <p className="text-sm text-muted-foreground">Aspiring Machine Learning Engineer</p>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                Engineering student at BMS Institute of Technology and Management. 
                Passionate about building tools that make data scientists more productive.
              </p>

              <div className="flex flex-wrap justify-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">Python</span>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">C++</span>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">TypeScript</span>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">React</span>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">Machine Learning</span>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3">Other Projects</p>
                <a 
                  href="https://github.com/SathvikHegade/SecureNote" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm"
                >
                  🔐 <span className="font-medium">SecureNote</span>
                  <span className="text-muted-foreground">- Secure note-taking with AI</span>
                </a>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <a 
                  href="https://github.com/SathvikHegade" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  <Github className="w-5 h-5" />
                </a>
                <a 
                  href="https://linkedin.com/in/sathvik-hegade-76112b330" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  <Linkedin className="w-5 h-5" />
                </a>
                <a 
                  href="mailto:sathvikhegade3@gmail.com"
                  className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  <Mail className="w-5 h-5" />
                </a>
              </div>

              <p className="text-xs text-muted-foreground italic pt-2">
                "Turning data into decisions and ideas into intelligent software."
              </p>
            </div>
          </div>
        </div>
      )}

      
    </>
  );
}
