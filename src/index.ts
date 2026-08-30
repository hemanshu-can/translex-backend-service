import "dotenv/config";
import "reflect-metadata";
import express from "express";
import cors from "cors";
import { useExpressServer } from "routing-controllers";
import { OcrController } from "./controllers/OcrController.js";
import { ConvertController } from "./controllers/ConvertController.js";
import { AuthController } from "./controllers/AuthController.js";

const port = Number(process.env.PORT) || 3000;

// Frontend origins allowed to make credentialed requests. Never "*" — the
// browser requires an exact origin + Access-Control-Allow-Credentials for
// withCredentials fetch (HttpOnly JWT cookie). Comma-separated env var,
// defaults to the Vite dev server origin.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3002")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();

app.use(cors({ origin: allowedOrigins, credentials: true }));
// Parse JSON bodies so @Body() works on the /convert endpoint.
app.use(express.json());

useExpressServer(app, {
  controllers: [OcrController, ConvertController, AuthController],
});

app.listen(port, () => {
  console.log(`Translator Pro Max backend listening on http://localhost:${port}`);
});
