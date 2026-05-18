import { h, render } from "https://esm.sh/preact";
import { useState, useEffect, useMemo } from "https://esm.sh/preact/hooks";
import htm from "https://esm.sh/htm";

const dayToName = {
  1: "Středa",
  2: "Čtvrtek",
  3: "Pátek",
  4: "Sobota",
  5: "Neděle",
};

const dayToDate = {
  1: "10. 6.",
  2: "11. 6.",
  3: "12. 6.",
  4: "13. 6.",
  5: "14. 6.",
};

// Initialize htm to work with Preact's h function
const html = htm.bind(h);

// Helper: Read comma-delimited IDs from the URL
function getIdsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const idsString = params.get("ids");
  return idsString ? idsString.split(",").filter(Boolean) : [];
}

// Helper: Read show mode from the URL
function getShowFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("show") || "all";
}

// Helper: Read dark mode from URL
function getDarkModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("dark") === "1" || "1";
}

// Helper: Convert "HH:mm" to a comparable value, treating 0:00-6:00 as late night
function getTimeValue(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  let totalMinutes = hours * 60 + minutes;
  // If time is between 0:00 and 6:00, add 24 hours worth of minutes
  if (hours < 6) {
    totalMinutes += 24 * 60;
  }
  return totalMinutes;
}

function getTimeRange(band) {
  return {
    start: getTimeValue(band.startTime),
    end: getTimeValue(band.endTime),
  };
}

function App() {
  const [ids, setIds] = useState(getIdsFromUrl);
  const [show, setShow] = useState(getShowFromUrl);
  const [darkMode, setDarkMode] = useState(getDarkModeFromUrl);
  const [search, setSearch] = useState("");
  const [harmonogram, setHarmonogram] = useState([]);

  // Fetch harmonogram data
  useEffect(() => {
    fetch("./harmonogram.json")
      .then((res) => res.json())
      .then((data) => setHarmonogram(data))
      .catch((err) => console.error("Error loading harmonogram:", err));
  }, []);

  // Synchronize state changes back to URL
  useEffect(() => {
    const url = new URL(window.location);

    if (ids.length > 0) {
      url.searchParams.set("ids", ids.join(","));
    } else {
      url.searchParams.delete("ids");
    }

    url.searchParams.set("show", show);
    url.searchParams.set("dark", darkMode ? "1" : "0");

    window.history.replaceState({}, "", url);

    // Toggle dark mode class on body
    if (darkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }, [ids, show, darkMode]);

  // Handle back/forward browser navigation
  useEffect(() => {
    const handlePopState = () => {
      setIds(getIdsFromUrl());
      setShow(getShowFromUrl());
      setDarkMode(getDarkModeFromUrl());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const toggleBandSelection = (band) => {
    const idStr = band.bandId.toString();
    if (ids.includes(idStr)) {
      if (show === "selected") {
        if (
          !window.confirm(
            `Are you sure you want to remove ${band.bandName} from your selection?`,
          )
        ) {
          return;
        }
      }
      setIds(ids.filter((id) => id !== idStr));
    } else {
      setIds([...ids, idStr]);
    }
  };

  const [bands, daysWithItems] = useMemo(() => {
    const daysWithItems = new Set([]);
    const filtered = harmonogram.filter((band) => {
      if (band.active === false) return false;

      const matchesSearch = band.bandName
        .toLowerCase()
        .includes(search.toLowerCase());
      if (!matchesSearch) return false;

      const isSelected = ids.includes(band.bandId.toString());
      if (show === "selected" && !isSelected) return false;

      daysWithItems.add(band.day);
      return true;
    });
    const sorted = filtered.sort((a, b) => {
      if (a.day !== b.day) {
        return a.day - b.day;
      }
      return getTimeValue(a.startTime) - getTimeValue(b.startTime);
    });
    return [sorted, daysWithItems];
  }, [harmonogram, ids, search, show]);

  const selectedBands = harmonogram.filter((b) =>
    ids.includes(b.bandId.toString()),
  );

  const getConflictingBands = (band) => {
    if (!ids.includes(band.bandId.toString())) return [];
    const range = getTimeRange(band);
    return selectedBands.filter((other) => {
      if (other.bandId === band.bandId || other.day !== band.day) return false;
      const otherRange = getTimeRange(other);
      return range.start < otherRange.end && otherRange.start < range.end;
    });
  };

  const scrollToDay = (d) => {
    const el = document.getElementById(`section-${d}`);
    if (el) {
      el.scrollIntoView({ behavior: "instant" });
    }
  };

  const setViewMode = (currentShow) => {
    scrollToDay(1);
    setTimeout(() => setShow(currentShow === "all" ? "selected" : "all"), 0);
  };

  return html`
    <div id="content">
      <div class="top-bar">
        <div class="control-buttons">
          <div class="search-bar">
            <input
              id="search-input"
              type="text"
              placeholder="Search"
              value=${search}
              onInput=${(e) => setSearch(e.target.value)}
              class="search-input"
            />
          </div>
          <button
            class="button control-btn ${show === "selected"
              ? "control-selected"
              : ""}"
            onClick=${() => setViewMode(show)}
          >
            ⭐
          </button>
          <button
            class="button control-btn ${darkMode ? "control-selected" : ""}"
            onClick=${() => setDarkMode(!darkMode)}
          >
            🌙
          </button>
        </div>
      </div>

      <div class="list-layout">
        ${[1, 2, 3, 4, 5].map((d) =>
          daysWithItems.has(d)
            ? html`
                <section class="scroll-section" id="section-${d}">
                  <h2>${dayToName[d]} ${dayToDate[d]}</h2>
                  ${bands.map((band) => {
                    if (band.day !== d) return null;
                    const isSelected =
                      show === "selected" ||
                      ids.includes(band.bandId.toString());
                    const conflictingBands = getConflictingBands(band);
                    const conflict = conflictingBands.length > 0;

                    return html`
                      <div
                        class="card"
                        key=${band.bandId}
                        onClick=${() => toggleBandSelection(band)}
                        style="cursor: pointer; border-left: 5px solid ${isSelected
                          ? conflict
                            ? "#f44336"
                            : "var(--selected)"
                          : "#ccc"}; background: ${isSelected
                          ? conflict
                            ? "var(--conflict-bg)"
                            : "var(--selected-bg)"
                          : "var(--card-bg)"};"
                      >
                        <strong>${band.bandName}</strong>
                        ${conflict
                          ? html`<span
                              style="color: #f44336; font-size: 0.8em; margin-left: 10px;"
                            >
                              ${"⚠️ Conflict: "}
                              ${conflictingBands
                                .map((other) => {
                                  const range = getTimeRange(band);
                                  const otherRange = getTimeRange(other);
                                  const overlap =
                                    Math.min(range.end, otherRange.end) -
                                    Math.max(range.start, otherRange.start);
                                  const duration = range.end - range.start;
                                  const percentage = Math.round(
                                    (overlap / duration) * 100,
                                  );
                                  return `${other.bandName} (${percentage}%)`;
                                })
                                .join(", ")}
                            </span>`
                          : ""}
                        <br />
                        <span
                          >${band.startTime} - ${band.endTime} |
                          ${` Stage: ${band.stage}`}</span
                        >
                      </div>
                    `;
                  })}
                </section>
              `
            : null,
        )}
        ${(bands.length === 0 || daysWithItems.size === 0) &&
        harmonogram.length > 0 &&
        html`<p>No bands found/selected.</p>`}
        ${harmonogram.length === 0 && html`<p>Loading harmonogram...</p>`}
      </div>
      <div class="days-tab">
        ${[1, 2, 3, 4, 5].map(
          (d) => html`
            <button
              key=${d}
              style="width: 100%"
              class="button day-button"
              onClick=${() => scrollToDay(d)}
            >
              ${dayToDate[d]}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
