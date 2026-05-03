import { useState } from "react";
import { AppLayout, type RouteId } from "./layout/AppLayout.js";
import { ArchitecturePage } from "./pages/ArchitecturePage.js";
import { DevConsole } from "./pages/DevConsole.js";
import { HomePage } from "./pages/HomePage.js";
import { JuryLabPage } from "./pages/JuryLabPage.js";
import { UserScanPage } from "./pages/UserScanPage.js";

export function App() {
  const [route, setRoute] = useState<RouteId>("home");

  return (
    <AppLayout route={route} onNavigate={setRoute}>
      {route === "home" ? <HomePage onNavigate={setRoute} /> : null}
      {route === "arch" ? <ArchitecturePage /> : null}
      {route === "scan" ? <UserScanPage /> : null}
      {route === "jury" ? <JuryLabPage /> : null}
      {route === "dev" ? <DevConsole /> : null}
    </AppLayout>
  );
}
