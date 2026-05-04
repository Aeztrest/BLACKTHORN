import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Hub } from "./components/Hub";
import SolSwap from "./sites/solswap/SolSwap";
import PixelDrop from "./sites/pixeldrop/PixelDrop";
import SolYield from "./sites/solyield/SolYield";
import ClaimHub from "./sites/claimhub/ClaimHub";
import LaunchPad from "./sites/launchpad/LaunchPad";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/solswap" element={<SolSwap />} />
        <Route path="/pixeldrop" element={<PixelDrop />} />
        <Route path="/solyield" element={<SolYield />} />
        <Route path="/claimhub" element={<ClaimHub />} />
        <Route path="/launchpad" element={<LaunchPad />} />
      </Routes>
    </BrowserRouter>
  );
}
