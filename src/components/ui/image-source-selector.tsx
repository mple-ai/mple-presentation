"use client";

import {
  TOGETHER_IMAGE_MODELS,
  type ImageModelList,
} from "@/app/_actions/apps/image-studio/constants";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wand2 } from "lucide-react";

export const IMAGE_MODELS = TOGETHER_IMAGE_MODELS;

interface ImageSourceSelectorProps {
  imageSource: "automatic" | "ai" | "stock";
  imageModel: ImageModelList;
  stockImageProvider: "unsplash" | "pixabay";
  onImageSourceChange: (source: "automatic" | "ai" | "stock") => void;
  onImageModelChange: (model: ImageModelList) => void;
  onStockImageProviderChange: (provider: "unsplash" | "pixabay") => void;
  className?: string;
  showLabel?: boolean;
}

export function ImageSourceSelector({
  imageSource,
  imageModel,
  stockImageProvider,
  onImageSourceChange,
  onImageModelChange,
  onStockImageProviderChange,
  className,
  showLabel = true,
}: ImageSourceSelectorProps) {
  return (
    <div className={className}>
      {showLabel && (
        <Label className="mb-2 block text-sm font-medium">Image Source</Label>
      )}
      <Select
        value={
          imageSource === "ai"
            ? imageModel || "black-forest-labs/FLUX.1-schnell"
            : imageSource === "stock"
              ? `stock-${stockImageProvider}`
              : "automatic"
        }
        onValueChange={(value) => {
          if (value === "automatic") {
            onImageSourceChange("automatic");
          } else if (value.startsWith("stock-")) {
            // Handle stock image selection
            const provider = value.replace("stock-", "") as
              | "unsplash"
              | "pixabay";
            onImageSourceChange("stock");
            onStockImageProviderChange(provider);
          } else {
            // Handle AI model selection
            onImageSourceChange("ai");
            onImageModelChange(value as ImageModelList);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select image generation method" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="automatic" className="font-medium">
              Automatic
            </SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1 text-primary/80">
              <Wand2 size={10} />
              AI Generation
            </SelectLabel>
            {IMAGE_MODELS.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
          {/* <SelectGroup>
            <SelectLabel className="flex items-center gap-1 text-primary/80">
              <Image size={10} />
              Stock Images
            </SelectLabel>
            <SelectItem value="stock-unsplash">Unsplash</SelectItem>
            <SelectItem value="stock-pixabay">Pixabay</SelectItem>
          </SelectGroup> */}
        </SelectContent>
      </Select>
    </div>
  );
}
