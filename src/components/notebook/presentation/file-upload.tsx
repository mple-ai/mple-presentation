"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FileUpload,
  FileUploadClear,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";
import { usePresentationState } from "@/states/presentation-state";

// Full list of MIME types supported by OpenAI file search
// https://developers.openai.com/api/docs/assistants/tools/file-search
const OPENAI_SUPPORTED_MIME_TYPES = [
  "text/x-c",
  "text/x-c++",
  "text/x-csharp",
  "text/css",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/x-golang",
  "text/html",
  "text/x-java",
  "text/javascript",
  "application/json",
  "text/markdown",
  "application/pdf",
  "text/x-php",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/x-python",
  "text/x-script.python",
  "text/x-ruby",
  "application/x-sh",
  "text/x-tex",
  "application/typescript",
  "text/plain",
].join(",");

export default function PresentationFileUpload() {
  const { files, setFiles } = usePresentationState();

  return (
    <FileUpload
      value={files}
      onValueChange={setFiles}
      maxFiles={10}
      maxSize={20 * 1024 * 1024}
      accept={OPENAI_SUPPORTED_MIME_TYPES}
      multiple
      className="w-full"
    >
      <div className="flex items-center justify-between">
        <FileUploadTrigger asChild>
          <Button variant="outline" size="sm" className="cursor-pointer">
            <Plus className="size-4" />
            Add Files
          </Button>
        </FileUploadTrigger>
        <FileUploadClear asChild>
          <Button variant="ghost" size="sm">
            Clear All
          </Button>
        </FileUploadClear>
      </div>
      <FileUploadList className="max-h-64 overflow-y-auto">
        {files.map((file, index) => (
          <FileUploadItem key={`${file.name}-${index}`} value={file}>
            <FileUploadItemPreview />
            <FileUploadItemMetadata />
            <FileUploadItemDelete asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <X className="size-4" />
              </Button>
            </FileUploadItemDelete>
          </FileUploadItem>
        ))}
      </FileUploadList>
    </FileUpload>
  );
}
