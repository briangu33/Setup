import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import readline from 'readline';
import { MpcState } from 'setup-mpc-common';
import { existsAsync, mkdirAsync, renameAsync } from './fs-async';
import { TranscriptStore } from './transcript-store';

export class Sealer extends EventEmitter {
  private sealingProc?: ChildProcess;
  private sealingPath: string;
  private cancelled = false;

  constructor(private transcriptStore: TranscriptStore) {
    super();
    this.sealingPath = transcriptStore.getSealingPath();
  }

  public async run(state: MpcState) {
    const previousParticipant = state.participants
      .slice()
      .reverse()
      .find(p => p.state === 'COMPLETE');

    if (!previousParticipant) {
      throw new Error('No previous participant to perform sealing step on.');
    }

    await mkdirAsync(this.sealingPath, { recursive: true });
    await this.transcriptStore.copyVerifiedTo(previousParticipant.address, this.sealingPath);

    if (this.cancelled) {
      return;
    }

    await this.compute();
    await this.renameTranscripts();
  }

  public cancel() {
    this.cancelled = true;
    this.removeAllListeners();
    if (this.sealingProc) {
      this.sealingProc.kill('SIGINT');
      this.sealingProc = undefined;
    }
  }

  private async renameTranscripts() {
    let num = 0;
    while (await existsAsync(`${this.sealingPath}/transcript${num}_out.dat`)) {
      await renameAsync(`${this.sealingPath}/transcript${num}_out.dat`, `${this.sealingPath}/transcript${num}.dat`);
      ++num;
    }
  }

  private async compute() {
    return new Promise((resolve, reject) => {
      const { SETUP_PATH = '../setup-tools/seal' } = process.env;
      console.log(this.sealingPath);
      const sealingProc = (this.sealingProc = spawn(SETUP_PATH, [this.sealingPath]));

      readline
        .createInterface({
          input: sealingProc.stdout,
          terminal: false,
        })
        .on('line', this.handleSetupOutput);

      sealingProc.stderr.on('data', data => console.error(data.toString()));

      sealingProc.on('close', code => {
        this.sealingProc = undefined;
        if (code === 0 || this.cancelled) {
          console.error(`Sealing complete or cancelled.`);
          resolve();
        } else {
          reject(new Error(`seal exited with code ${code}`));
        }
      });

      sealingProc.on('error', reject);
    });
  }

  private handleSetupOutput = (data: Buffer) => {
    console.error('From seal: ', data.toString());
    const params = data
      .toString()
      .replace('\n', '')
      .split(' ');
    const cmd = params.shift()!;
    switch (cmd) {
      case 'progress': {
        this.emit('progress', +params[0]);
        break;
      }
    }
  };
}