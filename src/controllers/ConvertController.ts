import {
  BadRequestError,
  Body,
  Controller,
  Post,
  UseBefore,
} from "routing-controllers";
import { convertText, type Page } from "../lib/deepseek.js";
import { proofCheck, type ProofCheckResult } from "../services/conversionService.js";
import { convertInputGuard } from "../middlewares/convertInputGuard.js";
import { authGuard } from "../middlewares/authGuard.js";

@Controller("/convert")
@UseBefore(authGuard, convertInputGuard)
export class ConvertController {
  @Post("/")
  async convert(
    @Body() body: { pages?: Page[] },
  ): Promise<{ pages: Page[]; proofCheck: ProofCheckResult }> {
    const pages = body?.pages;
    if (!pages || pages.length === 0) {
      throw new BadRequestError("Body must include a non-empty pages array");
    }
    const convertedPages = await convertText(pages);
    // Auxiliary check — if the verification call itself fails, degrade to a
    // failed verdict instead of losing the completed translation.
    const proofCheckResult = await proofCheck(pages, convertedPages).catch(
      (error) => {
        console.error("Proof check failed:", error);
        return {
          matched: false,
          confidence: 0,
          notes: ["The verification call failed."],
        };
      },
    );
    return { pages: convertedPages, proofCheck: proofCheckResult };
  }
}
