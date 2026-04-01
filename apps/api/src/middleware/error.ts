import type { Request, Response, NextFunction } from "express";

const asMessage = (err: unknown) => {
  if (err instanceof Error) {
    return err.message;
  }
  return "Unexpected error";
};

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found", code: "NOT_FOUND" });
};

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: asMessage(err), code: "INTERNAL_SERVER_ERROR" });
};
