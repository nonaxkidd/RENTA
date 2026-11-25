import nodemailer from "nodemailer";

export async function sendGmail(to: string, subject: string, text: string): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    const error = new Error("Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
    error.name = "GmailNotConfigured";
    throw error;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `RENTA <${user}>`,
    to,
    subject,
    text,
  });
}
