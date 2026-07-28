import type { Metadata } from "next";
import { Cinzel, Noto_Serif_SC, Long_Cang, UnifrakturMaguntia } from "next/font/google";
import Providers from "@/components/Providers";
import AccountBar from "@/components/AccountBar";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cinzel",
});

// Google's own Noto CJK project — full, reliable glyph coverage (ZCOOL XiaoWei was
// dropping/mangling some common characters, e.g. "回" rendered as a solid tofu block).
const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-zcool",
});

const longCang = Long_Cang({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-longcang",
});

const unifraktur = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-unifraktur",
});

export const metadata: Metadata = {
  title: "REGICIDE — 弑君",
  description: "皇帝与奴隶的心理博弈",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`h-full ${cinzel.variable} ${notoSerifSC.variable} ${longCang.variable} ${unifraktur.variable}`}>
      <body className="h-full bg-void text-text-primary">
        <div className="vignette" />
        <Providers>
          <AccountBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
