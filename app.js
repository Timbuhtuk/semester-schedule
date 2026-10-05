(() => {
  "use strict";

  const data = window.SCHEDULE_DATA;
  if (!data) throw new Error("Schedule data is missing");

  const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  const dayNamesShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const sourceNames = { uvt: "UVT · 2 курс", retake: "Долг · обычная группа", second: "ХНУРЕ", sport: "UVT · физкультура", alternate: "Долг · другая группа" };
  const daysByDate = new Map(data.days.map(day => [day.date, day]));

  const asDate = iso => new Date(`${iso}T12:00:00Z`);
  const isoDate = date => date.toISOString().slice(0, 10);
  const formatDate = (iso, options = { day: "numeric", month: "long" }) =>
    new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: "UTC" }).format(asDate(iso));
  const minute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function calculateConflicts(visible) {
    const pairs = [];
    const byEvent = new Map();
    const byDate = new Map();
    for (const [date, events] of visible) {
      for (let q = 0; q < events.length; q++) {
        for (let e = q + 1; e < events.length; e++) {
          const first = events[q];
          const second = events[e];
          const firstEnd = first.end ? minute(first.end) : minute(first.start) + 90;
          const secondEnd = second.end ? minute(second.end) : minute(second.start) + 90;
          if (Math.max(minute(first.start), minute(second.start)) >= Math.min(firstEnd, secondEnd)) continue;
          const pair = { date, first, second, possible: !first.end || !second.end };
          pairs.push(pair);
          if (!byDate.has(date)) byDate.set(date, []);
          byDate.get(date).push(pair);
          for (const event of [first, second]) {
            if (!byEvent.has(event.id)) byEvent.set(event.id, []);
            byEvent.get(event.id).push(pair);
          }
        }
      }
    }
    return { pairs, byEvent, byDate };
  }
  let conflicts = null;
  let visibleByDate = new Map();

  const months = [];
  for (let year = 2026, month = 8; year < 2027 || month === 0; month++) {
    if (month === 12) { year++; month = 0; }
    months.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    if (year === 2027 && month === 0) break;
  }

  const query = new URLSearchParams(location.search);
  const legacyOptionalMode = query.get("mode") === "optional";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const initialDate = query.get("date") && /^202[67]-\d\d-\d\d$/.test(query.get("date")) ? query.get("date") : today;
  const clampedDate = initialDate < data.meta.start ? data.meta.start : initialDate > data.meta.end ? data.meta.end : initialDate;
  const findWeek = date => {
    const match = data.weeks.findIndex(week => week.start <= date && date <= week.end);
    if (match >= 0) return match;
    const previous = data.weeks.findLastIndex(week => week.start <= date);
    return Math.max(0, previous);
  };
  const state = {
    mode: query.get("mode") === "progress" ? "progress" : "schedule",
    view: query.get("view") === "month" ? "month" : "week",
    weekIndex: findWeek(clampedDate),
    monthIndex: Math.max(0, months.indexOf(clampedDate.slice(0, 7))),
    selectedDay: clampedDate,
    showUvt: true,
    showSecond: true,
    showOptional: legacyOptionalMode || query.get("alternates") === "1",
  };

  const elements = {
    weekView: document.getElementById("week-view"),
    monthView: document.getElementById("month-view"),
    previous: document.getElementById("previous"),
    next: document.getElementById("next"),
    today: document.getElementById("today"),
    periodLabel: document.getElementById("period-label"),
    periodKicker: document.getElementById("period-kicker"),
    periodSelect: document.getElementById("period-select"),
    summary: document.getElementById("summary"),
    calendar: document.getElementById("calendar"),
    conflicts: document.getElementById("conflicts"),
    dialog: document.getElementById("event-dialog"),
    dialogContent: document.getElementById("dialog-content"),
    dialogClose: document.getElementById("dialog-close"),
    planner: document.getElementById("planner"),
    progress: document.getElementById("progress"),
    progressContent: document.getElementById("progress-content"),
    method: document.getElementById("method"),
  };

  function selectEvents() {
    const selected = data.events.filter(event => event.source === "second" ? state.showSecond : state.showUvt);
    if (state.showOptional) selected.push(...data.optionalRetakes);
    visibleByDate = new Map();
    for (const event of selected) {
      if (!visibleByDate.has(event.date)) visibleByDate.set(event.date, []);
      visibleByDate.get(event.date).push(event);
    }
    for (const entries of visibleByDate.values()) entries.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
    conflicts = calculateConflicts(visibleByDate);
  }

  function periodDates() {
    if (state.view === "week") return data.days.filter(day => day.weekStart === data.weeks[state.weekIndex].start).map(day => day.date);
    return data.days.filter(day => day.date.startsWith(months[state.monthIndex])).map(day => day.date);
  }

  function periodConflicts() {
    const dates = new Set(periodDates());
    return conflicts.pairs.filter(pair => dates.has(pair.date));
  }

  function eventTime(event) {
    return event.end ? `${event.start}–${event.end}` : `${event.start} · конец неизвестен`;
  }

  function eventCard(event) {
    const isConflict = conflicts.byEvent.has(event.id);
    const conflictLabel = isConflict ? conflicts.byEvent.get(event.id).some(pair => !pair.possible) ? "пересечение" : "возможное пересечение" : "";
    const flag = isConflict ? `<span class="event-card__flag">${conflicts.byEvent.get(event.id).some(pair => !pair.possible) ? "ПЕРЕСЕЧЕНИЕ" : "ВОЗМОЖНОЕ ПЕРЕСЕЧЕНИЕ"}</span>` : "";
    const note = event.note ? `<span class="event-card__note">${escapeHtml(event.note)}</span>` : "";
    return `<button class="event-card event-card--${event.source}${isConflict ? " event-card--conflict" : ""}" type="button" data-event-id="${escapeHtml(event.id)}" aria-label="${escapeHtml(`${eventTime(event)}, ${event.title}${isConflict ? ", " + conflictLabel : ""}`)}">
      <span class="event-card__top"><span class="event-card__source">${escapeHtml(sourceNames[event.source])}</span></span>
      <span class="event-card__title">${escapeHtml(event.title)}</span>${flag}${note}
    </button>`;
  }

  function renderWeek() {
    const week = data.weeks[state.weekIndex];
    const dates = data.days.filter(day => day.weekStart === week.start);
    elements.calendar.innerHTML = renderTimeGrid(dates.map(day => day.date));
  }

  function eventEndMinute(event) {
    return event.end ? minute(event.end) : minute(event.start) + 90;
  }

  function layoutDayEvents(events) {
    const ordered = [...events].sort((a, b) =>
      minute(a.start) - minute(b.start) || eventEndMinute(b) - eventEndMinute(a));
    const result = [];
    let cluster = [];
    let clusterEnd = -1;

    function finishCluster() {
      if (!cluster.length) return;
      const columnEnds = [];
      const placed = cluster.map(event => {
        const start = minute(event.start);
        let column = columnEnds.findIndex(end => end <= start);
        if (column < 0) column = columnEnds.length;
        columnEnds[column] = eventEndMinute(event);
        return { event, column };
      });
      const columns = columnEnds.length;
      result.push(...placed.map(item => ({ ...item, columns })));
      cluster = [];
      clusterEnd = -1;
    }

    for (const event of ordered) {
      const start = minute(event.start);
      if (cluster.length && start >= clusterEnd) finishCluster();
      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, eventEndMinute(event));
    }
    finishCluster();
    return result;
  }

  function renderTimeGrid(dates) {
    const displayed = dates.flatMap(date => visibleByDate.get(date) ?? []);
    if (!displayed.length) return `<div class="empty-schedule">В этом периоде занятий нет.</div>`;
    const startMinute = Math.min(7 * 60, ...displayed.map(event => Math.floor(minute(event.start) / 60) * 60));
    const endMinute = Math.max(22 * 60, ...displayed.map(event => Math.ceil(eventEndMinute(event) / 60) * 60));
    const hourHeight = 72;
    const bodyHeight = (endMinute - startMinute) / 60 * hourHeight;
    const hours = [];
    for (let value = startMinute; value <= endMinute; value += 60) hours.push(value);
    const heads = dates.map(date => {
      const day = daysByDate.get(date);
      return `<div class="timeline__day"><span>${dayNames[day?.weekday ?? 0]}</span><strong>${escapeHtml(formatDate(date))}</strong>${day?.status ? `<small>${escapeHtml(day.status)}</small>` : ""}</div>`;
    }).join("");
    const labels = hours.map(value => {
      const top = (value - startMinute) / 60 * hourHeight;
      const label = `${String(Math.floor(value / 60)).padStart(2, "0")}:00`;
      return `<span style="top:${top}px">${label}</span>`;
    }).join("");
    const lanes = dates.map(date => {
      const entries = layoutDayEvents(visibleByDate.get(date) ?? []);
      const cards = entries.map(({ event, column, columns }) => {
        const top = (minute(event.start) - startMinute) / 60 * hourHeight;
        const height = Math.max(28, (eventEndMinute(event) - minute(event.start)) / 60 * hourHeight - 2);
        const left = column / columns * 100;
        const width = 100 / columns;
        return `<div class="timeline-event" style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px)">${eventCard(event)}</div>`;
      }).join("");
      return `<div class="timeline__lane" style="--hour-height:${hourHeight}px">${cards}</div>`;
    }).join("");
    return `<div class="timeline-scroll"><div class="timeline" style="--day-count:${dates.length}"><div class="timeline__header"><div class="timeline__corner">ВРЕМЯ</div>${heads}</div><div class="timeline__body" style="height:${bodyHeight}px"><div class="timeline__axis">${labels}</div>${lanes}</div></div></div>`;
  }

  function monthGridDates(month) {
    const [year, number] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, number - 1, 1));
    const last = new Date(Date.UTC(year, number, 0));
    const offset = (first.getUTCDay() + 6) % 7;
    const total = Math.ceil((offset + last.getUTCDate()) / 7) * 7;
    const firstCell = new Date(Date.UTC(year, number - 1, 1 - offset));
    return Array.from({ length: total }, (_, index) => isoDate(new Date(firstCell.getTime() + index * 86400000)));
  }

  function renderDayDetail() {
    const day = daysByDate.get(state.selectedDay);
    const events = visibleByDate.get(state.selectedDay) ?? [];
    return `<section class="day-detail" aria-label="Выбранный день">
      <div class="day-detail__head"><h3>${escapeHtml(formatDate(state.selectedDay, { weekday: "long", day: "numeric", month: "long" }))}</h3><span>${events.length} ${events.length === 1 ? "пара" : "занятий"}${day?.status ? ` · ${escapeHtml(day.status)}` : ""}</span></div>
      ${renderTimeGrid([state.selectedDay])}
    </section>`;
  }

  function renderMonth() {
    const month = months[state.monthIndex];
    const calendar = monthGridDates(month);
    elements.calendar.innerHTML = `<div class="month-grid">${dayNamesShort.map(name => `<div class="month-weekday">${name}</div>`).join("")}${calendar.map(date => {
      const events = visibleByDate.get(date) ?? [];
      const dayConflicts = conflicts.byDate.get(date) ?? [];
      const outside = !date.startsWith(month);
      const classes = ["month-day", outside ? "month-day--outside" : "", date === state.selectedDay ? "month-day--selected" : "", dayConflicts.length ? "month-day--conflict" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" type="button" data-day="${date}" aria-label="${escapeHtml(`${formatDate(date)}, занятий: ${events.length}, возможных пересечений: ${dayConflicts.length}`)}">
        <span class="month-day__top"><span class="month-day__date">${Number(date.slice(-2))}</span>${dayConflicts.length ? `<span class="month-day__alert">! ${dayConflicts.length}</span>` : ""}</span>
        <span class="month-day__events">${events.slice(0, 3).map(event => `<span class="month-mini month-mini--${event.source}">${escapeHtml(event.title)}</span>`).join("")}</span>
        ${events.length > 3 ? `<span class="month-day__more">+ ещё ${events.length - 3}</span>` : ""}
        <span class="month-dots">${events.slice(0, 8).map(event => `<i style="--source-color:var(--${event.source === "second" ? "second" : event.source === "retake" || event.source === "alternate" ? "retake" : event.source === "sport" ? "sport" : "uvt"})"></i>`).join("")}</span>
      </button>`;
    }).join("")}</div>${renderDayDetail()}`;
  }

  function renderConflicts() {
    const pairs = periodConflicts();
    elements.conflicts.innerHTML = `<div class="conflicts-head"><div><p class="eyebrow">ВРЕМЯ / СОВПАДЕНИЯ</p><h2 id="conflicts-title">Пересечения</h2></div><span>${pairs.length} в выбранном периоде</span></div>${pairs.length ?
      `<div class="conflict-grid">${pairs.map(pair => `<article class="conflict-card"><span class="conflict-card__date">${escapeHtml(formatDate(pair.date, { weekday: "long", day: "numeric", month: "long" }))} · ${pair.possible ? "ВОЗМОЖНОЕ" : "ПОДТВЕРЖДЁННОЕ"}</span><div class="conflict-card__pair"><b>${escapeHtml(pair.first.start)}</b><span>${escapeHtml(pair.first.title)}</span><b>${escapeHtml(pair.second.start)}</b><span>${escapeHtml(pair.second.title)}</span></div><p class="conflict-card__reason">${pair.possible ? "Конец занятия второго университета неизвестен. Проверь фактическую длительность." : "Время занятий пересекается."}</p></article>`).join("")}</div>` :
      `<div class="conflicts-empty">В выбранном периоде пересечений нет.</div>`}`;
  }

  function renderSummary() {
    const dates = periodDates();
    const appointments = dates.flatMap(date => visibleByDate.get(date) ?? []);
    const pairs = periodConflicts();
    const withEvents = dates.filter(date => (visibleByDate.get(date) ?? []).length > 0).length;
    elements.summary.innerHTML = `<div class="summary-item"><strong>${appointments.length}</strong><span>занятий в периоде</span></div><div class="summary-item${pairs.length ? " summary-item--alert" : ""}"><strong>${pairs.length}</strong><span>пересечений для проверки</span></div><div class="summary-item"><strong>${withEvents}</strong><span>дней с занятиями</span></div>`;
  }

  function weekOption(week, index) {
    const label = `${index + 1}. ${formatDate(week.start)} — ${formatDate(week.end)}${week.parity ? ` · ${week.parity === "odd" ? "нечётная" : "чётная"}` : ""}`;
    return `<option value="${index}">${escapeHtml(label)}</option>`;
  }

  function renderControls() {
    const isWeek = state.view === "week";
    elements.weekView.setAttribute("aria-pressed", String(isWeek));
    elements.monthView.setAttribute("aria-pressed", String(!isWeek));
    const index = isWeek ? state.weekIndex : state.monthIndex;
    const max = isWeek ? data.weeks.length - 1 : months.length - 1;
    elements.previous.disabled = index === 0;
    elements.next.disabled = index === max;
    elements.periodKicker.textContent = isWeek ? `НЕДЕЛЯ ${index + 1} / ${data.weeks.length}` : "МЕСЯЦ";
    elements.periodLabel.textContent = isWeek ? `${formatDate(data.weeks[index].start)} — ${formatDate(data.weeks[index].end)}` :
      formatDate(`${months[index]}-01`, { month: "long", year: "numeric" });
    elements.periodSelect.innerHTML = isWeek ? data.weeks.map(weekOption).join("") :
      months.map((month, q) => `<option value="${q}">${escapeHtml(formatDate(`${month}-01`, { month: "long", year: "numeric" }))}</option>`).join("");
    elements.periodSelect.value = String(index);
  }

  const attendanceNames = ["PTS", "OS", "Базы данных", "GTC", "PIII", "ES", "IP", "Немецкий", "Математика · долг", "Архитектура · долг", "Физкультура"];
  function attendanceName(event) {
    if (event.source === "sport") return "Физкультура";
    if (event.source === "retake") return event.title.startsWith("Математика") ? "Математика · долг" : "Архитектура · долг";
    if (event.title === "Немецкий") return "Немецкий";
    if (event.title.includes("Базы данных")) return "Базы данных";
    return event.title.split(/[ ,(]/)[0];
  }
  let progressData;
  try {
    const saved = JSON.parse(localStorage.getItem("timetable-progress-v1") ?? "{}");
    progressData = { attendance: saved.attendance ?? {}, completed: saved.completed ?? {} };
  } catch { progressData = { attendance: {}, completed: {} }; }
  function saveProgress() {
    try { localStorage.setItem("timetable-progress-v1", JSON.stringify(progressData)); }
    catch { document.getElementById("storage-note").textContent = "Браузер не разрешил сохранить отметки."; }
  }
  function renderProgress() {
    const attendance = attendanceNames.map(name => {
      const count = Math.max(0, Number(progressData.attendance[name]) || 0);
      const planned = data.events.filter(event => event.source !== "second" && attendanceName(event) === name).length;
      return `<div class="attendance-row"><div><strong>${escapeHtml(name)}</strong><small>Запланировано: ${planned}</small></div><div class="counter"><button type="button" data-count-name="${escapeHtml(name)}" data-delta="-1" aria-label="Уменьшить: ${escapeHtml(name)}">−</button><output>${count}</output><button type="button" data-count-name="${escapeHtml(name)}" data-delta="1" aria-label="Увеличить: ${escapeHtml(name)}">+</button></div></div>`;
    }).join("");
    const works = data.courses.map(course => {
      const items = data.workItems.filter(item => item.code === course.code);
      const done = items.filter(item => progressData.completed[item.id]).length;
      return `<article class="work-course"><div class="work-course__head"><div><span class="eyebrow">${escapeHtml(course.code)} · ${escapeHtml(course.teacher)}</span><h4>${escapeHtml(course.name)}</h4></div><strong>${done} / ${items.length}</strong></div>${items.length ? `<div class="work-items">${items.map(item => `<label class="work-item"><input type="checkbox" data-work-id="${escapeHtml(item.id)}"${progressData.completed[item.id] ? " checked" : ""}><span>${escapeHtml(item.type)} ${item.number}${item.note ? ` <small title="${escapeHtml(item.note)}">(?)</small>` : ""}</span></label>`).join("")}</div>` : `<p class="no-works">Лабораторных, практических и тестов в списке нет.</p>`}</article>`;
    }).join("");
    const completed = data.workItems.filter(item => progressData.completed[item.id]).length;
    elements.progressContent.innerHTML = `<div class="progress-summary"><span>ХНУРЕ: <strong>${completed} / ${data.workItems.length}</strong> работ</span><span id="storage-note">Отметки сохраняются на этом устройстве.</span></div><div class="progress-section"><div class="progress-section__head"><p class="eyebrow">UVT</p><h3>Посещения</h3></div><div class="attendance-list">${attendance}</div></div><div class="progress-section"><div class="progress-section__head"><p class="eyebrow">ХНУРЕ</p><h3>Работы</h3></div><div class="work-grid">${works}</div></div>`;
  }

  function updateAddress() {
    const url = new URL(location.href);
    url.searchParams.set("mode", state.mode);
    url.searchParams.set("view", state.view);
    url.searchParams.set("date", state.view === "week" ? data.weeks[state.weekIndex].start : state.selectedDay);
    if (state.showOptional) url.searchParams.set("alternates", "1");
    else url.searchParams.delete("alternates");
    history.replaceState(null, "", url);
  }

  function render() {
    for (const mode of ["schedule", "progress"])
      document.getElementById(`mode-${mode}`).setAttribute("aria-pressed", String(state.mode === mode));
    const progressMode = state.mode === "progress";
    elements.planner.hidden = progressMode;
    elements.conflicts.hidden = progressMode;
    elements.method.hidden = progressMode;
    elements.progress.hidden = !progressMode;
    if (progressMode) renderProgress();
    else {
      document.getElementById("planner-title").textContent = "Расписание";
      document.getElementById("source-toggles").hidden = false;
      document.getElementById("optional-explainer").hidden = !state.showOptional;
      document.getElementById("toggle-uvt").setAttribute("aria-pressed", String(state.showUvt));
      document.getElementById("toggle-second").setAttribute("aria-pressed", String(state.showSecond));
      document.getElementById("toggle-optional").setAttribute("aria-pressed", String(state.showOptional));
      selectEvents();
      renderControls();
      renderSummary();
      if (state.view === "week") renderWeek();
      else renderMonth();
      renderConflicts();
    }
    updateAddress();
  }

  function movePeriod(change) {
    if (state.view === "week") {
      state.weekIndex = Math.max(0, Math.min(data.weeks.length - 1, state.weekIndex + change));
      state.selectedDay = data.weeks[state.weekIndex].start;
    }
    else {
      state.monthIndex = Math.max(0, Math.min(months.length - 1, state.monthIndex + change));
      if (!state.selectedDay.startsWith(months[state.monthIndex])) state.selectedDay = `${months[state.monthIndex]}-01`;
    }
    render();
  }

  function openEvent(id) {
    const event = [...data.events, ...data.optionalRetakes].find(item => item.id === id);
    if (!event) return;
    const related = conflicts?.byEvent.get(id) ?? [];
    const warning = related.length ? `<p class="event-dialog__warning">${related.some(pair => !pair.possible) ? "Подтверждённое пересечение" : "Возможное пересечение"}: ${related.map(pair => escapeHtml((pair.first.id === id ? pair.second : pair.first).title)).join(", ")}.</p>` : "";
    elements.dialogContent.innerHTML = `<p class="eyebrow">${escapeHtml(sourceNames[event.source])} / ${escapeHtml(formatDate(event.date, { weekday: "long", day: "numeric", month: "long" }))}</p><h2 id="dialog-title">${escapeHtml(event.title)}</h2><p class="event-dialog__time">${escapeHtml(eventTime(event))}</p>${event.note ? `<p class="event-dialog__warning">${escapeHtml(event.note)}</p>` : ""}${warning}${!event.end ? `<p>Для ХНУРЕ указано только время начала.</p>` : ""}`;
    elements.dialog.showModal();
  }

  for (const mode of ["schedule", "progress"])
    document.getElementById(`mode-${mode}`).addEventListener("click", () => { state.mode = mode; render(); });
  document.getElementById("toggle-uvt").addEventListener("click", () => { state.showUvt = !state.showUvt; render(); });
  document.getElementById("toggle-second").addEventListener("click", () => { state.showSecond = !state.showSecond; render(); });
  document.getElementById("toggle-optional").addEventListener("click", () => { state.showOptional = !state.showOptional; render(); });
  elements.weekView.addEventListener("click", () => { state.view = "week"; state.weekIndex = findWeek(state.selectedDay); render(); });
  elements.monthView.addEventListener("click", () => { state.view = "month"; state.monthIndex = Math.max(0, months.indexOf(state.selectedDay.slice(0, 7))); render(); });
  elements.previous.addEventListener("click", () => movePeriod(-1));
  elements.next.addEventListener("click", () => movePeriod(1));
  elements.today.addEventListener("click", () => {
    state.selectedDay = today < data.meta.start ? data.meta.start : today > data.meta.end ? data.meta.end : today;
    state.weekIndex = findWeek(state.selectedDay);
    state.monthIndex = Math.max(0, months.indexOf(state.selectedDay.slice(0, 7)));
    render();
  });
  elements.periodSelect.addEventListener("change", () => {
    const index = Number(elements.periodSelect.value);
    if (state.view === "week") {
      state.weekIndex = index;
      state.selectedDay = data.weeks[index].start;
    }
    else { state.monthIndex = index; state.selectedDay = `${months[index]}-01`; }
    render();
  });
  elements.calendar.addEventListener("click", event => {
    const card = event.target.closest("[data-event-id]");
    if (card) { openEvent(card.dataset.eventId); return; }
    const day = event.target.closest("[data-day]");
    if (day) {
      state.selectedDay = day.dataset.day;
      if (!state.selectedDay.startsWith(months[state.monthIndex]) && months.includes(state.selectedDay.slice(0, 7))) {
        state.monthIndex = months.indexOf(state.selectedDay.slice(0, 7));
      }
      render();
    }
  });
  elements.progressContent.addEventListener("click", event => {
    const button = event.target.closest("[data-count-name]");
    if (!button) return;
    const name = button.dataset.countName;
    progressData.attendance[name] = Math.max(0, (Number(progressData.attendance[name]) || 0) + Number(button.dataset.delta));
    saveProgress();
    renderProgress();
  });
  elements.progressContent.addEventListener("change", event => {
    const input = event.target.closest("[data-work-id]");
    if (!input) return;
    progressData.completed[input.dataset.workId] = input.checked;
    saveProgress();
    renderProgress();
  });
  elements.dialogClose.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", event => { if (event.target === elements.dialog) elements.dialog.close(); });
  document.addEventListener("keydown", event => {
    if (event.target.closest("button, select, dialog, input, textarea") || state.mode === "progress") return;
    if (event.key === "ArrowLeft") movePeriod(-1);
    if (event.key === "ArrowRight") movePeriod(1);
  });

  render();
})();
