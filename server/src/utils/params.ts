import { Request, Response } from "express";
import mongoose from "mongoose";

export function routeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function requireObjectId(req: Request, res: Response, name: string): string | undefined {
  const value = routeParam(req.params[name] as string | string[] | undefined);
  if (!value || !mongoose.isValidObjectId(value)) {
    res.status(404).json({ message: "Not found." });
    return undefined;
  }
  return value;
}
