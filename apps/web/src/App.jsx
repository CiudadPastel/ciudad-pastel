import { useEffect, useState } from "react";

import AdminLogin from "./components/AdminLogin";

import {
  observeAuthState,
  signOutAdmin,
  validateAdminSession
} from "./services/auth.service";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = observeAuthState(
        async (firebaseUser) => {
          if (!firebaseUser) {
            setUser(null);
            setLoading(false);
            return;
          }

          try {
            const adminSession =
                await validateAdminSession(firebaseUser);

            if (adminSession) {
              setUser(firebaseUser);
            } else {
              await signOutAdmin();
              setUser(null);
            }
          } catch (error) {
            console.error(
                "Session validation failed:",
                error
            );

            setUser(null);
          } finally {
            setLoading(false);
          }
        }
    );

    return unsubscribe;
  }, []);

  async function handleLogout() {
    await signOutAdmin();
    setUser(null);
  }

  if (loading) {
    return <p>Cargando...</p>;
  }

  if (!user) {
    return (
        <AdminLogin
            onLogin={setUser}
        />
    );
  }

  return (
      <main>
        <h1>Ciudad Pastel Administracion</h1>

        <p>
          Signed in as{" "}
          <strong>{user.email}</strong>
        </p>

        <p>
          Permisos Administrativos Ortogados
        </p>

        <button onClick={handleLogout}>
          Cerrar Sesion
        </button>
      </main>
  );
}

export default App;