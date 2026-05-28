import { generateImageAction } from "@/app/_actions/apps/image-studio/generate";
import { generateSlideImageAction } from "@/app/_actions/presentation/generate-slide-image";
import { auth } from "@/server/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prompt, model, isImageSlide } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    let result;
    if (isImageSlide) {
      result = await generateSlideImageAction(prompt, model);
    } else {
      result = await generateImageAction(prompt, model);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("API generate-image error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate image",
      },
      { status: 500 },
    );
  }
}
