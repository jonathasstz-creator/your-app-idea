
/**
 * Módulo de cálculo de layout adaptativo para a partitura.
 * Calcula densidade de compassos, janelas visíveis e dimensões baseadas no container.
 */

export interface SheetLayout {
  minMeasureWidthPx: number;
  measuresPerLine: number;
  linesVisible: number;
  containerWidth: number;
  containerHeight: number;
  zoom: number;
}

export interface MeasureWindow {
  startMeasure: number;
  endMeasure: number;
}

/**
 * Calcula o layout da partitura baseado nas dimensões do container e zoom.
 * @param containerWidth Largura do container em pixels
 * @param containerHeight Altura do container em pixels
 * @param sheetZoom Fator de zoom (default 1.0)
 * @returns Layout calculado com medidas e compassos por linha
 */
export function computeSheetLayout(
  containerWidth: number,
  containerHeight: number,
  sheetZoom: number = 1.0
): SheetLayout {
  // Modelo: máximo de compassos por linha (densidade controlada)
  // Telas largas: 3 compassos por linha; telas normais: 2 compassos
  const breakpoint = 1200;
  const maxMeasuresPerLine = containerWidth >= breakpoint ? 3 : 2;

  // Calcular largura mínima por compasso com clamp percentual do container
  // Objetivo: notas maiores, menos compassos por linha, sem overflow bizarro
  // Referência MIDIano/Synthesia: preferem mostrar menos por tela com maior legibilidade
  // Usa clamp com percentual (45-55% do container) + piso mínimo maior para reduzir densidade
  const MIN_PERCENT = 0.45; // 45% do container width
  const MAX_PERCENT = 0.55; // 55% do container width
  const MIN_MEASURE_WIDTH = 480 * sheetZoom; // Piso mínimo aumentado (era 420) para menos densidade
  const MAX_MEASURE_WIDTH = 720 * sheetZoom; // Teto máximo aumentado proporcionalmente
  
  const baseMeasureWidth = containerWidth / maxMeasuresPerLine;
  const percentBased = containerWidth * Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, baseMeasureWidth / containerWidth));
  const minMeasureWidthPx = Math.max(
    MIN_MEASURE_WIDTH,
    Math.min(MAX_MEASURE_WIDTH, Math.max(percentBased, baseMeasureWidth))
  );

  // Calcular quantos compassos cabem por linha (deve ser <= maxMeasuresPerLine)
  const measuresPerLine = Math.max(1, Math.min(
    maxMeasuresPerLine,
    Math.floor(containerWidth / minMeasureWidthPx)
  ));

  // Estimar altura de um sistema (staff) - assumindo ~110px por sistema como base
  // Ajustar baseado no zoom
  const estimatedStaffHeight = 110 * sheetZoom;
  const linesVisible = Math.max(1, Math.floor(containerHeight / estimatedStaffHeight));

  return {
    minMeasureWidthPx,
    measuresPerLine,
    linesVisible,
    containerWidth,
    containerHeight,
    zoom: sheetZoom,
  };
}

/**
 * Calcula a janela de compassos visíveis baseado no compasso atual.
 * @param currentMeasure Índice do compasso atual (0-based)
 * @param totalMeasures Total de compassos na partitura
 * @param measuresPerLine Quantos compassos cabem por linha
 * @param bufferFactor Fator de buffer antes/depois (default 0.3 = 30%)
 * @returns Janela [startMeasure, endMeasure]
 */
export function computeVisibleMeasureWindow(
  currentMeasure: number,
  totalMeasures: number,
  measuresPerLine: number,
  bufferFactor: number = 0.3
): MeasureWindow {
  // Calcular quantos compassos mostrar no total (linhas visíveis * compassos por linha)
  // Usar measuresPerLine como base, mas considerar múltiplas linhas se necessário
  const visibleMeasures = measuresPerLine;

  // Buffer antes e depois do compasso atual
  const bufferBefore = Math.floor(visibleMeasures * bufferFactor);
  const bufferAfter = Math.floor(visibleMeasures * bufferFactor);

  // Calcular range
  let startMeasure = Math.max(0, currentMeasure - bufferBefore);
  let endMeasure = Math.min(totalMeasures - 1, currentMeasure + bufferAfter);

  // Garantir que a janela tenha pelo menos visibleMeasures compassos (se possível)
  const windowSize = endMeasure - startMeasure + 1;
  if (windowSize < visibleMeasures && startMeasure > 0) {
    // Expandir para trás se possível
    const expandBy = visibleMeasures - windowSize;
    startMeasure = Math.max(0, startMeasure - expandBy);
  }

  return {
    startMeasure,
    endMeasure,
  };
}

/**
 * Verifica se o cursor entrou no threshold para atualizar a janela.
 * @param currentMeasure Compasso atual
 * @param windowStart Início da janela atual
 * @param windowEnd Fim da janela atual
 * @param threshold Percentual do final da janela (default 0.75 = 75%)
 * @returns true se deve atualizar a janela
 */
export function shouldUpdateWindow(
  currentMeasure: number,
  windowStart: number,
  windowEnd: number,
  threshold: number = 0.75
): boolean {
  const windowSize = windowEnd - windowStart;
  const thresholdPosition = windowStart + Math.floor(windowSize * threshold);
  return currentMeasure >= thresholdPosition;
}
