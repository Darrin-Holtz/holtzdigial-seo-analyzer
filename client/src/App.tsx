import { lazy, Suspense } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Loading from "./components/Loading";
import { useApp } from "./context/AppContext";

// Lazy-load Navbar so React's first commit (which paints the Hero H1 = LCP)
// does not have to process the Navbar component tree first. Navbar is
// position:fixed so deferring it causes zero layout shift (CLS stays 0).
const Navbar = lazy(() => import("./components/Navbar"));

// Lazy-load all non-home routes to reduce initial bundle size
const Login = lazy(() => import("./pages/Login"));
// Lazy-load Toaster so react-hot-toast is excluded from the initial JS bundle.
// By the time any page that triggers a toast (e.g. Login) loads, Toaster will
// have already been fetched and mounted.
const Toaster = lazy(() => import("react-hot-toast").then((m) => ({ default: m.Toaster })));
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
            <Suspense fallback={null}>
                <Toaster />
            </Suspense>
            {/* Fallback is a minimal fixed bar that matches Navbar's visual footprint
                (height 64px, same blur/background) so there is no layout shift when
                the real Navbar mounts on the next render pass. */}
            {!hideNavbar && (
                <Suspense fallback={
                    <nav aria-hidden className="fixed top-0 w-full h-16 z-50 bg-background/70 backdrop-blur-lg" />
                }>
                    <Navbar />
                </Suspense>
            )}
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
