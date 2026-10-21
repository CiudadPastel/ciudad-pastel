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

import PublicLayout
    from "./components/public/PublicLayout";

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

import EnrollmentRequests
    from "./pages/admin/EnrollmentRequests";

import PublicCoursesList
    from "./pages/public/CoursesList";

import MyRecipeBooks
    from "./pages/public/MyRecipeBooks";

import PublicCourseDetail
    from "./pages/public/CourseDetail";

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
                path="/cursos"
                element={<PublicLayout />}
            >
                <Route
                    index
                    element={<PublicCoursesList />}
                />
                <Route
                    path=":id"
                    element={<PublicCourseDetail />}
                />
            </Route>

            <Route element={<PublicLayout />}>
                <Route
                    path="/mis-libros-de-recetas"
                    element={<MyRecipeBooks />}
                />
            </Route>

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

                    <Route
                        path="solicitudes"
                        element={<EnrollmentRequests />}
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
