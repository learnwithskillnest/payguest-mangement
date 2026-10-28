"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, PROPERTY_COOKIE } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { flash, optStr, str } from "@/lib/forms";

export async function signup(fd: FormData) {
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const pgName = str(fd, "pgName");
  if (!name || !email || !pgName) flash("/signup", "error", "Please fill in your name, email and PG name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) flash("/signup", "error", "Please enter a valid email address.");
  if (password.length < 8) flash("/signup", "error", "Password must be at least 8 characters.");
  if (await db.user.findUnique({ where: { email } })) {
    flash("/signup", "error", "An account with this email already exists. Please log in.");
  }
  const user = await db.user.create({
    data: {
      name,
      email,
      phone: optStr(fd, "phone"),
      passwordHash: await hashPassword(password),
      properties: { create: { name: pgName, city: optStr(fd, "city"), upiPayeeName: name } },
    },
  });
  await createSession(user.id);
  redirect("/rooms?msg=Welcome! Start by adding your rooms and beds.");
}

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    flash("/login", "error", "Email or password is incorrect.");
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function createFirstProperty(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = str(fd, "pgName");
  if (!name) flash("/onboarding", "error", "Please enter your PG name.");
  const property = await db.property.create({
    data: { ownerId: user.id, name, city: optStr(fd, "city"), upiPayeeName: user.name },
  });
  (await cookies()).set(PROPERTY_COOKIE, property.id, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/rooms");
}
