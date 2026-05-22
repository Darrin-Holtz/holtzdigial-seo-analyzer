/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = { theme: "system", setTheme: () => null };

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({ children, defaultTheme = "system", storageKey = "rankpilot-theme", ...props }: ThemeProviderProps) {
    // Resolve "system" immediately so the effect never has to call setTheme()
    // on mount — that second-render cycle causes a forced CSSOM recalculation
    // (classList.remove + classList.add on <html>) that shows up as 1.5s of
    // Style & Layout work and a 53ms forced reflow in Lighthouse.
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = (localStorage.getItem(storageKey) as Theme) || defaultTheme;
        if (stored === "system") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return stored;
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove("light", "dark");
        // theme is always "dark" or "light" here — no setTheme() side-effect needed
        root.classList.add(theme);
    }, [theme]);

    const value = {
        theme,
        setTheme: (newTheme: Theme) => {
            const resolved: Theme =
                newTheme === "system"
                    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
                    : newTheme;
            localStorage.setItem(storageKey, resolved);
            setTheme(resolved);
        },
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);
    if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");
    return context;
};
