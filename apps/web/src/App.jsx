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

import ProductDetail
    from "./pages/admin/ProductDetail";

import ProductCreate
    from "./pages/admin/ProductCreate";

import ProductEdit
    from "./pages/admin/ProductEdit";

import ProductsList
    from "./pages/admin/ProductsList";

import PublicCoursesList
    from "./pages/public/CoursesList";

import MyRecipeBooks
    from "./pages/public/MyRecipeBooks";

import PublicCourseDetail
    from "./pages/public/CourseDetail";

import PublicProductsList
    from "./pages/public/ProductsList";

import PublicProductDetail
    from "./pages/public/ProductDetail";

import Home
    from "./pages/Home";

import Cart from "./pages/public/Cart";

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

            <Route
                path="/tienda"
                element={<PublicLayout />}
            >
                <Route
                    index
                    element={<PublicProductsList />}
                />
                <Route path="carrito" element={<Cart />} />
                <Route
                    path=":id"
                    element={<PublicProductDetail />}
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
                        path="productos"
                        element={<ProductsList />}
                    />

                    <Route
                        path="productos/nuevo"
                        element={<ProductCreate />}
                    />

                    <Route
                        path="productos/:id/editar"
                        element={<ProductEdit />}
                    />

                    <Route
                        path="productos/:id"
                        element={<ProductDetail />}
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
