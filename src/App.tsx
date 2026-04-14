import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-800">
      <Sidebar />
      <MainContent />
    </div>
  );
}

export default App;
