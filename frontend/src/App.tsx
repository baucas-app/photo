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
import { PartnerPage } from "./pages/PartnerPage";
import { AdminPage } from "./pages/AdminPage";
import { ViewerPage } from "./pages/ViewerPage";
import { PublicAlbumPage } from "./pages/PublicAlbumPage";
import { MapPage } from "./pages/MapPage";
import { TrashPage } from "./pages/TrashPage";
import { ArchivePage } from "./pages/ArchivePage";
import { MemoriesPage } from "./pages/MemoriesPage";
import { SmartAlbumsPage } from "./pages/SmartAlbumsPage";
import { SmartAlbumDetailPage } from "./pages/SmartAlbumDetailPage";
import { TagGroupsPage } from "./pages/TagGroupsPage";
import { UserLabelsPage } from "./pages/UserLabelsPage";
import { UserLabelDetailPage } from "./pages/UserLabelDetailPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { TripsPage } from "./pages/TripsPage";
import { TripDetailPage } from "./pages/TripDetailPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/share/:token" element={<PublicAlbumPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/viewer/:id" element={<ViewerPage />} />
            <Route element={<Layout />}>
              <Route path="/" element={<TimelinePage />} />
              <Route path="/memories" element={<MemoriesPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/trash" element={<TrashPage />} />
              <Route path="/albums" element={<AlbumsPage />} />
              <Route path="/albums/:id" element={<AlbumDetailPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/duplicates" element={<DuplicatesPage />} />
              <Route path="/faces" element={<FacesPage />} />
              <Route path="/faces/:id" element={<FaceDetailPage />} />
              <Route path="/sharing" element={<SharingPage />} />
              <Route path="/partner" element={<PartnerPage />} />
              <Route path="/smart-albums" element={<SmartAlbumsPage />} />
              <Route path="/smart-albums/:id" element={<SmartAlbumDetailPage />} />
              <Route path="/tag-groups" element={<TagGroupsPage />} />
              <Route path="/user-labels" element={<UserLabelsPage />} />
              <Route path="/user-labels/:id" element={<UserLabelDetailPage />} />
              <Route path="/trips" element={<TripsPage />} />
              <Route path="/trips/:id" element={<TripDetailPage />} />
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
