import { useState } from "react";
import { Header } from "@/components/Header";
import { LiveSession } from "@/components/LiveSession";

const Index = () => {
  const [isCalibrating, setIsCalibrating] = useState(false);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {!isCalibrating && <Header />}
      
      <main className="container py-12 relative z-10">
        <div className="w-full max-w-4xl mx-auto">
          <LiveSession onCalibrationChange={setIsCalibrating} />
        </div>
      </main>
    </div>
  );
};

export default Index;
