"use client";
import { createEmptyPresentation } from "@/app/_actions/notebook/presentation/presentationActions";
import { ThemeBackground } from "@/components/notebook/presentation/components/theme/ThemeBackground";
import { Spinner } from "@/components/ui/spinner";
import { usePresentationState } from "@/states/presentation-state";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type LoadingPhase = "waiting" | "analyzing" | "creating";

const PHASE_LABELS: Record<LoadingPhase, string> = {
  waiting: "Preparing documents...",
  analyzing: "Analyzing documents...",
  creating: "Loading Presentation Outline",
};

function getSlideCount(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.max(1, Math.floor(parsed));
}

export default function Page() {
  const router = useRouter();
  const params = useSearchParams();
  const { resolvedTheme } = useTheme();
  const startedRef = useRef(false);
  const handledRequestRef = useRef<string | null>(null);
  const themeMode = resolvedTheme === "dark" ? "dark" : "light";
  const createTheme = resolvedTheme === "dark" ? "ebony" : "mystique";
  const prompt = params.get("prompt")?.trim() ?? "";
  const language = params.get("language") ?? "en-US";
  const noOfSlides = getSlideCount(params.get("noOfSlides"));
  const webSearchEnabled = params.get("webSearch") === "true";
  const {
    setPresentationInput,
    setLanguage: setPresentationLanguage,
    setNumSlides,
    setCurrentPresentation,
    setIsGeneratingOutline,
    startOutlineGeneration,
    setWebSearchEnabled,
    setTheme: setPresentationTheme,
    setFiles,
    setGenerateSpeakerNotes,
    setNotes,
  } = usePresentationState();

  const [phase, setPhase] = useState<LoadingPhase>(() => {
    const state = usePresentationState.getState();
    return state.pendingCreateRequest ? "creating" : "waiting";
  });

  // Create empty presentation and navigate to outline generation
  const createAndNavigate = async (prompt: string, language: string) => {
    try {
      setPhase("creating");
      setIsGeneratingOutline(true);
      setPresentationTheme(createTheme);

      const result = await createEmptyPresentation({
        title: prompt.substring(0, 50) || "Untitled Presentation",
        theme: createTheme,
        language,
      });

      if (result.success && result.presentation) {
        setCurrentPresentation(
          result.presentation.id,
          result.presentation.title,
        );
        startOutlineGeneration();
        router.replace(`/presentation/generate/${result.presentation.id}`);
      } else {
        setIsGeneratingOutline(false);
        toast.error(result.message || "Failed to create presentation");
        router.push("/presentation");
      }
    } catch (error) {
      setIsGeneratingOutline(false);
      console.error("Error creating presentation:", error);
      toast.error("Failed to create presentation");
      router.push("/presentation");
    }
  };

  // Path A: pendingCreateRequest from PresentationDashboard (RAG already done there)
  useEffect(() => {
    if (startedRef.current) return;

    const state = usePresentationState.getState();
    const request = state.pendingCreateRequest;
    if (!request) return;

    startedRef.current = true;
    state.setPendingCreateRequest(null);

    setPresentationInput(request.prompt);
    setPresentationLanguage(request.language);
    setNumSlides(request.numSlides);
    setWebSearchEnabled(request.webSearchEnabled);
    state.setModelProvider(request.modelProvider);
    state.setModelId(request.modelId);
    setGenerateSpeakerNotes(request.generateSpeakerNotes);
    setNotes(request.notes);

    void createAndNavigate(request.prompt, request.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Path B: SET_PPT_DATA from parent iframe (does its own RAG if files are present)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const { type, files: incomingFiles, prompt, notes: incomingNotes } = event.data || {};

      if (type !== "SET_PPT_DATA" || startedRef.current) return;
      startedRef.current = true;

      let finalPrompt = prompt || "";
      const language = params.get("language") ?? "en-US";

      // Reconstruct File objects from base64 data
      let reconstructedFiles: File[] = [];
      if (incomingFiles?.length) {
        reconstructedFiles = incomingFiles.map(
          (f: { name: string; type: string; data: string }) => {
            const parts = (f.data || "").split(",");
            const byteString = atob(parts[1] ?? "");
            const mimeString =
              (parts[0] ?? "").split(":")[1]?.split(";")[0] ?? f.type;
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            return new File([ab], f.name, { type: mimeString });
          },
        );
        setFiles(reconstructedFiles);
      }

      let totalSlides = 10;

      // If files are present, do RAG via /api/admin/ppt
      if (reconstructedFiles.length > 0) {
        setPhase("analyzing");
        try {
          const formData = new FormData();
          for (const file of reconstructedFiles) {
            formData.append("files", file);
          }
          formData.append("prompt", finalPrompt);

          const response = await fetch("/api/admin/ppt", {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();

            if (data.numSlides) {
              totalSlides = Number(data.numSlides);
            }

            if (data.pptPrompt && data.context) {
              finalPrompt = `${data.pptPrompt}\n\nContext:\n${data.context}`;
            } else if (data.pptPrompt) {
              finalPrompt = data.pptPrompt;
            } else if (data.context) {
              finalPrompt = `Context from provided documents:\n${data.context}\n\nUser Request: ${finalPrompt}`;
            }
          } else {
            toast.error("Failed to analyze documents.");
            router.push("/presentation");
            return;
          }
        } catch (error) {
          console.error("RAG fetch failed:", error);
          toast.error("An error occurred during document analysis.");
          router.push("/presentation");
          return;
        }
      }

      // Apply final values and proceed to outline generation
      setPresentationInput(finalPrompt);
      setNumSlides(totalSlides);
 
      const notes = incomingNotes ?? params.get("notes");
      if (notes !== null) {
        setNotes(notes === "true" || notes === true);
      }
      setGenerateSpeakerNotes(true);

      void createAndNavigate(finalPrompt, language);
    };

    window.addEventListener("message", handleMessage);
    // Signal to parent that we are ready to receive data
    window.parent.postMessage({ type: "PPT_READY" }, "*");
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeBackground themeOverride={createTheme} themeModeOverride={themeMode}>
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center">
        <div className="relative">
          <Spinner className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-bold">{PHASE_LABELS[phase]}</h2>
          <p className="text-muted-foreground">Please wait a moment...</p>
        </div>
      </div>
    </ThemeBackground>
  );
}
