import "./globals.css";

export const metadata = {
  title: "Campus Library",
  description: "Campus Library Loan & Reservation System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
