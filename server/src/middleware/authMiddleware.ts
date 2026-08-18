import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type UserRole = "tenant" | "owner" | "admin";

interface TokenPayload {
  userId: string;
  role: UserRole;
  status: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = authorization.split(" ")[1];

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    const payload = jwt.verify(
      token,
      secret
    ) as TokenPayload;

    req.auth = payload;

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.auth) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({
        message: "You do not have permission",
      });
    }

    next();
  };
}