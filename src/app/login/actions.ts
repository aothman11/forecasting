"use server";

import { verifyCredentials } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { redirect } from "next/navigation";

export interface LoginState {
  error: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    return { error: "Invalid email or password. Please try again." };
  }

  await createSession(user);
  redirect("/");
}
