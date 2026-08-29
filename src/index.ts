import "dotenv/config";
import "reflect-metadata";
import express from "express";
import cors from "cors";
import { useExpressServer } from "routing-controllers";
import { OcrController } from "./controllers/OcrController.js";
import { ConvertController } from "./controllers/ConvertController.js";

const port = Number(process.env.PORT) || 3000;

const app = express();

// Allow the Vite dev server (http://localhost:3001) to call the API directly.
app.use(cors());
// Parse JSON bodies so @Body() works on the /convert endpoint.
app.use(express.json());

useExpressServer(app, {
  controllers: [OcrController, ConvertController],
});

app.listen(port, () => {
  console.log(`Translator Pro Max backend listening on http://localhost:${port}`);
});
