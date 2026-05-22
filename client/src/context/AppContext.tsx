import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Axios is NOT imported here — auth calls use the native Fetch API so that
// axios stays out of the initial JS bundle (it lives in src/lib/api.ts and is
// only pulled in by lazy-loaded pages that need it for authenticated requests).

interface User {
    id: string;
    name: string;
    email: string;
    plan: string;
    analysisCount?: number;
}

interface AppContextType {
    user: User | null;
    loading: boolean;
    // `api` is intentionally absent — consumers import { api } from '../lib/api'
    login: (email: string, password: string) => Promise<{success: boolean; message?: string}>;
    register: (name: string, email: string, password: string) => Promise<{success: boolean; message?: string}>;
    logout: () => void;
    loadUser: () => Promise<void>;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const loadUser = async () => {
        try {
            // Consume the pre-fetch started in index.html's inline script.
            // By the time React mounts (~1.3 s), the response is already in-flight
            // or fully resolved, so setLoading(false) fires with minimal delay.
            const w = window as { __af?: Promise<Response> };
            const earlyFetch = w.__af;
            if (earlyFetch !== undefined) delete w.__af;
            const res = await (earlyFetch ?? fetch(`${BACKEND_URL}/api/auth/user`, { credentials: "include" }));
            const data = await res.json();
            setUser(data.success ? data.user : null);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUser();
    }, []);

    const login = async (email: string, password: string) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (data.success) {
                setUser(data.user);
                return { success: true };
            }
            return { success: false, message: data.message || "Login failed" };
        } catch {
            return { success: false, message: "An error occurred" };
        }
    };

    const register = async (name: string, email: string, password: string) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await res.json();
            if (data.success) {
                setUser(data.user);
                return { success: true };
            }
            return { success: false, message: data.message || "Registration failed" };
        } catch {
            return { success: false, message: "An error occurred" };
        }
    };

    const logout = async () => {
        try {
            await fetch(`${BACKEND_URL}/api/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } catch { /* ignore network errors on logout */ }
        setUser(null);
    };

    const value = { user, loading, login, register, logout, loadUser };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useApp must be used within an AppProvider");
    }
    return context;
}