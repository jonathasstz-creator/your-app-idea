import type {
  StatsViewModel,
  StatsHeatmapNote,
  StatsChapter,
  StatsSuggestion,
} from './analytics-client';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function createKpiCard(entry: { label: string; value: string }) {
  const card = document.createElement('article');
  card.className = 'kpi-card';
  const label = document.createElement('div');
  label.className = 'kpi-label';
  label.textContent = entry.label;
  const value = document.createElement('div');
  value.className = 'kpi-value';
  value.textContent = entry.value;
  card.append(label, value);
  return card;
}

export function createChapterCard(chapter: StatsChapter) {
  const card = document.createElement('article');
  card.className = 'chapter-card';

  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = chapter.title;
  header.appendChild(title);

  const status = document.createElement('span');
  status.className = `status-pill ${chapter.unlocked ? 'status-hit' : 'status-miss'}`;
  status.textContent = chapter.unlocked ? 'Unlocked' : 'Locked';
  header.appendChild(status);

  const progressTrack = document.createElement('div');
  progressTrack.className = 'progress-track';
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  const pct = Math.max(0, Math.min(100, chapter.progress_pct));
  progressBar.style.width = `${pct}%`;
  progressTrack.appendChild(progressBar);

  const progressLabel = document.createElement('div');
  progressLabel.className = 'progress-label';
  progressLabel.textContent = `${pct.toFixed(1)}% progress`;

  const statsList = document.createElement('div');
  statsList.className = 'stat-row';
  statsList.innerHTML = `
      <span>Acurácia</span><strong>${chapter.accuracy_avg.toFixed(1)}%</strong>
    `;

  const latencyRow = document.createElement('div');
  latencyRow.className = 'stat-row';
  latencyRow.innerHTML = `
      <span>Latência</span><strong>${chapter.latency_avg.toFixed(1)} ms</strong>
    `;

  const sessionRow = document.createElement('div');
  sessionRow.className = 'stat-row';
  sessionRow.innerHTML = `
      <span>Sessões</span><strong>${chapter.sessions_total}</strong>
    `;

  const lastSessionRow = document.createElement('div');
  lastSessionRow.className = 'stat-row';
  lastSessionRow.innerHTML = `
      <span>Última sessão</span><strong>${formatDate(chapter.last_session_at)}</strong>
    `;

  const rec = document.createElement('p');
  rec.className = 'chapter-recommendation';
  rec.innerHTML = `<strong>${chapter.recommendation.label}</strong><br>${chapter.recommendation.reason}`;

  const heatmapRow = createHeatmapList(chapter.heatmap_top_notes, {
    limit: 4,
    emptyText: 'Nenhuma nota crítica',
  });

  card.append(
    header,
    progressTrack,
    progressLabel,
    statsList,
    latencyRow,
    sessionRow,
    lastSessionRow,
    rec,
    heatmapRow
  );

  return card;
}

export function createHeatmapList(
  notes: StatsHeatmapNote[],
  options?: { limit?: number; emptyText?: string }
) {
  const limit = options?.limit ?? notes.length;
  const emptyText = options?.emptyText ?? 'Carregando dados...';

  const chips = document.createElement('div');
  chips.className = 'heatmap-list';

  if (notes.length) {
    notes.slice(0, limit).forEach((note) => {
      const chip = document.createElement('span');
      chip.className = 'heatmap-chip';
      chip.textContent = `${midiToNote(note.midi)} · ${note.error_rate.toFixed(1)}%`;
      chips.appendChild(chip);
    });
  } else {
    chips.textContent = emptyText;
  }

  return chips;
}

export function createRecommendationCard(
  suggestion: StatsSuggestion,
  onAction: (action?: string) => void
) {
  const card = document.createElement('div');
  card.className = 'recommendation-card';

  const title = document.createElement('strong');
  title.textContent = suggestion.title;
  const body = document.createElement('p');
  body.textContent = suggestion.body;
  card.append(title, body);

  if (suggestion.cta_label && suggestion.cta_action) {
    const button = document.createElement('button');
    button.textContent = suggestion.cta_label;
    button.addEventListener('click', () => onAction(suggestion.cta_action));
    card.appendChild(button);
  }

  return card;
}

export function renderDashboard(
  root: HTMLElement,
  stats: StatsViewModel,
  onAction: (action?: string) => void
) {
  root.innerHTML = '';

  const overviewSection = createOverviewSection(stats, onAction);
  const progressSection = createProgressSection(stats);
  const chaptersSection = createChaptersSection(stats.chapters);
  const heatmapSection = createHeatmapSection(stats.global_heatmap_top_notes);
  const recommendationsSection = createRecommendationsSection(
    stats.suggestions,
    onAction
  );

  root.append(
    overviewSection,
    progressSection,
    chaptersSection,
    heatmapSection,
    recommendationsSection
  );
}

function createOverviewSection(
  stats: StatsViewModel,
  onAction: (action?: string) => void
) {
  const container = document.createElement('div');
  container.className = 'chart-card';

  const header = document.createElement('div');
  header.className = 'overview-header';
  const headerLeft = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Overview';
  const rangeTag = document.createElement('span');
  rangeTag.className = 'overview-range';
  rangeTag.textContent = `${stats.range.from} → ${stats.range.to}`;
  headerLeft.append(title, rangeTag);

  const button = document.createElement('button');
  button.className = 'overview-cta';
  button.textContent = 'Continue training';
  button.addEventListener('click', () => onAction('/viewer/trainer'));

  header.append(headerLeft, button);

  const grid = document.createElement('div');
  grid.className = 'kpi-grid';

  const cards = [
    { label: 'Sessões · 7 dias', value: stats.kpis.sessions_7d.toString() },
    { label: 'Sessões · 30 dias', value: stats.kpis.sessions_30d.toString() },
    { label: 'Acurácia média', value: stats.kpis.accuracy_avg.toFixed(1) + '%' },
    { label: 'Latência média', value: stats.kpis.latency_avg.toFixed(1) + ' ms' },
    { label: 'Melhor streak', value: stats.kpis.best_streak.toString() },
    { label: 'Melhor score', value: stats.kpis.best_score.toFixed(1) },
  ];

  cards.forEach((entry) => grid.append(createKpiCard(entry)));

  container.append(header, grid);
  return container;
}

function createProgressSection(stats: StatsViewModel) {
  const container = document.createElement('div');
  container.className = 'chart-card';
  const title = document.createElement('h2');
  title.textContent = 'Progress diário';
  container.appendChild(title);

  const chartWrapper = document.createElement('div');
  chartWrapper.className = 'chart-wrapper';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');

  const daily = stats.daily.length ? stats.daily : [{ sessions: 0, date: '', accuracy_avg: 0, latency_avg: 0, score_avg: 0 }];
  const sessions = daily.map((row) => row.sessions);
  const maxSessions = Math.max(...sessions, 1);

  const points = daily
    .map((row, index) => {
      const x =
        daily.length === 1
          ? 50
          : (index / (daily.length - 1)) * 100;
      const y = 100 - (row.sessions / maxSessions) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'var(--primary-neon)');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);

  daily.forEach((row, index) => {
    const x =
      daily.length === 1
        ? 50
        : (index / (daily.length - 1)) * 100;
    const y = 100 - (row.sessions / maxSessions) * 100;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', `${x}`);
    circle.setAttribute('cy', `${y}`);
    circle.setAttribute('r', '1.5');
    circle.setAttribute('fill', '#fff');
    svg.appendChild(circle);
  });

  chartWrapper.appendChild(svg);
  container.appendChild(chartWrapper);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = `
    <span>Sessions / dia</span>
    <span>Acurácia média ${stats.kpis.accuracy_avg.toFixed(1)}%</span>
  `;
  container.appendChild(legend);
  return container;
}

function createChaptersSection(chapters: StatsChapter[]) {
  const container = document.createElement('div');
  container.className = 'chapters-card';
  const title = document.createElement('h2');
  title.textContent = 'Chapters';
  container.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'chapters-grid';

  chapters.forEach((chapter) => {
    const card = createChapterCard(chapter);
    grid.appendChild(card);
  });

  container.appendChild(grid);
  return container;
}

function createHeatmapSection(notes: StatsHeatmapNote[]) {
  const container = document.createElement('div');
  container.className = 'heatmap-card';
  const title = document.createElement('h2');
  title.textContent = 'Heatmap de notas';
  container.appendChild(title);

  const description = document.createElement('p');
  description.textContent = notes.length
    ? `Notas com maior taxa de erro: ${formatNoteList(
        notes.slice(0, 3).map((note) => note.midi)
      )}.`
    : 'Ainda não há notas críticas detectadas.';
  container.appendChild(description);

  const chips = createHeatmapList(notes);
  container.appendChild(chips);
  return container;
}

function createRecommendationsSection(
  suggestions: StatsSuggestion[],
  onAction: (action?: string) => void
) {
  const container = document.createElement('div');
  container.className = 'recommendations-card';
  const title = document.createElement('h2');
  title.textContent = 'Recommendations';
  container.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'recommendations-grid';

  if (!suggestions.length) {
    const empty = document.createElement('div');
    empty.className = 'recommendation-card';
    empty.textContent = 'Nenhuma recomendação disponível.';
    grid.appendChild(empty);
  }

  suggestions.forEach((suggestion) => {
    const card = createRecommendationCard(suggestion, onAction);
    grid.appendChild(card);
  });

  container.appendChild(grid);
  return container;
}

function formatNoteList(midis: number[]) {
  return midis.map((midi) => midiToNote(midi)).join(', ');
}

function midiToNote(midi: number) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12] ?? '♯';
  return `${name}${octave}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return 'sem sessões';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'sem sessões';
  }
  return date.toLocaleString('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
