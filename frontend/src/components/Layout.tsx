import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function initials(user: { name?: string | null; email: string }): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    return parts.map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }
  return user.email[0].toUpperCase();
}

export function Layout() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <h1>Fotos</h1>

        <div className="sidebar-nav">
          <NavLink to="/" end>
            <span className="nav-icon">◼</span>Mediathek
          </NavLink>
          <NavLink to="/memories">
            <span className="nav-icon">❋</span>Erinnerungen
          </NavLink>
          <NavLink to="/trips">
            <span className="nav-icon">✈</span>Reisen
          </NavLink>
          <NavLink to="/map">
            <span className="nav-icon">⊙</span>Karte
          </NavLink>

          <div className="sidebar-section">Alben</div>
          <NavLink to="/albums">
            <span className="nav-icon">▣</span>Alben
          </NavLink>
          <NavLink to="/smart-albums">
            <span className="nav-icon">▣</span>Smart Albums
          </NavLink>
          <NavLink to="/search">
            <span className="nav-icon">⊕</span>Suche
          </NavLink>
          <NavLink to="/faces">
            <span className="nav-icon">⊚</span>Personen
          </NavLink>
          <NavLink to="/sharing">
            <span className="nav-icon">⊛</span>Freigaben
          </NavLink>
          <NavLink to="/partner">
            <span className="nav-icon">⊛</span>Partner
          </NavLink>
          <NavLink to="/tag-groups">
            <span className="nav-icon">⊞</span>Tag-Gruppen
          </NavLink>
          <NavLink to="/user-labels">
            <span className="nav-icon">◈</span>Labels
          </NavLink>

          <div className="sidebar-section">Dienstprogramme</div>
          <NavLink to="/duplicates">
            <span className="nav-icon">⊟</span>Duplikate
          </NavLink>
          <NavLink to="/archive">
            <span className="nav-icon">▦</span>Archiv
          </NavLink>
          <NavLink to="/trash">
            <span className="nav-icon">⊠</span>Papierkorb
          </NavLink>

          {user?.role === "admin" && (
            <NavLink to="/admin">
              <span className="nav-icon">⊞</span>Admin
            </NavLink>
          )}
        </div>

        <div className="sidebar-spacer" />

        {user && (
          <NavLink to="/settings" className="sidebar-profile">
            <div className="sidebar-avatar">{initials(user)}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.name ?? user.email}</span>
              <span className="sidebar-user-role">
                {user.role === "admin" ? "Admin" : "Nutzer"}
              </span>
            </div>
            <span className="sidebar-gear">⊗</span>
          </NavLink>
        )}
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
