import { createContext, useContext, useEffect, useState } from "react";

type Theme = {
  mode: "dark" | "light";
  primary: string;
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
        return { mode: defaultTheme, primary: "#0066cc" };
      }
    }
    return { mode: defaultTheme, primary: "#0066cc" };
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme.mode);
    root.style.setProperty("--primary", theme.primary);
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

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};