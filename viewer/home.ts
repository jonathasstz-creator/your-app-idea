  import type { StatsViewModel } from './analytics-client';
  import {
    createChapterCard,
    createHeatmapList,
    createKpiCard,
    createRecommendationCard,
  } from './dashboard';

  export type HomeState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; stats: StatsViewModel };

  interface HomeRenderOptions {
    onAction: (action?: string) => void;
    onOpenChapters: () => void;
    onRetry: () => void;
  }

  export function renderHome(
    root: HTMLElement,
    state: HomeState,
    options: HomeRenderOptions
  ) {
    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'home-root dashboard-root';

    container.appendChild(buildHero(options.onAction, options.onOpenChapters));

    const summary = document.createElement('div');
    summary.className = 'home-summary-grid';

    if (state.status === 'loading') {
      summary.append(
        buildLoadingCard('Resumo rápido'),
        buildLoadingCard('Capítulos'),
        buildLoadingCard('Próximo passo')
      );
    } else if (state.status === 'error') {
      summary.append(buildErrorCard(state.message, options));
    } else {
      summary.append(
        buildKpiPanel(state.stats),
        buildChaptersPanel(state.stats),
        buildNextStepPanel(state.stats, options.onAction)
      );
    }

    container.appendChild(summary);
    container.appendChild(
      buildShortcuts(options.onAction, options.onOpenChapters, state)
    );

    root.appendChild(container);
  }

  function buildHero(onAction: (action?: string) => void, onOpenChapters: () => void) {
    const card = document.createElement('div');
    card.className = 'home-card home-hero';

    const kicker = document.createElement('p');
    kicker.className = 'home-kicker';
    kicker.textContent = 'Hub de prática';

    const title = document.createElement('h1');
    title.textContent = 'Continue de onde parou';

    const subtitle = document.createElement('p');
    subtitle.textContent =
      'Acesse o Trainer, veja o dashboard e escolha capítulos em um lugar só.';

    const actions = document.createElement('div');
    actions.className = 'home-actions';

    const startBtn = document.createElement('button');
    startBtn.className = 'primary';
    startBtn.type = 'button';
    startBtn.textContent = 'Continuar treino';
    startBtn.addEventListener('click', () => onAction('/viewer/trainer'));

    const dashboardBtn = document.createElement('button');
    dashboardBtn.className = 'secondary';
    dashboardBtn.type = 'button';
    dashboardBtn.textContent = 'Ver meu progresso';
    dashboardBtn.addEventListener('click', () => onAction('/viewer/dashboard'));

    const chaptersBtn = document.createElement('button');
    chaptersBtn.className = 'secondary accent';
    chaptersBtn.id = 'home-chapters-btn';
    chaptersBtn.type = 'button';
    chaptersBtn.textContent = 'Capítulos';
    chaptersBtn.addEventListener('click', () => onOpenChapters());

    actions.append(startBtn, dashboardBtn, chaptersBtn);
    card.append(kicker, title, subtitle, actions);

    return card;
  }

  function buildKpiPanel(stats: StatsViewModel) {
    const panel = document.createElement('div');
    panel.className = 'chart-card home-panel';

    const header = document.createElement('div');
    header.className = 'home-panel-header';
    const title = document.createElement('h2');
    title.textContent = 'Resumo rápido';
    const range = document.createElement('span');
    range.className = 'overview-range';
    range.textContent = `${stats.range.from} → ${stats.range.to}`;
    header.append(title, range);

    const grid = document.createElement('div');
    grid.className = 'kpi-grid';

    const entries = [
      { label: 'Sessões (7d)', value: stats.kpis.sessions_7d.toString() },
      { label: 'Acurácia média', value: `${stats.kpis.accuracy_avg.toFixed(1)}%` },
      { label: 'Melhor streak', value: `x${stats.kpis.best_streak}` },
      { label: 'Latência média', value: `${stats.kpis.latency_avg.toFixed(1)} ms` },
    ];

    entries.forEach((entry) => grid.append(createKpiCard(entry)));

    panel.append(header, grid);
    return panel;
  }

  function buildChaptersPanel(stats: StatsViewModel) {
    const panel = document.createElement('div');
    panel.className = 'chapters-card home-panel';

    const header = document.createElement('div');
    header.className = 'home-panel-header';
    const title = document.createElement('h2');
    title.textContent = 'Capítulos em foco';
    const count = document.createElement('span');
    count.className = 'home-panel-caption';
    count.textContent = `${stats.chapters.length} capítulos no catálogo`;
    header.append(title, count);
    panel.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'chapters-grid home-mini-chapters';

    const chapters = stats.chapters.slice(0, 3);
    if (!chapters.length) {
      const empty = document.createElement('div');
      empty.className = 'dashboard-loading';
      empty.textContent = 'Nenhum capítulo disponível.';
      panel.appendChild(empty);
      return panel;
    }

    chapters.forEach((chapter) => grid.append(createChapterCard(chapter)));
    panel.appendChild(grid);
    return panel;
  }

  function buildNextStepPanel(
    stats: StatsViewModel,
    onAction: (action?: string) => void
  ) {
    const panel = document.createElement('div');
    panel.className = 'recommendations-card home-panel';

    const header = document.createElement('div');
    header.className = 'home-panel-header';
    const title = document.createElement('h2');
    title.textContent = 'Próximo passo';
    const helper = document.createElement('span');
    helper.className = 'home-panel-caption';
    helper.textContent = 'Sugestões e notas críticas';
    header.append(title, helper);
    panel.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'recommendations-grid';

    const suggestion = stats.suggestions[0];
    if (suggestion) {
      grid.append(createRecommendationCard(suggestion, onAction));
    } else {
      const empty = document.createElement('div');
      empty.className = 'recommendation-card';
      empty.textContent = 'Nenhuma recomendação disponível.';
      grid.appendChild(empty);
    }

    panel.appendChild(grid);

    const heatmap = document.createElement('div');
    heatmap.className = 'home-heatmap';
    const label = document.createElement('div');
    label.className = 'home-panel-caption';
    label.textContent = 'Notas com maior erro recente';
    const chips = createHeatmapList(stats.global_heatmap_top_notes, {
      limit: 6,
      emptyText: 'Nenhuma nota crítica',
    });
    heatmap.append(label, chips);
    panel.appendChild(heatmap);

    return panel;
  }

  function buildShortcuts(
    onAction: (action?: string) => void,
    onOpenChapters: () => void,
    state: HomeState
  ) {
    const wrapper = document.createElement('div');
    wrapper.className = 'home-shortcuts';

    const title = document.createElement('div');
    title.className = 'home-shortcuts-title';
    title.textContent = 'Ações rápidas';

    const buttons = document.createElement('div');
    buttons.className = 'home-shortcuts-row';

    const nextAction =
      state.status === 'ready' && state.stats.suggestions[0]?.cta_action
        ? state.stats.suggestions[0].cta_action
        : '/viewer/trainer';

    const entries = [
      { label: 'Treinar minhas dificuldades', handler: () => onAction(nextAction) },
      { label: 'Escolher capítulo', handler: onOpenChapters },
      { label: 'Abrir dashboard', handler: () => onAction('/viewer/dashboard') },
    ];

    entries.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chapter-secondary-btn home-shortcut-btn';
      btn.textContent = entry.label;
      btn.addEventListener('click', entry.handler);
      buttons.appendChild(btn);
    });

    wrapper.append(title, buttons);
    return wrapper;
  }

  function buildLoadingCard(title: string) {
    const card = document.createElement('div');
    card.className = 'chart-card home-panel home-loading-card';

    const header = document.createElement('div');
    header.className = 'home-panel-header';
    const heading = document.createElement('h3');
    heading.textContent = title;
    header.appendChild(heading);

    const skeletons = document.createElement('div');
    skeletons.className = 'home-loading';
    for (let i = 0; i < 3; i++) {
      const bar = document.createElement('div');
      bar.className = 'home-skeleton';
      skeletons.appendChild(bar);
    }

    card.append(header, skeletons);
    return card;
  }

  function buildErrorCard(message: string, options: HomeRenderOptions) {
    const card = document.createElement('div');
    card.className = 'chart-card home-panel home-error-card';

    const title = document.createElement('h3');
    title.textContent = 'Resumo indisponível';
    const desc = document.createElement('p');
    desc.textContent = `Falha ao carregar estatísticas: ${message}`;

    const actions = document.createElement('div');
    actions.className = 'home-actions home-error-actions';

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'chapter-primary-btn';
    retry.textContent = 'Tentar de novo';
    retry.addEventListener('click', () => options.onRetry());

    const dashboard = document.createElement('button');
    dashboard.type = 'button';
    dashboard.className = 'chapter-secondary-btn';
    dashboard.textContent = 'Abrir dashboard';
    dashboard.addEventListener('click', () => options.onAction('/viewer/dashboard'));

    actions.append(retry, dashboard);
    card.append(title, desc, actions);
    return card;
  }
