import bcrypt from "bcryptjs";
import dns from "dns";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "../models/User";

dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config();

const accounts = [
  { firstName: "RENTA", lastName: "Superadmin", email: "superadmin@renta.local", password: "SuperAdmin12345!", role: "superadmin" as const },
  { firstName: "RENTA", lastName: "Administrator", email: "admin@renta.local", password: "Admin12345!", role: "admin" as const },
  { firstName: "Maria", lastName: "Santos", email: "owner@gmail.com", password: "Owner12345!", role: "owner" as const },
  { firstName: "Juan", lastName: "Dela Cruz", email: "tenant@gmail.com", password: "Tenant12345!", role: "tenant" as const },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  for (const account of accounts) {
    const existing = await User.findOne({ email: account.email });
    if (existing) {
      console.log("EXISTS", account.email);
      continue;
    }

    await User.create({
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      passwordHash: await bcrypt.hash(account.password, 12),
      defaultRole: account.role,
      status: "active",
      emailVerified: true,
    });
    console.log("CREATED", account.email);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
