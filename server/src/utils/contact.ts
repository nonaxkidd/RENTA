import { z } from "zod";

export const gmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .refine((value) => value.endsWith("@gmail.com"), {
    message: "Use a Gmail address, like name@gmail.com.",
  });

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(09\d{9}|\+639\d{9})$/, "Use a Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX.");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
