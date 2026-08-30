import {
  BadRequestError,
  Body,
  Controller,
  Post,
  UseBefore,
} from "routing-controllers";
import { convertText } from "../lib/deepseek.js";
import { convertInputGuard } from "../middlewares/convertInputGuard.js";
import { authGuard } from "../middlewares/authGuard.js";

@Controller("/convert")
@UseBefore(authGuard, convertInputGuard)
export class ConvertController {
  @Post("/")
  async convert(@Body() body: { text?: string }): Promise<{ text: string }> {
    const text = body?.text?.trim() ?? "";
    if (!text) {
      throw new BadRequestError("Body must include non-empty text");
    }
    return { text: await convertText(text) };
  }
}
