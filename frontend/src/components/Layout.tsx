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
        <NavLink to="/memories">Erinnerungen</NavLink>
        <NavLink to="/trips">Reisen</NavLink>
        <NavLink to="/map">Karte</NavLink>
        <NavLink to="/albums">Alben</NavLink>
        <NavLink to="/search">Suche</NavLink>
        <NavLink to="/faces">Personen</NavLink>
        <NavLink to="/sharing">Freigaben</NavLink>
        <NavLink to="/partner">Partner</NavLink>
        <NavLink to="/smart-albums">Smart Albums</NavLink>
        <NavLink to="/tag-groups">Tag-Gruppen</NavLink>
        <NavLink to="/user-labels">Labels</NavLink>

        <div className="sidebar-section">Bibliothek</div>
        <NavLink to="/duplicates">Duplikate</NavLink>
        <NavLink to="/archive">Archiv</NavLink>
        <NavLink to="/trash">Papierkorb</NavLink>

        <div className="sidebar-section" />
        <NavLink to="/settings">Einstellungen</NavLink>
        {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
