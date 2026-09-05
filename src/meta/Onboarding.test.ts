import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ASIDES,
  ONBOARDING_CHAIN,
  Onboarding,
  type OnboardingContext,
} from './Onboarding';

/** Русский текст текущей подсказки или пустая строка. */
function ru(guide: Onboarding, patch: Partial<OnboardingContext> = {}): string {
  return guide.hint(context(patch))?.ru ?? '';
}

function context(patch: Partial<OnboardingContext> = {}): OnboardingContext {
  return { state: 'idle', canAfford: true, hasNewZone: true, panelOpen: false, ...patch };
}

describe('обучение первых десяти минут', () => {
  it('начинается с заброса и молчит в остальных состояниях', () => {
    const guide = new Onboarding();
    expect(guide.hint(context())?.ru).toContain('заброс');
    expect(guide.hint(context({ state: 'fighting' }))).toBeNull();
  });

  it('не мешает открытой панели', () => {
    const guide = new Onboarding();
    expect(guide.hint(context({ panelOpen: true }))).toBeNull();
  });

  it('цепочка идёт по порядку и закрывается своими сигналами', () => {
    const guide = new Onboarding();
    const order = ONBOARDING_CHAIN.map((step) => step.id);
    const seen: string[] = [];

    for (const step of ONBOARDING_CHAIN) {
      expect(guide.step?.id).toBe(step.id);
      seen.push(step.id);
      expect(guide.signal(step.done)).toBe(true);
    }

    expect(seen).toEqual(order);
    expect(guide.finished).toBe(true);
    expect(guide.hint(context())).toBeNull();
  });

  it('шаг с условием ждёт, но не пропадает', () => {
    const guide = new Onboarding();
    guide.signal('cast');
    guide.signal('bite');
    guide.signal('landed');

    expect(guide.step?.id).toBe('shop');
    // Денег нет — подсказка про снасти была бы издевательством.
    expect(guide.hint(context({ canAfford: false }))).toBeNull();
    expect(guide.hint(context({ canAfford: true }))?.ru).toContain('Снасти');
  });

  it('игрок, который разобрался сам, перепрыгивает шаги', () => {
    const guide = new Onboarding();
    guide.signal('cast');
    // Купил снасть раньше, чем игра успела намекнуть про клёв и бой.
    expect(guide.signal('bought')).toBe(true);
    expect(guide.step?.id).toBe('quest');
  });

  it('буйный улов важнее шага цепочки и показывается один раз', () => {
    const guide = new Onboarding();
    const inBoat = context({ state: 'onboard' });
    expect(guide.hint(inBoat)?.ru).toContain('буянит');

    guide.signal('subdued');
    expect(guide.hint(inBoat)).toBeNull();
  });

  it('подсказка про обрыв появляется только после обрыва', () => {
    const guide = new Onboarding();
    guide.signal('cast');
    guide.signal('bite');
    expect(ru(guide)).not.toContain('покраснела');

    guide.signal('snapped');
    expect(ru(guide)).toContain('покраснела');

    guide.signal('landed');
    expect(ru(guide)).not.toContain('покраснела');
  });

  it('каждая подсказка — одна короткая строка на обоих языках', () => {
    for (const hint of [...ONBOARDING_CHAIN, ...ONBOARDING_ASIDES]) {
      for (const lang of ['ru', 'en'] as const) {
        const text = hint.text[lang] ?? '';
        expect(text, `${hint.id}.${lang}`).toBeTruthy();
        expect(text, `${hint.id}.${lang}`).not.toContain('\n');
        // Длиннее не влезает в строку на узком экране и нарушает правило
        // «ни одного обучающего экрана» из docs/03, § 3.6.
        expect(text.length, `${hint.id}.${lang}: ${text}`).toBeLessThanOrEqual(42);
      }
    }
  });

  it('шаг и разовые подсказки переживают перезагрузку', () => {
    const guide = new Onboarding();
    guide.signal('cast');
    guide.signal('snapped');
    guide.signal('landed');

    const restored = new Onboarding();
    restored.restore(guide.serialize());
    expect(restored.step?.id).toBe(guide.step?.id);
    expect(ru(restored)).not.toContain('покраснела');
  });

  it('битый сейв не ломает обучение', () => {
    const guide = new Onboarding();
    guide.restore({ step: Number.NaN, seen: [] });
    expect(guide.step?.id).toBe('cast');

    guide.restore({ step: 999, seen: [] });
    expect(guide.finished).toBe(true);
  });

  it('пропуск закрывает всё разом', () => {
    const guide = new Onboarding();
    guide.skipAll();
    expect(guide.hint(context())).toBeNull();
    expect(guide.hint(context({ state: 'onboard' }))).toBeNull();
  });
});
