import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign In — AWP COP" };

export default async function LoginPage() {
  // Already authenticated → go straight to app
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(145deg, #022c16 0%, #035c29 45%, #06703a 100%)",
      }}
    >
      <LoginForm />
    </main>
  );
}
