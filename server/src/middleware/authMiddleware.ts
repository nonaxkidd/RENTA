import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

type UserRole = "tenant" | "owner" | "admin" | "superadmin";

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

export async function authenticate(
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

    const user = await User.findById(payload.userId).select("defaultRole status");
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (user.status === "suspended" || user.status === "archived" || user.status === "rejected") {
      return res.status(403).json({ message: "Account is not allowed to log in", code: "ACCOUNT_BLOCKED" });
    }

    req.auth = {
      userId: user._id.toString(),
      role: user.defaultRole,
      status: user.status,
    };

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

    const role = req.auth.role;
    const allowed = roles.includes(role) || (role === "superadmin" && roles.includes("admin"));

    if (!allowed) {
      return res.status(403).json({
        message: "You do not have permission",
      });
    }

    next();
  };
}