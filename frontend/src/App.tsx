import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { AdminRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TimelinePage } from "./pages/TimelinePage";
import { AlbumsPage } from "./pages/AlbumsPage";
import { AlbumDetailPage } from "./pages/AlbumDetailPage";
import { SearchPage } from "./pages/SearchPage";
import { DuplicatesPage } from "./pages/DuplicatesPage";
import { FacesPage } from "./pages/FacesPage";
import { FaceDetailPage } from "./pages/FaceDetailPage";
import { SharingPage } from "./pages/SharingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { ViewerPage } from "./pages/ViewerPage";
import { PublicAlbumPage } from "./pages/PublicAlbumPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/share/:token" element={<PublicAlbumPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/viewer/:id" element={<ViewerPage />} />
            <Route element={<Layout />}>
              <Route path="/" element={<TimelinePage />} />
              <Route path="/albums" element={<AlbumsPage />} />
              <Route path="/albums/:id" element={<AlbumDetailPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/duplicates" element={<DuplicatesPage />} />
              <Route path="/faces" element={<FacesPage />} />
              <Route path="/faces/:id" element={<FaceDetailPage />} />
              <Route path="/sharing" element={<SharingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
