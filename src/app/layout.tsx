import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JW Tennis Club 운영 관리",
  description: "JW Tennis Club 회원, 회비, 지출, 일정, 정산 운영 관리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
