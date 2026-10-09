import {
    Navigate,
    Route,
    Routes
} from "react-router-dom";

import ProtectedRoute
    from "./auth/ProtectedRoute";

import AdminLayout
    from "./components/admin/AdminLayout";

import AdminLogin
    from "./components/AdminLogin";

import AdminDashboard
    from "./pages/AdminDashboard";

import CourseCreate
    from "./pages/admin/CourseCreate";

import CourseDetail
    from "./pages/admin/CourseDetail";

import CourseEdit
    from "./pages/admin/CourseEdit";

import CoursesList
    from "./pages/admin/CoursesList";

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

            {/* Todo lo que está aquí adentro requiere sesión de administración */}
            <Route
                element={<ProtectedRoute />}
            >
                <Route
                    path="/admin"
                    element={<AdminLayout />}
                >
                    <Route
                        index
                        element={<AdminDashboard />}
                    />

                    <Route
                        path="cursos"
                        element={<CoursesList />}
                    />

                    <Route
                        path="cursos/nuevo"
                        element={<CourseCreate />}
                    />

                    <Route
                        path="cursos/:id"
                        element={<CourseDetail />}
                    />

                    <Route
                        path="cursos/:id/editar"
                        element={<CourseEdit />}
                    />
                </Route>
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
