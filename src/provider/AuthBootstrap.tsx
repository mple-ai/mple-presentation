"use client";

import { usePresentationState } from "@/states/presentation-state";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

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
  const { setLanguage, setNotes } = usePresentationState();

  useEffect(() => {
    const language = params.get("language");
    if (language) {
      const parsedLang = languageMap[language];
      if (parsedLang) setLanguage(parsedLang);
    }

    const notes = params.get("notes");
    if (notes !== null) {
      setNotes(notes === "true");
    }
  }, [params, setLanguage, setNotes]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

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
