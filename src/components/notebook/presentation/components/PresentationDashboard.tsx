"use client";

import { fetchPresentations } from "@/app/_actions/notebook/presentation/fetchPresentations";
import { createBlankPresentation } from "@/app/_actions/notebook/presentation/presentationActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePresentationState } from "@/states/presentation-state";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PresentationFileUpload from "../file-upload";

const LANGUAGES = [
  ["en-US", "English"],
  ["pt", "Portuguese"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
  ["ru", "Russian"],
  ["hi", "Hindi"],
  ["ar", "Arabic"],
] as const;

export function PresentationDashboard() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isCreating, setIsCreating] = useState(false);
  const {
    presentationInput,
    setPresentationInput,
    language,
    setLanguage,
    modelId,
    modelProvider,
    numSlides,
    setNumSlides,
    webSearchEnabled,
    setWebSearchEnabled,
    setCurrentPresentation,
    setPendingCreateRequest,
    setTheme,
    resetPresentationState,
    files,
    generateSpeakerNotes,
    notes,
  } = usePresentationState();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SET_PPT_DATA") {
        if (event.data.prompt) {
          setPresentationInput(event.data.prompt);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    // Signal to parent that we are ready to receive data
    window.parent.postMessage({ type: "PPT_READY" }, "*");

    return () => window.removeEventListener("message", handleMessage);
  }, [setPresentationInput]);

  const { data, isLoading } = useQuery({
    queryKey: ["presentations"],
    queryFn: () => fetchPresentations(0),
  });

  const items = data?.items ?? [];
  const slidesOptions = useMemo(
    () => Array.from({ length: 30 }, (_, index) => `${index + 1}`),
    [],
  );

  const createPresentation = useCallback(
    async (autoData?: {
      prompt: string;
      files: File[];
      numSlides: number;
      language: string;
    }) => {
      setIsCreating(true);
      let prompt = (autoData?.prompt ?? presentationInput).trim();
      const currentFiles = autoData?.files ?? files;
      const selectedLanguage = autoData?.language ?? language;
      let selectedNumSlides = autoData?.numSlides ?? numSlides;
      const selectedWebSearchEnabled = webSearchEnabled;
      const selectedGenerateSpeakerNotes = true;
      const selectedNotes = notes;

      // Declare outside so finally block can always clear it
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // just under maxDuration

      try {
        if (currentFiles.length > 0) {
          const formData = new FormData();
          for (const file of currentFiles) {
            formData.append("files", file);
          }
          formData.append("prompt", prompt);
          formData.append("numSlides", String(selectedNumSlides));

          try {
            const response = await fetch("/api/admin/ppt", {
              method: "POST",
              body: formData,
              signal: controller.signal,
            });

            if (response.ok) {
              const data = await response.json();

              if (data.numSlides) {
                const apiNumSlides = Number(data.numSlides) || 10;
                setNumSlides(apiNumSlides);
                selectedNumSlides = apiNumSlides;
              }

              if (data.pptPrompt && data.context) {
                prompt = `${data.pptPrompt}\n\nContext:\n${data.context}`;
              } else if (data.pptPrompt) {
                prompt = data.pptPrompt;
              } else if (data.context) {
                prompt = `Context from provided documents:\n${data.context}\n\nUser Request: ${prompt}`;
              }
            } else {
              console.warn(
                "RAG search failed, proceeding with original prompt",
              );
              toast.warning(
                "Could not analyze documents. Proceeding without context.",
              );
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              toast.warning(
                "Document analysis timed out. Proceeding with original prompt.",
              );
            } else {
              console.error("RAG Error:", error);
              toast.warning(
                "Could not analyze documents. Proceeding without context.",
              );
            }
          } finally {
            clearTimeout(timeoutId);
          }
        }

        resetPresentationState();
        setPendingCreateRequest({
          prompt,
          language: selectedLanguage,
          modelId,
          modelProvider,
          numSlides: selectedNumSlides,
          webSearchEnabled: selectedWebSearchEnabled,
          generateSpeakerNotes: selectedGenerateSpeakerNotes,
          notes: selectedNotes,
        });
        router.push("/presentation/create");
      } catch (error) {
        console.error(error);
        toast.error("Failed to create presentation");
      } finally {
        setIsCreating(false);
      }
    },
    [
      files,
      language,
      modelId,
      modelProvider,
      numSlides,
      presentationInput,
      resetPresentationState,
      router,
      setPendingCreateRequest,
      webSearchEnabled,
      generateSpeakerNotes,
      notes,
    ],
  );

  const createBlank = async () => {
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    const title = presentationInput.trim() || "Blank presentation";
    const selectedLanguage = language;

    try {
      const theme = resolvedTheme === "dark" ? "ebony" : "mystique";
      const result = await createBlankPresentation(
        title,
        theme,
        selectedLanguage,
      );

      if (!result.success || !result.presentation) {
        toast.error(result.message ?? "Failed to create presentation");
        return;
      }

      setTheme(theme);
      setCurrentPresentation(result.presentation.id, result.presentation.title);
      router.replace(`/presentation/${result.presentation.id}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create presentation");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <section className="grid gap-6 ">
        <Card className="border-border/60 bg-background/70 shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-6 w-6 text-primary" />
              Create a presentation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Textarea
              value={presentationInput}
              onChange={(event) => setPresentationInput(event.target.value)}
              placeholder="Describe the presentation you want to build."
              className="min-h-36 resize-none"
            />

            <div className="flex w-full  p-4">
              <div className="w-1/2 space-y-2">
                <div className="text-sm font-medium">Reference Files</div>
                <PresentationFileUpload />
              </div>

              <div className="ml-auto w-40 space-y-2">
                <div className="text-sm font-medium">Slides</div>
                <Select
                  value={String(numSlides)}
                  onValueChange={(value) => setNumSlides(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {slidesOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>



            <div className="flex justify-end gap-3 ml-auto ">
              <Button
                className="cursor-pointer bg-[#4e0da3] hover:bg-[#4e0da3]"
                onClick={() => void createPresentation()}
                disabled={isCreating || !presentationInput.trim()}
              >
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Generate outline
              </Button>
              {/* <Button
                variant="outline"
                onClick={() => void createBlank()}
                disabled={isCreating}
              >
                <FilePlus2 className="mr-2 h-4 w-4" />
                Blank presentation
              </Button> */}
            </div>
          </CardContent>
        </Card>

        {/* <Card className="border-border/60 bg-background/70 shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Presentation className="h-5 w-5 text-primary" />
              Recent presentations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading presentations...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No presentations yet.
              </div>
            ) : (
              items.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push(`/presentation/${item.id}`)}
                  className="flex w-full flex-col rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium">
                    {item.title || "Untitled Presentation"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Updated{" "}
                    {formatDistanceToNow(new Date(item.updatedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card> */}
      </section>
    </div>
  );
}
