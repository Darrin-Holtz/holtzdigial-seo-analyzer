import axios from "axios";

// Shared authenticated Axios instance for all lazy-loaded pages.
//
// This module is intentionally NOT imported by AppContext or any eagerly-loaded
// component. Keeping it out of the initial bundle removes ~11 KiB gzip of axios
// from the critical JS path, reducing parse time before the LCP element paints.
// Pages that need it (Dashboard, Analyze, Report, etc.) are all lazy-loaded anyway.
export const api = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_URL || "",
    withCredentials: true,
});
