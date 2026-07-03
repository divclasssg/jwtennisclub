import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.scss";

const notoSansKr = Noto_Sans_KR({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-noto-sans-kr",
  weight: "variable",
});

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
    <html className={notoSansKr.variable} lang="ko">
      <body>{children}</body>
    </html>
  );
}
