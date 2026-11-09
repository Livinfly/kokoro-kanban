import { render } from 'ink';
import { App, type AppProps } from './App.js';

export async function startBoard(props: AppProps): Promise<void> {
  const instance = render(<App {...props} />, { exitOnCtrlC: true });
  await instance.waitUntilExit();
}
