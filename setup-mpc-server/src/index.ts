import http from 'http';
import { Address } from 'web3x/address';
import { appFactory } from './app';
import { mkdirAsync } from './fs-async';
import { ParticipantSelectorFactory } from './participant-selector';
import { Server } from './server';
import { DiskStateStore } from './state-store';
import { defaultState } from './state/default-state';
import { DiskTranscriptStoreFactory } from './transcript-store';

const { PORT = 80, STORE_PATH = './store', INFURA_API_KEY = 'fe576c8bab174752bd0d963c89d5d7a2' } = process.env;

async function main() {
  const shutdown = async () => process.exit(0);
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const adminAddress = Address.fromString('0x1aA18F5b595d87CC2C66d7b93367d8beabE203bB');
  const participantSelectorFactory = new ParticipantSelectorFactory(adminAddress, INFURA_API_KEY);
  const latestBlock = await participantSelectorFactory.getCurrentBlockHeight('ropsten');
  const defaults = defaultState(latestBlock);
  const stateStore = new DiskStateStore(STORE_PATH + '/state', defaults);
  const transcriptStoreFactory = new DiskTranscriptStoreFactory(STORE_PATH);

  const server = new Server(transcriptStoreFactory, stateStore, participantSelectorFactory);
  await server.start();

  const tmpPath = STORE_PATH + '/tmp';
  await mkdirAsync(tmpPath, { recursive: true });
  const app = appFactory(server, adminAddress, participantSelectorFactory, '/api', tmpPath);

  const httpServer = http.createServer(app.callback());
  httpServer.listen(PORT);
  console.log(`Server listening on port ${PORT}.`);
}

main().catch(console.log);
