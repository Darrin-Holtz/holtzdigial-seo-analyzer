import type { AxiosInstance } from "axios";
import axios from "axios";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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
    api: AxiosInstance;
    login: (email: string, password: string) => Promise<{success: boolean; message?: string}>;
    register: (name: string, email: string, password: string) => Promise<{success: boolean; message?: string}>;
    logout: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

const AppContext = createContext<AppContextType | undefined>(undefined);

// Single shared axios instance — credentials (httpOnly cookie) sent automatically
const api = axios.create({
    baseURL: BACKEND_URL,
    withCredentials: true,
});

export function AppProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const loadUser = async () => {
        try {
            const { data } = await api.get("/api/auth/user");
            if (data.success) {
                setUser(data.user);
            } else {
                setUser(null);
            }
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
            const res = await api.post("/api/auth/login", { email, password });
            if (res.data.success) {
                setUser(res.data.user);
                return { success: true };
            }
            return { success: false, message: res.data.message || "Login failed" };
        } catch (error: any) {
            return { success: false, message: error.response?.data?.message || "An error occurred" };
        }
    };

    const register = async (name: string, email: string, password: string) => {
        try {
            const res = await api.post("/api/auth/register", { name, email, password });
            if (res.data.success) {
                setUser(res.data.user);
                return { success: true };
            }
            return { success: false, message: res.data.message || "Registration failed" };
        } catch (error: any) {
            return { success: false, message: error.response?.data?.message || "An error occurred" };
        }
    };

    const logout = async () => {
        try {
            await api.post("/api/auth/logout");
        } catch { /* ignore network errors on logout */ }
        setUser(null);
    };

    const value = { user, loading, api, login, register, logout, loadUser };

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