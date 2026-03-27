import { PresentationGenerationManager } from "@/components/notebook/presentation/components/PresentationGenerationManager";
import { PresentationThemeProvider } from "@/components/presentation/providers/PresentationThemeProvider";
import { AuthBootstrap } from "@/provider/AuthBootstrap";
import type React from "react";

export default async function PresentationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthBootstrap>
      <PresentationThemeProvider>
        <PresentationGenerationManager />
        <div className="flex h-screen w-screen flex-col supports-[(height:100dvh)]:h-dvh">
          {/* <PresentationHeader /> */}
          <main className="relative flex flex-1 overflow-hidden">
            <div className="sheet-container h-full max-h-full flex-1 place-items-center overflow-x-clip overflow-y-auto">
              {children}
            </div>
          </main>
        </div>
      </PresentationThemeProvider>
    </AuthBootstrap>
  );
}
