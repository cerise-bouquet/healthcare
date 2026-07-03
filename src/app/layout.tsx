import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata = {
  title: "健康测评系统",
  description: "Health assessment MVP scaffold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
