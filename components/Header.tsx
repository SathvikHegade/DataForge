import { Moon, Sun, User, Github, Linkedin, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function Header() {
  const [isDark, setIsDark] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <>
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto text-center sm:text-left">
              <img
                src="/logo.png"
                alt="DataForge Logo"
                className="mx-auto sm:mx-0 w-10 h-10 sm:w-10 sm:h-10 rounded-lg object-cover"
              />
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">DataForge</h1>
                <p className="text-xs text-muted-foreground">Smart Dataset Cleaning</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto mt-3 sm:mt-0 justify-center sm:justify-end">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowAbout(true)}
                className="rounded-xl gap-2"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">About Developer</span>
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setIsDark(!isDark)}
                className="rounded-xl"
                aria-label="Toggle theme"
              >
                {isDark ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
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
