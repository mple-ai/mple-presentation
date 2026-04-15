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
  const prompt = (formData.get("prompt") as string) || "";
  const requestedNumSlides = formData.has("numSlides") 
    ? Number(formData.get("numSlides")) 
    : undefined;

  const hasFiles = files.length > 0;

  let vectorStoreId: string | undefined;
  const fileIds: string[] = [];

  try {
    // ===== INPUT LOGGING =====
    mainSpan.annotate({
      fileCount: files.length,
      files: JSON.stringify(
        files.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
        })),
      ),
      promptPreview: prompt.slice(0, 200) || "none",
    });

    let context = "";

    if (hasFiles) {
      // ===== VECTOR STORE =====
      const vsStart = Date.now();
      const vectorStore = await openai.vectorStores.create({
        name: `RAG-${userId}`,
        expires_after: { anchor: "last_active_at", days: 1 },
      });
      vectorStoreId = vectorStore.id;

      mainSpan.event("vector_store_created", {
        vectorStoreId,
        latencyMs: Date.now() - vsStart,
      });

      // ===== FILE UPLOAD =====
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

      const failedUploads = uploadResults.filter(
        (r) => r.status === "rejected",
      );

      successfulUploads.forEach((r) => fileIds.push(r.value.id));

      mainSpan.event("file_upload_complete", {
        successCount: successfulUploads.length,
        failureCount: failedUploads.length,
        latencyMs: Date.now() - uploadStart,
        uploadedFiles: JSON.stringify(
          successfulUploads.map((f) => f.value.name),
        ),
        failedReasons: JSON.stringify(
          failedUploads.map((f) => f.reason?.message),
        ),
      });

      if (!fileIds.length) {
        throw new Error("All file uploads failed");
      }

      // ===== INDEXING =====
      const batchStart = Date.now();

      await openai.vectorStores.fileBatches.createAndPoll(vectorStore.id, {
        file_ids: fileIds,
      });

      mainSpan.event("vector_store_indexed", {
        vectorStoreId,
        latencyMs: Date.now() - batchStart,
        fileCount: fileIds.length,
      });

      // ===== RAG CALL =====
      const ragModel = "gpt-4o-mini";
      const ragStart = Date.now();

      const ragResponse = await openai.responses.create({
        model: ragModel,
        input: `Extract all relevant information from the uploaded documents for creating a presentation.

User request: "${prompt || "Create a presentation based on the uploaded documents"}"

Instructions:
- Search the documents thoroughly for content related to the user's request.
- If the request mentions a specific topic, focus on extracting that content.
- If the request is vague, extract the key topics, main points, and structure of the documents.
- Return a detailed, structured summary of the relevant content found.
- Include specific facts, data points, and details from the documents.
`,
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStore.id],
            max_num_results: 20,
            ranking_options: {
              ranker: "auto",
              score_threshold: 0.25,
            },
          },
        ],
      });

      const ragLatency = Date.now() - ragStart;
      context = ragResponse.output_text ?? "";

      mainSpan.event("rag_response", {
        model: ragModel,
        latencyMs: ragLatency,
        inputTokens: ragResponse.usage?.input_tokens,
        outputTokens: ragResponse.usage?.output_tokens,
        totalTokens: ragResponse.usage?.total_tokens,
        responseChars: context.length,
        responsePreview: context.slice(0, 300),
      });
    }

    // ===== PROMPT GENERATION (JSON MODE) =====
    const promptModel = "gpt-4o";
    const promptStart = Date.now();

    const promptGenResponse = await openai.chat.completions.create({
      model: promptModel,
      messages: [
        {
          role: "system",
          content:
            "You generate concise PowerPoint prompts and ensure the slide count matches the user's request.",
        },
        {
          role: "user",
          content: `
Generate:
 1. A single high-quality PowerPoint prompt (max 2 lines). This prompt should be an optimized, expanded version of the user's intent to get the best results from a presentation generator.
 2. Exactly ${requestedNumSlides || "an appropriate number"} of slides

Rules:
- No bullet points
- No slide breakdowns
- No formatting instructions
- Prompt must be concise but descriptive
- Slide count must be between 1 and 30

Return STRICT JSON:
{
  "pptPrompt": "string",
  "numSlides": number
}

${context ? `Context:\n${context}` : "Note: No reference documents provided. Focus entirely on expanding the User Intent into a high-quality presentation prompt."}

 User intent:
 ${prompt || "Generate a comprehensive presentation covering key topics related to the user's field."}

 Requested Slide Count: ${requestedNumSlides || "Not specified (estimate based on user intent)"}
 ALWAYS respect the user's requested slide count if provided.
          `,
        },
      ],
      response_format: { type: "json_object" },
    });

    const promptLatency = Date.now() - promptStart;

    let pptPrompt = "";
    let numSlides = requestedNumSlides ?? 8; // use requested or fallback default

    try {
      const parsed = JSON.parse(
        promptGenResponse.choices[0]?.message.content || "{}",
      );

      pptPrompt = parsed.pptPrompt ?? "";
      // Prioritize user's requested slides over LLM estimation
      numSlides = requestedNumSlides ?? parsed.numSlides ?? 8;
    } catch (err) {
      logger.error("Failed to parse prompt generation JSON", err, {
        traceId,
      });
    }

    // Clamp slides to valid range [1, 30]
    numSlides = Math.min(30, Math.max(1, numSlides));

    mainSpan.event("prompt_generation_response", {
      model: promptModel,
      latencyMs: promptLatency,
      inputTokens: promptGenResponse.usage?.prompt_tokens,
      outputTokens: promptGenResponse.usage?.completion_tokens,
      totalTokens: promptGenResponse.usage?.total_tokens,
      responseChars: pptPrompt.length,
      responsePreview: pptPrompt.slice(0, 200),
      numSlides,
    });

    // ===== FINAL RESPONSE =====
    return NextResponse.json({
      context,
      pptPrompt,
      numSlides,
    });
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
