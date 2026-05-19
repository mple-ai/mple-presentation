"use server";

import {
  generateImageAction as generateTogetherImageAction,
  type ImageModelList as TogetherImageModelList,
} from "@/app/_actions/image/generate";
import { utapi } from "@/app/api/uploadthing/core";
import { env } from "@/env";
import { requireOptionalIntegration } from "@/lib/env/optional-integrations";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { fal } from "@fal-ai/client";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { OpenAI } from "openai";
import path from "path";
import { UTFile } from "uploadthing/server";
import { type FalImageModelList, type ImageModelList } from "./constants";

async function persistGeneratedImage(
  imageUrl: string,
  prompt: string,
  userId: string,
  filePrefix: string,
) {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error("Failed to download generated image");
  }

  const imageBlob = await imageResponse.blob();
  const imageBuffer = await imageBlob.arrayBuffer();
  const filename = `${filePrefix}_${Date.now()}.png`;
  const utFile = new UTFile([new Uint8Array(imageBuffer)], filename);
  const uploadResult = await utapi.uploadFiles([utFile]);

  if (!uploadResult[0]?.data?.ufsUrl) {
    throw new Error("Failed to upload generated image");
  }

  return db.generatedImage.create({
    data: {
      url: uploadResult[0].data.ufsUrl,
      prompt,
      userId,
    },
  });
}

async function generateFalImage(
  prompt: string,
  model: FalImageModelList,
  userId: string,
) {
  const falConfig = requireOptionalIntegration({
    integration: "FAL",
    envVar: "FAL_API_KEY",
    value: env.FAL_API_KEY,
    feature: "AI image generation",
  });

  if (!falConfig.ok) {
    return {
      success: false,
      error: falConfig.error,
    };
  }

  fal.config({
    credentials: falConfig.value,
  });

  const result = await fal.subscribe(model, {
    input: {
      prompt,
      num_images: 1,
      aspect_ratio: "1:1",
    },
  });

  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error("Failed to generate image");
  }

  const image = await persistGeneratedImage(imageUrl, prompt, userId, "image");

  return {
    success: true,
    image,
  };
}

async function generateOpenAIImage(prompt: string, userId: string) {
  console.log(
    "🚀 [SERVER ACTION] Calling OpenAI (gpt-image-1.5) for prompt:",
    prompt,
  );
  const openaiConfig = requireOptionalIntegration({
    integration: "OpenAI",
    envVar: "OPENAI_API_KEY",
    value: env.OPENAI_API_KEY,
    feature: "AI image generation",
  });

  if (!openaiConfig.ok) {
    return {
      success: false,
      error: openaiConfig.error,
    };
  }

  const openai = new OpenAI({ apiKey: openaiConfig.value });

  const response = await openai.images.generate({
    model: "gpt-image-1.5",
    prompt,
  });

  // gpt-image-1.5 returns base64 data, not a URL
  const b64Json = response.data?.[0]?.b64_json;
  if (!b64Json) {
    throw new Error("OpenAI returned no image data");
  }

  const imageBuffer = Buffer.from(b64Json, "base64");
  const filename = `openai_image_${Date.now()}.png`;
  const utFile = new UTFile([new Uint8Array(imageBuffer)], filename);
  const uploadResult = await utapi.uploadFiles([utFile]);

  if (!uploadResult[0]?.data?.ufsUrl) {
    throw new Error("Failed to upload OpenAI image");
  }

  const image = await db.generatedImage.create({
    data: {
      url: uploadResult[0].data.ufsUrl,
      prompt,
      userId,
    },
  });

  return {
    success: true,
    image,
  };
}

async function generateGeminiImage(prompt: string, userId: string) {
  let googleProjectId = "";
  let googleConfig;
  let credentialsPath = "/tmp/google.json";

  if (process.env.GOOGLE_JSON) {
    console.log("✅ Using googleConfig from ENV in presentation");
    googleConfig = JSON.parse(process.env.GOOGLE_JSON);
    if (!fs.existsSync(credentialsPath)) {
      fs.writeFileSync(credentialsPath, process.env.GOOGLE_JSON);
    }
  } else {
    try {
      if (fs.existsSync(credentialsPath)) {
        console.log("📄 Using google.json file in presentation");
        googleConfig = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
      }
    } catch (err: any) {
      console.warn("Could not load google.json:", err.message);
    }
  }

  if (googleConfig) {
    googleProjectId = googleConfig.project_id;
  }

  if (!googleProjectId) {
    return {
      success: false,
      error:
        "Missing Google Project ID from google.json. Please ensure google.json is present.",
    };
  }

  // Set environment variable required by vertexai mode
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

  console.log(
    "🍌 [SERVER ACTION] Calling Nano Banana Pro (Gemini Pro) for prompt:",
    prompt,
  );

  const googleGenAI = new GoogleGenAI({
    vertexai: true,
    project: googleProjectId,
    location: "global",
  });

  const SYSTEM_PROMPT = `
Generate a high quality, professional, clean illustration.
Style: modern, realistic, sharp focus, high detail.
Avoid text, watermarks, logos, blur, distortion.
`;
  const finalPrompt = `${SYSTEM_PROMPT}\nUser request: ${prompt}`;

  const result = await googleGenAI.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
  });

  const imagePart = result.candidates?.[0]?.content?.parts?.find((p: any) =>
    p.inlineData?.mimeType?.startsWith("image/"),
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini failed to generate an image");
  }

  const base64Image = imagePart.inlineData.data;
  const imageBuffer = Buffer.from(base64Image, "base64");
  const filename = `gemini_image_${Date.now()}.png`;
  const utFile = new UTFile([new Uint8Array(imageBuffer)], filename);
  const uploadResult = await utapi.uploadFiles([utFile]);

  if (!uploadResult[0]?.data?.ufsUrl) {
    throw new Error("Failed to upload Gemini image to UploadThing");
  }

  const image = await db.generatedImage.create({
    data: {
      url: uploadResult[0].data.ufsUrl,
      prompt,
      userId,
    },
  });

  return {
    success: true,
    image,
  };
}

export async function generateImageAction(
  prompt: string,
  model: ImageModelList = "black-forest-labs/FLUX.1-schnell",
) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      error: "You must be logged in to generate images",
    };
  }

  try {
    console.log(
      "🎯 [SERVER ACTION] generateImageAction triggered with model:",
      model,
    );
    if (model === "gpt-image-1.5") {
      return await generateOpenAIImage(prompt, session.user.id);
    }

    if (model === "gemini-3-pro-image-preview") {
      return await generateGeminiImage(prompt, session.user.id);
    }

    if (model.startsWith("fal-ai/")) {
      return await generateFalImage(
        prompt,
        model as FalImageModelList,
        session.user.id,
      );
    }

    return await generateTogetherImageAction(
      prompt,
      model as TogetherImageModelList,
    );
  } catch (error) {
    console.error("Error generating image:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate image",
    };
  }
}
