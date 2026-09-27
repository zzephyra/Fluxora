import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router";

import { LandingPage } from "./features/landing";
import { LoginPage, RequireSession } from "./features/auth";
import { ProjectEntryPage, ProjectsPage } from "./features/projects";
import { setUnauthorizedHandler } from "./lib/api";

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
          <Route element={<LandingPage />} path="/" />
          <Route element={<LoginPage />} path="/login" />
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
          <Route element={<Navigate replace to="/projects" />} path="*" />
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
