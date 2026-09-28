import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router";

import { LandingPage } from "./features/landing";
import { LoginPage, RequireSession } from "./features/auth";
import { AssignmentScreen, CatalogScreen, ModelAdminPage } from "./features/admin";
import { ProjectEntryPage, ProjectsPage, StudioEntry } from "./features/projects";
import { setUnauthorizedHandler } from "./lib/api";

const VideoEditor = lazy(() => import("./features/video-editor/video-editor").then(module => ({ default: module.VideoEditor })));

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UnauthorizedRedirect />
        <Routes>
          <Route path="/projects/:projectId/editor/:documentId" element={<RequireSession><Suspense fallback={<p role="status">正在加载编辑器…</p>}><VideoEditor /></Suspense></RequireSession>} />
          <Route element={<LandingPage />} path="/" />
          <Route element={<LoginPage />} path="/login" />
          <Route
            element={
              <RequireSession>
                <StudioEntry />
              </RequireSession>
            }
            path="/studio"
          />
          <Route
            element={
              <RequireSession>
                <ProjectsPage />
              </RequireSession>
            }
            path="/projects"
          />
          <Route
            element={
              <RequireSession>
                <ProjectEntryPage />
              </RequireSession>
            }
            path="/projects/:projectId/*"
          />
          <Route
            element={
              <RequireSession>
                <ModelAdminPage />
              </RequireSession>
            }
            path="/admin"
          >
            <Route index element={<Navigate replace to="models" />} />
            <Route element={<CatalogScreen />} path="models" />
            <Route element={<Navigate replace to="/admin/models" />} path="register" />
            <Route element={<AssignmentScreen />} path="assignments" />
          </Route>
          <Route element={<Navigate replace to="/studio" />} path="*" />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function UnauthorizedRedirect() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      navigate("/login", { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, queryClient]);

  return null;
}
