import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { connectDB } from "../config/db";
import { User } from "../models/User";

dotenv.config();

async function seedAdmin() {
  try {
    await connectDB();

    const adminEmail = "admin@renta.local";
    const adminPassword = "Admin12345!";

    const existingAdmin = await User.findOne({
      email: adminEmail,
    });

    if (existingAdmin) {
      console.log("Admin account already exists.");
      return;
    }

    const passwordHash = await bcrypt.hash(
      adminPassword,
      12
    );

    await User.create({
      firstName: "RENTA",
      lastName: "Administrator",
      email: adminEmail,
      passwordHash,
      defaultRole: "admin",
      status: "active",
      emailVerified: true,
    });

    console.log("Admin account created successfully!");
    console.log(`Email: ${adminEmail}`);

    const superEmail = "superadmin@renta.local";
    const existingSuper = await User.findOne({ email: superEmail });
    if (!existingSuper) {
      await User.create({
        firstName: "RENTA",
        lastName: "Superadmin",
        email: superEmail,
        passwordHash: await bcrypt.hash("SuperAdmin12345!", 12),
        defaultRole: "superadmin",
        status: "active",
        emailVerified: true,
      });
      console.log(`Superadmin created: ${superEmail}`);
    }
  } catch (error) {
    console.error("Admin creation failed:", error);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();