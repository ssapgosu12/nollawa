import { describe, expect, it } from 'vitest';
import { App, planHistorySync, remoteBackTransition, remoteMatchRoute, type AppHistoryRoute } from './App';
import { GAME_CATALOG, type CatalogGameId } from './game/catalog';

const remoteGames: { game: CatalogGameId; label: string; route: 'play' | 'yacht' }[] = [
  { game: 'samok', label: '사목', route: 'play' },
  { game: 'omok', label: '오목', route: 'play' },
  { game: 'yukmok', label: '육목', route: 'play' },
  { game: 'reversi', label: '리버시', route: 'play' },
  { game: 'yacht', label: '요트', route: 'yacht' },
];

const routeSequence = (start: AppHistoryRoute) => {
  const routes = [start];
  const commands: string[] = [];
  let current = start;
  while (true) {
    const transition = remoteBackTransition(current);
    if (!transition) break;
    commands.push(transition.command.command);
    routes.push(transition.screen);
    current = transition.screen;
  }
  return { routes, commands };
};

describe('M2-YACHT-2 acceptance 8: deterministic remote browser-back routes', () => {
  it.each(remoteGames)('$label remote match back uses the authoritative return-lobby path', ({ game, route }) => {
    expect(remoteMatchRoute(game)).toBe(route);
    expect(remoteBackTransition(route)).toEqual({ screen: 'lobby', command: { command: 'return-lobby' }, close: false });
  });

  it('proves match -> lobby -> title and games -> lobby -> title route sequences', () => {
    expect(routeSequence(remoteMatchRoute('yacht'))).toEqual({ routes: ['yacht', 'lobby', 'name'], commands: ['return-lobby', 'leave-room'] });
    expect(routeSequence('games')).toEqual({ routes: ['games', 'lobby', 'name'], commands: ['set-activity', 'leave-room'] });
    expect(remoteBackTransition('games')?.command).toEqual({ command: 'set-activity', activity: 'lobby' });
    expect(remoteBackTransition('lobby')).toMatchObject({ screen: 'name', command: { command: 'leave-room' }, close: true });
  });

  it('synchronizes one history entry per depth without push-on-back duplicate loops', () => {
    expect(planHistorySync(null, 'name')).toEqual({ type: 'replace', route: 'name' });
    expect(planHistorySync('name', 'play')).toEqual({ type: 'push', routes: ['lobby', 'play'] });
    expect(planHistorySync('lobby', 'games')).toEqual({ type: 'push', routes: ['games'] });
    expect(planHistorySync('play', 'lobby')).toEqual({ type: 'go', delta: -1, route: 'lobby' });
    expect(planHistorySync('lobby', 'lobby')).toEqual({ type: 'none' });
    expect(App.toString()).toMatch(/addEventListener\(["']popstate["']/);
    expect(App.toString()).toContain('window.history.pushState');
  });
});

describe('M2-YACHT-2 acceptance 9: Korean shared catalog name', () => {
  it('renders the shared Yacht list entry as 요트 다이스', () => {
    expect(GAME_CATALOG.find(({ id }) => id === 'yacht')?.name).toBe('요트 다이스');
  });
});
