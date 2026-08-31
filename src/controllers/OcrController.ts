import { Controller, Post, UploadedFile, UseBefore } from "routing-controllers";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { authGuard } from "../middlewares/authGuard.js";

// Creates a client (uses GOOGLE_APPLICATION_CREDENTIALS from the environment)
const client = new ImageAnnotatorClient();

@Controller("/ocr")
@UseBefore(authGuard)
export class OcrController {
  @Post("/")
  async extractText(
    @UploadedFile("file") file: Express.Multer.File,
  ): Promise<{ pages: { pageNumber: number; text: string }[] }> {
    if (file.mimetype === "application/pdf") {
      return { pages: await this.extractPdfPages(file.buffer) };
    }
    // Performs text detection on the uploaded image
    const [result] = await client.textDetection(file.buffer);
    console.log("Text detection result:", result);
    const detections = result.textAnnotations ?? [];
    console.log("Detected text:", detections.map((d) => d.description));
    const text = detections.map((d) => d.description ?? "").join("\n");
    return { pages: [{ pageNumber: 1, text }] };
  }

  // PDFs/TIFFs use document text detection: one response per page, and the
  // extracted text lives in fullTextAnnotation.text (textDetection is image-only).
  // Each page response carries its 1-based page number in context.pageNumber.
  private async extractPdfPages(
    buffer: Buffer,
  ): Promise<{ pageNumber: number; text: string }[]> {
    const [result] = await client.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            content: buffer.toString("base64"),
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    });
    const fileResponses = result.responses ?? [];
    return fileResponses
      .flatMap((fileRes) => fileRes.responses ?? [])
      .map((page, i) => ({
        pageNumber: page.context?.pageNumber ?? i + 1,
        text: page.fullTextAnnotation?.text ?? "",
      }));
  }
}
