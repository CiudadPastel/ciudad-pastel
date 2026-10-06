import {
    Navigate,
    Route,
    Routes
} from "react-router-dom";

import ProtectedRoute
    from "./auth/ProtectedRoute";

import AdminLogin
    from "./components/AdminLogin";

import AdminDashboard
    from "./pages/AdminDashboard";

import Home
    from "./pages/Home";

function App() {
    return (
        <Routes>

            <Route
                path="/"
                element={<Home />}
            />

            <Route
                path="/admin/login"
                element={<AdminLogin />}
            />

            <Route
                element={<ProtectedRoute />}
            >
                <Route
                    path="/admin"
                    element={
                        <AdminDashboard />
                    }
                />
            </Route>

            <Route
                path="*"
                element={
                    <Navigate
                        to="/"
                        replace
                    />
                }
            />

        </Routes>
    );
}

export default App;