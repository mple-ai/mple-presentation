import { type ImageModelList as TogetherImageModelList } from "@/app/_actions/image/generate";

export type FalImageModelList =
  | "fal-ai/flux-2/flash"
  | "fal-ai/flux-2/turbo"
  | "fal-ai/flux/dev"
  | "fal-ai/flux-2-pro"
  | "fal-ai/nano-banana-pro";

export const TOGETHER_IMAGE_MODELS: {
  value: TogetherImageModelList;
  label: string;
}[] = [
  // { value: "black-forest-labs/FLUX1.1-pro", label: "Flux 1.1 Pro" },
  // { value: "black-forest-labs/FLUX.1-pro", label: "Flux 1 Pro" },
  // { value: "black-forest-labs/FLUX.1-dev", label: "Flux 1 Dev" },
  { value: "black-forest-labs/FLUX.1-schnell", label: "Flux 1 Schnell" },
  // { value: "black-forest-labs/FLUX.1-schnell-Free", label: "Flux 1 Schnell (Free)" },
];

export type CustomModelList = "gpt-image-1.5" | "gemini-3-pro-image-preview";

export const CUSTOM_IMAGE_MODELS: {
  value: CustomModelList;
  label: string;
}[] = [
  { value: "gpt-image-1.5", label: "OpenAI (gpt-image-1.5)" },
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro (Gemini)" },
];

export type ImageModelList = TogetherImageModelList | FalImageModelList | CustomModelList;
