import "./globals.css";
import Shell from "@/components/Shell";
export const metadata = { title: "Meeting Intelligence Workspace", description: "A transcript workspace for meeting summaries, search, and follow-up." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Shell>{children}</Shell></body></html>;
}
