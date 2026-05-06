import createError, { HttpError } from "http-errors";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import { fileURLToPath } from "url";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import indexRouter from "./routes/index.js";
import templateRouter from "./routes/template.js";
import chatRouter from "./routes/chat.js";
import uploadRouter from "./routes/upload.js"; // Import

const app = express();
const corsOrigin = process.env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(logger("dev"));
app.use(
  cors({
    origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use("/", indexRouter);
app.use("/api/template", templateRouter);
app.use("/api/chat", chatRouter);
app.use("/api/upload", uploadRouter); // Mount

// catch 404 and forward to error handler
app.use(function (req: Request, res: Response, next: NextFunction) {
  next(createError(404));
});

// error handler
app.use(function (err: HttpError, req: Request, res: Response, next: NextFunction) {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  res.status(err.status || 500);
  res.json({ error: err.message });
});

export default app;
