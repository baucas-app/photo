import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function Layout() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <h1>Photos</h1>
        <NavLink to="/" end>
          Mediathek
        </NavLink>
        <NavLink to="/albums">Alben</NavLink>
        <NavLink to="/search">Suche</NavLink>
        <NavLink to="/faces">Personen</NavLink>
        <NavLink to="/sharing">Freigaben</NavLink>
        <NavLink to="/settings">Einstellungen</NavLink>
        {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
