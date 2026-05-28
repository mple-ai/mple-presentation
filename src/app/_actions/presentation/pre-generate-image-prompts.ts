"use server";

import { modelPicker } from "@/lib/modelPicker";
import { auth } from "@/server/auth";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export interface PreGeneratePromptsParams {
  outline: string[];
  title: string;
  prompt: string;
  imageSource: "ai" | "stock" | "automatic";
  modelProvider: string;
  modelId: string;
}

export async function preGenerateImagePromptsAction(params: PreGeneratePromptsParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      error: "You must be logged in to generate image prompts",
      queries: [] as string[],
    };
  }

  const { outline, title, prompt, imageSource, modelProvider, modelId } = params;

  try {
    const isStockImage = imageSource === "stock" || imageSource === "automatic";

    const promptStyle = isStockImage
      ? `You are an expert image search query generator. Generate SHORT, high-quality keyword search queries in English (1 to 4 words max) suitable for search engines like Unsplash or Pixabay. Avoid descriptive sentences, symbols, or generic punctuation.`
      : `You are an expert AI image generator prompt engineer. Generate highly descriptive, visual prompts (60-120 words) for an AI image generator (like DALL-E or Flux). Describe details, mood, colors, framing, style (cinematic, photorealistic, illustration, etc.), lighting, and atmosphere. Do NOT include text on the image.`;

    const systemPrompt = `${promptStyle}

Output your response as a strict JSON array of strings, where each string represents the image query for the corresponding slide outline in the exact same index. Return ONLY a valid JSON array of strings. Do not wrap in markdown tags or include any explanatory text.

Example Output format:
[
  "query for slide 1",
  "query for slide 2"
]`;

    const outlineText = outline
      .map((item, index) => `Slide ${index + 1}: ${item}`)
      .join("\n");
    const userMessage = `Presentation Title: ${title}\nUser's Original Prompt: ${prompt}\n\nSlide Outlines:\n${outlineText}`;

    const model = modelPicker(modelProvider, modelId);
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);

    const text = typeof response.content === "string" ? response.content.trim() : "";

    let jsonText = text;
    if (jsonText.startsWith("```")) {
      const match = jsonText.match(/```(?:json)?([\s\S]*?)```/);
      if (match?.[1]) {
        jsonText = match[1].trim();
      }
    }

    const queries = JSON.parse(jsonText) as string[];

    if (!Array.isArray(queries) || queries.length !== outline.length) {
      console.warn(
        "Mismatch or invalid format in pre-generated image prompts:",
        queries,
      );
      return {
        success: true,
        queries: outline.map(() => ""),
      };
    }

    return {
      success: true,
      queries,
    };
  } catch (error) {
    console.error("Failed to pre-generate image prompts:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to pre-generate image prompts",
      queries: outline.map(() => ""),
    };
  }
}
