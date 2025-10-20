import { Eye } from "lucide-react";
import spikelyLogo from "@/assets/spikely-logo.png";

export const Header = () => {
  return (
    <header className="py-4 sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="container">
        <div className="flex items-center gap-3">
          <img src={spikelyLogo} alt="Spikely" className="h-12 w-auto" />
        </div>
      </div>
    </header>
  );
};