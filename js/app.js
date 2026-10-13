"use strict";

const API_BASE = "https://pokeapi.co/api/v2";
const FIRST_GEN_III_ID = 252;
const LAST_GEN_III_ID = 386;
const CACHE_KEY = "hoenn-lab-pokemon-v1";
const TEAM_KEY = "hoenn-lab-team-v1";
const TEAMS_KEY = "hoenn-lab-teams-v1";
const PRIORITY_KEY = "hoenn-lab-priorities-v1";
const MAX_TEAMS = 5;
const MAX_TEAM_NAME_LENGTH = 24;
const STAT_KEYS = ["hp", "attack", "defense", "special-attack", "special-defense", "speed"];
const STAT_LABELS = {
  hp: "PS",
  attack: "ATQ",
  defense: "DEF",
  "special-attack": "AT.ESP",
  "special-defense": "DEF.ESP",
  speed: "VEL"
};
const STAT_NAMES = {
  hp: "PS",
  attack: "Ataque",
  defense: "Defensa",
  "special-attack": "At. esp.",
  "special-defense": "Def. esp.",
  speed: "Velocidad"
};
const PRIORITY_TARGET_PERCENTILES = { low: 50, normal: 75, high: 90 };
const PRIORITY_WEIGHTS = { low: 0.6, normal: 1, high: 1.5 };
const TYPE_DUPLICATE_PENALTY = 4;
const MAX_TYPE_PENALTY = 24;
const TYPE_NAMES = {
  normal: "Normal", fighting: "Lucha", flying: "Volador", poison: "Veneno",
  ground: "Tierra", rock: "Roca", bug: "Bicho", ghost: "Fantasma",
  steel: "Acero", fire: "Fuego", water: "Agua", grass: "Planta",
  electric: "Eléctrico", psychic: "Psíquico", ice: "Hielo", dragon: "Dragón",
  dark: "Siniestro", fairy: "Hada"
};

const elements = {
  grid: document.querySelector("#pokemon-grid"),
  search: document.querySelector("#search-input"),
  typeFilter: document.querySelector("#type-filter"),
  roleFilter: document.querySelector("#role-filter"),
  resultCount: document.querySelector("#result-count"),
  loadStatus: document.querySelector("#load-status"),
  loadMessage: document.querySelector("#load-message"),
  errorMessage: document.querySelector("#error-message"),
  emptyState: document.querySelector("#empty-state"),
  retryContainer: document.querySelector("#retry-container"),
  retryButton: document.querySelector("#retry-button"),
  teamGrid: document.querySelector("#team-grid"),
  teamSummary: document.querySelector("#team-summary"),
  navTeamCount: document.querySelector("#nav-team-count"),
  navTeamName: document.querySelector("#nav-team-name"),
  activeTeamName: document.querySelector("#active-team-name"),
  savedTeamSelect: document.querySelector("#saved-team-select"),
  savedTeamCount: document.querySelector("#saved-team-count"),
  createTeamForm: document.querySelector("#create-team-form"),
  newTeamName: document.querySelector("#new-team-name"),
  createTeamButton: document.querySelector("#create-team-button"),
  renameTeamForm: document.querySelector("#rename-team-form"),
  renameTeamName: document.querySelector("#rename-team-name"),
  deleteTeamButton: document.querySelector("#delete-team-button"),
  teamManagerMessage: document.querySelector("#team-manager-message"),
  gradeValue: document.querySelector("#grade-value"),
  gradeLabel: document.querySelector("#grade-label"),
  evaluateTeamButton: document.querySelector("#evaluate-team-button"),
  teamAnalysis: document.querySelector("#team-analysis"),
  teamReport: document.querySelector("#team-report"),
  prioritySettings: document.querySelector("#priority-settings"),
  modalNumber: document.querySelector("#modal-number"),
  modalBody: document.querySelector("#modal-body")
};

const pokemonById = new Map();
const failedIds = new Set();
let teams = readTeams();
let activeTeamId = teams.activeId;
let teamIds = getActiveTeam().members;
let statPriorities = readPriorities();
let totalLoaded = 0;
let dexReady = false;

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (error) {
    console.warn("No se pudo leer la caché local de Pokémon.", error);
    return {};
  }
}

function normalizeTeamMembers(members) {
  if (!Array.isArray(members)) return [];
  return [...new Set(members.filter(id =>
    Number.isInteger(id) && id >= FIRST_GEN_III_ID && id <= LAST_GEN_III_ID
  ))].slice(0, 6);
}

function getActiveTeam() {
  return teams.teams.find(team => team.id === activeTeamId) || teams.teams[0];
}

function createTeamRecord(name, members = []) {
  return {
    id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    members: normalizeTeamMembers(members)
  };
}

function readTeams() {
  try {
    const saved = JSON.parse(localStorage.getItem(TEAMS_KEY) || "null");
    if (saved && Array.isArray(saved.teams)) {
      const validTeams = saved.teams
        .filter(team => team && typeof team.id === "string" && typeof team.name === "string")
        .slice(0, MAX_TEAMS)
        .map(team => ({
          id: team.id,
          name: team.name.trim().slice(0, MAX_TEAM_NAME_LENGTH) || "Equipo",
          members: normalizeTeamMembers(team.members)
        }));
      if (validTeams.length) {
        const activeId = validTeams.some(team => team.id === saved.activeId) ? saved.activeId : validTeams[0].id;
        return { teams: validTeams, activeId };
      }
    }

    const legacyTeam = normalizeTeamMembers(JSON.parse(localStorage.getItem(TEAM_KEY) || "[]"));
    const firstTeam = createTeamRecord("Mi equipo", legacyTeam);
    const migrated = { teams: [firstTeam], activeId: firstTeam.id };
    localStorage.setItem(TEAMS_KEY, JSON.stringify(migrated));
    localStorage.removeItem(TEAM_KEY);
    return migrated;
  } catch (error) {
    console.error("No se pudieron cargar o migrar los equipos guardados.", error);
    const firstTeam = createTeamRecord("Mi equipo");
    return { teams: [firstTeam], activeId: firstTeam.id };
  }
}

function readPriorities() {
  const defaults = Object.fromEntries(STAT_KEYS.map(stat => [stat, "normal"]));
  try {
    const saved = JSON.parse(localStorage.getItem(PRIORITY_KEY) || "{}");
    for (const stat of STAT_KEYS) {
      if (["low", "normal", "high"].includes(saved[stat])) defaults[stat] = saved[stat];
    }
  } catch (error) {
    console.warn("No se pudieron leer las prioridades guardadas.", error);
  }
  return defaults;
}

function persistTeam() {
  try {
    const activeTeam = getActiveTeam();
    activeTeam.members = [...teamIds];
    teams.activeId = activeTeamId;
    localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
  } catch (error) {
    console.error("No se pudieron guardar los equipos en este navegador.", error);
    showError("No se pudieron guardar los equipos en este navegador. Puede que el almacenamiento esté deshabilitado.");
  }
}

function persistTeams() {
  try {
    teams.activeId = activeTeamId;
    localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
    return true;
  } catch (error) {
    console.error("No se pudieron guardar los cambios de equipos.", error);
    showError("No se pudieron guardar los cambios de equipos en este navegador.");
    return false;
  }
}

function persistPriorities() {
  try {
    localStorage.setItem(PRIORITY_KEY, JSON.stringify(statPriorities));
  } catch (error) {
    console.error("No se pudieron guardar las prioridades.", error);
    showError("No se pudieron guardar tus prioridades en este navegador.");
  }
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove("d-none");
}

function hideError() {
  elements.errorMessage.classList.add("d-none");
  elements.errorMessage.textContent = "";
}

async function fetchPokemon(id, cache) {
  const cached = cache[id];
  if (cached && cached.id === id && Array.isArray(cached.types) && Array.isArray(cached.stats)) {
    return cached;
  }

  const response = await fetch(`${API_BASE}/pokemon/${id}`);
  if (!response.ok) throw new Error(`PokéAPI respondió ${response.status} para el Pokémon #${id}.`);
  const data = await response.json();
  const pokemon = {
    id: data.id,
    name: data.name,
    image: data.sprites.other?.["official-artwork"]?.front_default || data.sprites.front_default,
    types: data.types.map(item => item.type.name),
    stats: Object.fromEntries(data.stats.map(item => [item.stat.name, item.base_stat])),
    height: data.height,
    weight: data.weight,
    abilities: data.abilities.map(item => item.ability.name)
  };
  cache[id] = pokemon;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("No se pudo actualizar la caché local; la Pokédex seguirá funcionando durante esta sesión.", error);
  }
  return pokemon;
}

async function runPool(ids, cache) {
  let nextIndex = 0;
  const workerCount = Math.min(8, ids.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < ids.length) {
      const id = ids[nextIndex++];
      try {
        const pokemon = await fetchPokemon(id, cache);
        pokemonById.set(id, pokemon);
        failedIds.delete(id);
      } catch (error) {
        failedIds.add(id);
        console.error(`No se pudo cargar el Pokémon #${id}.`, error);
      } finally {
        totalLoaded += 1;
        elements.loadMessage.textContent = `Cargando datos de Hoenn… ${totalLoaded}/${LAST_GEN_III_ID - FIRST_GEN_III_ID + 1}`;
        renderPokemon();
        renderTeam();
      }
    }
  });
  await Promise.all(workers);
}

async function loadDex(ids = null) {
  const cache = readCache();
  const allIds = ids || Array.from({ length: LAST_GEN_III_ID - FIRST_GEN_III_ID + 1 }, (_, index) => FIRST_GEN_III_ID + index);
  totalLoaded = ids ? totalLoaded - ids.length : 0;
  elements.loadStatus.classList.remove("d-none");
  elements.loadStatus.querySelector(".spinner-border").classList.remove("d-none");
  elements.retryContainer.classList.add("d-none");
  hideError();
  await runPool(allIds, cache);

  const count = LAST_GEN_III_ID - FIRST_GEN_III_ID + 1;
  dexReady = true;
  if (failedIds.size) {
    elements.loadMessage.textContent = `Carga parcial: ${pokemonById.size}/${count} Pokémon disponibles.`;
    elements.retryContainer.classList.remove("d-none");
    showError(`${failedIds.size} Pokémon no respondieron. Puedes reintentar la carga; el resto de la Pokédex sigue disponible.`);
  } else {
    elements.loadMessage.textContent = `Pokédex lista · ${count} Pokémon de tercera generación`;
  }
  elements.loadStatus.querySelector(".spinner-border").classList.add("d-none");
  elements.typeFilter.disabled = false;
  elements.roleFilter.disabled = false;
  populateTypes();
  renderPokemon();
  renderTeam();
}

function populateTypes() {
  const selectedValue = elements.typeFilter.value;
  const typeNames = new Set([...pokemonById.values()].flatMap(pokemon => pokemon.types));
  elements.typeFilter.innerHTML = '<option value="">Todos los tipos</option>';
  [...typeNames]
    .sort((a, b) => (TYPE_NAMES[a] || a).localeCompare(TYPE_NAMES[b] || b, "es"))
    .forEach(type => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = TYPE_NAMES[type] || type;
      elements.typeFilter.append(option);
    });
  elements.typeFilter.value = selectedValue;
}

function getRole(pokemon) {
  const stats = pokemon.stats;
  const scores = [
    { role: "Atacante", score: (stats.attack + stats["special-attack"]) / 2 },
    { role: "Defensor", score: (stats.defense + stats["special-defense"]) / 2 },
    { role: "Ágil", score: stats.speed }
  ].sort((a, b) => b.score - a.score);
  if (scores[0].score - scores[1].score < 15) return "Equilibrado";
  return scores[0].role;
}

function makeTypeBadges(types) {
  return types.map(type => `<span class="type-badge">${escapeHTML(TYPE_NAMES[type] || type)}</span>`).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function getVisiblePokemon() {
  const query = elements.search.value.trim().toLocaleLowerCase("es");
  const selectedType = elements.typeFilter.value;
  const selectedRole = elements.roleFilter.value;
  return [...pokemonById.values()]
    .filter(pokemon => {
      const matchesQuery = !query || pokemon.name.includes(query) || String(pokemon.id).includes(query.replace(/^#/, ""));
      const matchesType = !selectedType || pokemon.types.includes(selectedType);
      const matchesRole = !selectedRole || getRole(pokemon) === selectedRole;
      return matchesQuery && matchesType && matchesRole;
    })
    .sort((a, b) => a.id - b.id);
}

function statMarkup(label, value) {
  const width = Math.min(100, Math.round(value / 180 * 100));
  return `<div class="stat-item"><div class="stat-label"><span>${label}</span><span>${value}</span></div><div class="stat-track"><div class="stat-fill" style="width:${width}%"></div></div></div>`;
}

function renderPokemon() {
  const visible = getVisiblePokemon();
  elements.resultCount.textContent = `${visible.length} Pokémon encontrados`;
  elements.grid.innerHTML = visible.map(pokemon => {
    const selected = teamIds.includes(pokemon.id);
    const atLimit = teamIds.length >= 6 && !selected;
    const image = pokemon.image || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`;
    const stats = STAT_KEYS.slice(0, 4).map(key => statMarkup(STAT_LABELS[key], pokemon.stats[key])).join("");
    return `<article class="pokemon-card">
      <div class="card-topline"><span>#${String(pokemon.id).padStart(3, "0")}</span><span>GEN 03</span></div>
      <img class="pokemon-image" src="${escapeHTML(image)}" alt="${escapeHTML(pokemon.name)}" loading="lazy">
      <h3 class="pokemon-name">${escapeHTML(pokemon.name)}</h3>
      <div class="type-list">${makeTypeBadges(pokemon.types)}</div>
      <div class="card-stats">${stats}</div>
      <div class="role-chip"><span>ROL SUGERIDO</span><strong>${getRole(pokemon)}</strong></div>
      <div class="card-actions">
        <button class="card-button" type="button" data-action="details" data-id="${pokemon.id}">Ver ficha</button>
        <button class="card-button add-button" type="button" data-action="team" data-id="${pokemon.id}" ${atLimit ? "disabled" : ""}>${selected ? "En equipo ✓" : "＋ Equipo"}</button>
      </div>
    </article>`;
  }).join("");
  elements.emptyState.classList.toggle("d-none", visible.length > 0);
}

function renderTeam() {
  const members = teamIds.map(id => pokemonById.get(id)).filter(Boolean);
  const activeTeam = getActiveTeam();
  elements.navTeamCount.textContent = `${teamIds.length}/6`;
  elements.navTeamName.textContent = activeTeam.name;
  elements.activeTeamName.textContent = activeTeam.name;
  elements.teamSummary.textContent = `${teamIds.length} de 6 integrantes`;
  const slots = Array.from({ length: 6 }, (_, index) => {
    const pokemon = members[index];
    if (!pokemon) {
      return `<div class="team-slot"><span aria-hidden="true">＋</span><span>Espacio ${index + 1}</span></div>`;
    }
    const image = pokemon.image || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`;
    return `<div class="team-slot filled">
      <button class="remove-member" type="button" data-action="remove" data-id="${pokemon.id}" aria-label="Quitar a ${escapeHTML(pokemon.name)} del equipo">×</button>
      <img src="${escapeHTML(image)}" alt="" loading="lazy">
      <strong>${escapeHTML(pokemon.name)}</strong>
      <span>${makeTypeBadges(pokemon.types)}</span>
    </div>`;
  }).join("");
  elements.teamGrid.innerHTML = slots;
  renderTeamManager();
  renderTeamAnalysis();
}

function renderTeamManager() {
  const activeTeam = getActiveTeam();
  elements.savedTeamSelect.innerHTML = "";
  teams.teams.forEach(team => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = `${team.name} (${team.members.length}/6)`;
    option.selected = team.id === activeTeamId;
    elements.savedTeamSelect.append(option);
  });
  elements.savedTeamCount.textContent = `${teams.teams.length} de ${MAX_TEAMS} equipos guardados`;
  elements.createTeamButton.disabled = teams.teams.length >= MAX_TEAMS;
  elements.newTeamName.disabled = teams.teams.length >= MAX_TEAMS;
  elements.deleteTeamButton.disabled = teams.teams.length <= 1;
  if (document.activeElement !== elements.renameTeamName) {
    elements.renameTeamName.value = activeTeam.name;
  }
}

function setTeamManagerMessage(message, isError = false) {
  elements.teamManagerMessage.textContent = message;
  elements.teamManagerMessage.classList.toggle("is-error", isError);
}

function getValidatedTeamName(value, excludedTeamId = null) {
  const name = value.trim();
  if (!name) return { error: "Escribe un nombre para el equipo." };
  if (name.length > MAX_TEAM_NAME_LENGTH) {
    return { error: `El nombre no puede superar ${MAX_TEAM_NAME_LENGTH} caracteres.` };
  }
  const alreadyExists = teams.teams.some(team =>
    team.id !== excludedTeamId && team.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es")
  );
  if (alreadyExists) return { error: "Ya existe un equipo con ese nombre." };
  return { name };
}

function createTeam(name) {
  if (teams.teams.length >= MAX_TEAMS) {
    setTeamManagerMessage(`El máximo es de ${MAX_TEAMS} equipos.`, true);
    return;
  }
  const validated = getValidatedTeamName(name);
  if (validated.error) {
    setTeamManagerMessage(validated.error, true);
    return;
  }
  const newTeam = createTeamRecord(validated.name);
  teams.teams.push(newTeam);
  activeTeamId = newTeam.id;
  teamIds = newTeam.members;
  if (!persistTeams()) return;
  elements.newTeamName.value = "";
  setTeamManagerMessage(`Equipo "${newTeam.name}" creado.`);
  renderPokemon();
  renderTeam();
}

function switchActiveTeam(id) {
  const team = teams.teams.find(savedTeam => savedTeam.id === id);
  if (!team || team.id === activeTeamId) return;
  activeTeamId = team.id;
  teamIds = team.members;
  if (!persistTeams()) return;
  setTeamManagerMessage(`Ahora editas "${team.name}".`);
  renderPokemon();
  renderTeam();
}

function renameActiveTeam(name) {
  const team = getActiveTeam();
  const validated = getValidatedTeamName(name, team.id);
  if (validated.error) {
    setTeamManagerMessage(validated.error, true);
    return;
  }
  team.name = validated.name;
  if (!persistTeams()) return;
  setTeamManagerMessage(`El equipo ahora se llama "${team.name}".`);
  renderTeam();
}

function deleteActiveTeam() {
  if (teams.teams.length <= 1) {
    setTeamManagerMessage("Debe quedar al menos un equipo guardado.", true);
    return;
  }
  const team = getActiveTeam();
  if (!window.confirm(`¿Borrar el equipo "${team.name}" y sus integrantes?`)) return;

  teams.teams = teams.teams.filter(savedTeam => savedTeam.id !== team.id);
  activeTeamId = teams.teams[0].id;
  teamIds = teams.teams[0].members;
  if (!persistTeams()) return;
  setTeamManagerMessage(`Equipo "${team.name}" borrado.`);
  renderPokemon();
  renderTeam();
}

function getTeamAverages(members) {
  return Object.fromEntries(STAT_KEYS.map(stat => [
    stat,
    members.reduce((total, pokemon) => total + pokemon.stats[stat], 0) / members.length
  ]));
}

function getStatBenchmarks() {
  const dex = [...pokemonById.values()];
  return Object.fromEntries(STAT_KEYS.map(stat => [
    stat,
    dex.map(pokemon => pokemon.stats[stat]).sort((a, b) => a - b)
  ]));
}

function getPercentileRank(distribution, value) {
  const lower = distribution.filter(candidate => candidate < value).length;
  const equal = distribution.filter(candidate => candidate === value).length;
  return (lower + equal / 2) / distribution.length * 100;
}

function getPercentileValue(distribution, percentile) {
  const index = Math.min(distribution.length - 1, Math.ceil(percentile / 100 * distribution.length) - 1);
  return distribution[Math.max(0, index)];
}

function getTypeBalance(members) {
  const counts = new Map();
  members.forEach(pokemon => {
    pokemon.types.forEach(type => counts.set(type, (counts.get(type) || 0) + 1));
  });
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || (TYPE_NAMES[a[0]] || a[0]).localeCompare(TYPE_NAMES[b[0]] || b[0], "es"));
  const repeatedSlots = duplicates.reduce((total, [, count]) => total + count - 1, 0);
  return {
    counts,
    duplicates,
    repeatedSlots,
    penalty: Math.min(repeatedSlots * TYPE_DUPLICATE_PENALTY, MAX_TYPE_PENALTY)
  };
}

function evaluateTeam(members, benchmarks) {
  const averages = getTeamAverages(members);
  let weightedAttainment = 0;
  let totalWeight = 0;
  const stats = {};

  for (const stat of STAT_KEYS) {
    const priority = statPriorities[stat];
    const targetPercentile = PRIORITY_TARGET_PERCENTILES[priority];
    const percentile = getPercentileRank(benchmarks[stat], averages[stat]);
    const target = getPercentileValue(benchmarks[stat], targetPercentile);
    const attainment = Math.min(percentile / targetPercentile, 1);
    const weight = PRIORITY_WEIGHTS[priority];
    weightedAttainment += attainment * weight;
    totalWeight += weight;
    stats[stat] = { average: averages[stat], percentile, target, targetPercentile, attainment, priority };
  }

  const statScore = weightedAttainment / totalWeight * 100;
  const typeBalance = getTypeBalance(members);
  return {
    score: Math.max(0, statScore - typeBalance.penalty),
    statScore,
    stats,
    typeBalance
  };
}

function getBaseStatTotal(pokemon) {
  return STAT_KEYS.reduce((total, stat) => total + pokemon.stats[stat], 0);
}

function getGrade(score) {
  if (score >= 95) return "A";
  if (score >= 85) return "B";
  if (score >= 75) return "C";
  if (score >= 65) return "D";
  return "E";
}

function getGradeDescription(score) {
  if (score >= 95) return "Balance sobresaliente";
  if (score >= 85) return "Muy buen equilibrio";
  if (score >= 75) return "Buen punto de partida";
  if (score >= 65) return "Hay stats por reforzar";
  return "Conviene revisar el equipo";
}

function renderStatAnalysis(stats) {
  return `<div class="stat-analysis-grid">${STAT_KEYS.map(stat => {
    const { average, percentile, target, targetPercentile, attainment, priority } = stats[stat];
    const percent = Math.round(attainment * 100);
    const status = attainment >= 1 ? "met" : attainment >= 0.85 ? "near" : "below";
    return `<div class="analysis-stat ${status}">
      <div class="analysis-stat-heading"><strong>${STAT_NAMES[stat]}</strong><span>Prom. ${average.toFixed(1)}</span></div>
      <div class="analysis-track"><div class="analysis-fill" style="width:${percent}%"></div></div>
      <span class="analysis-priority">Percentil ${Math.round(percentile)} · Meta P${targetPercentile} (${target}) · prioridad ${priority === "high" ? "alta" : priority === "low" ? "baja" : "normal"}</span>
    </div>`;
  }).join("")}</div>`;
}

function findRecommendations(members, benchmarks, currentEvaluation) {
  const currentIds = new Set(members.map(pokemon => pokemon.id));
  const bestByAddition = new Map();

  for (let index = 0; index < members.length; index += 1) {
    for (const candidate of pokemonById.values()) {
      if (currentIds.has(candidate.id)) continue;
      if (getBaseStatTotal(candidate) > getBaseStatTotal(members[index])) continue;
      const replacement = [...members];
      replacement[index] = candidate;
      const evaluation = evaluateTeam(replacement, benchmarks);
      const improvement = evaluation.score - currentEvaluation.score;
      if (improvement <= 0.1) continue;

      const existing = bestByAddition.get(candidate.id);
      if (!existing || improvement > existing.improvement) {
        bestByAddition.set(candidate.id, {
          remove: members[index],
          add: candidate,
          evaluation,
          improvement
        });
      }
    }
  }

  return [...bestByAddition.values()]
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 3);
}

function describeTradeoff(recommendation) {
  const changes = STAT_KEYS.map(stat => ({
    stat,
    difference: recommendation.add.stats[stat] - recommendation.remove.stats[stat],
    priority: statPriorities[stat]
  }));
  const priorityRank = { high: 0, normal: 1, low: 2 };
  const gains = changes.filter(change => change.difference > 0)
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.difference - a.difference);
  const costs = changes.filter(change => change.difference < 0)
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.difference - b.difference);
  if (!gains.length) {
    const beforeTypes = getTypeBalance(teamIds.map(id => pokemonById.get(id)));
    const afterTypes = getTypeBalance(teamIds
      .filter(id => id !== recommendation.remove.id)
      .map(id => pokemonById.get(id))
      .concat(recommendation.add));
    return afterTypes.repeatedSlots < beforeTypes.repeatedSlots
      ? "Mejora la diversidad de tipos sin aumentar el total base de stats."
      : "Mejora la calificación al redistribuir el perfil de stats.";
  }

  const gain = gains[0];
  const cost = costs[0];
  const gainText = `sube ${STAT_NAMES[gain.stat]} (+${gain.difference}, prioridad ${gain.priority === "high" ? "alta" : gain.priority === "low" ? "baja" : "normal"})`;
  const statDescription = cost
    ? `${gainText} y sacrifica ${STAT_NAMES[cost.stat]} (${cost.difference}, prioridad ${cost.priority === "high" ? "alta" : cost.priority === "low" ? "baja" : "normal"}).`
    : `${gainText}; no reduce otra stat.`;
  const beforeTypes = getTypeBalance(teamIds.map(id => pokemonById.get(id)));
  const afterMembers = teamIds
    .filter(id => id !== recommendation.remove.id)
    .map(id => pokemonById.get(id))
    .concat(recommendation.add);
  const afterTypes = getTypeBalance(afterMembers);
  if (afterTypes.repeatedSlots < beforeTypes.repeatedSlots) {
    return `${statDescription} También mejora la diversidad de tipos.`;
  }
  return statDescription;
}

function renderRecommendations(members, benchmarks, evaluation) {
  const recommendations = findRecommendations(members, benchmarks, evaluation);
  if (!recommendations.length) {
    return `<div class="recommendations"><h4>Recomendación</h4><p>No encontramos un cambio que mejore la puntuación redistribuyendo stats sin aumentar el total base del integrante sustituido. Prueba ajustando las prioridades.</p></div>`;
  }

  return `<div class="recommendations">
    <h4>Intercambios que redistribuyen stats</h4>
    <ul>${recommendations.map(recommendation => `<li>
      <div class="suggestion-main">
        <span>Cambiar <strong>${escapeHTML(recommendation.remove.name)}</strong> por <strong>${escapeHTML(recommendation.add.name)}</strong></span>
        <span class="suggestion-score">+${recommendation.improvement.toFixed(1)} pts</span>
      </div>
      <small>${escapeHTML(describeTradeoff(recommendation))}</small>
      <button class="suggestion-apply" type="button" data-action="apply-suggestion" data-remove-id="${recommendation.remove.id}" data-add-id="${recommendation.add.id}">
        Aplicar intercambio
      </button>
    </li>`).join("")}</ul>
  </div>`;
}

function applyRecommendation(removeId, addId) {
  const removeIndex = teamIds.indexOf(removeId);
  const pokemonToAdd = pokemonById.get(addId);
  const pokemonToRemove = pokemonById.get(removeId);
  if (removeIndex === -1 || !pokemonToAdd || !pokemonToRemove || teamIds.includes(addId)) {
    showError("No se pudo aplicar el intercambio: el equipo cambió o la recomendación ya no está disponible.");
    renderTeam();
    return;
  }
  if (getBaseStatTotal(pokemonToAdd) > getBaseStatTotal(pokemonToRemove)) {
    showError("No se pudo aplicar el intercambio porque el Pokémon sugerido ya no cumple el límite de stats.");
    renderTeam();
    return;
  }

  teamIds[removeIndex] = addId;
  hideError();
  persistTeam();
  renderPokemon();
  renderTeam();
}

function renderTeamAnalysis() {
  if (!dexReady || pokemonById.size === 0) {
    elements.gradeValue.textContent = "—";
    elements.gradeLabel.textContent = "Cargando datos de la Pokédex";
    elements.teamAnalysis.innerHTML = '<p class="analysis-placeholder">Las metas se basan en los promedios de la Pokédex Gen III.</p>';
    elements.evaluateTeamButton.disabled = true;
    return;
  }

  const members = teamIds.map(id => pokemonById.get(id)).filter(Boolean);
  elements.evaluateTeamButton.disabled = members.length !== 6;
  if (members.length !== 6) {
    elements.gradeValue.textContent = "—";
    elements.gradeLabel.textContent = "Completa los seis espacios";
    elements.teamAnalysis.innerHTML = `<p class="analysis-placeholder">Añade ${6 - members.length} Pokémon más para evaluar los promedios de stats de tu equipo.</p>`;
    elements.evaluateTeamButton.textContent = "Evaluar equipo";
    return;
  }

  const benchmarks = getStatBenchmarks();
  const evaluation = evaluateTeam(members, benchmarks);
  elements.gradeValue.textContent = getGrade(evaluation.score);
  const typePenalty = evaluation.typeBalance.penalty;
  const penaltyLabel = typePenalty ? ` · −${typePenalty} por tipos repetidos` : "";
  elements.gradeLabel.textContent = `${Math.round(evaluation.score)} / 100${penaltyLabel} · ${getGradeDescription(evaluation.score)}`;
  elements.teamAnalysis.innerHTML = `${renderStatAnalysis(evaluation.stats)}<p class="recommendation-rule">Las metas se basan en percentiles de stats individuales de Gen III; las sugerencias no aumentan el total base del miembro que sale.</p>${renderRecommendations(members, benchmarks, evaluation)}`;
  if (document.querySelector("#team-evaluation-modal").classList.contains("show")) {
    renderTeamReport(evaluation);
  }
}

function renderTeamReport(evaluation) {
  const rankedStats = STAT_KEYS.map(stat => ({
    stat,
    average: evaluation.stats[stat].average
  })).sort((a, b) => b.average - a.average);
  const typeBalance = evaluation.typeBalance;
  const repeatedTypes = typeBalance.duplicates
    .sort((a, b) => b[1] - a[1] || (TYPE_NAMES[a[0]] || a[0]).localeCompare(TYPE_NAMES[b[0]] || b[0], "es"));
  const statRows = rankedStats.map((item, index) => `
    <li class="report-stat-row">
      <span class="report-rank">${index + 1}</span>
      <strong>${STAT_NAMES[item.stat]}</strong>
      <span class="report-stat-value">${item.average.toFixed(1)}</span>
    </li>`).join("");
  const typeRows = repeatedTypes.map(([type, count]) => `
    <li class="report-type-row">
      <span>${escapeHTML(TYPE_NAMES[type] || type)}</span>
      <strong>${count}</strong>
    </li>`).join("");

  document.querySelector("#team-evaluation-modal-title").textContent = `Datos · ${getActiveTeam().name}`;
  elements.teamReport.innerHTML = `<div class="report-columns">
      <section class="report-section">
        <h3>Stats · mayor a menor</h3>
        <p class="report-section-note">Promedio de cada stat entre los seis integrantes.</p>
        <ol class="report-stat-list">${statRows}</ol>
      </section>
      <section class="report-section">
        <h3>Tipos repetidos</h3>
        <p class="report-section-note">Recuento de integrantes que comparten cada tipo.</p>
        ${repeatedTypes.length
          ? `<ul class="report-type-list">${typeRows}</ul>`
          : '<p class="team-report-good">No hay tipos repetidos.</p>'}
      </section>
    </div>`;
}

function toggleTeam(id) {
  if (teamIds.includes(id)) {
    teamIds = teamIds.filter(memberId => memberId !== id);
  } else if (teamIds.length < 6) {
    teamIds.push(id);
  } else {
    showError("Tu equipo ya tiene seis integrantes. Quita uno antes de añadir otro.");
    return;
  }
  persistTeam();
  renderPokemon();
  renderTeam();
}

function showDetails(id) {
  const pokemon = pokemonById.get(id);
  if (!pokemon) return;
  elements.modalNumber.textContent = `ARCHIVO DE CAMPO / #${String(pokemon.id).padStart(3, "0")}`;
  const image = pokemon.image || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`;
  const allStats = STAT_KEYS.map(key => {
    const value = pokemon.stats[key];
    const width = Math.min(100, Math.round(value / 180 * 100));
    return `<div class="stat-row"><span>${STAT_LABELS[key]}</span><div class="stat-track"><div class="stat-fill" style="width:${width}%"></div></div><span class="stat-value">${value}</span></div>`;
  }).join("");
  elements.modalBody.innerHTML = `<div class="detail-heading">
      <img src="${escapeHTML(image)}" alt="${escapeHTML(pokemon.name)}">
      <div><h2 id="modal-title">${escapeHTML(pokemon.name)}</h2><div class="type-list">${makeTypeBadges(pokemon.types)}</div></div>
    </div>
    <div class="detail-measurements">
      <span>ALTURA<strong>${(pokemon.height / 10).toFixed(1)} m</strong></span>
      <span>PESO<strong>${(pokemon.weight / 10).toFixed(1)} kg</strong></span>
      <span>ROL<strong>${getRole(pokemon)}</strong></span>
    </div>
    <h3 class="eyebrow">ESTADÍSTICAS BASE</h3>
    <div class="detail-stats">${allStats}</div>
    <p class="mb-0 mt-3 text-secondary small">Habilidades: ${pokemon.abilities.map(escapeHTML).join(", ") || "No disponibles"}</p>`;
  bootstrap.Modal.getOrCreateInstance(document.querySelector("#pokemon-modal")).show();
}

elements.search.addEventListener("input", renderPokemon);
elements.typeFilter.addEventListener("change", renderPokemon);
elements.roleFilter.addEventListener("change", renderPokemon);
elements.grid.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === "team") toggleTeam(id);
  if (button.dataset.action === "details") showDetails(id);
});
elements.teamGrid.addEventListener("click", event => {
  const button = event.target.closest('button[data-action="remove"]');
  if (button) toggleTeam(Number(button.dataset.id));
});
elements.teamAnalysis.addEventListener("click", event => {
  const button = event.target.closest('button[data-action="apply-suggestion"]');
  if (!button) return;
  applyRecommendation(Number(button.dataset.removeId), Number(button.dataset.addId));
});
elements.teamReport.addEventListener("click", event => {
  const button = event.target.closest('button[data-action="apply-suggestion"]');
  if (!button) return;
  applyRecommendation(Number(button.dataset.removeId), Number(button.dataset.addId));
});
elements.savedTeamSelect.addEventListener("change", () => {
  switchActiveTeam(elements.savedTeamSelect.value);
});
elements.createTeamForm.addEventListener("submit", event => {
  event.preventDefault();
  createTeam(elements.newTeamName.value);
});
elements.renameTeamForm.addEventListener("submit", event => {
  event.preventDefault();
  renameActiveTeam(elements.renameTeamName.value);
});
elements.deleteTeamButton.addEventListener("click", deleteActiveTeam);
document.querySelector("#teams-modal").addEventListener("show.bs.modal", () => {
  setTeamManagerMessage("");
  renderTeamManager();
});
elements.prioritySettings.addEventListener("change", event => {
  const select = event.target.closest("select[data-stat-priority]");
  if (!select || !["low", "normal", "high"].includes(select.value)) return;
  statPriorities[select.dataset.statPriority] = select.value;
  persistPriorities();
  renderTeamAnalysis();
});
elements.evaluateTeamButton.addEventListener("click", () => {
  const members = teamIds.map(id => pokemonById.get(id)).filter(Boolean);
  if (!dexReady || members.length !== 6) return;
  renderTeamReport(evaluateTeam(members, getStatBenchmarks()));
  bootstrap.Modal.getOrCreateInstance(document.querySelector("#team-evaluation-modal")).show();
});
elements.prioritySettings.querySelectorAll("select[data-stat-priority]").forEach(select => {
  select.value = statPriorities[select.dataset.statPriority];
});
elements.retryButton.addEventListener("click", () => loadDex([...failedIds]));

renderTeam();
loadDex().catch(error => {
  console.error("No se pudo iniciar la Pokédex.", error);
  elements.loadStatus.classList.add("d-none");
  showError("No se pudo conectar con PokéAPI. Comprueba tu conexión y vuelve a cargar la página.");
});
