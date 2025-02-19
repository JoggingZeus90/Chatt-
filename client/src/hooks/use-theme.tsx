import { createContext, useContext, useEffect, useState } from "react";

type Theme = {
  mode: "dark" | "light";
  primary: string;
  contrast: number; // Add contrast to theme type
};

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme["mode"];
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: {
    mode: "light",
    primary: "#0066cc",
    contrast: 100, // Default contrast value
  },
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey);
    if (storedTheme) {
      try {
        return JSON.parse(storedTheme);
      } catch {
        return { mode: defaultTheme, primary: "#0066cc", contrast: 100 };
      }
    }
    return { mode: defaultTheme, primary: "#0066cc", contrast: 100 };
  });

  useEffect(() => {
    const root = window.document.documentElement;

    // Update color mode
    root.classList.remove("light", "dark");
    root.classList.add(theme.mode);

    // Convert hex to HSL for primary color
    const hsl = hexToHSL(theme.primary);

    // Apply contrast to lightness
    const adjustedL = (hsl.l * theme.contrast) / 100;

    // Set CSS custom properties for Tailwind
    root.style.setProperty("--primary", `${hsl.h} ${hsl.s}% ${adjustedL}%`);

    localStorage.setItem(storageKey, JSON.stringify(theme));
  }, [theme, storageKey]);

  const value = {
    theme,
    setTheme: (theme: Theme) => setTheme(theme),
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
}

// Helper function to convert hex to HSL
function hexToHSL(hex: string) {
  // Remove the # if present
  hex = hex.replace("#", "");

  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  // Find min and max RGB values
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h = h / 6;
  }

  // Convert to degrees and percentages
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return { h, s, l };
}