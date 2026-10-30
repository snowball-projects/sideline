import { rows, shortName, searchTeam, restoreSelections } from "./field.mjs";
const $ = (id) => document.getElementById(id);
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const button = (text, action, className) => {
  const el = node("button", text, className);
  el.type = "button";
  el.addEventListener("click", action);
  return el;
};
const link = (text, url) => {
  const el = node("a", text);
  el.href = url;
  el.target = "_blank";
  el.rel = "noreferrer";
  return el;
};
const localTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not supplied";
const storageKey = "sideline.teams.v1";
let data,
  week,
  selected = [],
  opener;
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selected));
  } catch {}
}
function closeSearch() {
  $("results").hidden = true;
  $("search").setAttribute("aria-expanded", "false");
}
function popup(title, content, control) {
  opener = control;
  $("popup-content").replaceChildren(node("h2", title));
  $("popup-content").firstElementChild.id = "popup-title";
  $("popup-content").append(content);
  $("popup").showModal();
}
$("close-popup").addEventListener("click", () => $("popup").close());
$("popup").addEventListener("click", (event) => {
  if (event.target === $("popup")) {
    const box = $("popup").getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      $("popup").close();
  }
});
$("popup").addEventListener("close", () => {
  // Preserve focus if another interaction started before this queued event.
  if (!$("popup").open && document.activeElement === document.body)
    opener?.isConnected && opener.focus();
});
function playerPopup(group, control, report) {
  const player = group.players[0],
    content = node("div"),
    details = node("dl");
  const absent = report ? "Not listed" : "No injury report yet";
  for (const [label, value] of [
    ["Injury", player.injury?.injury || absent],
    ["Game status", player.injury?.game || absent],
    ["Practice status", player.injury?.practice || absent],
  ])
    details.append(node("dt", label), node("dd", value));
  content.append(details, node("h3", "Backups"));
  const list = node("ul");
  for (const backup of group.players.slice(1)) {
    const status = backup.injury
      ? [backup.injury.game, backup.injury.practice].join(" · ")
      : absent;
    list.append(node("li", `${backup.name} · ${group.position} · ${status}`));
  }
  content.append(group.players.length > 1 ? list : node("p", "None listed"));
  popup(`${player.name} · ${group.position}`, content, control);
}
function field(unit, side, report) {
  const half = node("section", undefined, `field-half ${side}`);
  half.setAttribute(
    "aria-label",
    side === "offense" ? "Offense on the field" : "Opponent defense",
  );
  if (!unit.length)
    half.append(node("p", "Starters unavailable", "field-empty"));
  for (const groups of rows(unit, side)) {
    const row = node("div", undefined, "field-row");
    for (const group of groups) {
      const player = group.players[0],
        control = button(
          undefined,
          () => playerPopup(group, control, report),
          "player",
        );
      const badges = report ? player.injury?.badges || [] : [];
      control.setAttribute(
        "aria-label",
        `${player.name}, ${group.position}${badges.length ? ", " + badges.join(", ") : ""}${player.star ? ", league top 10 defender" : ""}`,
      );
      control.append(
        node("span", shortName(player.name), "player-name"),
        node("span", group.position, "position"),
      );
      const status = node("span", undefined, "badges");
      for (const badge of badges) status.append(node("span", badge, "badge"));
      if (player.star) {
        const star = node("span", "★", "star");
        star.setAttribute("aria-label", "League top 10 defender");
        status.append(star);
      }
      control.append(status);
      row.append(control);
    }
    half.append(row);
  }
  return half;
}
function teamHeading(team, side) {
  const section = node("div", undefined, "team-heading"),
    asset = data.teams[team],
    image = node("img");
  image.src = asset.url;
  image.alt = "";
  image.width = 48;
  image.height = 48;
  const labels = node("div");
  labels.append(node("p", side, "eyebrow"), node("h2", asset.name));
  section.append(image, labels);
  return section;
}
function stats(record, side) {
  const section = node("section", undefined, `stats ${side}-stats`);
  section.setAttribute(
    "aria-label",
    side === "offense" ? "Offense statistics" : "Defense statistics",
  );
  const labels =
    side === "offense"
      ? ["Points / game", "Yards / game", "Sacks taken", "Turnovers lost"]
      : [
          "Points allowed / game",
          "Yards allowed / game",
          "Sacks made",
          "Turnovers forced",
        ];
  labels.forEach((label, index) => {
    const metric = record?.[side][index],
      item = node("div", undefined, "metric");
    item.append(
      node("span", label, "metric-label"),
      node(
        "strong",
        metric
          ? metric.value.toLocaleString(undefined, {
              maximumFractionDigits: index < 2 ? 1 : 0,
            })
          : "—",
      ),
      node(
        "span",
        metric ? `${metric.tied ? "T" : ""}#${metric.rank}` : "No prior games",
        "rank",
      ),
    );
    section.append(item);
  });
  return section;
}
function renderCards() {
  const cards = $("cards");
  cards.replaceChildren();
  $("message").textContent = selected.length
    ? `${selected.length} of 6 cards`
    : "No teams selected";
  for (const team of selected) {
    const own = week.teams[team],
      other = own.opponent && week.teams[own.opponent],
      card = node("article", undefined, "card");
    card.setAttribute(
      "aria-label",
      `${data.teams[team].name} offense${other ? " against " + data.teams[own.opponent].name : own.bye ? ", Bye" : ""}`,
    );
    const heading = teamHeading(team, "Offense"),
      remove = button(
        "×",
        () => {
          const index = selected.indexOf(team);
          selected = selected.filter((value) => value !== team);
          save();
          renderCards();
          (
            $("cards").children[
              Math.min(index, selected.length - 1)
            ]?.querySelector(".remove") || $("search")
          ).focus();
        },
        "remove",
      );
    remove.setAttribute("aria-label", `Remove ${data.teams[team].name}`);
    heading.append(remove);
    const notice = node(
      "p",
      !own.report || (other && !other.report) ? "No injury report yet" : "",
      "report-notice",
    );
    card.append(
      heading,
      stats(own.stats, "offense"),
      notice,
      field(own.offense, "offense", own.report),
      node("div", "Line of scrimmage", "scrimmage"),
    );
    if (other)
      card.append(
        field(other.defense, "defense", other.report),
        stats(other.stats, "defense"),
        teamHeading(own.opponent, "Defense"),
      );
    else {
      card.append(
        node("div", own.bye ? "Bye" : "Opponent unavailable", "bye"),
        node("div", undefined, "empty-stats"),
        node("div", undefined, "empty-heading"),
      );
    }
    cards.append(card);
  }
}
function add(team) {
  if (!selected.includes(team)) {
    if (selected.length === 6) return;
    selected.push(team);
    save();
    renderCards();
  }
  $("search").value = "";
  closeSearch();
  $("cards").children[selected.indexOf(team)]?.querySelector(".remove").focus();
}
function search() {
  const query = $("search").value.trim().toLowerCase(),
    results = $("results");
  results.replaceChildren();
  if (!query || !data) {
    closeSearch();
    return;
  }
  const choices = [];
  for (const [team, asset] of Object.entries(data.teams))
    if (`${team} ${asset.name}`.toLowerCase().includes(query))
      choices.push({ team, label: asset.name });
  for (const player of data.players)
    if (
      `${player.name} ${player.team} ${player.position}`
        .toLowerCase()
        .includes(query)
    ) {
      const team = searchTeam(player, week);
      choices.push({
        team,
        label: `${player.name} · ${player.position} · ${player.team}${!team ? (week.teams[player.team]?.bye ? " · Bye" : " · Opponent unavailable") : ""}`,
      });
    }
  for (const choice of choices.slice(0, 24)) {
    const control = button(choice.label, () => add(choice.team));
    control.disabled =
      !choice.team ||
      (selected.length === 6 && !selected.includes(choice.team));
    results.append(control);
  }
  if (!choices.length) results.append(node("p", "No matches"));
  results.hidden = false;
  $("search").setAttribute("aria-expanded", "true");
}
$("search").addEventListener("input", search);
$("search").addEventListener("focus", search);
$("search").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    search();
    $("results").querySelector("button:not(:disabled)")?.focus();
  }
  if (event.key === "Escape") closeSearch();
});
$("results").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("search").focus();
    closeSearch();
    return;
  }
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const choices = [...$("results").querySelectorAll("button:not(:disabled)")],
    index =
      choices.indexOf(document.activeElement) +
      (event.key === "ArrowDown" ? 1 : -1);
  if (index < 0) $("search").focus();
  else choices[Math.min(index, choices.length - 1)]?.focus();
});
for (const type of ["pointerdown", "focusin"])
  document.addEventListener(type, (event) => {
    if (!event.target.closest(".search-area")) closeSearch();
  });
$("week").addEventListener("change", () => {
  week = data.weeks.find((week) => week.week === +$("week").value);
  renderCards();
  search();
});
$("info").addEventListener("click", () => {
  const content = node("div");
  if (!data) content.append(node("p", "Weekly data unavailable"));
  else {
    content.append(
      node(
        "p",
        `Collected ${localTime(data.generated_at)}. Statistics through ${week.stats_through ? "week " + week.stats_through : "no prior games"}.`,
      ),
    );
    content.append(
      node(
        "p",
        "Statistics use complete regular-season weeks before the selected week. Points include all schedule scores; net yards include sack yards lost. Sacks and turnovers are totals. Ranks use competition ties. ★ marks a top-10 defender in tackles, sacks or interceptions, including ties, after player totals reconcile to team totals.",
      ),
    );
    content.append(
      node(
        "p",
        "A report is available only when the source has injury rows for that team and week. Missing entries do not establish health. The source supplies no report publication dates, and does not distinguish an absent report from a report with no listed injuries.",
      ),
    );
    content.append(
      node(
        "p",
        "Starters are first in each formation slot, with backups in source depth order. Charts are the latest observations inside the selected week before kickoff. Missing historical or future observations remain unavailable. A depth chart does not confirm game participation. Bye charts use the same week window.",
      ),
    );
    for (const source of data.sources) {
      const section = node("section");
      section.append(
        link(source.label, source.url),
        node(
          "p",
          `File updated ${localTime(source.source_updated_at)} · collected ${localTime(source.retrieved_at)} · checked ${source.checked_on}`,
        ),
      );
      content.append(section);
    }
    content.append(
      link("nflverse data · CC BY 4.0", data.sources[0].terms_url),
      node(
        "p",
        "sideline filters and joins nflverse records and calculates pre-week statistics. No endorsement or warranties. Software: MIT. Original data: CC0. Team marks retain their owners’ rights.",
      ),
    );
    const logos = node("details");
    logos.append(node("summary", "Team logo sources and licenses"));
    for (const asset of Object.values(data.teams)) {
      const item = node("p");
      item.append(
        link(asset.name, asset.source),
        node("span", ` · ${asset.license} · checked ${asset.reviewed_at} · `),
        link("License", asset.license_url),
      );
      logos.append(item);
    }
    content.append(
      logos,
      link("Full credits", "THIRD-PARTY-NOTICES.md"),
      document.createTextNode(" · "),
      link("Software license", "LICENSE"),
    );
  }
  popup("Sources and licenses", content, $("info"));
});
async function load() {
  try {
    const response = await fetch("./current.json");
    if (!response.ok) throw new Error("Data unavailable");
    data = await response.json();
    const now = Date.now();
    week =
      data.weeks.find(
        (week) =>
          Date.parse(week.starts_at) <= now && now < Date.parse(week.ends_at),
      ) ||
      data.weeks.find((week) => Date.parse(week.starts_at) > now) ||
      data.weeks.at(-1);
    try {
      selected = restoreSelections(
        JSON.parse(localStorage.getItem(storageKey)),
        data.teams,
      );
    } catch {}
    for (const entry of data.weeks) {
      const option = node("option", entry.label);
      option.value = entry.week;
      $("week").append(option);
    }
    $("week").firstElementChild.remove();
    $("week").value = week.week;
    $("week").disabled = false;
    $("search").disabled = false;
    $("injury-updated").textContent =
      `Injury data updated: ${localTime(data.injury_updated_at)}`;
    renderCards();
  } catch {
    $("message").textContent = "Weekly data unavailable";
  }
}
load();
