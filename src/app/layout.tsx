import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { StoreProvider } from "@/store/provider";
import "./globals.css";

const vazirmatn = localFont({
  src: "./fonts/Vazirmatn-var.woff2",
  variable: "--font-vazirmatn",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "پشتیبان — پلتفرم هوش مصنوعی پشتیبانی مشتریان",
  description:
    "دانش کسب‌وکارتان را متصل کنید؛ پشتیبان در چند دقیقه یک دستیار هوشمند و ربات تلگرام می‌سازد که به مشتریان شما پاسخ فوری و دقیق می‌دهد.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${vazirmatn.variable} font-sans antialiased`}>
        <StoreProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
