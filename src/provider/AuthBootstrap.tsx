"use client";

import { usePresentationState } from "@/states/presentation-state";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const languageMap: Record<string, string> = {
  Bengali: "Bengali",
  Gujarati: "Gujarati",
  Hindi: "Hindi",
  Kannada: "Kannada",
  Malayalam: "Malayalam",
  Marathi: "Marathi",
  Tamil: "Tamil",
  Telugu: "Telugu",
  Arabic: "Arabic",
  Chinese: "Chinese",
  English: "English",
  French: "French",
  German: "German",
  Indonesian: "Indonesian",
  Italian: "Italian",
  Japanese: "Japanese",
  Khmer: "Khmer",
  Korean: "Korean",
  Malay: "Malay",
  Myanmar: "Myanmar",
  Polish: "Polish",
  Portuguese: "Portuguese",
  Russian: "Russian",
  Spanish: "Spanish",
  Swedish: "Swedish",
  Turkish: "Turkish",
  Vietnamese: "Vietnamese",
  Thailand: "Thailand",
  Filipino: "Filipino",
};

export function AuthBootstrap({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const params = useSearchParams();
  const { status } = useSession();
  const [authDone, setAuthDone] = useState(false);
  const { setLanguage } = usePresentationState();

  useEffect(() => {
    const token = params.get("token");
    const language = params.get("language");

    if (language) {
      const parsedLang = languageMap[language];
      if (parsedLang) {
        setLanguage(parsedLang);
      }
    }

    if (!token) {
      setAuthDone(true);
      return;
    }

    // Run once: sign out any existing session, then sign in with Cognito token
    async function doAuth() {
      if (status === "loading") return; // wait until we know the state

      if (status === "authenticated") {
        await signOut({ redirect: false });
      }

      await signIn("credentials", {
        token,
        redirect: false,
      });

      globalThis.history.replaceState({}, "", globalThis.location.pathname);
      setAuthDone(true);
    }

    doAuth();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === "loading"]); // only re-run when loading state resolves

  if (!authDone || status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        Authenticating...
      </div>
    );
  }

  // No token in URL and not authenticated = direct access attempt
  if (status === "unauthenticated") {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-3">
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground text-sm">
          This app can only be accessed through the mple.ai website.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
