import type { Response } from "express";

export type ApiErrorCode = string;

export const sendError = (res: Response, status: number, code: ApiErrorCode, error: string) => {
  res.status(status).json({ error, code });
};

