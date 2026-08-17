import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getCurrentUser } from "@/lib/dal";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AWP COP",
  description: "Al-Watania Poultry Central Operations Planning workbench",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // getCurrentUser() is cached per-request via React cache() in dal.ts.
  // Returns null on the /login page (unauthenticated) which is fine —
  // AuthProvider accepts null and the login page doesn't use useAuth().
  const user = await getCurrentUser();

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider user={user}>{children}</AuthProvider>
      </body>
    </html>
  );
}
