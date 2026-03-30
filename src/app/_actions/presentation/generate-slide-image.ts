"use server";

import { generateImageAction } from "@/app/_actions/apps/image-studio/generate";
import { auth } from "@/server/auth";

const DEFAULT_SLIDE_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";

export async function generateSlideImageAction(
  prompt: string,
  imageModel: string = DEFAULT_SLIDE_IMAGE_MODEL,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      error: "You must be logged in to generate images",
    };
  }

  // Admin only feature
  if (!session.user.isAdmin) {
    return {
      success: false,
      error: "This feature is only available for admin users",
    };
  }

  try {
    // const falConfig = requireOptionalIntegration({
    //   integration: "FAL",
    //   envVar: "FAL_API_KEY",
    //   value: env.FAL_API_KEY,
    //   feature: "slide image generation",
    // });

    // if (!falConfig.ok) {
    //   return {
    //     success: false,
    //     error: falConfig.error,
    //   };
    // }

    // fal.config({
    //   credentials: falConfig.value,
    // });

    console.log(`Generating slide image with model: ${imageModel}`);

    const result = await generateImageAction(prompt, imageModel as any);

    return result;
    // const falConfig = requireOptionalIntegration({
    //   integration: "FAL",
    //   envVar: "FAL_API_KEY",
    //   value: env.FAL_API_KEY,
    //   feature: "slide image generation",
    // });

    // if (!falConfig.ok) {
    //   return {
    //     success: false,
    //     error: falConfig.error,
    //   };
    // }

    // fal.config({
    //   credentials: falConfig.value,
    // });

    // console.log(`Generating slide image with model: ${imageModel}`);

    // const result = await generateImageAction(prompt, imageModel as any);

    // return result;
  } catch (error) {
    console.error("Error generating slide image:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate slide image",
    };
  }
}
