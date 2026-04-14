"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { usePresentationState } from "@/states/presentation-state";
import { Download, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  downloadBlob,
  exportPresentationToPptx,
  scanAllSlides,
} from "../export";
import { SaveStatus } from "./SaveStatus";

export function ExportButton() {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const exportResultRef = useRef<{ blob: Blob; fileName: string } | null>(null);
  const { isGeneratingPresentation, rootImageGeneration } =
    usePresentationState();

  const isImageGenerating = Object.values(rootImageGeneration).some(
    (gen) => gen.status === "queued" || gen.status === "generating",
  );
  const isGenerationInProgress = isGeneratingPresentation || isImageGenerating;

  const handleDownload = () => {
    if (!exportResultRef.current) {
      return;
    }

    downloadBlob(
      exportResultRef.current.blob,
      exportResultRef.current.fileName,
    );
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      exportResultRef.current = null;

      const {
        slides,
        currentPresentationTitle,
        currentPresentationId,
        presentationInput,
      } = usePresentationState.getState();

      if (slides.length === 0) {
        throw new Error("No slides to export");
      }

      const { update } = toast({
        title: "Exporting Presentation",
        description: (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Scanning slides...</span>
          </div>
        ),
        duration: Infinity,
      });

      const scanResults = await scanAllSlides(slides);

      if (scanResults.length === 0) {
        throw new Error(
          "Failed to scan slides. Please ensure all slides are visible on the page.",
        );
      }

      update({
        description: (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Generating PowerPoint...</span>
          </div>
        ),
      });

      exportResultRef.current = await exportPresentationToPptx(
        scanResults,
        slides,
        currentPresentationTitle ?? "presentation",
      );

      // handleDownload();

      const { blob } = exportResultRef.current;

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;

        // Send the Data URL back to the parent app
        globalThis.parent.postMessage(
          {
            type: "PRESENTATION_GENERATED",
            url: base64data,
            presentationId: currentPresentationId,
            prompt: presentationInput,
          },
          "*",
        );

        update({
          title: "Export Complete",
          description: "Presentation sent to parent app.",
          duration: 5000,
        });
      };
      reader.onerror = () => {
        throw new Error("Failed to convert presentation data.");
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      toast({
        title: "Export Failed",
        description:
          error instanceof Error
            ? error.message
            : "There was an error exporting your presentation.",
        variant: "destructive",
      });
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      size="lg"
      className="relative h-9 w-9 px-0 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3 bg-[#4e0da3] hover:bg-[#4e0da3] cursor-pointer"
      aria-label="Export presentation"
      onClick={handleExport}
      disabled={isExporting || isGenerationInProgress}
    >
      <SaveStatus className="absolute top-1 right-1 sm:static" />
      {/* <Download className="h-4 w-4 sm:mr-1" /> */}
      <span className="hidden sm:inline">
        {isExporting ? (
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Exporting...</span>
          </div>
        ) : isGenerationInProgress ? (
          <div className="flex items-center gap-1.5">
            <span>Generating...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5">
            <Download />
            <span>Export Presentation</span>
          </div>
        )}
      </span>
    </Button>
  );
}
