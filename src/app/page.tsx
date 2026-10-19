import BarStation from "@/components/BarStation";
import { backboardEnabled } from "@/server/backboard";
import { geminiEnabled } from "@/server/gemini";

// Which AI features this deployment runs, from its server keys. Read at build
// time, so turning a key on or off in Vercel needs a redeploy.
export default function Home() {
  return <BarStation ai={{ gemini: geminiEnabled(), memory: backboardEnabled() }} />;
}
