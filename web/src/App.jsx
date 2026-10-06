import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api.js";
import CasePage from "./pages/CasePage.jsx";
import Desk from "./pages/Desk.jsx";
import Queue from "./pages/Queue.jsx";
import Score from "./pages/Score.jsx";

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand" end>
          <span className="brand-mark">FD</span>
          <span>
            <strong>Fraud-DESK</strong>
            <small>Pre-decision scoring</small>
          </span>
        </NavLink>
        <nav>
          <NavLink to="/" end>
            Desk
          </NavLink>
          <NavLink to="/score">Score</NavLink>
          <QueueLink />
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Desk />} />
          <Route path="/score" element={<Score />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/cases/:id" element={<CasePage />} />
        </Routes>
      </main>
    </div>
  );
}

function QueueLink() {
  const [open, setOpen] = useState(0);
  useEffect(() => {
    let stop = false;
    const tick = () => {
      api("/api/stats")
        .then((body) => {
          if (!stop) setOpen(body.open);
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  return (
    <NavLink to="/queue">
      Queue
      {open > 0 ? <span className="nav-count">{open}</span> : null}
    </NavLink>
  );
}
