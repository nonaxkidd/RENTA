import { Request, Response } from "express";
import { User } from "../models/User";
import type { IVerification } from "../models/User";
import { decryptText } from "../utils/cryptoDocs";
import { readEncryptedDoc, saveEncryptedDoc, sniffFile } from "../utils/files";
import { AuditLog } from "../models/AuditLog";
import { routeParam, requireObjectId } from "../utils/params";

type DocKind = "id" | "authority";

function presentVerification(verification?: IVerification | null) {
  if (!verification) return null;
  return {
    submittedAt: verification.submittedAt,
    reviewedAt: verification.reviewedAt,
    reviewNote: verification.reviewNote,
    revisionRequested: verification.revisionRequested,
    hasIdDocument: Boolean(verification.idDocumentKey || verification.idDocumentUrl),
    hasAuthorityDocument: Boolean(verification.authorityDocumentKey || verification.authorityDocumentUrl),
    idDocumentUrl: verification.idDocumentKey ? undefined : decryptText(verification.idDocumentUrl),
    authorityDocumentUrl: verification.authorityDocumentKey ? undefined : decryptText(verification.authorityDocumentUrl),
  };
}

export async function getMyVerification(req: Request, res: Response) {
  try {
    const user = await User.findById(req.auth?.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ status: user.status, verification: presentVerification(user.verification) });
  } catch (error) {
    console.error("Failed to fetch verification:", error);
    res.status(500).json({ message: "Failed to fetch verification." });
  }
}

function uploadedFile(req: Request, field: string): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

export async function submitVerification(req: Request, res: Response) {
  try {
    const idFile = uploadedFile(req, "idDocument");
    const authorityFile = uploadedFile(req, "authorityDocument");

    if (!idFile || !authorityFile) {
      return res.status(400).json({ message: "Upload both a government ID and proof of authority." });
    }

    const idMime = sniffFile(idFile.buffer);
    const authorityMime = sniffFile(authorityFile.buffer);
    if (!idMime || !authorityMime) {
      return res.status(400).json({ message: "Documents must be JPEG, PNG, WebP, or PDF files." });
    }

    const user = await User.findById(req.auth?.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.status === "active") {
      return res.status(400).json({ message: "Your account is already verified." });
    }

    if (user.status === "suspended") {
      return res.status(403).json({ message: "Your account is suspended. Please contact an administrator." });
    }

    const idKey = await saveEncryptedDoc(idFile.buffer);
    const authorityKey = await saveEncryptedDoc(authorityFile.buffer);

    user.verification = {
      idDocumentKey: idKey,
      idDocumentMime: idMime,
      authorityDocumentKey: authorityKey,
      authorityDocumentMime: authorityMime,
      submittedAt: new Date(),
      revisionRequested: false,
    };
    user.status = "pending";

    await user.save();

    res.json({ status: user.status, verification: presentVerification(user.verification) });
  } catch (error) {
    console.error("Failed to submit verification:", error);
    res.status(500).json({ message: "Failed to submit verification." });
  }
}

async function streamDocument(res: Response, verification: IVerification | undefined, kind: DocKind) {
  const key = kind === "id" ? verification?.idDocumentKey : verification?.authorityDocumentKey;
  const mime = kind === "id" ? verification?.idDocumentMime : verification?.authorityDocumentMime;
  if (!key || !mime) {
    res.status(404).json({ message: "That document was not uploaded." });
    return;
  }
  const bytes = await readEncryptedDoc(key);
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `inline; filename="${kind}-document"`);
  res.send(bytes);
}

export async function readMyDocument(req: Request, res: Response) {
  try {
    const kindParam = routeParam(req.params.kind as string | string[] | undefined);
    const kind = kindParam === "authority" ? "authority" : kindParam === "id" ? "id" : null;
    if (!kind) return res.status(400).json({ message: "Unknown document." });
    const user = await User.findById(req.auth?.userId);
    if (!user) return res.status(404).json({ message: "User not found." });
    await streamDocument(res, user.verification, kind);
  } catch (error) {
    console.error("Failed to read document:", error);
    if (!res.headersSent) res.status(500).json({ message: "Failed to open the document." });
  }
}

export async function readOwnerDocument(req: Request, res: Response) {
  try {
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const kindParam = routeParam(req.params.kind as string | string[] | undefined);
    const kind = kindParam === "authority" ? "authority" : kindParam === "id" ? "id" : null;
    if (!kind) return res.status(400).json({ message: "Unknown document." });

    const owner = await User.findOne({ _id: id, defaultRole: "owner" });
    if (!owner) return res.status(404).json({ message: "Owner not found." });

    const actor = await User.findById(req.auth?.userId);
    await AuditLog.create({
      actorId: req.auth?.userId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : "Administrator",
      action: "Viewed owner document",
      targetType: "owner",
      targetId: owner._id,
      targetLabel: `${owner.firstName} ${owner.lastName} (${owner.email})`,
      note: kind === "id" ? "Government ID" : "Proof of authority",
    });

    await streamDocument(res, owner.verification, kind);
  } catch (error) {
    console.error("Failed to read owner document:", error);
    if (!res.headersSent) res.status(500).json({ message: "Failed to open the document." });
  }
}
