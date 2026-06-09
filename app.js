import { h, render } from "https://esm.sh/preact";
import {
  useState,
  useEffect,
  useMemo,
  useRef,
} from "https://esm.sh/preact/hooks";
import htm from "https://esm.sh/htm";

const DAYS = [
  { id: 0, name: "Úterý", date: "9. 6.", calendarDate: 9 },
  { id: 1, name: "Středa", date: "10. 6.", calendarDate: 10 },
  { id: 2, name: "Čtvrtek", date: "11. 6.", calendarDate: 11 },
  { id: 3, name: "Pátek", date: "12. 6.", calendarDate: 12 },
  { id: 4, name: "Sobota", date: "13. 6.", calendarDate: 13 },
  { id: 5, name: "Neděle", date: "14. 6.", calendarDate: 14 },
];

const html = htm.bind(h);

function getFavoriteIdsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const idsString = params.get("favoriteIds");
  return idsString ? idsString.split(",").filter(Boolean) : [];
}

function getViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("view") || "all";
}

function getDarkModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const dark = params.get("dark");
  return dark === null ? true : dark === "true";
}

function getTimeValue(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  let totalMinutes = hours * 60 + minutes;
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

function getBandEndDate(band) {
  const [hours, minutes] = band.endTime.split(":").map(Number);
  const day = DAYS.find((d) => d.id === band.day);
  const actualDay = hours < 6 ? day.calendarDate + 1 : day.calendarDate;
  return new Date(2026, 5, actualDay, hours, minutes);
}

function isBandPast(band, now) {
  return now > getBandEndDate(band);
}

function getOverlapPercentage(band, other) {
  const range = getTimeRange(band);
  const otherRange = getTimeRange(other);
  const overlap =
    Math.min(range.end, otherRange.end) -
    Math.max(range.start, otherRange.start);
  const duration = range.end - range.start;
  return Math.round((overlap / duration) * 100);
}

function App() {
  const [favoriteIds, setFavoriteIds] = useState(getFavoriteIdsFromUrl);
  const [view, setView] = useState(getViewFromUrl);
  const [darkMode, setDarkMode] = useState(getDarkModeFromUrl);
  const [search, setSearch] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const prevSearchRef = useRef("");
  const prevMatchIndexRef = useRef(0);
  const prevViewRef = useRef(view);
  const [harmonogram, setHarmonogram] = useState([]);
  const [now] = useState(() => new Date());
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    fetch("./harmonogram.json")
      .then((res) => res.json())
      .then((data) => setHarmonogram(data))
      .catch((err) => console.error("Error loading harmonogram:", err));
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const url = new URL(window.location);

    if (favoriteIds.length > 0) {
      url.searchParams.set("favoriteIds", favoriteIds.join(","));
    } else {
      url.searchParams.delete("favoriteIds");
    }

    url.searchParams.set("view", view);
    url.searchParams.set("dark", darkMode ? "true" : "false");

    window.history.replaceState({}, "", url);
  }, [favoriteIds, view, darkMode]);

  const toggleFavorite = (band) => {
    if (favoriteIds.includes(band.bandId)) {
      if (view === "favorites") {
        if (
          !window.confirm(
            `Are you sure you want to remove ${band.bandName} from your selection?`,
          )
        ) {
          return;
        }
      }
      setFavoriteIds(favoriteIds.filter((id) => id !== band.bandId));
    } else {
      setFavoriteIds([...favoriteIds, band.bandId]);
    }
  };

  const [bandsByDay, daysWithBands] = useMemo(() => {
    const daysWithBands = new Set([]);
    const grouped = {};
    const filtered = harmonogram.filter((band) => {
      if (band.active === false) return false;

      if (view === "favorites" && !favoriteIds.includes(band.bandId))
        return false;

      daysWithBands.add(band.day);
      return true;
    });
    filtered.sort((a, b) => {
      if (a.day !== b.day) {
        return a.day - b.day;
      }
      return getTimeValue(a.startTime) - getTimeValue(b.startTime);
    });
    for (const band of filtered) {
      if (!grouped[band.day]) grouped[band.day] = [];
      grouped[band.day].push(band);
    }
    return [grouped, daysWithBands];
  }, [harmonogram, favoriteIds, search, view]);

  const favoriteBands = useMemo(
    () => harmonogram.filter((b) => favoriteIds.includes(b.bandId)),
    [harmonogram, favoriteIds],
  );

  const getConflictingBands = (band) => {
    if (!favoriteIds.includes(band.bandId)) return [];
    if (favoriteBands.length < 2) return [];
    const range = getTimeRange(band);
    return favoriteBands.filter((other) => {
      if (other.bandId === band.bandId || other.day !== band.day) return false;
      const otherRange = getTimeRange(other);
      return range.start < otherRange.end && otherRange.start < range.end;
    });
  };

  const getConflictGradient = (band, conflictingBands) => {
    const range = getTimeRange(band);
    const duration = range.end - range.start;
    return conflictingBands
      .map((other) => {
        const otherRange = getTimeRange(other);
        const overlapStart = Math.max(range.start, otherRange.start);
        const overlapEnd = Math.min(range.end, otherRange.end);
        const startPct = ((overlapStart - range.start) / duration) * 100;
        const endPct = ((overlapEnd - range.start) / duration) * 100;
        return `linear-gradient(to right, transparent ${startPct}%, rgba(244,67,54,0.25) ${startPct}%, rgba(244,67,54,0.25) ${endPct}%, transparent ${endPct}%)`;
      })
      .join(", ");
  };

  const scrollToDay = (d) => {
    const el = document.getElementById(`section-${d}`);
    if (el) {
      el.scrollIntoView({ behavior: "instant" });
    }
  };

  const scrollToCurrentBand = () => {
    for (const day of DAYS) {
      const dayBands = bandsByDay[day.id];
      if (!dayBands) continue;
      for (const band of dayBands) {
        if (!isBandPast(band, now)) {
          const el = document.getElementById(`band-${band.bandId}`);
          if (el) el.scrollIntoView({ behavior: "instant" });
          return;
        }
      }
    }
  };

  useEffect(() => {
    if (harmonogram.length === 0) return;
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true;
      scrollToCurrentBand();
    }
  }, [harmonogram]);

  useEffect(() => {
    if (!search) {
      setSearchMatchIndex(0);
      prevSearchRef.current = "";
      prevMatchIndexRef.current = 0;
      prevViewRef.current = view;
      return;
    }

    const searchChanged = search !== prevSearchRef.current;
    const indexChanged = searchMatchIndex !== prevMatchIndexRef.current;
    const viewChanged = view !== prevViewRef.current;

    if (searchChanged || indexChanged || viewChanged) {
      const lowerSearch = search.toLowerCase();
      const matches = [];
      for (const day of DAYS) {
        const dayBands = bandsByDay[day.id];
        if (!dayBands) continue;
        for (const band of dayBands) {
          if (band.bandName.toLowerCase().includes(lowerSearch)) {
            matches.push(band.bandId);
          }
        }
      }

      if (matches.length > 0) {
        const actualIndex = searchMatchIndex % matches.length;
        const targetId = matches[actualIndex];
        const el = document.getElementById(`band-${targetId}`);
        if (el) el.scrollIntoView({ behavior: "instant" });
      }

      prevSearchRef.current = search;
      prevMatchIndexRef.current = searchMatchIndex;
      prevViewRef.current = view;
    }
  }, [search, searchMatchIndex, bandsByDay, view]);

  const toggleView = () => {
    const nextView = view === "all" ? "favorites" : "all";
    setView(nextView);
    if (!search) {
      setTimeout(() => scrollToCurrentBand(), 0);
    }
  };

  const getCardClass = (isFavorite, past) => {
    let cls = "card";
    if (past) cls += " card-past";
    if (isFavorite) cls += " card-selected";
    return cls;
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
              onInput=${(e) => {
                setSearch(e.target.value);
                setSearchMatchIndex(0);
              }}
              onKeyDown=${(e) => {
                if (e.key === "Enter" && search) {
                  setSearchMatchIndex((prev) => prev + 1);
                }
              }}
              class="search-input"
            />
            ${search &&
            html`<button
              class="button search-clear"
              onClick=${() => setSearch("")}
            >
              ✕
            </button>`}
          </div>
          <button
            class="button control-btn ${view === "favorites"
              ? "control-selected"
              : ""}"
            onClick=${toggleView}
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
        ${DAYS.map((day) =>
          daysWithBands.has(day.id)
            ? html`
                <section class="scroll-section" id="section-${day.id}">
                  <h2>${day.name} ${day.date}</h2>
                  ${(bandsByDay[day.id] || []).map((band) => {
                    const isFavorite = favoriteIds.includes(band.bandId);
                    const isMatched =
                      search &&
                      band.bandName
                        .toLowerCase()
                        .includes(search.toLowerCase());
                    const conflictingBands = getConflictingBands(band);
                    const conflict = conflictingBands.length > 0;
                    const past = isBandPast(band, now);
                    const style = conflict
                      ? `background-image: ${getConflictGradient(band, conflictingBands)}`
                      : "";

                    return html`
                      <div
                        class=${`${getCardClass(isFavorite, past)} ${isMatched ? "card-matched" : ""}`}
                        id="band-${band.bandId}"
                        key=${band.bandId}
                        onClick=${() => toggleFavorite(band)}
                        style=${style}
                      >
                        <strong>${band.bandName}</strong>
                        <span
                          >${band.startTime} - ${band.endTime} |
                          ${` Stage: ${band.stage}`}</span
                        >
                        ${conflict
                          ? html`<span class="conflict-label">
                              ${"⚠️ Conflict: "}
                              ${conflictingBands
                                .map(
                                  (other) =>
                                    `${other.bandName} (${getOverlapPercentage(band, other)}%)`,
                                )
                                .join(", ")}
                            </span>`
                          : ""}
                      </div>
                    `;
                  })}
                </section>
              `
            : null,
        )}
        ${daysWithBands.size === 0 &&
        harmonogram.length > 0 &&
        html`<p>No bands found/selected.</p>`}
        ${harmonogram.length === 0 && html`<p>Loading harmonogram...</p>`}
      </div>
      <div class="days-tab">
        ${DAYS.map(
          (day) => html`
            <button
              key=${day.id}
              style="width: 100%"
              class="button day-button"
              onClick=${() => scrollToDay(day.id)}
            >
              ${day.date}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
