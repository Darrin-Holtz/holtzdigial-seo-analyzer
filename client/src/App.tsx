import { lazy, Suspense } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Loading from "./components/Loading";
import { Toaster } from "react-hot-toast";
import { useApp } from "./context/AppContext";

// Lazy-load all non-home routes to reduce initial bundle size
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analyze = lazy(() => import("./pages/Analyze"));
const Report = lazy(() => import("./pages/Report"));
const History = lazy(() => import("./pages/History"));
const RankTracker = lazy(() => import("./pages/RankTracker"));
const RankDetail = lazy(() => import("./pages/RankDetail"));

export default function App() {
    const {user, loading} = useApp();
    const location = useLocation();

    const hideNavbar = ["/login", "/register"].includes(location.pathname);

    return (
        <>
            <Toaster />
            {!hideNavbar && <Navbar />}
            <Suspense fallback={<Loading />}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={loading ? <Loading /> : (user ? <Navigate to="/dashboard" replace /> : <Login state="login" />)} />
                    <Route path="/register" element={loading ? <Loading /> : (user ? <Navigate to="/dashboard" replace /> : <Login state="register" />)} />
                    <Route element={<ProtectedRoute />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/analyze" element={<Analyze />} />
                        <Route path="/report/:id" element={<Report />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/rank-tracker" element={<RankTracker />} />
                        <Route path="/rank/:id" element={<RankDetail />} />
                    </Route>
                </Routes>
            </Suspense>
        </>
    );
}
