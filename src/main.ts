import { App } from './core/App';
import { createPlatform } from './platform';

async function bootstrap(): Promise<void> {
  const platform = await createPlatform();
  const app = new App(platform);
  await app.start();
}

bootstrap().catch((error: unknown) => {
  console.error('[boot] запуск не удался', error);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Не удалось запустить игру';
});
