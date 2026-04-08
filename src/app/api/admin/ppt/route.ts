import { env } from "@/env.js";
import { logger } from "@/lib/observability/server/logger";
import { auth } from "@/server/auth";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { OpenAI } from "openai";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const traceId = randomUUID();

  const mainSpan = logger.startSpan("admin:ppt:POST", {
    attributes: { traceId },
  });

  const session = await auth();
  if (!session?.user) {
    mainSpan.annotate({ error: "unauthorized" });
    mainSpan.end();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  mainSpan.annotate({ userId });

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
    // 🔹 Log input metadata
    mainSpan.annotate({
      fileCount: files.length,
      files: JSON.stringify(
        files.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
        })),
      ),
      promptPreview: prompt.slice(0, 200),
    });

    // =============================
    // 1. Create Vector Store
    // =============================
    const vsStart = Date.now();
    const vectorStore = await openai.vectorStores.create({
      name: `RAG-Outline-${userId}-${traceId}`,
      expires_after: { anchor: "last_active_at", days: 1 },
    });
    vectorStoreId = vectorStore.id;

    mainSpan.event("vector_store_created", {
      vectorStoreId,
      latencyMs: Date.now() - vsStart,
    });

    const uploadStart = Date.now();

    const uploadResults = await Promise.allSettled(
      files.map(async (file) => {
        const uploaded = await openai.files.create({
          file,
          purpose: "assistants",
          expires_after: {
            anchor: "created_at",
            seconds: 60 * 60 * 24 * 7,
          },
        });
        return {
          id: uploaded.id,
          name: file.name,
        };
      }),
    );

    const successfulUploads = uploadResults.filter(
      (r): r is PromiseFulfilledResult<{ id: string; name: string }> =>
        r.status === "fulfilled",
    );

    const failedUploads = uploadResults.filter((r) => r.status === "rejected");

    successfulUploads.forEach((r) => fileIds.push(r.value.id));

    mainSpan.event("file_upload_complete", {
      successCount: successfulUploads.length,
      failureCount: failedUploads.length,
      latencyMs: Date.now() - uploadStart,

      uploadedFiles: JSON.stringify(successfulUploads.map((f) => f.value.name)),

      failedReasons: JSON.stringify(
        failedUploads.map((f) => f.reason?.message),
      ),
    });

    if (!fileIds.length) {
      throw new Error("All file uploads failed");
    }

    const batchStart = Date.now();

    await openai.vectorStores.fileBatches.createAndPoll(vectorStore.id, {
      file_ids: fileIds,
    });

    mainSpan.event("vector_store_indexed", {
      vectorStoreId,
      latencyMs: Date.now() - batchStart,
      fileCount: fileIds.length,
    });

    const model = "gpt-4o-mini";

    const queryStart = Date.now();

    const response = await openai.responses.create({
      model,
      input: `Search the uploaded documents and provide a concise structured summary for building a presentation about: "${prompt}". Focus on key themes, facts, and logical flow.`,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStore.id],
          max_num_results: 5,
          ranking_options: {
            ranker: "auto",
            score_threshold: 0.5,
          },
        },
      ],
    });

    const latencyMs = Date.now() - queryStart;

    const context = response.output_text ?? "";

    mainSpan.event("openai_response", {
      model,
      latencyMs,

      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      totalTokens: response.usage?.total_tokens,

      responseChars: context.length,
      responsePreview: context.slice(0, 300),

      toolCalls: JSON.stringify(response.output?.slice(0, 2)),

      maxResults: 5,
      scoreThreshold: 0.5,
    });

    return NextResponse.json({ context });
  } catch (error) {
    mainSpan.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    );
  } finally {
    mainSpan.end();
    if (vectorStoreId) {
      openai.vectorStores
        .delete(vectorStoreId)
        .then(() => {
          logger.info("Vector store deleted", {
            traceId,
            vectorStoreId,
            userId,
          });
        })
        .catch((err) => {
          logger.error("Cleanup error (vector store)", err, {
            traceId,
            vectorStoreId,
            userId,
          });
        });
    }

    for (const fileId of fileIds) {
      openai.files
        .delete(fileId)
        .then(() => {
          logger.info("File deleted", { traceId, fileId, userId });
        })
        .catch((err) => {
          logger.error("Cleanup error (file)", err, {
            traceId,
            fileId,
            userId,
          });
        });
    }
  }
}
