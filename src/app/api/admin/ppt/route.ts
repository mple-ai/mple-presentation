import { env } from "@/env.js";
import { auth } from "@/server/auth";
import { NextResponse } from "next/server";
import { OpenAI } from "openai";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const prompt = formData.get("prompt") as string;

  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
  }

  let vectorStoreId: string | undefined;
  const fileIds: string[] = [];

  try {
    // 1. Create a temporary vector store
    const vectorStore = await openai.vectorStores.create({
      name: `RAG-Outline-${session.user.id}-${Date.now()}`,
      expires_after: {
        anchor: "last_active_at",
        days: 1,
      },
    });
    vectorStoreId = vectorStore.id;

    // 2. Upload all files in parallel
    await Promise.all(
      files.map(async (file) => {
        const uploaded = await openai.files.create({
          file,
          purpose: "assistants",
        });
        fileIds.push(uploaded.id);
      }),
    );

    // 3. Add files to vector store in a single batch and poll for completion
    await openai.vectorStores.fileBatches.createAndPoll(vectorStore.id, {
      file_ids: fileIds,
    });

    // 4. Query using the Responses API — no assistant/thread/run needed
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: `Please search the uploaded documents and provide a concise summary of relevant information that should be considered when generating a presentation outline about: "${prompt}". Focus on key themes, facts, and structure suggested by the documents.`,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStore.id],
        },
      ],
    });

    const context = response.output_text;

    return NextResponse.json({ context });
  } catch (error) {
    console.error("RAG Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 },
    );
  } finally {
    // Cleanup: delete vector store and all uploaded files
    if (vectorStoreId) {
      openai.vectorStores.delete(vectorStoreId).catch(console.error);
    }
    for (const fileId of fileIds) {
      openai.files.delete(fileId).catch(console.error);
    }
  }
}
