import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function Header() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.png" 
              alt="DataForge Logo" 
              className="w-10 h-10 rounded-lg object-cover"
            />
            <div>
              <h1 className="text-xl font-bold text-foreground">DataForge</h1>
              <p className="text-xs text-muted-foreground">Smart Dataset Cleaning</p>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsDark(!isDark)}
            className="rounded-xl"
          >
            {isDark ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
