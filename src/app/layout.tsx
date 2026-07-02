import "./globals.css";

export const metadata = {
  title: "健康测评系统",
  description: "Health assessment MVP scaffold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
